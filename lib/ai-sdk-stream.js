/**
 * lib/ai-sdk-stream.js — Native SSE Streaming Layer (مُستوحى من Vercel AI SDK)
 *
 * يُرسل tokens فورياً للعميل عبر SSE بدلاً من انتظار الرد الكامل.
 * يدعم: Groq (OpenAI-compatible) → Gemini SSE → Mistral streaming
 *
 * أحداث SSE المُرسَلة:
 *   data: {"token":"..."}      ← chunk نصي من LLM
 *   data: {"error":"..."}      ← فشل جميع المزودين
 *   data: [DONE]               ← نهاية البث
 */

import {
  getGroqKeyPool,
  pickGroqKey,
  markGroqSuccess,
  markGroqRateLimit,
  markGroqError,
} from './groq-rotation.js'

function writeSSE(res, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`data: ${payload}\n\n`)
}

// ── CJK pollution guard ────────────────────────────────────────────────────
// Returns true if the accumulated text is mostly Chinese/Japanese/Korean
// and the user's query was NOT in CJK — used to abort polluted streams early.
function _hasCJK(str) {
  return (str.match(/[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]/g) || []).length
}
function _isCJKPolluted(acc, userQuery = '') {
  if (!acc || acc.length < 30) return false
  const userHasCJK = _hasCJK(userQuery) > 3
  if (userHasCJK) return false          // user asked in Chinese → fine
  const cjkCount = _hasCJK(acc)
  return cjkCount / acc.length > 0.18   // >18% CJK chars in accumulated output
}

// Helper: wrap token writer with CJK abort logic
// Returns an object with { write(token), aborted }
function _makeCJKGuardedWriter(res, userQuery = '') {
  let acc = ''
  let aborted = false
  return {
    write(token) {
      if (aborted) return false
      acc += token
      if (acc.length > 60 && _isCJKPolluted(acc, userQuery)) {
        aborted = true
        console.warn('[ai-stream] CJK pollution detected — aborting stream')
        return false   // caller should stop streaming
      }
      writeSSE(res, { token })
      return true
    },
    get aborted() { return aborted },
  }
}

// Extract last user message from messages array (for CJK guard)
function _lastUserQuery(messages) {
  return [...(messages || [])].reverse().find(m => m.role === 'user')?.content || ''
}

// ── Groq streaming with key rotation (tries all available keys on 429) ────
async function streamGroq(res, messages, { maxTokens = 3000, model = 'llama-3.1-8b-instant' } = {}) {
  const pool = getGroqKeyPool()
  if (!pool.length) return false

  const guard = _makeCJKGuardedWriter(res, _lastUserQuery(messages))

  // Track which keys we've tried this request to avoid double-trying
  const tried = new Set()
  const maxAttempts = Math.min(pool.length, 3)  // try up to 3 keys per request

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = pickGroqKey()
    if (!key || tried.has(key)) break
    tried.add(key)

    const t0 = Date.now()
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7, stream: true }),
        signal: AbortSignal.timeout(22_000),
      })

      if (response.status === 429) {
        markGroqRateLimit(key)
        console.warn(`[ai-stream] Groq key #${attempt + 1} rate-limited, trying next key...`)
        continue  // try next key
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        console.warn('[ai-stream] Groq error:', response.status, err.error?.message?.slice(0, 80))
        markGroqError(key)
        continue
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let hasContent = false
      let buf = ''
      let cjkAborted = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          const t = line.trim()
          if (!t || t === 'data: [DONE]') continue
          if (!t.startsWith('data: ')) continue
          try {
            const chunk = JSON.parse(t.slice(6))
            const token = chunk.choices?.[0]?.delta?.content
            if (token) {
              hasContent = true
              if (!guard.write(token)) { cjkAborted = true; break }
            }
          } catch { /* ignore malformed lines */ }
        }
        if (cjkAborted) break
      }

      if (cjkAborted) return false  // let next provider try
      if (hasContent) markGroqSuccess(key, Date.now() - t0)
      return hasContent

    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[ai-stream] Groq stream failed:', err.message?.slice(0, 80))
        markGroqError(key)
      }
    }
  }
  return false
}

// ── Gemini streaming (SSE via streamGenerateContent) ──────────────────────
async function streamGemini(res, messages, { maxTokens = 3000 } = {}) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (!key) return false
  try {
    const systemMsg = messages.find(m => m.role === 'system')
    const convMsgs = messages.filter(m => m.role !== 'system')
    const geminiContents = convMsgs.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const body = {
      contents: geminiContents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }
    if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(22_000),
      }
    )

    if (!response.ok) {
      console.warn('[ai-stream] Gemini error:', response.status)
      return false
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const guard = _makeCJKGuardedWriter(res, _lastUserQuery(messages))
    let hasContent = false
    let buf = ''
    let cjkAborted = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith('data: ')) continue
        try {
          const chunk = JSON.parse(t.slice(6))
          const token = chunk.candidates?.[0]?.content?.parts?.[0]?.text
          if (token) {
            hasContent = true
            if (!guard.write(token)) { cjkAborted = true; break }
          }
        } catch { /* ignore */ }
      }
      if (cjkAborted) break
    }
    if (cjkAborted) return false
    return hasContent
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[ai-stream] Gemini stream failed:', err.message?.slice(0, 80))
    return false
  }
}

// ── Mistral streaming (OpenAI-compatible) ────────────────────────────────
async function streamMistral(res, messages, { maxTokens = 3000 } = {}) {
  const key = process.env.MISTRAL_API_KEY
  if (!key) return false
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
        stream: true,
      }),
      signal: AbortSignal.timeout(22_000),
    })

    if (!response.ok) {
      console.warn('[ai-stream] Mistral error:', response.status)
      return false
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const guard = _makeCJKGuardedWriter(res, _lastUserQuery(messages))
    let hasContent = false
    let buf = ''
    let cjkAborted = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const t = line.trim()
        if (!t || t === 'data: [DONE]') continue
        if (!t.startsWith('data: ')) continue
        try {
          const chunk = JSON.parse(t.slice(6))
          const token = chunk.choices?.[0]?.delta?.content
          if (token) {
            hasContent = true
            if (!guard.write(token)) { cjkAborted = true; break }
          }
        } catch { /* ignore */ }
      }
      if (cjkAborted) break
    }
    if (cjkAborted) return false
    return hasContent
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[ai-stream] Mistral stream failed:', err.message?.slice(0, 80))
    return false
  }
}

// ── OpenRouter streaming fallback ─────────────────────────────────────────
async function streamOpenRouter(res, messages, { maxTokens = 3000 } = {}) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return false
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://dz-gpt.vercel.app',
        'X-Title': 'DZ-GPT',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
        stream: true,
      }),
      signal: AbortSignal.timeout(22_000),
    })

    if (!response.ok) {
      console.warn('[ai-stream] OpenRouter error:', response.status)
      return false
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const guard = _makeCJKGuardedWriter(res, _lastUserQuery(messages))
    let hasContent = false
    let buf = ''
    let cjkAborted = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const t = line.trim()
        if (!t || t === 'data: [DONE]') continue
        if (!t.startsWith('data: ')) continue
        try {
          const chunk = JSON.parse(t.slice(6))
          const token = chunk.choices?.[0]?.delta?.content
          if (token) {
            hasContent = true
            if (!guard.write(token)) { cjkAborted = true; break }
          }
        } catch { /* ignore */ }
      }
      if (cjkAborted) break
    }
    if (cjkAborted) return false
    return hasContent
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[ai-stream] OpenRouter stream failed:', err.message?.slice(0, 80))
    return false
  }
}

/**
 * Detect query complexity to pick optimal tokens + model.
 * Returns: 'simple' | 'medium' | 'complex'
 */
function _detectComplexity(messages) {
  const last = [...messages].reverse().find(m => m.role === 'user')?.content || ''
  const arabicChars = (last.match(/[\u0600-\u06FF]/g) || []).length
  const hasCode = /```|function|class |import |const |def |<html|<script/.test(last)
  const isLong = last.length > 120
  const hasKeywords = /شرح|حلّل|قارن|اكتب|أنشئ|انشئ|generate|explain|analyze|create|write|code|موقع|برنامج|خطة/.test(last)
  if (hasCode || (isLong && hasKeywords)) return 'complex'
  if (arabicChars > 15 || last.length > 60 || hasKeywords) return 'medium'
  return 'simple'
}

/**
 * Stream AI response to Express res via SSE.
 * Priority: Groq (fast 8b) → Groq (70b) → Gemini → Mistral → OpenRouter
 *
 * @param {import('express').Response} res
 * @param {Array<{role:string, content:string}>} messages
 * @param {{ maxTokens?: number, isComplex?: boolean }} opts
 */
export async function streamAIResponse(res, messages, { maxTokens, isComplex } = {}) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Auto-detect complexity if not provided
  const complexity = isComplex === true ? 'complex' : isComplex === false ? 'simple' : _detectComplexity(messages)

  // Token budget: simple=600 medium=1200 complex=3000
  const effectiveTokens = maxTokens ?? (complexity === 'complex' ? 3000 : complexity === 'medium' ? 1200 : 600)

  // Model: 8b for simple/medium (ultra-fast ~300ms TTFT), 70b only for complex
  const primaryModel = complexity === 'complex' ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant'

  // 🔁 ReAct Loop — حقن تعليمات التفكير المنظّم في كل نموذج
  const _reactInstruction = `أنت DZ Agent — مساعد ذكاء اصطناعي جزائري. عند الإجابة، فكّر أولاً في السؤال بعمق ثم أجب بوضوح ودقة. لا تُضف ملاحظات تقنية أو مصادر برمجية في الرد النهائي.`
  const enrichedMessages = messages.map((m, i) => {
    if (m.role === 'system' && i === 0) {
      return { ...m, content: `${_reactInstruction}\n\n${m.content}` }
    }
    return m
  })
  const _hasSystem = messages.some(m => m.role === 'system')
  const finalMessages = _hasSystem ? enrichedMessages : [{ role: 'system', content: _reactInstruction }, ...messages]

  // Priority chain: Groq fast → Groq smart → Gemini → Mistral → OpenRouter
  let ok = await streamGroq(res, finalMessages, { maxTokens: effectiveTokens, model: primaryModel })

  if (!ok && primaryModel !== 'llama-3.3-70b-versatile') {
    ok = await streamGroq(res, finalMessages, { maxTokens: effectiveTokens, model: 'llama-3.3-70b-versatile' })
  }

  if (!ok) ok = await streamGemini(res, finalMessages, { maxTokens: effectiveTokens })
  if (!ok) ok = await streamMistral(res, finalMessages, { maxTokens: effectiveTokens })
  if (!ok) ok = await streamOpenRouter(res, finalMessages, { maxTokens: effectiveTokens })

  if (!ok) writeSSE(res, { error: 'all_providers_failed' })
  writeSSE(res, '[DONE]')
  res.end()
}

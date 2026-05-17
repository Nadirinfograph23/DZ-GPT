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

function writeSSE(res, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`data: ${payload}\n\n`)
}

// ── Groq streaming (OpenAI-compatible, native SSE) ────────────────────────
async function streamGroq(res, messages, { maxTokens = 3000, model = 'llama-3.1-8b-instant' } = {}) {
  const key = process.env.AI_API_KEY
  if (!key) return false
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7, stream: true }),
      signal: AbortSignal.timeout(22_000),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      console.warn('[ai-stream] Groq error:', response.status, err.error?.message?.slice(0, 80))
      return false
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let hasContent = false
    let buf = ''

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
          if (token) { hasContent = true; writeSSE(res, { token }) }
        } catch { /* ignore malformed lines */ }
      }
    }
    return hasContent
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[ai-stream] Groq stream failed:', err.message?.slice(0, 80))
    return false
  }
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
    let hasContent = false
    let buf = ''

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
          if (token) { hasContent = true; writeSSE(res, { token }) }
        } catch { /* ignore */ }
      }
    }
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
    let hasContent = false
    let buf = ''

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
          if (token) { hasContent = true; writeSSE(res, { token }) }
        } catch { /* ignore */ }
      }
    }
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
    let hasContent = false
    let buf = ''

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
          if (token) { hasContent = true; writeSSE(res, { token }) }
        } catch { /* ignore */ }
      }
    }
    return hasContent
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[ai-stream] OpenRouter stream failed:', err.message?.slice(0, 80))
    return false
  }
}

/**
 * Stream AI response to Express res via SSE.
 * Priority: Groq (fast 8b) → Groq (70b) → Gemini → Mistral → OpenRouter
 *
 * @param {import('express').Response} res
 * @param {Array<{role:string, content:string}>} messages
 * @param {{ maxTokens?: number, isComplex?: boolean }} opts
 */
export async function streamAIResponse(res, messages, { maxTokens = 3000, isComplex = false } = {}) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const primaryModel = isComplex ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant'

  // Priority chain: Groq fast → Groq smart → Gemini → Mistral → OpenRouter
  let ok = await streamGroq(res, messages, { maxTokens, model: primaryModel })

  if (!ok && primaryModel !== 'llama-3.3-70b-versatile') {
    ok = await streamGroq(res, messages, { maxTokens, model: 'llama-3.3-70b-versatile' })
  }

  if (!ok) ok = await streamGemini(res, messages, { maxTokens })
  if (!ok) ok = await streamMistral(res, messages, { maxTokens })
  if (!ok) ok = await streamOpenRouter(res, messages, { maxTokens })

  if (!ok) writeSSE(res, { error: 'all_providers_failed' })
  writeSSE(res, '[DONE]')
  res.end()
}

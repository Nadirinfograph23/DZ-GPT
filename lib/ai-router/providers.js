// ═══════════════════════════════════════════════════════════════════
// AI Router — Provider Implementations
// Each provider returns { content: string, model: string } or null.
// All calls are timeout-protected and never throw — they return null on failure.
// ═══════════════════════════════════════════════════════════════════

const TIMEOUT_MS = 28_000

function abortAfter(ms) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  return { signal: c.signal, clear: () => clearTimeout(t) }
}

function cleanThinkTags(text) {
  if (!text) return text
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

// ── Gemini (Google AI) ────────────────────────────────────────────
export async function callGemini(messages, { max_tokens = 3000, model = 'gemini-2.5-flash' } = {}) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const { signal, clear } = abortAfter(TIMEOUT_MS)
  try {
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))
    const systemMsg = messages.find(m => m.role === 'system')
    const body = {
      contents,
      generationConfig: { maxOutputTokens: max_tokens, temperature: 0.7 },
    }
    if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] }

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }
    )
    clear()
    if (!r.ok) {
      console.warn(`[Gemini] HTTP ${r.status}`)
      return null
    }
    const d = await r.json()
    const content = d.candidates?.[0]?.content?.parts?.[0]?.text || null
    return content ? { content: cleanThinkTags(content), model: `gemini/${model}` } : null
  } catch (err) {
    clear()
    console.warn('[Gemini] error:', err.message)
    return null
  }
}

// ── Mistral ───────────────────────────────────────────────────────
export async function callMistral(messages, { max_tokens = 3000, model = 'mistral-large-latest' } = {}) {
  const key = process.env.MISTRAL_API_KEY
  if (!key) return null
  const { signal, clear } = abortAfter(TIMEOUT_MS)
  try {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens, temperature: 0.7, stream: false }),
      signal,
    })
    clear()
    if (!r.ok) { console.warn(`[Mistral] HTTP ${r.status}`); return null }
    const d = await r.json()
    const content = d.choices?.[0]?.message?.content || null
    return content ? { content: cleanThinkTags(content), model: `mistral/${model}` } : null
  } catch (err) {
    clear()
    console.warn('[Mistral] error:', err.message)
    return null
  }
}

// ── GitHub Models (OpenAI-compatible) ────────────────────────────
export async function callGitHubModels(messages, { max_tokens = 3000, model = 'gpt-4o-mini' } = {}) {
  const key = process.env.GITHUB_TOKEN
  if (!key) return null
  const { signal, clear } = abortAfter(TIMEOUT_MS)
  try {
    const r = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens, temperature: 0.7 }),
      signal,
    })
    clear()
    if (!r.ok) { console.warn(`[GitHub Models] HTTP ${r.status}`); return null }
    const d = await r.json()
    const content = d.choices?.[0]?.message?.content || null
    return content ? { content: cleanThinkTags(content), model: `github/${model}` } : null
  } catch (err) {
    clear()
    console.warn('[GitHub Models] error:', err.message)
    return null
  }
}

// ── NVIDIA NIM ────────────────────────────────────────────────────
export async function callNvidia(messages, { max_tokens = 3000, model = 'meta/llama-3.3-70b-instruct' } = {}) {
  const key = process.env.NVIDIA_API_KEY
  if (!key) return null
  const { signal, clear } = abortAfter(TIMEOUT_MS)
  try {
    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens, temperature: 0.7, stream: false }),
      signal,
    })
    clear()
    if (!r.ok) { console.warn(`[NVIDIA NIM] HTTP ${r.status}`); return null }
    const d = await r.json()
    const content = d.choices?.[0]?.message?.content || null
    return content ? { content: cleanThinkTags(content), model: `nvidia/${model}` } : null
  } catch (err) {
    clear()
    console.warn('[NVIDIA NIM] error:', err.message)
    return null
  }
}

// ── Cohere ────────────────────────────────────────────────────────
export async function callCohere(messages, { max_tokens = 3000, model = 'command-r-plus' } = {}) {
  const key = process.env.COHERE_API_KEY
  if (!key) return null
  const { signal, clear } = abortAfter(TIMEOUT_MS)
  try {
    const systemMsg = messages.find(m => m.role === 'system')
    const chatHistory = messages
      .filter(m => m.role !== 'system')
      .slice(0, -1)
      .map(m => ({ role: m.role === 'assistant' ? 'CHATBOT' : 'USER', message: m.content }))
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUser) return null

    const r = await fetch('https://api.cohere.ai/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        message: lastUser.content,
        chat_history: chatHistory,
        preamble: systemMsg?.content || undefined,
        max_tokens,
        temperature: 0.7,
      }),
      signal,
    })
    clear()
    if (!r.ok) { console.warn(`[Cohere] HTTP ${r.status}`); return null }
    const d = await r.json()
    const content = d.text || null
    return content ? { content: cleanThinkTags(content), model: `cohere/${model}` } : null
  } catch (err) {
    clear()
    console.warn('[Cohere] error:', err.message)
    return null
  }
}

// ── OpenRouter ────────────────────────────────────────────────────
export async function callOpenRouter(messages, { max_tokens = 3000, model = 'meta-llama/llama-3.3-70b-instruct' } = {}) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return null
  const { signal, clear } = abortAfter(TIMEOUT_MS)
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': 'https://dz-gpt.vercel.app',
        'X-Title': 'DZ-GPT',
      },
      body: JSON.stringify({ model, messages, max_tokens, temperature: 0.7, stream: false }),
      signal,
    })
    clear()
    if (!r.ok) { console.warn(`[OpenRouter] HTTP ${r.status}`); return null }
    const d = await r.json()
    const content = d.choices?.[0]?.message?.content || null
    return content ? { content: cleanThinkTags(content), model: `openrouter/${model}` } : null
  } catch (err) {
    clear()
    console.warn('[OpenRouter] error:', err.message)
    return null
  }
}

// dz Voice Intelligence System — Voice Router
// Sends transcribed text to dz Agent's existing chat/agent endpoints and
// returns the response text. Strictly read-only against the agent core —
// no logic is modified, we just pick the right endpoint and shape the call.
//
// The router tries endpoints in order:
//   1. window.__dzAgentProcess(text)     — in-page hook (set by host app)
//   2. /api/dz-agent-v4/smart             — V4 dispatcher (text/code/image/chart)
//   3. /api/agent                         — generic chat fallback
//   4. /api/chat                          — last-resort minimal fallback
//
// Whichever responds first with usable text wins.

import { Emitter } from './utils.js'

function pickText(data) {
  if (!data || typeof data !== 'object') return ''
  // Common response shapes across the dz-agent endpoints.
  return (
    data.text || data.reply || data.answer || data.message ||
    data.content || data.response || data.format ||
    data?.choices?.[0]?.message?.content ||
    data?.result?.text ||
    ''
  ).toString().trim()
}

async function tryEndpoint(url, body, signal) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!r.ok) return null
    const ct = r.headers.get('content-type') || ''
    if (!ct.includes('json')) return null
    const data = await r.json()
    const text = pickText(data)
    return text ? { text, raw: data, source: url } : null
  } catch {
    return null
  }
}

export function createVoiceRouter({ baseUrl = '' } = {}) {
  const bus = new Emitter()

  return {
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),

    async ask(userText, { language, signal } = {}) {
      const text = String(userText || '').trim()
      if (!text) return { text: '', source: 'noop' }
      bus.emit('thinking', { text, language })

      // 1. In-page hook — host app may inject window.__dzAgentProcess for direct integration.
      if (typeof window !== 'undefined' && typeof window.__dzAgentProcess === 'function') {
        try {
          const reply = await window.__dzAgentProcess(text, { language, source: 'voice' })
          const replyText = typeof reply === 'string' ? reply : pickText(reply)
          if (replyText) { bus.emit('reply', { text: replyText, source: 'window.__dzAgentProcess' }); return { text: replyText, source: 'window.__dzAgentProcess' } }
        } catch (e) { /* swallow and try HTTP */ }
      }

      const endpoints = [
        [`${baseUrl}/api/dz-agent-v4/smart`,   { prompt: text, persist: false }],
        [`${baseUrl}/api/agent`,               { message: text, query: text, language }],
        [`${baseUrl}/api/chat`,                { message: text, query: text }],
      ]
      for (const [url, body] of endpoints) {
        const res = await tryEndpoint(url, body, signal)
        if (res?.text) { bus.emit('reply', res); return res }
      }

      const fallback = language === 'ar'
        ? 'عذراً، لم أستطع الحصول على إجابة الآن. حاول مرة أخرى.'
        : language === 'fr'
          ? "Désolé, je n'ai pas pu obtenir de réponse. Réessayez."
          : "Sorry, I couldn't reach the agent. Please try again."
      bus.emit('reply', { text: fallback, source: 'fallback' })
      return { text: fallback, source: 'fallback' }
    },
  }
}

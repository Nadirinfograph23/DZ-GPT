import { callAIRouter } from '../../lib/ai-router/index.js'
import { handleVideoDiscussion } from '../../modules/youtube_insight_module/controller.js'

function jsonBody(req) {
  if (!req?.body) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

async function youtubeAiGenerate({ messages, max_tokens }) {
  return callAIRouter(messages, {
    max_tokens: Math.min(Number(max_tokens) || 1400, 4096),
    taskHint: 'retrieval',
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end('')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  try {
    const body = jsonBody(req)
    const question = String(body.question || body.text || '').trim()
    if (!question) return res.status(400).json({ ok: false, error: 'question is required' })
    const result = await handleVideoDiscussion(
      body.youtubeContext || body.video || body.context || {},
      question,
      Array.isArray(body.history) ? body.history : [],
      youtubeAiGenerate,
    )
    return res.status(200).json({ ok: true, ...result, model: 'youtube-insight' })
  } catch (err) {
    console.error('[YouTube Insight] direct discussion failed:', err)
    return res.status(502).json({ ok: false, error: err?.message || 'YouTube discussion failed' })
  }
}

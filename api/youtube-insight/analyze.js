import { callAIRouter } from '../../lib/ai-router/index.js'
import { handleYouTubeInput } from '../../modules/youtube_insight_module/controller.js'

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
    const input = String(body.url || body.query || body.text || '').trim()
    if (!input) return res.status(400).json({ ok: false, error: 'url or query is required' })
    const yt = await handleYouTubeInput(input, {
      aiGenerate: youtubeAiGenerate,
      preloadedMeta: body.preloadedMeta || null,
      noSuggestions: !!body.noSuggestions,
    })
    return res.status(200).json({
      ok: true, content: yt?.message || '', model: 'youtube-insight', richType: 'youtube', youtubeFlow: yt?.flow,
      youtubeVideo: yt?.video ? { id: yt.video.id, url: yt.video.url, title: yt.video.title, channel: yt.video.author || yt.video.channel || '', duration: yt.video.duration || 0, views: yt.video.views || 0, thumbnail: yt.video.thumbnail || '', description: yt.video.description || '', captionText: yt.captionText || null } : undefined,
      youtubeResults: (yt?.results || []).map(v => ({ id: v.id, url: v.url, title: v.title, channel: v.channel || '', duration: v.duration || 0, views: v.views || 0, thumbnail: v.thumbnail || '' })),
      youtubeAnalysis: yt?.analysis ? { ok: true, summary: yt.analysis.summary || '', captionAvailable: !!yt.captionText } : undefined,
      youtubeSuggestions: yt?.suggestions || [], captionText: yt?.captionText || null, captionNote: yt?.captionNote || null,
    })
  } catch (err) {
    console.error('[YouTube Insight] direct analyze failed:', err)
    return res.status(502).json({ ok: false, error: err?.message || 'YouTube analysis failed' })
  }
}

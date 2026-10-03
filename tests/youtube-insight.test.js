import assert from 'node:assert/strict'
import { YouTube as workerYouTube } from '../workers/stubs/youtube-sr.js'
import { handleVideoDiscussion } from '../modules/youtube_insight_module/controller.js'
import { isYouTubeResponse } from '../src/lib/youtube-response.js'

const originalFetch = globalThis.fetch

function testWorkerResponseRendersYouTubePanel() {
  const response = {
    model: 'youtube-insight',
    richType: 'youtube',
    youtubeFlow: 'search',
    youtubeResults: [{ id: 'yt000000001', thumbnail: 'https://i.ytimg.com/vi/yt000000001/hqdefault.jpg' }],
  }
  assert.equal(isYouTubeResponse(response), true, 'Worker richType responses should enter the YouTube panel')
  assert.equal(isYouTubeResponse({ isYouTube: true }), true, 'legacy YouTube flags should remain supported')
  assert.equal(isYouTubeResponse({ model: 'static-fact', richType: 'text' }), false)
}

async function testWorkerSearchFillsEightDistinctCards() {
  globalThis.fetch = async input => {
    const url = String(input)
    if (url.startsWith('https://r.jina.ai/')) {
      return new Response([
        '[Jina result 1](https://www.youtube.com/watch?v=ji000000001)',
        '[Jina result 2](https://www.youtube.com/watch?v=ji000000002)',
        '[Jina result 3](https://www.youtube.com/watch?v=ji000000003)',
      ].join('\n'), { status: 200 })
    }
    if (url.includes('youtube.com/results?')) {
      const html = [
        ['yt000000001', 'YouTube result 1'],
        ['yt000000002', 'YouTube result 2'],
        ['yt000000003', 'YouTube result 3'],
      ].map(([id, title]) => `"videoId":"${id}","title":{"runs":[{"text":"${title}"}]}`).join(',')
      return new Response(html, { status: 200 })
    }
    if (url.includes('/api/v1/search')) {
      return new Response(JSON.stringify([
        { videoId: 'yt000000001', title: 'Duplicate result' },
        { videoId: 'in000000001', title: 'Invidious result 1' },
        { videoId: 'in000000002', title: 'Invidious result 2' },
      ]), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('google.com/search')) {
      return new Response('No additional results', { status: 200 })
    }
    return new Response('', { status: 404 })
  }

  const results = await workerYouTube.search('اختبار البحث', { limit: 8 })
  assert.equal(results.length, 8, 'the search should top up to eight available results')
  assert.equal(new Set(results.map(result => result.id)).size, 8, 'results should have distinct video IDs')
  for (const result of results) {
    assert.match(result.id, /^[A-Za-z0-9_-]{11}$/)
    assert.ok(result.title)
    assert.equal(result.thumbnail, `https://i.ytimg.com/vi/${result.id}/hqdefault.jpg`)
  }
}

async function testSelectedVideoDiscussionLoadsCaptions() {
  const videoId = 'video000001'
  const captionText = ('نص تجريبي من الفيديو يشرح الفكرة الأساسية مع تفاصيل عملية وأمثلة واضحة. ').repeat(4).trim()
  const captionTrack = {
    baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=ar`,
    languageCode: 'ar',
    name: { simpleText: 'Arabic' },
  }
  const watchHtml = [
    '<meta property="og:title" content="عنوان الفيديو الحقيقي">',
    '<meta property="og:description" content="وصف الفيديو الحقيقي">',
    '"ownerChannelName":"قناة الاختبار"',
    '"lengthSeconds":"125"',
    '"viewCount":"1000"',
    `"captionTracks":[${JSON.stringify(captionTrack)}]`,
    'x'.repeat(5500),
  ].join('')

  globalThis.fetch = async input => {
    const url = String(input)
    if (url.includes(`youtube.com/watch?v=${videoId}`)) {
      return new Response(watchHtml, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    if (url.includes('youtube.com/api/timedtext')) {
      return new Response(JSON.stringify({
        events: [{ segs: [{ utf8: captionText }] }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response('', { status: 404 })
  }

  let discussionPrompt = ''
  const aiGenerate = async ({ messages }) => {
    const systemMessage = messages.find(message => message.role === 'system')
    if (systemMessage) discussionPrompt = systemMessage.content
    return { content: 'تحليل مبني على النص المستخرج من الفيديو.' }
  }

  const result = await handleVideoDiscussion(
    { id: videoId, title: 'عنوان بطاقة البحث' },
    'لخص لي الفيديو',
    [],
    aiGenerate,
  )

  assert.equal(result.video.id, videoId)
  assert.equal(result.video.title, 'عنوان بطاقة البحث', 'selected-card metadata should be retained')
  assert.equal(result.video.channel, 'قناة الاختبار')
  assert.ok(result.captionText?.includes('نص تجريبي'))
  assert.ok(discussionPrompt.includes('نص حقيقي مستخرج من الفيديو'))
  assert.ok(discussionPrompt.includes('نص تجريبي'))
  assert.match(result.reply, /تحليل مبني/)
}

try {
  testWorkerResponseRendersYouTubePanel()
  console.log('✅ Worker YouTube responses enter the rich thumbnail panel')
  await testWorkerSearchFillsEightDistinctCards()
  console.log('✅ YouTube worker search returns eight distinct thumbnail cards')
  await testSelectedVideoDiscussionLoadsCaptions()
  console.log('✅ Selected-video discussion hydrates metadata and captions')
} finally {
  globalThis.fetch = originalFetch
}
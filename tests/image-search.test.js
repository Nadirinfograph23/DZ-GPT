import assert from 'node:assert/strict'
import worker from '../workers/entry.js'
import {
  extractImageSearchSubject,
  formatImageSearchResponse,
  isImageSearchQuery,
  searchImages,
} from '../lib/image-search/index.js'
import { normalizeImageResults } from '../src/lib/image-results.js'
import { classifyIntent, INTENTS } from '../lib/dz-intent-router.js'

const originalFetch = globalThis.fetch
const requests = []
let pinterestMode = 'success'

globalThis.fetch = async (input, init = {}) => {
  const url = String(input)
  requests.push({ url, headers: init.headers || {} })

  if (url.startsWith('https://www.pinterest.com/search/pins/')) {
    if (pinterestMode === 'blocked') return new Response('blocked', { status: 403 })
    return new Response('', {
      status: 200,
      headers: { 'set-cookie': '_b=ephemeral; Path=/; Secure' },
    })
  }

  if (url.includes('/resource/BaseSearchResource/get/')) {
    const results = pinterestMode === 'success'
      ? [{
          id: 'pin-123',
          title: 'Riyad Mahrez portrait',
          images: { orig: { url: 'https://i.pinimg.com/originals/test-image.jpg', width: 1200, height: 800 } },
          pinner: { full_name: 'Test creator' },
        }]
      : []
    return new Response(JSON.stringify({ resource_response: { data: { results } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (url.startsWith('https://api.openverse.org/v1/images/')) {
    return new Response(JSON.stringify({
      results: [
        {
          url: 'https://images.example/riyad-mahrez.jpg',
          thumbnail: 'https://images.example/riyad-mahrez-thumb.jpg',
          title: 'Riyad Mahrez portrait in Algeria shirt',
          foreign_landing_url: 'https://openverse.org/records/mahrez',
          license: 'by',
          creator: 'Test photographer',
          width: 1200,
          height: 800,
        },
        {
          url: 'https://images.example/football-stadium.jpg',
          thumbnail: 'https://images.example/football-stadium-thumb.jpg',
          title: 'Football stadium',
          foreign_landing_url: 'https://openverse.org/records/stadium',
          license: 'by',
          width: 1200,
          height: 800,
        },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  if (url.startsWith('https://commons.wikimedia.org/w/api.php')) {
    const params = new URL(url).searchParams
    if (params.get('list') === 'search') {
      return new Response(JSON.stringify({
        query: { search: [{ title: 'File:Riyad Mahrez portrait.jpg' }] },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({
      query: {
        pages: {
          123: {
            title: 'File:Riyad Mahrez portrait.jpg',
            imageinfo: [{
              url: 'https://images.example/riyad-mahrez.jpg',
              thumburl: 'https://images.example/riyad-mahrez-thumb.jpg',
              width: 1200,
              height: 800,
              thumbwidth: 700,
              thumbheight: 467,
              mime: 'image/jpeg',
              extmetadata: {
                ObjectName: { value: 'Riyad Mahrez portrait' },
                LicenseShortName: { value: 'CC BY-SA' },
                Artist: { value: 'Test photographer' },
              },
            }],
          },
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  throw new Error('Unexpected image-search request: ' + url)
}

try {
  const naturalRequests = [
    'صور رياض محرز',
    'رياض محرز بالصور',
    'وريني رياض محرز',
    'أريد أن أرى رياض محرز',
    'photos de Riyad Mahrez',
    'show me Riyad Mahrez',
    'ابحث عن صور لرياض محرز',
    'صور مسجد الفرقان في عنابة',
  ]
  for (const query of naturalRequests) {
    assert.equal(isImageSearchQuery(query), true, `should detect natural image intent: ${query}`)
    assert.equal(classifyIntent(query).intent, INTENTS.IMAGE_SEARCH, `intent router should route image query: ${query}`)
  }
  assert.equal(isImageSearchQuery('من هو رياض محرز؟'), false, 'a normal person question must remain a normal question')
  assert.equal(classifyIntent('من هو رياض محرز؟').intent, INTENTS.SPORTS_PLAYER)
  assert.equal(isImageSearchQuery('أنشئ صورة لرياض محرز'), false, 'image generation must not enter image search')
  assert.equal(isImageSearchQuery('show me the code'), false, 'a non-visual show-me request must remain normal chat')
  assert.equal(isImageSearchQuery('وريني الكود'), false, 'an Arabic code request must remain normal chat')

  const expectedSubjects = [
    ['صور رياض محرز', 'رياض محرز'],
    ['رياض محرز بالصور', 'رياض محرز'],
    ['وريني رياض محرز', 'رياض محرز'],
    ['أريد أن أرى رياض محرز', 'رياض محرز'],
    ['photos de Riyad Mahrez', 'Riyad Mahrez'],
    ['show me Riyad Mahrez', 'Riyad Mahrez'],
    ['ابحث عن صور لرياض محرز', 'رياض محرز'],
    ['صور مسجد الفرقان في عنابة', 'مسجد الفرقان في عنابة'],
    ['صور لبنان', 'لبنان'],
    ['صور للبنان', 'لبنان'],
    ['ابحث عن صور لبنان', 'لبنان'],
    ['ابحث عن صور للبنان', 'لبنان'],
  ]
  for (const [query, subject] of expectedSubjects) {
    assert.equal(extractImageSearchSubject(query), subject, `should preserve the actual subject for: ${query}`)
  }

  const pinterestStart = requests.length
  const pinterestResult = await searchImages({
    query: 'interior design image regression',
    limit: 4,
    preferredSource: 'pinterest',
  })
  assert.equal(pinterestResult.images.length, 1)
  assert.equal(pinterestResult.images[0].source, 'Pinterest')
  assert.match(pinterestResult.images[0].url, /^https:\/\/i\.pinimg\.com\//)
  assert.equal(requests.length - pinterestStart, 2, 'successful Pinterest search must not call fallback providers')
  assert.match(requests[pinterestStart + 1].headers.Cookie || '', /_b=ephemeral/, 'warm-up cookies must stay request-scoped')

  const fallbackStart = requests.length
  pinterestMode = 'empty'
  const fallbackResult = await searchImages({
    query: 'show me Riyad Mahrez fallback regression',
    limit: 5,
    preferredSource: 'pinterest',
  })
  const fallbackRequests = requests.slice(fallbackStart)
  assert.ok(fallbackResult.images.length > 0, 'Openverse/Wikimedia should fill an empty Pinterest result')
  assert.ok(fallbackResult.images.every(image => ['Openverse', 'Wikimedia Commons'].includes(image.source)))
  assert.equal(fallbackResult.images.filter(image => image.fullUrl === 'https://images.example/riyad-mahrez.jpg').length, 1, 'duplicate provider URLs must be removed')
  assert.ok(
    fallbackResult.images.findIndex(image => image.title === 'Riyad Mahrez portrait in Algeria shirt')
      < fallbackResult.images.findIndex(image => image.title === 'Football stadium'),
    'more relevant image titles should rank ahead of unrelated matches',
  )
  assert.ok(fallbackRequests.some(request => request.url.startsWith('https://api.openverse.org/')))
  assert.ok(fallbackRequests.some(request => request.url.startsWith('https://commons.wikimedia.org/')))
  assert.ok(fallbackRequests.every(request => !/bing|google|duckduckgo|unsplash|pexels|pixabay/i.test(request.url)))

  const blockedStart = requests.length
  pinterestMode = 'blocked'
  const blockedResult = await searchImages({
    query: 'photos de Riyad Mahrez blocked regression',
    limit: 4,
    preferredSource: 'pinterest',
  })
  assert.ok(blockedResult.images.length > 0, 'an HTTP-blocked Pinterest request should silently fall back')
  assert.ok(requests.slice(blockedStart).some(request => request.url.startsWith('https://api.openverse.org/')))
  assert.ok(requests.slice(blockedStart).some(request => request.url.startsWith('https://commons.wikimedia.org/')))

  const defaultStart = requests.length
  pinterestMode = 'success'
  const defaultResult = await searchImages({ query: 'historical archive image regression', limit: 4 })
  assert.equal(defaultResult.preferredSource, 'pinterest', 'unqualified image searches should default to Pinterest')
  assert.equal(defaultResult.images[0]?.source, 'Pinterest')
  assert.equal(requests.length - defaultStart, 2, 'default Pinterest success should avoid fallback calls')

  const mosqueResult = await searchImages({ query: 'صور مسجد الفرقان في عنابة', limit: 2 })
  assert.equal(mosqueResult.query, 'Al Furqan Mosque Annaba Algeria')
  const mosqueApiRequest = requests.findLast(request => request.url.includes('/resource/BaseSearchResource/get/'))
  const pinterestSearchQuery = JSON.parse(new URL(mosqueApiRequest.url).searchParams.get('data')).options.query
  assert.equal(decodeURIComponent(pinterestSearchQuery), 'Al Furqan Mosque Annaba Algeria')

  const normalized = normalizeImageResults([
    { url: 'https://i.pinimg.com/originals/one.jpg', thumbnail: 'https://i.pinimg.com/236x/one.jpg', title: 'Valid' },
    { url: 'javascript:alert(1)', title: 'Invalid scheme' },
    { url: '', fullUrl: 'https://images.example/two.jpg', thumbnail: 'data:image/png;base64,broken' },
  ], 9)
  assert.equal(normalized.length, 2, 'image-grid normalization should discard results without a safe HTTP(S) URL')
  assert.equal(normalized[0].url, 'https://i.pinimg.com/236x/one.jpg')
  assert.equal(normalized[1].url, 'https://images.example/two.jpg')

  const workerStart = requests.length
  const workerRequest = new Request('https://dzagent.app/api/dz-agent-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'show me Riyad Mahrez' }] }),
  })
  const workerResponse = await worker.fetch(workerRequest, {}, {})
  const workerBody = await workerResponse.json()
  assert.equal(workerResponse.status, 200)
  assert.equal(workerBody.mode, 'image-search')
  assert.equal(workerBody._imageSearch, true)
  assert.ok(workerBody.images.length > 0, 'Worker chat route should return structured gallery images')
  assert.equal(requests.length - workerStart, 2, 'Worker route should use the successful Pinterest provider directly')

  const emptyResponse = formatImageSearchResponse({
    images: [],
    query: 'interior design',
    originalQuery: 'ديكور',
    preferredSource: 'pinterest',
  })
  assert.match(emptyResponse, /pinterest\.com\/search\/pins/)
  assert.doesNotMatch(emptyResponse, /commons\.wikimedia\.org/)
  const defaultEmptyResponse = formatImageSearchResponse({
    images: [],
    query: 'ancient architecture',
    originalQuery: 'ancient architecture',
    preferredSource: 'auto',
  })
  assert.match(defaultEmptyResponse, /pinterest\.com\/search\/pins/)
  assert.doesNotMatch(defaultEmptyResponse, /commons\.wikimedia\.org/)

  console.log('Image-search intent, subject extraction, fallback, ranking, gallery payload, and URL-safety checks passed.')
} finally {
  globalThis.fetch = originalFetch
}

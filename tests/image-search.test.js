import assert from 'node:assert/strict'
import { searchImages, formatImageSearchResponse } from '../lib/image-search/index.js'
import { normalizeImageResults } from '../src/lib/image-results.js'

const originalFetch = globalThis.fetch
const requests = []
globalThis.fetch = async (input, init = {}) => {
  const url = String(input)
  requests.push({ url, headers: init.headers || {} })
  if (url.startsWith('https://www.pinterest.com/search/pins/')) {
    return new Response('', { status: 200, headers: { 'set-cookie': '_b=ephemeral; Path=/; Secure' } })
  }
  if (url.includes('/resource/BaseSearchResource/get/')) {
    return new Response(JSON.stringify({ resource_response: { data: { results: [{
      id: 'pin-123',
      title: 'Pinterest result',
      images: { orig: { url: 'https://i.pinimg.com/originals/test-image.jpg', width: 1200, height: 800 } },
      pinner: { full_name: 'Test creator' },
    }] } } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  throw new Error('Unexpected non-Pinterest request: ' + url)
}

try {
  const result = await searchImages({ query: 'interior design image regression', limit: 4, preferredSource: 'pinterest' })
  assert.equal(result.images.length, 1)
  assert.equal(result.images[0].source, 'Pinterest')
  assert.match(result.images[0].url, /^https:\/\/i\.pinimg\.com\//)
  assert.equal(requests.length, 2, 'Pinterest mode must not call Wikimedia or other providers')
  assert.match(requests[1].headers.Cookie || '', /_b=ephemeral/, 'warm-up cookies should be scoped to the API request')

  const beforeDefaultRequests = requests.length
  const defaultResult = await searchImages({ query: 'historical archive image regression', limit: 4 })
  assert.equal(defaultResult.preferredSource, 'pinterest', 'unqualified image searches should default to Pinterest')
  assert.equal(defaultResult.images[0]?.source, 'Pinterest')
  assert.equal(requests.length - beforeDefaultRequests, 2, 'default Pinterest mode must not call Wikimedia or other providers')
  assert.ok(requests.slice(beforeDefaultRequests).every(request => request.url.startsWith('https://www.pinterest.com/')))

  const normalized = normalizeImageResults([
    { url: 'https://i.pinimg.com/originals/one.jpg', thumbnail: 'https://i.pinimg.com/236x/one.jpg', title: 'Valid' },
    { url: 'javascript:alert(1)', title: 'Invalid scheme' },
    { url: '', fullUrl: 'https://images.example/two.jpg', thumbnail: 'data:image/png;base64,broken' },
  ], 9)
  assert.equal(normalized.length, 2, 'image-grid normalization should discard results without a safe HTTP(S) URL')
  assert.equal(normalized[0].url, 'https://i.pinimg.com/236x/one.jpg')
  assert.equal(normalized[1].url, 'https://images.example/two.jpg')

  const emptyResponse = formatImageSearchResponse({ images: [], query: 'interior design', originalQuery: 'ديكور', preferredSource: 'pinterest' })
  assert.match(emptyResponse, /pinterest\.com\/search\/pins/)
  assert.doesNotMatch(emptyResponse, /commons\.wikimedia\.org/)
  const defaultEmptyResponse = formatImageSearchResponse({ images: [], query: 'ancient architecture', originalQuery: 'ancient architecture', preferredSource: 'auto' })
  assert.match(defaultEmptyResponse, /pinterest\.com\/search\/pins/)
  assert.doesNotMatch(defaultEmptyResponse, /commons\.wikimedia\.org/)
  console.log('Pinterest image-search regression checks passed.')
} finally {
  globalThis.fetch = originalFetch
}

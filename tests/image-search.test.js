import assert from 'node:assert/strict'
import { searchImages, formatImageSearchResponse } from '../lib/image-search/index.js'

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

  const emptyResponse = formatImageSearchResponse({ images: [], query: 'interior design', originalQuery: 'ديكور', preferredSource: 'pinterest' })
  assert.match(emptyResponse, /pinterest\.com\/search\/pins/)
  assert.doesNotMatch(emptyResponse, /commons\.wikimedia\.org/)
  console.log('Pinterest image-search regression checks passed.')
} finally {
  globalThis.fetch = originalFetch
}

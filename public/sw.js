const SHELL_CACHE = 'dz-gpt-shell-v5'
const AUDIO_CACHE = 'dz-tube-audio-v1'
const ALL_CACHES = [SHELL_CACHE, AUDIO_CACHE]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(['/pwa-192x192.png', '/pwa-512x512.png', '/manifest.webmanifest'])
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !ALL_CACHES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' })))
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // ── Audio streaming proxy: network-first, cache fallback ─────────────────
  // These are the audio byte-pipe endpoints. We pass them through normally
  // (never intercept the stream) but on network failure we serve from cache.
  // Range requests are left completely alone so the browser's buffering works.
  if (
    url.pathname.startsWith('/api/dz-tube/audio-proxy') ||
    url.pathname.startsWith('/api/dz-tube/audio-pipe') ||
    url.pathname.startsWith('/api/stream')
  ) {
    // Range requests must not be cached — let them pass through untouched.
    if (request.headers.get('range')) return
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful, non-partial full responses.
          if (response.ok && response.status === 200) {
            const clone = response.clone()
            caches.open(AUDIO_CACHE).then((cache) => {
              try { cache.put(request, clone) } catch {}
            })
          }
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // ── All other /api/ routes: pass through without interference ─────────────
  if (url.pathname.startsWith('/api/')) return

  // ── Navigation requests: network-first, shell cache fallback ─────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          const clone = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match(request)))
})

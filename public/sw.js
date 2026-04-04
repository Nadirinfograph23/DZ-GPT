// ─── Cache names ────────────────────────────────────────────────
const SHELL_CACHE  = 'dz-gpt-shell-v2'   // HTML / navigation
const ASSET_CACHE  = 'dz-gpt-assets-v2'  // hashed JS/CSS/images
const ALL_CACHES   = [SHELL_CACHE, ASSET_CACHE]

// ─── Install: pre-cache only the app shell icons ────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(['/pwa-192x192.png', '/pwa-512x512.png', '/manifest.webmanifest'])
    )
  )
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting()
})

// ─── Activate: delete every old cache ───────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k))
      )
    ).then(() => {
      // Take control of all open pages immediately
      self.clients.claim()
      // Tell every tab: "new version active, please reload"
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }))
      })
    })
  )
})

// ─── Fetch strategy ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 1. Never intercept API calls
  if (url.pathname.startsWith('/api/')) return

  // 2. Hashed assets (/assets/index-AbC123.js) → cache-first
  //    They are content-addressed; if the hash changed it's a new file.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      })
    )
    return
  }

  // 3. Navigation (HTML) → network-first so updates are always visible
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Refresh the shell cache with the latest HTML
          const clone = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match(request))  // offline fallback
    )
    return
  }

  // 4. Everything else → network-first, fall back to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          caches.open(SHELL_CACHE).then((c) => c.put(request, response.clone()))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})

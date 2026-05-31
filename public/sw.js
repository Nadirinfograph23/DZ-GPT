// DZ GPT — Service Worker v2.0
// يدعم: PWA install، offline caching، push notifications، permissions hint
const SHELL_CACHE = 'dz-gpt-shell-v6'
const AUDIO_CACHE = 'dz-tube-audio-v1'
const ALL_CACHES  = [SHELL_CACHE, AUDIO_CACHE]

// ── Install: pre-cache shell ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll([
        '/pwa-192x192.png',
        '/pwa-512x512.png',
        '/manifest.webmanifest',
      ]).catch(() => {}))
  )
  self.skipWaiting()
})

// ── Activate: clean old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !ALL_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(cs => cs.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  )
})

// ── Fetch: network-first حسب نوع الطلب ────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Audio streaming — network-first، cache fallback، بدون Range requests
  if (
    url.pathname.startsWith('/api/dz-tube/audio-proxy') ||
    url.pathname.startsWith('/api/dz-tube/audio-pipe') ||
    url.pathname.startsWith('/api/stream')
  ) {
    if (request.headers.get('range')) return
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && response.status === 200) {
            const clone = response.clone()
            caches.open(AUDIO_CACHE).then(c => { try { c.put(request, clone) } catch {} })
          }
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // API calls — pass-through بدون cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return

  // Navigation — network-first، shell cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          const clone = response.clone()
          caches.open(SHELL_CACHE).then(c => c.put(request, clone))
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // Static assets — network-first
  event.respondWith(
    fetch(request, { cache: 'no-store' }).catch(() => caches.match(request))
  )
})

// ── Push notifications ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json().catch(() => null) ||
    { title: 'DZ GPT', body: 'رسالة جديدة' }
  event.waitUntil(
    self.registration.showNotification(data.title || 'DZ GPT', {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      dir: 'rtl',
      lang: 'ar',
      tag: 'dz-gpt',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(cs => {
        const open = cs.find(c => c.url.includes(self.location.origin) && 'focus' in c)
        return open ? open.focus() : clients.openWindow('/')
      })
  )
})

// ── رسالة من الصفحة ────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

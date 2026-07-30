// DZ GPT — Service Worker v5.0
// يدعم: PWA install، offline caching، push notifications، auto-update versioning
const SHELL_CACHE   = 'dz-gpt-shell-v13'  // ← رُفع لإجبار كل المتصفحات على استلام SW_UPDATED
const AUDIO_CACHE   = 'dz-tube-audio-v1'
const ALL_CACHES    = [SHELL_CACHE, AUDIO_CACHE]
const VERSION_CHECK_INTERVAL = 2 * 60 * 1000  // 2 دقائق — أسرع كشف

let _lastCommit = null

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

// ── Activate: clean old caches + force-reload all clients ─────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !ALL_CACHES.includes(k)).map(k => {
          console.log(`[SW] 🗑️ Deleting old cache: ${k}`)
          return caches.delete(k)
        })
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(cs => {
        // أرسل SW_UPDATED فقط — الـ versionChecker يتولى الـ reload
        cs.forEach(c => c.postMessage({ type: 'SW_UPDATED' }))
      })
      .then(() => checkVersionPeriodically())
  )
})

// ── Version Check ─────────────────────────────────────────────────────────
async function checkVersion() {
  try {
    const res = await fetch('/api/version', {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!res.ok) return
    const data = await res.json()
    const commit = data.commit || data.version

    if (_lastCommit && commit && _lastCommit !== commit) {
      console.log(`[SW] 🆕 New version detected: ${_lastCommit} → ${commit}`)
      const clients = await self.clients.matchAll({ type: 'window' })
      clients.forEach(c => c.postMessage({ type: 'NEW_VERSION', version: commit, prev: _lastCommit }))
    }
    if (commit) _lastCommit = commit
  } catch {}
}

function checkVersionPeriodically() {
  checkVersion()
  setInterval(checkVersion, VERSION_CHECK_INTERVAL)
}

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

  // JS/CSS/HTML — لا كاش أبداً — network فقط
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.tsx') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.includes('/assets/')
  ) {
    event.respondWith(fetch(request, { cache: 'no-store' }))
    return
  }

  // Static assets — network-first, cache fallback (صور، خطوط...)
  event.respondWith(
    fetch(request, { cache: 'no-store' }).catch(() => caches.match(request))
  )
})

// ── Push notifications ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'DZ GPT', body: 'رسالة جديدة' }
  if (event.data) {
    try { data = event.data.json() } catch {
      try { data = { title: 'DZ GPT', body: event.data.text() } } catch {}
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'DZ GPT', {
      body:    data.body || '',
      icon:    '/pwa-192x192.png',
      badge:   '/pwa-192x192.png',
      dir:     'rtl',
      lang:    'ar',
      tag:     data.tag || 'dz-gpt',
      data:    data,
      vibrate: [200, 100, 200],
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

// ── رسائل من الصفحة ────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'CHECK_VERSION') checkVersion()
})

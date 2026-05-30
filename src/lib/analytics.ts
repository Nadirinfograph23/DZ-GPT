const _queue: Array<{ feature: string; event: string; meta?: unknown }> = []
let _flushing = false

async function _flush() {
  if (_flushing || _queue.length === 0) return
  _flushing = true
  const batch = _queue.splice(0, 10)
  try {
    await Promise.all(
      batch.map(({ feature, event, meta }) =>
        fetch('/api/analytics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature, event, meta }),
          keepalive: true,
        }).catch(() => {})
      )
    )
  } finally {
    _flushing = false
    if (_queue.length > 0) _flush()
  }
}

export function trackEvent(feature: string, event: string, meta?: Record<string, unknown>) {
  _queue.push({ feature, event, meta })
  setTimeout(_flush, 200)
}

export function trackPageView(page: string) {
  trackEvent(page, 'page_view')
}

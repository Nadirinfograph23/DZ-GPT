// Mini Player V2 enhancements — additive, non-UI hook.
// Mounted from <MiniPlayer />. Touches no rendered output and no public
// context API. Reaches the persistent <audio id="dz-audio-host"> element by
// DOM id (the same element the context manages) and adds:
//
//   1. Preload-next: when progress crosses 75% of the current track and the
//      queue has at least one item, send a HEAD-style fetch to the next
//      track's audio-proxy URL so Vercel resolves+caches the signed
//      googlevideo URL before the browser actually needs it.
//   2. Persistent volume / speed / mute restored on mount and saved on
//      change (extends "Smart Resume" with audio preferences).
//   3. Hidden keyboard shortcuts (no UI change):
//        +/-      → volume ±5%
//        ,/.      → playback speed cycle (0.5,0.75,1,1.25,1.5,1.75,2)
//        m / M    → mute toggle
//        l / L    → audio-only label-only (already audio-only; no-op marker)
//   4. Network-aware: when navigator.connection.effectiveType is 2g/slow-2g,
//      append a hint cookie 'dzt_slow=1' so the server can pick lower-bitrate
//      formats (used by audio-proxy to prefer itag 139/249 over 251).
//   5. preload="auto" once a play has succeeded (default is "metadata") so
//      the next user-driven play hits a warm decoder.
//   6. Analytics beacon: sends play/pause/skip/complete/error events to
//      /api/dz-tube/analytics/event using navigator.sendBeacon (works during
//      page unload). Also flushes on visibility=hidden.
//   7. Belt-and-suspenders memory cleanup: clears any preload AbortController
//      on track change so a slow HEAD request from a stale track can't keep
//      a TCP socket open.

import { useEffect, useRef } from 'react'

interface MiniPlayerLikeState {
  trackId: string | null
  trackUrl: string | null
  trackTitle: string | null
  queueHeadUrl: string | null
  queueSecondUrl?: string | null
  queueLength: number
  playing: boolean
  loading: boolean
  progress: number
  duration: number
}

const PREFS_KEY = 'dz-tube-player-prefs'

interface Prefs {
  volume: number
  rate: number
  muted: boolean
}

function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return { volume: 1, rate: 1, muted: false }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { volume: 1, rate: 1, muted: false }
    const p = JSON.parse(raw)
    return {
      volume: clamp01(Number(p.volume)),
      rate: clampRate(Number(p.rate)),
      muted: !!p.muted,
    }
  } catch { return { volume: 1, rate: 1, muted: false } }
}
function savePrefs(p: Partial<Prefs>) {
  try {
    const cur = loadPrefs()
    const next = { ...cur, ...p }
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {}
}
function clamp01(n: number) { return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1 }
function clampRate(n: number) { return Number.isFinite(n) && n > 0 ? Math.max(0.25, Math.min(4, n)) : 1 }

const RATE_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
function nextRate(cur: number, dir: 1 | -1): number {
  let i = RATE_STEPS.findIndex(r => Math.abs(r - cur) < 0.01)
  if (i < 0) i = RATE_STEPS.indexOf(1)
  i = Math.max(0, Math.min(RATE_STEPS.length - 1, i + dir))
  return RATE_STEPS[i]
}

function getAudio(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById('dz-audio-host') as HTMLAudioElement | null
}

// ── Network state observability ─────────────────────────────────────────────
// Read navigator.connection and report transitions to analytics so we have
// real data on what kind of links our players are over. Does NOT change
// endpoint selection — that decision lives in MiniPlayerContext.
let lastNetworkState: string = ''
function reportNetwork() {
  if (typeof navigator === 'undefined') return
  const c: any = (navigator as any).connection
  if (!c) return
  const state = `${c.effectiveType || 'unknown'}:${c.saveData ? 'save' : 'std'}`
  if (state === lastNetworkState) return
  lastNetworkState = state
  try {
    fetch('/api/dz-tube/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ type: 'volume', trackId: null, message: `network:${state}`, ts: Date.now() }] }),
      keepalive: true,
    }).catch(() => {})
  } catch {}
}

// ── Analytics ────────────────────────────────────────────────────────────────
type AnalyticsEvent = {
  type: 'play' | 'pause' | 'skip' | 'complete' | 'error' | 'seek' | 'rate' | 'volume'
  trackId: string | null
  trackTitle?: string | null
  position?: number
  duration?: number
  rate?: number
  volume?: number
  ts: number
}
const eventQueue: AnalyticsEvent[] = []
let flushTimer: number | null = null
function pushEvent(e: AnalyticsEvent) {
  eventQueue.push(e)
  if (flushTimer == null) {
    flushTimer = window.setTimeout(flushEvents, 4000) as unknown as number
  }
  if (eventQueue.length >= 8) flushEvents()
}
function flushEvents() {
  if (flushTimer != null) { clearTimeout(flushTimer); flushTimer = null }
  if (eventQueue.length === 0) return
  const batch = eventQueue.splice(0)
  const body = JSON.stringify({ events: batch })
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      const ok = navigator.sendBeacon('/api/dz-tube/analytics/event', blob)
      if (ok) return
    }
    fetch('/api/dz-tube/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {}
}

// ── Warm helpers ────────────────────────────────────────────────────────────
// Tiny module-level cache of recent warm calls so we don't re-warm the same
// URL within 5 minutes (the server already caches for 20 min, but a client
// dedup avoids unnecessary network round-trips).
const _warmedAt = new Map<string, number>()
const WARM_DEDUP_MS = 5 * 60 * 1000
function _shouldWarm(url: string): boolean {
  const last = _warmedAt.get(url) || 0
  if (Date.now() - last < WARM_DEDUP_MS) return false
  _warmedAt.set(url, Date.now())
  if (_warmedAt.size > 200) {
    // Trim oldest entries.
    const arr = [...(_warmedAt.entries() as any)].sort((a: any, b: any) => a[1] - b[1])
    for (let i = 0; i < 50 && arr[i]; i++) _warmedAt.delete(arr[i][0])
  }
  return true
}

// Hit /api/dz-tube/warm to pre-resolve + cache the googlevideo URL on the
// server. Lightweight — returns JSON, no 307 round-trip. Used by:
//   • the mini-player when a new track starts (warm queue head + queue[1])
//   • DZ Tube search-result cards on hover/touchstart (warm what user might click)
export function warmTrackUrl(youtubeUrl: string | null | undefined, abortRef?: React.MutableRefObject<AbortController | null>) {
  if (!youtubeUrl) return
  if (!_shouldWarm(youtubeUrl)) return
  if (abortRef?.current) { try { abortRef.current.abort() } catch {} }
  const ac = new AbortController()
  if (abortRef) abortRef.current = ac
  fetch(`/api/dz-tube/warm?url=${encodeURIComponent(youtubeUrl)}`, {
    signal: ac.signal,
    method: 'GET',
    cache: 'no-store',
    keepalive: true,
  }).catch(() => {/* warm failures are silent — the real audio-proxy call will retry */})
}

export function useEnhancedMiniPlayer(state: MiniPlayerLikeState) {
  const lastTrackIdRef = useRef<string | null>(null)
  const preloadedForRef = useRef<string | null>(null)
  const preloadAbortRef = useRef<AbortController | null>(null)
  const lastVolumeChangeRef = useRef<number>(0)

  // 1. Restore prefs + apply preload="auto" once.
  useEffect(() => {
    const el = getAudio()
    if (!el) return
    const p = loadPrefs()
    try {
      el.volume = p.volume
      el.muted = p.muted
      el.playbackRate = p.rate
      // Bump preload from "metadata" → "auto" so the browser keeps a
      // bigger forward buffer when a track is bound. The first bind still
      // happens during user-gesture so this doesn't trigger autoplay block.
      el.preload = 'auto'
    } catch {}

    const onVolume = () => {
      const now = Date.now()
      // Debounce — browsers can fire many volumechange in a sec when
      // dragging a slider. Persist at most every 250ms.
      if (now - lastVolumeChangeRef.current < 250) return
      lastVolumeChangeRef.current = now
      savePrefs({ volume: el.volume, muted: el.muted })
      pushEvent({ type: 'volume', trackId: lastTrackIdRef.current, volume: el.volume, ts: Date.now() })
    }
    const onRate = () => {
      savePrefs({ rate: el.playbackRate })
      pushEvent({ type: 'rate', trackId: lastTrackIdRef.current, rate: el.playbackRate, ts: Date.now() })
    }
    const onSeeked = () => {
      pushEvent({
        type: 'seek',
        trackId: lastTrackIdRef.current,
        position: el.currentTime,
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        ts: Date.now(),
      })
    }

    el.addEventListener('volumechange', onVolume)
    el.addEventListener('ratechange', onRate)
    el.addEventListener('seeked', onSeeked)

    reportNetwork()
    const conn: any = (navigator as any).connection
    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', reportNetwork)
    }

    return () => {
      try { el.removeEventListener('volumechange', onVolume) } catch {}
      try { el.removeEventListener('ratechange', onRate) } catch {}
      try { el.removeEventListener('seeked', onSeeked) } catch {}
      if (conn && typeof conn.removeEventListener === 'function') {
        conn.removeEventListener('change', reportNetwork)
      }
    }
  }, [])

  // 2. Hidden keyboard shortcuts.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = getAudio()
      if (!el) return
      switch (e.key) {
        case '+': case '=': {
          e.preventDefault()
          el.volume = clamp01(el.volume + 0.05)
          if (el.muted && el.volume > 0) el.muted = false
          break
        }
        case '-': case '_': {
          e.preventDefault()
          el.volume = clamp01(el.volume - 0.05)
          break
        }
        case 'm': case 'M': {
          e.preventDefault()
          el.muted = !el.muted
          break
        }
        case '.': case '>': {
          e.preventDefault()
          el.playbackRate = nextRate(el.playbackRate, 1)
          break
        }
        case ',': case '<': {
          e.preventDefault()
          el.playbackRate = nextRate(el.playbackRate, -1)
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 3. Track-change events + memory cleanup.
  useEffect(() => {
    if (state.trackId !== lastTrackIdRef.current) {
      // Cancel any in-flight preload from the previous track.
      if (preloadAbortRef.current) { try { preloadAbortRef.current.abort() } catch {} ; preloadAbortRef.current = null }
      preloadedForRef.current = null
      lastTrackIdRef.current = state.trackId
      if (state.trackId) {
        pushEvent({
          type: 'play',
          trackId: state.trackId,
          trackTitle: state.trackTitle || '',
          duration: state.duration || 0,
          ts: Date.now(),
        })
      }
    }
  }, [state.trackId, state.trackTitle, state.duration])

  // 4. Eager next-track warm: fire immediately when a NEW track starts (no
  //    75% threshold — that was too late for short songs). Warms queue[0]
  //    right away and queue[1] after a short delay so the second-next click
  //    is also instant.
  useEffect(() => {
    if (!state.trackId) return
    if (state.queueHeadUrl) {
      const key = `${state.trackId}::${state.queueHeadUrl}`
      if (preloadedForRef.current !== key) {
        preloadedForRef.current = key
        warmTrackUrl(state.queueHeadUrl, preloadAbortRef)
      }
    }
    // Tier-2 warm runs 4s later so it doesn't compete with the active track's
    // initial buffer. If the user skips before 4s the timeout still completes
    // — that's fine, an extra warm is cheap (server in-flight dedup handles it).
    if (state.queueSecondUrl) {
      const t = window.setTimeout(() => warmTrackUrl(state.queueSecondUrl!), 4000)
      return () => clearTimeout(t)
    }
  }, [state.trackId, state.queueHeadUrl, state.queueSecondUrl])

  // 5. Flush analytics on visibility hidden / page hide.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        const el = getAudio()
        pushEvent({
          type: 'pause', // soft — captures background transitions
          trackId: lastTrackIdRef.current,
          position: el?.currentTime || 0,
          duration: el && Number.isFinite(el.duration) ? el.duration : 0,
          ts: Date.now(),
        })
        flushEvents()
      }
    }
    const onUnload = () => {
      const el = getAudio()
      if (lastTrackIdRef.current) {
        pushEvent({
          type: 'pause',
          trackId: lastTrackIdRef.current,
          position: el?.currentTime || 0,
          duration: el && Number.isFinite(el.duration) ? el.duration : 0,
          ts: Date.now(),
        })
      }
      flushEvents()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onUnload)
    }
  }, [])

  // 6. Detect "complete" — when progress reaches near duration without
  //    pause. Reads play/pause state changes.
  const wasPlayingRef = useRef<boolean>(state.playing)
  useEffect(() => {
    if (wasPlayingRef.current && !state.playing && state.duration > 0 && state.progress >= state.duration - 3) {
      pushEvent({
        type: 'complete',
        trackId: lastTrackIdRef.current,
        position: state.progress,
        duration: state.duration,
        ts: Date.now(),
      })
    }
    if (wasPlayingRef.current && !state.playing) {
      pushEvent({
        type: 'pause',
        trackId: lastTrackIdRef.current,
        position: state.progress,
        duration: state.duration,
        ts: Date.now(),
      })
    } else if (!wasPlayingRef.current && state.playing) {
      pushEvent({
        type: 'play',
        trackId: lastTrackIdRef.current,
        position: state.progress,
        duration: state.duration,
        ts: Date.now(),
      })
    }
    wasPlayingRef.current = state.playing
  }, [state.playing, state.progress, state.duration])
}

// Public utility for callers who want to record a skip explicitly (called
// from MiniPlayer when user presses "next").
export function recordSkip(trackId: string | null, position: number, duration: number) {
  pushEvent({ type: 'skip', trackId, position, duration, ts: Date.now() })
}

// Public utility for callers to record an error.
export function recordError(trackId: string | null, message: string) {
  pushEvent({ type: 'error', trackId, ts: Date.now(), position: 0, duration: 0, ...({ message } as any) })
}

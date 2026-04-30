// Mini Player V2 enhancements — additive, non-UI hook.
// Mounted from <MiniPlayer />. Touches no rendered output and no public
// context API.
//
// Updated for YouTube IFrame Player API (Apr 2026): the legacy <audio>
// element was replaced by a singleton YT.Player exposed at
// window.__dzYtPlayer. All volume/rate/mute controls now call into that
// player; analytics + preload + keyboard shortcuts are unchanged.

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

// Get the singleton YouTube IFrame Player instance the context publishes to
// window.__dzYtPlayer. Returns null until the IFrame API has loaded.
function getYt(): any {
  if (typeof window === 'undefined') return null
  const p = (window as any).__dzYtPlayer
  if (!p) return null
  // YT.Player is only safe to call once getPlayerState exists.
  if (typeof p.getPlayerState !== 'function') return null
  return p
}

// ── Network state observability ─────────────────────────────────────────────
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
// Kept as a no-op-friendly export so any caller (e.g. DZ Tube cards) can
// still invoke it without breaking — under YT IFrame playback there is no
// server-side stream to pre-resolve, so this is now a tiny analytics ping
// only and does not perform a server warm round-trip.
const _warmedAt = new Map<string, number>()
const WARM_DEDUP_MS = 5 * 60 * 1000
function _shouldWarm(url: string): boolean {
  const last = _warmedAt.get(url) || 0
  if (Date.now() - last < WARM_DEDUP_MS) return false
  _warmedAt.set(url, Date.now())
  if (_warmedAt.size > 200) {
    const arr = [...(_warmedAt.entries() as any)].sort((a: any, b: any) => a[1] - b[1])
    for (let i = 0; i < 50 && arr[i]; i++) _warmedAt.delete(arr[i][0])
  }
  return true
}

// Public API kept for source-compatibility. Under YT IFrame playback the
// "warm" concept is a no-op (the iframe handles its own buffering), so we
// just dedup and return. The signature is preserved to avoid touching call
// sites in DZTube.tsx and other UI files.
export function warmTrackUrl(youtubeUrl: string | null | undefined, _abortRef?: React.MutableRefObject<AbortController | null>) {
  if (!youtubeUrl) return
  if (!_shouldWarm(youtubeUrl)) return
  // intentional no-op
}

export function useEnhancedMiniPlayer(state: MiniPlayerLikeState) {
  const lastTrackIdRef = useRef<string | null>(null)
  const preloadedForRef = useRef<string | null>(null)

  // 1. Restore prefs onto the YT player as soon as it's available, then keep
  //    them in sync via a light poll (the IFrame API has no volumechange
  //    event so we observe via getVolume()).
  useEffect(() => {
    let cancelled = false
    const lastApplied = { volume: -1, rate: -1, muted: 2 }

    const applyPrefs = () => {
      const yt = getYt()
      if (!yt) return false
      const p = loadPrefs()
      try {
        if (typeof yt.setVolume === 'function') yt.setVolume(Math.round(p.volume * 100))
        if (p.muted && typeof yt.mute === 'function') yt.mute()
        else if (!p.muted && typeof yt.unMute === 'function') yt.unMute()
        if (typeof yt.setPlaybackRate === 'function') {
          try { yt.setPlaybackRate(p.rate) } catch {}
        }
        lastApplied.volume = p.volume
        lastApplied.rate = p.rate
        lastApplied.muted = p.muted ? 1 : 0
      } catch {}
      return true
    }

    // Wait for YT to come online (poll up to 15s).
    let waited = 0
    const waitTimer = window.setInterval(() => {
      if (cancelled) return
      if (applyPrefs() || (waited += 250) > 15_000) clearInterval(waitTimer)
    }, 250)

    // Persist YT-side changes (volume/rate/mute) back to prefs.
    const syncTimer = window.setInterval(() => {
      const yt = getYt()
      if (!yt) return
      try {
        const v = typeof yt.getVolume === 'function' ? yt.getVolume() / 100 : lastApplied.volume
        const muted = typeof yt.isMuted === 'function' ? !!yt.isMuted() : !!lastApplied.muted
        const rate = typeof yt.getPlaybackRate === 'function' ? yt.getPlaybackRate() : lastApplied.rate
        const changed: Partial<Prefs> = {}
        if (Math.abs((v ?? 1) - lastApplied.volume) > 0.01) {
          changed.volume = clamp01(v)
          lastApplied.volume = changed.volume!
        }
        if ((muted ? 1 : 0) !== lastApplied.muted) {
          changed.muted = muted
          lastApplied.muted = muted ? 1 : 0
        }
        if (Math.abs((rate ?? 1) - lastApplied.rate) > 0.01) {
          changed.rate = clampRate(rate)
          lastApplied.rate = changed.rate!
        }
        if (Object.keys(changed).length > 0) {
          savePrefs(changed)
          if ('volume' in changed) {
            pushEvent({ type: 'volume', trackId: lastTrackIdRef.current, volume: changed.volume!, ts: Date.now() })
          }
          if ('rate' in changed) {
            pushEvent({ type: 'rate', trackId: lastTrackIdRef.current, rate: changed.rate!, ts: Date.now() })
          }
        }
      } catch {}
    }, 1500) as unknown as number

    reportNetwork()
    const conn: any = (navigator as any).connection
    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', reportNetwork)
    }

    return () => {
      cancelled = true
      clearInterval(waitTimer)
      clearInterval(syncTimer)
      if (conn && typeof conn.removeEventListener === 'function') {
        conn.removeEventListener('change', reportNetwork)
      }
    }
  }, [])

  // 2. Hidden keyboard shortcuts (now driving YT player).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const yt = getYt()
      if (!yt) return
      switch (e.key) {
        case '+': case '=': {
          e.preventDefault()
          try {
            const v = clamp01((yt.getVolume() / 100) + 0.05)
            yt.setVolume(Math.round(v * 100))
            if (yt.isMuted && yt.isMuted()) yt.unMute()
          } catch {}
          break
        }
        case '-': case '_': {
          e.preventDefault()
          try {
            const v = clamp01((yt.getVolume() / 100) - 0.05)
            yt.setVolume(Math.round(v * 100))
          } catch {}
          break
        }
        case 'm': case 'M': {
          e.preventDefault()
          try { if (yt.isMuted && yt.isMuted()) yt.unMute(); else yt.mute() } catch {}
          break
        }
        case '.': case '>': {
          e.preventDefault()
          try { yt.setPlaybackRate(nextRate(yt.getPlaybackRate(), 1)) } catch {}
          break
        }
        case ',': case '<': {
          e.preventDefault()
          try { yt.setPlaybackRate(nextRate(yt.getPlaybackRate(), -1)) } catch {}
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 3. Track-change events.
  useEffect(() => {
    if (state.trackId !== lastTrackIdRef.current) {
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

  // 4. Eager preload (no-op under YT iframe but kept for analytics path).
  useEffect(() => {
    if (!state.trackId) return
    if (state.queueHeadUrl) {
      const key = `${state.trackId}::${state.queueHeadUrl}`
      if (preloadedForRef.current !== key) {
        preloadedForRef.current = key
        warmTrackUrl(state.queueHeadUrl)
      }
    }
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
        pushEvent({
          type: 'pause',
          trackId: lastTrackIdRef.current,
          position: state.progress,
          duration: state.duration,
          ts: Date.now(),
        })
        flushEvents()
      }
    }
    const onUnload = () => {
      if (lastTrackIdRef.current) {
        pushEvent({
          type: 'pause',
          trackId: lastTrackIdRef.current,
          position: state.progress,
          duration: state.duration,
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
  }, [state.progress, state.duration])

  // 6. Detect "complete" + emit play/pause analytics on state transitions.
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

// Public utility for callers who want to record a skip explicitly.
export function recordSkip(trackId: string | null, position: number, duration: number) {
  pushEvent({ type: 'skip', trackId, position, duration, ts: Date.now() })
}

// Public utility for callers to record an error.
export function recordError(trackId: string | null, message: string) {
  pushEvent({ type: 'error', trackId, ts: Date.now(), position: 0, duration: 0, ...({ message } as any) })
}

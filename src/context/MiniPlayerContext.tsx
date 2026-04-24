import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'

export interface PlayerTrack {
  id: string
  url: string
  title: string
  thumbnail: string
  channel: string
  duration?: number
}

interface MiniPlayerCtx {
  track: PlayerTrack | null
  queue: PlayerTrack[]
  playing: boolean
  loading: boolean
  progress: number
  duration: number
  play: (track: PlayerTrack) => Promise<void>
  enqueue: (track: PlayerTrack) => void
  removeFromQueue: (id: string) => void
  clearQueue: () => void
  next: () => Promise<void>
  toggle: () => void
  seek: (sec: number) => void
  stop: () => void
}

const Ctx = createContext<MiniPlayerCtx | null>(null)

export function useMiniPlayer() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useMiniPlayer must be inside MiniPlayerProvider')
  return c
}

const STORAGE_KEY = 'dz-tube-player-state'
interface PersistedState {
  track: PlayerTrack | null
  queue: PlayerTrack[]
  progress: number
}
function loadPersisted(): PersistedState {
  if (typeof window === 'undefined') return { track: null, queue: [], progress: 0 }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { track: null, queue: [], progress: 0 }
    const p = JSON.parse(raw)
    return { track: p.track || null, queue: Array.isArray(p.queue) ? p.queue : [], progress: Number(p.progress) || 0 }
  } catch { return { track: null, queue: [], progress: 0 } }
}
function persist(state: PersistedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

function buildAudioSrc(track: PlayerTrack): string {
  const yt = track.url || `https://www.youtube.com/watch?v=${track.id}`
  return `/api/dz-tube/audio-proxy?url=${encodeURIComponent(yt)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level audio singleton.
//
// The audio element AND its event listeners are created exactly once at module
// load — NOT inside a React useEffect. This eliminates an entire class of bugs:
//   • StrictMode double-mount re-attaching listeners on stale refs
//   • Race between user gesture click and useEffect listener attach
//   • Multiple <audio> elements being created on hot reload / re-render
//   • Toggle button reading a stale audioRef.current
//
// React subscribes to state changes via the tiny pub-sub `subscribers` set.
// There is one and only one HTMLAudioElement, accessible everywhere via
// `getAudio()`, and one and only one set of listeners forwarding events into
// the snapshot.
// ─────────────────────────────────────────────────────────────────────────────

interface AudioSnapshot {
  playing: boolean
  loading: boolean
  progress: number
  duration: number
  trackId: string | null
}

let audioEl: HTMLAudioElement | null = null
let snapshot: AudioSnapshot = { playing: false, loading: false, progress: 0, duration: 0, trackId: null }
const subscribers = new Set<(s: AudioSnapshot) => void>()

function notify() {
  subscribers.forEach(fn => fn(snapshot))
}
function patch(p: Partial<AudioSnapshot>) {
  snapshot = { ...snapshot, ...p }
  notify()
}

function getAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  if (audioEl) return audioEl
  // Reuse a previously created element (survives React re-mounts).
  let el = document.getElementById('dz-audio-host') as HTMLAudioElement | null
  if (!el) {
    el = document.createElement('audio')
    el.id = 'dz-audio-host'
    el.preload = 'metadata'
    el.style.display = 'none'
    el.setAttribute('playsinline', '')
    el.setAttribute('webkit-playsinline', '')
    document.body.appendChild(el)
  }
  audioEl = el
  // Listeners attached EXACTLY ONCE for the lifetime of the page.
  el.addEventListener('loadedmetadata', () => {
    const d = el!.duration
    if (Number.isFinite(d) && d > 0) patch({ duration: d })
  })
  el.addEventListener('durationchange', () => {
    const d = el!.duration
    if (Number.isFinite(d) && d > 0) patch({ duration: d })
  })
  el.addEventListener('timeupdate', () => {
    patch({ progress: el!.currentTime || 0 })
  })
  el.addEventListener('play', () => patch({ playing: true, loading: false }))
  el.addEventListener('pause', () => patch({ playing: false }))
  el.addEventListener('waiting', () => patch({ loading: true }))
  el.addEventListener('playing', () => patch({ loading: false, playing: true }))
  el.addEventListener('canplay', () => patch({ loading: false }))
  el.addEventListener('ended', () => {
    patch({ playing: false })
    if (onEndedCallback) onEndedCallback()
  })
  el.addEventListener('error', () => {
    console.warn('[mini-player] audio error', el!.error)
    patch({ loading: false, playing: false })
  })
  return el
}

let onEndedCallback: (() => void) | null = null

function bindAndPlay(track: PlayerTrack, autoplay: boolean, resumeAt: number) {
  const el = getAudio()
  if (!el) return
  patch({
    loading: true,
    progress: resumeAt > 1 ? resumeAt : 0,
    duration: track.duration && track.duration > 0 ? track.duration : 0,
    trackId: track.id,
  })
  try {
    el.src = buildAudioSrc(track)
    el.load()
    if (resumeAt > 1) {
      const seekOnce = () => {
        try { el.currentTime = resumeAt } catch {}
        el.removeEventListener('loadedmetadata', seekOnce)
      }
      el.addEventListener('loadedmetadata', seekOnce)
    }
    if (autoplay) {
      const p = el.play()
      if (p && typeof (p as Promise<void>).catch === 'function') {
        ;(p as Promise<void>).catch(err => {
          console.warn('[mini-player] play() rejected', err?.message || err)
          patch({ loading: false })
        })
      }
    }
  } catch (e) {
    console.warn('[mini-player] bindAndPlay failed', e)
    patch({ loading: false })
  }
}

// Expose on window for in-browser debugging (read-only inspection only).
if (typeof window !== 'undefined') {
  ;(window as any).__dzPlayer = {
    get el() { return audioEl },
    get snapshot() { return snapshot },
    subscribers,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// React provider — thin wrapper around the singleton.
// ─────────────────────────────────────────────────────────────────────────────
export function MiniPlayerProvider({ children }: { children: ReactNode }) {
  const initial = loadPersisted()
  const [track, setTrack] = useState<PlayerTrack | null>(initial.track)
  const [queue, setQueue] = useState<PlayerTrack[]>(initial.queue)
  const [snap, setSnap] = useState<AudioSnapshot>(snapshot)
  const queueRef = useRef<PlayerTrack[]>(initial.queue)
  const restoredRef = useRef(false)

  useEffect(() => { queueRef.current = queue }, [queue])

  // Subscribe to the singleton's state.
  useEffect(() => {
    const fn = (s: AudioSnapshot) => setSnap(s)
    subscribers.add(fn)
    // Make sure the audio element exists (creates listeners on first call).
    getAudio()
    setSnap(snapshot)
    return () => { subscribers.delete(fn) }
  }, [])

  const playInternal = useCallback((t: PlayerTrack, autoplay: boolean, resumeAt: number) => {
    setTrack(t)
    bindAndPlay(t, autoplay, resumeAt)
  }, [])

  const next = useCallback(async () => {
    const q = queueRef.current
    if (q.length === 0) return
    const [head, ...rest] = q
    setQueue(rest)
    playInternal(head, true, 0)
  }, [playInternal])

  // Wire end-of-track → next (module-level callback).
  useEffect(() => {
    onEndedCallback = () => { void next() }
    return () => { onEndedCallback = null }
  }, [next])

  const play = useCallback(async (t: PlayerTrack) => {
    playInternal(t, true, 0)
  }, [playInternal])

  // Restore previous track on first mount (paused, ready to resume).
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (initial.track) {
      playInternal(initial.track, false, initial.progress)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist track / queue.
  useEffect(() => {
    persist({ track, queue, progress: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, queue])
  useEffect(() => {
    if (!track) return
    const id = setInterval(() => {
      persist({ track, queue: queueRef.current, progress: snapshot.progress })
    }, 4000)
    return () => clearInterval(id)
  }, [track])

  const enqueue = useCallback((t: PlayerTrack) => {
    setQueue(prev => prev.find(x => x.id === t.id) ? prev : [...prev, t])
  }, [])

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(t => t.id !== id))
  }, [])

  const clearQueue = useCallback(() => setQueue([]), [])

  const toggle = useCallback(() => {
    const el = getAudio()
    if (!el || !track) return
    if (el.paused || el.ended) {
      // Source not bound yet (e.g. user clicked play right after a restore).
      if (!el.src || snapshot.trackId !== track.id) {
        bindAndPlay(track, true, el.currentTime || 0)
        return
      }
      const p = el.play()
      if (p && typeof (p as Promise<void>).catch === 'function') {
        ;(p as Promise<void>).catch(err => console.warn('[mini-player] toggle play failed', err?.message || err))
      }
    } else {
      try { el.pause() } catch {}
    }
  }, [track])

  const seek = useCallback((sec: number) => {
    const el = getAudio()
    if (!el) return
    try {
      el.currentTime = Math.max(0, sec)
      patch({ progress: el.currentTime })
    } catch {}
  }, [])

  const stop = useCallback(() => {
    const el = getAudio()
    if (el) {
      try { el.pause() } catch {}
      try { el.removeAttribute('src'); el.load() } catch {}
    }
    patch({ playing: false, progress: 0, duration: 0, trackId: null, loading: false })
    setTrack(null)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  // Update Media Session metadata when track changes.
  useEffect(() => {
    if (!track) return
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.channel || 'DZ Tube',
        album: 'DZ Tube',
        artwork: [
          { src: track.thumbnail, sizes: '96x96', type: 'image/jpeg' },
          { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
          { src: track.thumbnail, sizes: '480x360', type: 'image/jpeg' },
        ],
      })
    } catch {}
  }, [track])

  // Wire up Media Session action handlers (lockscreen / headset buttons).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        const el = getAudio()
        if (el && el.paused) {
          const p = el.play()
          if (p && typeof (p as Promise<void>).catch === 'function') {
            ;(p as Promise<void>).catch(() => {})
          }
        }
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        const el = getAudio()
        if (el && !el.paused) { try { el.pause() } catch {} }
      })
      navigator.mediaSession.setActionHandler('nexttrack', () => { void next() })
      navigator.mediaSession.setActionHandler('seekbackward', (d: any) => {
        const el = getAudio()
        if (!el) return
        try { el.currentTime = Math.max(0, el.currentTime - (d?.seekOffset || 10)) } catch {}
      })
      navigator.mediaSession.setActionHandler('seekforward', (d: any) => {
        const el = getAudio()
        if (!el) return
        try { el.currentTime = el.currentTime + (d?.seekOffset || 10) } catch {}
      })
      navigator.mediaSession.setActionHandler('seekto', (d: any) => {
        const el = getAudio()
        if (!el || typeof d?.seekTime !== 'number') return
        try { el.currentTime = d.seekTime } catch {}
      })
    } catch {}
  }, [next])

  // Keep MediaSession position state in sync so lockscreen scrubber works.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (!('setPositionState' in navigator.mediaSession)) return
    if (!snap.duration || !Number.isFinite(snap.duration)) return
    try {
      ;(navigator.mediaSession as any).setPositionState({
        duration: snap.duration,
        playbackRate: getAudio()?.playbackRate || 1,
        position: Math.min(snap.progress, snap.duration),
      })
    } catch {}
  }, [snap.progress, snap.duration])

  // Reflect playback state to the OS so the lockscreen icon stays in sync.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      ;(navigator.mediaSession as any).playbackState = snap.playing ? 'playing' : (track ? 'paused' : 'none')
    } catch {}
  }, [snap.playing, track])

  return (
    <Ctx.Provider value={{
      track,
      queue,
      playing: snap.playing,
      loading: snap.loading,
      progress: snap.progress,
      duration: snap.duration,
      play,
      enqueue,
      removeFromQueue,
      clearQueue,
      next,
      toggle,
      seek,
      stop,
    }}>
      {children}
    </Ctx.Provider>
  )
}

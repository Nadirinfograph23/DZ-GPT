import { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react'

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

// Extract a YouTube videoId from any standard URL form (kept for parity).
function extractVideoId(url: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split(/[/?#]/)[0] || null
    if (/(^|\.)youtube\.com$/i.test(u.hostname)) {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      const m = u.pathname.match(/^\/(embed|shorts|v|live)\/([^/?#]+)/)
      if (m) return m[2]
    }
  } catch {}
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url
  return null
}

// Build a SAME-ORIGIN URL that the <audio> element can be bound to
// synchronously inside the user-gesture frame. The server-side proxy
// (/api/dz-tube/audio-proxy) does the slow work of resolving the
// signed googlevideo URL and pipes the bytes through with full Range
// support. This avoids three classical mini-player failure modes:
//  1) Chrome/Safari blocking play() that runs after a 5s+ await
//  2) CORS rejections on third-party proxies that omit ACAO
//  3) googlevideo signed URLs expiring while the user listens
function buildAudioSrc(track: PlayerTrack): string {
  const yt = track.url || `https://www.youtube.com/watch?v=${track.id}`
  return `/api/dz-tube/audio-proxy?url=${encodeURIComponent(yt)}`
}

export function MiniPlayerProvider({ children }: { children: ReactNode }) {
  const initial = loadPersisted()
  const [track, setTrack] = useState<PlayerTrack | null>(initial.track)
  const [queue, setQueue] = useState<PlayerTrack[]>(initial.queue)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(initial.progress)
  const [duration, setDuration] = useState(initial.track?.duration || 0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<PlayerTrack[]>([])
  const restoredRef = useRef<boolean>(false)
  const resumeAtRef = useRef<number>(initial.progress)
  // Counter to discard late stream-resolution responses when the user
  // quickly switches tracks.
  const loadTokenRef = useRef<number>(0)
  // Track id currently bound to <audio>.src — used to skip redundant reloads.
  const currentSrcIdRef = useRef<string | null>(null)
  const nextRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => { queueRef.current = queue }, [queue])

  // Mount a hidden, persistent <audio> element exactly once. Audio elements
  // (unlike <video> or YouTube iframes) keep playing when the screen turns
  // off on mobile, which is the whole point of switching the engine here.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let el = document.getElementById('dz-audio-host') as HTMLAudioElement | null
    if (!el) {
      el = document.createElement('audio')
      el.id = 'dz-audio-host'
      el.preload = 'metadata'
      // NOTE: deliberately NOT setting crossOrigin. We don't read raw audio
      // samples (no Web Audio analyser, no canvas), and setting it forces
      // strict CORS validation that some upstream proxies fail silently
      // (the browser fires `error` with no useful message and playback dies).
      // Hide from layout but keep mounted so background play survives nav.
      el.style.display = 'none'
      el.setAttribute('playsinline', '')
      el.setAttribute('webkit-playsinline', '')
      document.body.appendChild(el)
    }
    audioRef.current = el

    const onLoadedMeta = () => {
      const d = el!.duration
      // NaN/Infinity guard — some HLS / MSE-less streams report Infinity.
      if (Number.isFinite(d) && d > 0) setDuration(d)
      // Resume position (set after metadata is ready so seek lands correctly).
      if (resumeAtRef.current > 1 && Number.isFinite(d) && d > 0 && resumeAtRef.current < d - 1) {
        try { el!.currentTime = resumeAtRef.current } catch {}
      }
      resumeAtRef.current = 0
    }
    const onDurationChange = () => {
      const d = el!.duration
      if (Number.isFinite(d) && d > 0) setDuration(d)
    }
    const onTimeUpdate = () => { setProgress(el!.currentTime || 0) }
    const onPlay = () => { setPlaying(true); setLoading(false) }
    const onPause = () => { setPlaying(false) }
    const onWaiting = () => { setLoading(true) }
    const onPlaying = () => { setLoading(false) }
    const onCanPlay = () => { setLoading(false) }
    const onEnded = () => {
      setPlaying(false)
      if (queueRef.current.length > 0) void nextRef.current()
    }
    const onError = () => {
      setLoading(false)
      setPlaying(false)
      console.warn('[mini-player] audio error', el!.error)
    }

    el.addEventListener('loadedmetadata', onLoadedMeta)
    el.addEventListener('durationchange', onDurationChange)
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('waiting', onWaiting)
    el.addEventListener('playing', onPlaying)
    el.addEventListener('canplay', onCanPlay)
    el.addEventListener('ended', onEnded)
    el.addEventListener('error', onError)

    return () => {
      el!.removeEventListener('loadedmetadata', onLoadedMeta)
      el!.removeEventListener('durationchange', onDurationChange)
      el!.removeEventListener('timeupdate', onTimeUpdate)
      el!.removeEventListener('play', onPlay)
      el!.removeEventListener('pause', onPause)
      el!.removeEventListener('waiting', onWaiting)
      el!.removeEventListener('playing', onPlaying)
      el!.removeEventListener('canplay', onCanPlay)
      el!.removeEventListener('ended', onEnded)
      el!.removeEventListener('error', onError)
    }
  }, [])

  // Internal: bind <audio> to the same-origin streaming proxy and start
  // playback. Bind + play are called SYNCHRONOUSLY so the user-gesture
  // activation is preserved (no autoplay block). The slow work — resolving
  // a signed googlevideo URL — happens server-side while the browser
  // already shows a buffering state.
  const loadAndPlay = useCallback((t: PlayerTrack, autoplay: boolean, resumeAt: number) => {
    const el = audioRef.current
    if (!el) return
    const myToken = ++loadTokenRef.current
    setLoading(true)
    setProgress(resumeAt > 1 ? resumeAt : 0)
    // Optimistically show the duration we already know from the search
    // result, so the mini-player doesn't sit at "0:00".
    setDuration(t.duration && t.duration > 0 ? t.duration : 0)
    resumeAtRef.current = resumeAt > 1 ? resumeAt : 0

    try {
      el.src = buildAudioSrc(t)
      currentSrcIdRef.current = t.id
      el.load()
      if (autoplay) {
        const p = el.play()
        if (p && typeof (p as Promise<void>).catch === 'function') {
          ;(p as Promise<void>).catch(err => {
            // Token check guards against late rejection from a stale call.
            if (myToken !== loadTokenRef.current) return
            console.warn('[mini-player] play() rejected', err?.message || err)
            setLoading(false)
          })
        }
      }
    } catch (e) {
      console.warn('[mini-player] el.play failed', e)
      setLoading(false)
    }

    // Update Media Session so the OS shows track info + lockscreen controls.
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title,
          artist: t.channel || 'DZ Tube',
          album: 'DZ Tube',
          artwork: [
            { src: t.thumbnail, sizes: '96x96', type: 'image/jpeg' },
            { src: t.thumbnail, sizes: '256x256', type: 'image/jpeg' },
            { src: t.thumbnail, sizes: '480x360', type: 'image/jpeg' },
          ],
        })
      } catch {}
    }
  }, [])

  const playInternal = useCallback(async (t: PlayerTrack, autoplay: boolean = true) => {
    setTrack(t)
    const resumeAt = resumeAtRef.current
    resumeAtRef.current = 0
    await loadAndPlay(t, autoplay, resumeAt)
  }, [loadAndPlay])

  const next = useCallback(async () => {
    const q = queueRef.current
    if (q.length === 0) return
    const [head, ...rest] = q
    setQueue(rest)
    await playInternal(head)
  }, [playInternal])
  useEffect(() => { nextRef.current = next }, [next])

  const play = useCallback(async (t: PlayerTrack) => { await playInternal(t) }, [playInternal])

  // Restore previous track on first mount (paused, ready to resume).
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (initial.track) {
      void playInternal(initial.track, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist track / queue (progress is persisted on its own interval below).
  useEffect(() => {
    persist({ track, queue, progress: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, queue])
  useEffect(() => {
    if (!track) return
    const id = setInterval(() => {
      const cur = audioRef.current?.currentTime || 0
      persist({ track, queue: queueRef.current, progress: cur })
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
    const el = audioRef.current
    if (!el || !track) return
    if (el.paused || el.ended) {
      // If the source was never bound (e.g. user clicked play right after
      // a restore), bind it now.
      if (!el.src || currentSrcIdRef.current !== track.id) {
        void loadAndPlay(track, true, audioRef.current?.currentTime || 0)
        return
      }
      const p = el.play()
      if (p && typeof (p as Promise<void>).catch === 'function') {
        ;(p as Promise<void>).catch(err => console.warn('[mini-player] toggle play failed', err?.message || err))
      }
    } else {
      try { el.pause() } catch {}
    }
  }, [track, loadAndPlay])

  const seek = useCallback((sec: number) => {
    const el = audioRef.current
    if (!el) return
    try {
      el.currentTime = Math.max(0, sec)
      setProgress(el.currentTime)
    } catch {}
  }, [])

  const stop = useCallback(() => {
    const el = audioRef.current
    if (el) {
      try { el.pause() } catch {}
      try { el.removeAttribute('src'); el.load() } catch {}
    }
    currentSrcIdRef.current = null
    setTrack(null)
    setPlaying(false)
    setProgress(0)
    setDuration(0)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  // Wire up Media Session action handlers (lockscreen / headset buttons).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        const el = audioRef.current
        if (el && el.paused) {
          const p = el.play()
          if (p && typeof (p as Promise<void>).catch === 'function') {
            ;(p as Promise<void>).catch(() => {})
          }
        }
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        const el = audioRef.current
        if (el && !el.paused) { try { el.pause() } catch {} }
      })
      navigator.mediaSession.setActionHandler('nexttrack', () => { void next() })
      navigator.mediaSession.setActionHandler('seekbackward', (d: any) => {
        const el = audioRef.current
        if (!el) return
        try { el.currentTime = Math.max(0, el.currentTime - (d?.seekOffset || 10)) } catch {}
      })
      navigator.mediaSession.setActionHandler('seekforward', (d: any) => {
        const el = audioRef.current
        if (!el) return
        try { el.currentTime = el.currentTime + (d?.seekOffset || 10) } catch {}
      })
      navigator.mediaSession.setActionHandler('seekto', (d: any) => {
        const el = audioRef.current
        if (!el || typeof d?.seekTime !== 'number') return
        try { el.currentTime = d.seekTime } catch {}
      })
    } catch {}
  }, [next])

  // Keep MediaSession position state in sync so lockscreen scrubber works.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (!('setPositionState' in navigator.mediaSession)) return
    if (!duration || !Number.isFinite(duration)) return
    try {
      ;(navigator.mediaSession as any).setPositionState({
        duration,
        playbackRate: audioRef.current?.playbackRate || 1,
        position: Math.min(progress, duration),
      })
    } catch {}
  }, [progress, duration])

  // Reflect playback state to the OS so the lockscreen icon stays in sync.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      ;(navigator.mediaSession as any).playbackState = playing ? 'playing' : (track ? 'paused' : 'none')
    } catch {}
  }, [playing, track])

  // Suppress unused-warning for the legacy helper kept for parity with the
  // previous IFrame implementation (other modules may still call it).
  void extractVideoId

  return (
    <Ctx.Provider value={{ track, queue, playing, loading, progress, duration, play, enqueue, removeFromQueue, clearQueue, next, toggle, seek, stop }}>
      {children}
    </Ctx.Provider>
  )
}

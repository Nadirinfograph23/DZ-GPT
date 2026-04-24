import { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react'

export interface PlayerTrack {
  id: string
  url: string
  title: string
  thumbnail: string
  channel: string
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

// Extract a YouTube videoId from any standard URL form.
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
  // Fall back to bare videoId (11 chars)
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url
  return null
}

// ---------- YouTube IFrame API loader (singleton) ----------
let _ytApiPromise: Promise<typeof window.YT> | null = null
function loadYouTubeApi(): Promise<typeof window.YT> {
  if (_ytApiPromise) return _ytApiPromise
  _ytApiPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') return
    if (window.YT && window.YT.Player) { resolve(window.YT); return }
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (prev) try { prev() } catch {}
      resolve(window.YT)
    }
    if (!document.querySelector('script[data-yt-iframe-api]')) {
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.async = true
      s.dataset.ytIframeApi = '1'
      document.head.appendChild(s)
    }
  })
  return _ytApiPromise
}

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady?: () => void
  }
}

export function MiniPlayerProvider({ children }: { children: ReactNode }) {
  const initial = loadPersisted()
  const [track, setTrack] = useState<PlayerTrack | null>(initial.track)
  const [queue, setQueue] = useState<PlayerTrack[]>(initial.queue)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(initial.progress)
  const [duration, setDuration] = useState(0)

  const playerRef = useRef<any>(null)
  const playerReadyRef = useRef<boolean>(false)
  const pendingTrackRef = useRef<{ t: PlayerTrack; autoplay: boolean; resumeAt: number } | null>(null)
  const queueRef = useRef<PlayerTrack[]>([])
  const restoredRef = useRef<boolean>(false)
  const resumeAtRef = useRef<number>(initial.progress)
  const tickRef = useRef<number | null>(null)
  useEffect(() => { queueRef.current = queue }, [queue])

  // Mount a hidden host element + initialize YT.Player exactly once
  useEffect(() => {
    if (typeof window === 'undefined') return
    let host = document.getElementById('dz-yt-host') as HTMLDivElement | null
    if (!host) {
      host = document.createElement('div')
      host.id = 'dz-yt-host'
      // Visually hidden but kept in layout so the iframe still loads + plays.
      // Some browsers refuse to play a 0×0 iframe; use 1×1 with very low opacity.
      Object.assign(host.style, {
        position: 'fixed',
        left: '0px',
        bottom: '0px',
        width: '1px',
        height: '1px',
        opacity: '0.001',
        pointerEvents: 'none',
        zIndex: '-1',
      } as CSSStyleDeclaration)
      const inner = document.createElement('div')
      inner.id = 'dz-yt-player'
      host.appendChild(inner)
      document.body.appendChild(host)
    }

    let cancelled = false
    loadYouTubeApi().then((YT) => {
      if (cancelled) return
      if (playerRef.current) return
      playerRef.current = new YT.Player('dz-yt-player', {
        height: '1',
        width: '1',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            playerReadyRef.current = true
            // If the user clicked play before the API loaded, do it now.
            const p = pendingTrackRef.current
            if (p) {
              pendingTrackRef.current = null
              loadIntoPlayer(p.t, p.autoplay, p.resumeAt)
            }
          },
          onStateChange: (e: any) => {
            const S = window.YT?.PlayerState || {}
            if (e.data === S.PLAYING) {
              setPlaying(true)
              setLoading(false)
              try {
                const d = playerRef.current?.getDuration?.() || 0
                if (d > 0) setDuration(d)
              } catch {}
            } else if (e.data === S.PAUSED) {
              setPlaying(false)
              setLoading(false)
            } else if (e.data === S.BUFFERING) {
              setLoading(true)
            } else if (e.data === S.ENDED) {
              setPlaying(false)
              setLoading(false)
              if (queueRef.current.length > 0) void next()
            } else if (e.data === S.CUED) {
              setLoading(false)
              try {
                const d = playerRef.current?.getDuration?.() || 0
                if (d > 0) setDuration(d)
              } catch {}
            }
          },
          onError: (e: any) => {
            console.warn('[mini-player] YT error', e?.data)
            setLoading(false)
            setPlaying(false)
          },
        },
      })
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll currentTime + duration while a track is loaded
  useEffect(() => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null }
    if (!track) return
    tickRef.current = window.setInterval(() => {
      const p = playerRef.current
      if (!p) return
      try {
        const t = p.getCurrentTime?.() || 0
        const d = p.getDuration?.() || 0
        setProgress(t)
        if (d > 0 && d !== duration) setDuration(d)
      } catch {}
    }, 500) as unknown as number
    return () => {
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track])

  // Internal: load a track into the player (only call when ready)
  const loadIntoPlayer = useCallback((t: PlayerTrack, autoplay: boolean, resumeAt: number) => {
    const player = playerRef.current
    if (!player || !playerReadyRef.current) {
      // Defer until onReady fires.
      pendingTrackRef.current = { t, autoplay, resumeAt }
      return
    }
    const videoId = extractVideoId(t.url) || extractVideoId(t.id)
    if (!videoId) {
      console.warn('[mini-player] could not extract videoId from', t.url, t.id)
      setLoading(false)
      return
    }
    try {
      if (autoplay) {
        player.loadVideoById({ videoId, startSeconds: resumeAt > 1 ? resumeAt : 0 })
      } else {
        player.cueVideoById({ videoId, startSeconds: resumeAt > 1 ? resumeAt : 0 })
      }
      // Reset known duration; we'll get the real one from onStateChange.
      setDuration(0)
      setProgress(resumeAt > 1 ? resumeAt : 0)
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title, artist: t.channel,
          artwork: [{ src: t.thumbnail, sizes: '480x360', type: 'image/jpeg' }],
        })
      }
    } catch (e) {
      console.error('[mini-player] loadIntoPlayer failed', e)
      setLoading(false)
    }
  }, [])

  const playInternal = useCallback(async (t: PlayerTrack, autoplay: boolean = true) => {
    setTrack(t)
    setLoading(true)
    const resumeAt = resumeAtRef.current
    resumeAtRef.current = 0
    // Ensure the API is loaded; the actual call to loadVideoById will happen
    // either now (if ready) or once onReady fires.
    await loadYouTubeApi()
    loadIntoPlayer(t, autoplay, resumeAt)
  }, [loadIntoPlayer])

  const next = useCallback(async () => {
    const q = queueRef.current
    if (q.length === 0) return
    const [head, ...rest] = q
    setQueue(rest)
    await playInternal(head)
  }, [playInternal])

  const play = useCallback(async (t: PlayerTrack) => { await playInternal(t) }, [playInternal])

  // Restore previous track on first mount (cued, ready to resume)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (initial.track) {
      void playInternal(initial.track, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist track / queue / progress
  useEffect(() => {
    persist({ track, queue, progress: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, queue])

  // Toggle a global body class so other pages can lift their fixed/sticky
  // chat inputs above the floating mini-player (~84px tall + 16px gap).
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (track) document.body.classList.add('dz-mini-active')
    else document.body.classList.remove('dz-mini-active')
    return () => { document.body.classList.remove('dz-mini-active') }
  }, [track])
  useEffect(() => {
    if (!track) return
    const id = setInterval(() => {
      let cur = 0
      try { cur = playerRef.current?.getCurrentTime?.() || 0 } catch {}
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
    const p = playerRef.current
    if (!p || !track) return
    try {
      const S = window.YT?.PlayerState || {}
      const state = p.getPlayerState?.()
      if (state === S.PLAYING || state === S.BUFFERING) {
        p.pauseVideo()
      } else {
        p.playVideo()
      }
    } catch (e) {
      console.warn('[mini-player toggle]', e)
    }
  }, [track])

  const seek = useCallback((sec: number) => {
    const p = playerRef.current
    if (!p) return
    try { p.seekTo(sec, true); setProgress(sec) } catch {}
  }, [])

  const stop = useCallback(() => {
    const p = playerRef.current
    if (p) { try { p.stopVideo() } catch {} }
    setTrack(null)
    setPlaying(false)
    setProgress(0)
    setDuration(0)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  // Full MediaSession + Wake Lock wiring so audio keeps playing when the
  // screen turns off and the OS lock-screen shows usable controls.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const safe = (action: string, handler: any) => { try { ms.setActionHandler(action as any, handler) } catch {} }
    safe('play', () => { try { playerRef.current?.playVideo?.() } catch {} })
    safe('pause', () => { try { playerRef.current?.pauseVideo?.() } catch {} })
    safe('stop', () => stop())
    safe('nexttrack', () => { void next() })
    safe('previoustrack', () => { try { playerRef.current?.seekTo?.(0, true); setProgress(0) } catch {} })
    safe('seekbackward', (d: any) => { const cur = playerRef.current?.getCurrentTime?.() || 0; seek(Math.max(0, cur - (d?.seekOffset || 10))) })
    safe('seekforward', (d: any) => { const cur = playerRef.current?.getCurrentTime?.() || 0; seek(cur + (d?.seekOffset || 10)) })
    safe('seekto', (d: any) => { if (typeof d?.seekTime === 'number') seek(d.seekTime) })
    return () => {
      ['play','pause','stop','nexttrack','previoustrack','seekbackward','seekforward','seekto'].forEach(a => safe(a, null))
    }
  }, [next, seek, stop])

  // Sync playbackState with the OS so lock-screen shows correct play/pause icon
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    try { navigator.mediaSession.playbackState = track ? (playing ? 'playing' : 'paused') : 'none' } catch {}
  }, [playing, track])

  // Push positionState every second so the lock-screen scrubber stays in sync
  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return
    let cancelled = false
    const id = window.setInterval(() => {
      if (cancelled) return
      try {
        if (duration > 0 && navigator.mediaSession.setPositionState) {
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: 1,
            position: Math.min(progress, duration),
          })
        }
      } catch {}
    }, 1000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [track, duration, progress])

  // Wake Lock — keep screen from sleeping while a track is actively playing.
  // (On phones the lock-screen audio still plays via MediaSession anyway, but
  // this prevents the tab from being aggressively suspended on some browsers.)
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const anyNav = navigator as any
    if (!anyNav.wakeLock) return
    let sentinel: any = null
    let cancelled = false
    const acquire = async () => {
      try {
        if (sentinel) return
        sentinel = await anyNav.wakeLock.request('screen')
        sentinel.addEventListener?.('release', () => { sentinel = null })
      } catch {}
    }
    const release = async () => {
      try { if (sentinel) { await sentinel.release(); sentinel = null } } catch {}
    }
    if (playing) void acquire(); else void release()
    const onVis = () => { if (document.visibilityState === 'visible' && playing) void acquire() }
    document.addEventListener('visibilitychange', onVis)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); void release() }
  }, [playing])

  return (
    <Ctx.Provider value={{ track, queue, playing, loading, progress, duration, play, enqueue, removeFromQueue, clearQueue, next, toggle, seek, stop }}>
      {children}
    </Ctx.Provider>
  )
}

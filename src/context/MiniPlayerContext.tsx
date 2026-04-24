import { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react'
import Hls from 'hls.js'

export interface PlayerTrack {
  id: string
  url: string
  title: string
  thumbnail: string
  channel: string
  /** Known duration in seconds (from search result). Used as a fallback
   *  when the streamed M4A reports `Infinity` / `0` for `audio.duration`. */
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

export function MiniPlayerProvider({ children }: { children: ReactNode }) {
  const initial = loadPersisted()
  const [track, setTrack] = useState<PlayerTrack | null>(initial.track)
  const [queue, setQueue] = useState<PlayerTrack[]>(initial.queue)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(initial.progress)
  const [duration, setDuration] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const queueRef = useRef<PlayerTrack[]>([])
  const restoredRef = useRef<boolean>(false)
  const resumeAtRef = useRef<number>(initial.progress)
  const reqIdRef = useRef<number>(0) // guard against stale fetches
  useEffect(() => { queueRef.current = queue }, [queue])

  // Mount a hidden <audio> element used for background-friendly playback.
  // Keeping it as a real element on the DOM lets the browser keep playing
  // when the screen locks (unlike a YouTube iframe that pauses on lock).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (audioRef.current) return
    let a = document.getElementById('dz-mini-audio') as HTMLAudioElement | null
    if (!a) {
      a = document.createElement('audio')
      a.id = 'dz-mini-audio'
      a.preload = 'auto'
      a.style.display = 'none'
      // Important: keep playing in background tabs
      ;(a as any).playsInline = true
      a.setAttribute('playsinline', '')
      a.setAttribute('webkit-playsinline', '')
      document.body.appendChild(a)
    }
    audioRef.current = a

    const onPlay = () => { setPlaying(true); setLoading(false) }
    const onPause = () => setPlaying(false)
    const onWaiting = () => setLoading(true)
    const onCanPlay = () => setLoading(false)
    // For streamed M4A (YouTube DASH audio without faststart) the browser
    // initially reports `Infinity` for duration. We accept it once it becomes
    // a finite > 0 number; otherwise we keep whatever fallback (track.duration)
    // was already set in `loadTrack`.
    const tryAdoptAudioDuration = () => {
      if (!a) return
      if (isFinite(a.duration) && a.duration > 0) {
        setDuration(a.duration)
        return
      }
      // Some streams expose the real duration via the seekable range once the
      // first segment has been parsed.
      try {
        if (a.seekable && a.seekable.length > 0) {
          const end = a.seekable.end(a.seekable.length - 1)
          if (isFinite(end) && end > 0) setDuration(end)
        }
      } catch {}
    }
    const onLoadedMeta = tryAdoptAudioDuration
    const onDurationChange = tryAdoptAudioDuration
    const onProgress = tryAdoptAudioDuration
    const onTimeUpdate = () => { if (a) setProgress(a.currentTime || 0) }
    const onEnded = () => { setPlaying(false); if (queueRef.current.length > 0) void next() }
    const onError = () => { setLoading(false); setPlaying(false); console.warn('[mini-player] audio error', a?.error) }

    a.addEventListener('play', onPlay)
    a.addEventListener('playing', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('waiting', onWaiting)
    a.addEventListener('canplay', onCanPlay)
    a.addEventListener('loadedmetadata', onLoadedMeta)
    a.addEventListener('durationchange', onDurationChange)
    a.addEventListener('progress', onProgress)
    a.addEventListener('timeupdate', onTimeUpdate)
    a.addEventListener('ended', onEnded)
    a.addEventListener('error', onError)

    return () => {
      a?.removeEventListener('play', onPlay)
      a?.removeEventListener('playing', onPlay)
      a?.removeEventListener('pause', onPause)
      a?.removeEventListener('waiting', onWaiting)
      a?.removeEventListener('canplay', onCanPlay)
      a?.removeEventListener('loadedmetadata', onLoadedMeta)
      a?.removeEventListener('durationchange', onDurationChange)
      a?.removeEventListener('progress', onProgress)
      a?.removeEventListener('timeupdate', onTimeUpdate)
      a?.removeEventListener('ended', onEnded)
      a?.removeEventListener('error', onError)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Set audio source (HLS via hls.js, or direct URL via <audio>)
  const attachSource = useCallback((srcUrl: string, isHls: boolean) => {
    const a = audioRef.current
    if (!a) return
    // Tear down any existing hls instance first
    if (hlsRef.current) {
      try { hlsRef.current.destroy() } catch {}
      hlsRef.current = null
    }
    if (isHls && a.canPlayType('application/vnd.apple.mpegurl')) {
      a.src = srcUrl
    } else if (isHls && Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: false, backBufferLength: 30 })
      hls.loadSource(srcUrl)
      hls.attachMedia(a)
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data?.fatal) console.warn('[mini-player] HLS fatal error', data)
      })
      hlsRef.current = hls
    } else {
      a.src = srcUrl
    }
  }, [])

  const loadTrack = useCallback(async (t: PlayerTrack, autoplay: boolean, resumeAt: number) => {
    const a = audioRef.current
    if (!a) return
    // Refuse to load anything without a YouTube id — this is the root cause
    // of the "duration = 0 forever" bug some users hit when search results
    // returned a malformed entry. Better to surface nothing than spin.
    if (!t.id || !t.url) {
      console.warn('[mini-player] refusing to load track without id/url', t)
      setLoading(false)
      return
    }
    const reqId = ++reqIdRef.current
    setLoading(true)
    setProgress(resumeAt > 1 ? resumeAt : 0)
    // Seed duration from the search-result value so the UI never shows 0:00
    // while the audio element discovers its own duration. Once the element
    // reports a finite duration via loadedmetadata/durationchange/progress,
    // that value will replace this seed.
    setDuration(t.duration && isFinite(t.duration) && t.duration > 0 ? t.duration : 0)

    // 1) Try direct audio URL (yt-dlp -g, then ytdl-core, then Piped)
    let attached = false
    try {
      const r = await fetch(`/api/dz-tube/audio-url?url=${encodeURIComponent(t.url)}`)
      if (reqId !== reqIdRef.current) return
      if (r.ok) {
        const d = await r.json()
        if (d?.streamUrl) {
          attachSource(d.streamUrl, false)
          attached = true
        }
      }
    } catch (e) {
      console.warn('[mini-player] audio-url failed, will try HLS', e)
    }

    // 2) Fallback to server-proxied HLS (bypasses signed-IP and CORS issues)
    if (!attached) {
      try {
        attachSource(`/api/dz-tube/audio-stream?url=${encodeURIComponent(t.url)}`, true)
        attached = true
      } catch (e) {
        console.error('[mini-player] HLS fallback failed', e)
      }
    }

    if (reqId !== reqIdRef.current) return

    // Seek when metadata becomes available
    if (resumeAt > 1) {
      const onMeta = () => { try { a.currentTime = resumeAt } catch {} }
      a.addEventListener('loadedmetadata', onMeta, { once: true })
    }

    if (autoplay) {
      try { await a.play() } catch (e) {
        console.warn('[mini-player] autoplay blocked', e)
        setPlaying(false); setLoading(false)
      }
    } else {
      setLoading(false)
    }

    // MediaSession metadata so the lock-screen / notification controls show
    // the correct title, artist & artwork. This is what allows playback to
    // continue (and be controllable) while the screen is locked.
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title || '',
          artist: t.channel || '',
          album: 'DZ Tube',
          artwork: t.thumbnail
            ? [
                { src: t.thumbnail, sizes: '96x96',  type: 'image/jpeg' },
                { src: t.thumbnail, sizes: '192x192', type: 'image/jpeg' },
                { src: t.thumbnail, sizes: '512x512', type: 'image/jpeg' },
              ]
            : [],
        })
      } catch {}
    }
  }, [attachSource])

  const playInternal = useCallback(async (t: PlayerTrack, autoplay: boolean = true) => {
    setTrack(t)
    const resumeAt = resumeAtRef.current
    resumeAtRef.current = 0
    await loadTrack(t, autoplay, resumeAt)
  }, [loadTrack])

  const next = useCallback(async () => {
    const q = queueRef.current
    if (q.length === 0) return
    const [head, ...rest] = q
    setQueue(rest)
    await playInternal(head)
  }, [playInternal])

  const play = useCallback(async (t: PlayerTrack) => { await playInternal(t) }, [playInternal])

  // Restore previous track on first mount (cued, ready to resume — do NOT
  // autoplay because browsers block playback without a user gesture)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (initial.track) {
      void playInternal(initial.track, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist track / queue (progress is persisted on its own interval)
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

  // Toggle a global body class so other pages can lift their fixed/sticky
  // chat inputs above the floating mini-player (~84px tall + 16px gap).
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (track) document.body.classList.add('dz-mini-active')
    else document.body.classList.remove('dz-mini-active')
    return () => { document.body.classList.remove('dz-mini-active') }
  }, [track])

  const enqueue = useCallback((t: PlayerTrack) => {
    setQueue(prev => prev.find(x => x.id === t.id) ? prev : [...prev, t])
  }, [])

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(t => t.id !== id))
  }, [])

  const clearQueue = useCallback(() => setQueue([]), [])

  // Self-healing toggle (restored from older working build 90a08dc5).
  // Some browsers — especially after a tab restore, after a long pause, or
  // when a signed audio URL has expired — leave the <audio> element in a
  // state where `a.play()` silently rejects and the user "clicks play and
  // nothing happens". We detect those situations and re-resolve the source
  // through `playInternal` so the button always *does* something.
  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a || !track) return
    // Currently playing → just pause and we're done.
    if (!a.paused && !a.ended) { a.pause(); return }
    // No source attached, or the element is in an error state → full re-init.
    const noSource = !a.currentSrc && !a.src
    const errored = !!a.error || a.networkState === a.NETWORK_NO_SOURCE
    if (noSource || errored) {
      void playInternal(track, true)
      return
    }
    // Otherwise just resume; if play() rejects (signed URL expired,
    // autoplay policy after long idle, etc.) self-heal by re-resolving
    // the audio URL via the normal playInternal path.
    setLoading(true)
    const p = a.play()
    if (p && typeof p.then === 'function') {
      p.then(() => setLoading(false)).catch(err => {
        console.warn('[mini-player toggle] play failed, re-initing:', err)
        void playInternal(track, true)
      })
    } else {
      setLoading(false)
    }
  }, [track, playInternal])

  const seek = useCallback((sec: number) => {
    const a = audioRef.current
    if (!a) return
    try { a.currentTime = sec; setProgress(sec) } catch {}
  }, [])

  const stop = useCallback(() => {
    const a = audioRef.current
    if (a) {
      try { a.pause() } catch {}
      try { a.removeAttribute('src'); a.load() } catch {}
    }
    if (hlsRef.current) {
      try { hlsRef.current.destroy() } catch {}
      hlsRef.current = null
    }
    setTrack(null)
    setPlaying(false)
    setProgress(0)
    setDuration(0)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  // Wire MediaSession action handlers — the OS uses these to drive the
  // lock-screen / Bluetooth headset / notification-shade media controls.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const safe = (action: string, handler: any) => { try { ms.setActionHandler(action as any, handler) } catch {} }
    safe('play', () => { void audioRef.current?.play().catch(() => {}) })
    safe('pause', () => { try { audioRef.current?.pause() } catch {} })
    safe('stop', () => stop())
    safe('nexttrack', () => { void next() })
    safe('previoustrack', () => { try { if (audioRef.current) { audioRef.current.currentTime = 0; setProgress(0) } } catch {} })
    safe('seekbackward', (d: any) => { const cur = audioRef.current?.currentTime || 0; seek(Math.max(0, cur - (d?.seekOffset || 10))) })
    safe('seekforward', (d: any) => { const cur = audioRef.current?.currentTime || 0; seek(cur + (d?.seekOffset || 10)) })
    safe('seekto', (d: any) => { if (typeof d?.seekTime === 'number') seek(d.seekTime) })
    return () => {
      ;['play','pause','stop','nexttrack','previoustrack','seekbackward','seekforward','seekto']
        .forEach(a => safe(a, null))
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

  // Background-play safety net: some mobile browsers (notably iOS Safari and
  // older Chrome on Android) pause an HTMLAudioElement when the tab becomes
  // hidden or the screen locks, even when MediaSession is wired up. We track
  // the user's desired playback intent in a ref so we can resume the audio
  // ourselves the moment the tab becomes visible again — without ever
  // re-loading the source (which would reset progress).
  const desiredPlayingRef = useRef<boolean>(false)
  useEffect(() => { desiredPlayingRef.current = playing }, [playing])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVis = () => {
      const a = audioRef.current
      if (!a || !track) return
      // We never tear down the source on visibility changes — just make sure
      // playback resumes if the OS paused us in the background.
      if (document.visibilityState === 'visible' && desiredPlayingRef.current && a.paused) {
        void a.play().catch(() => {})
      }
    }
    const onPageShow = () => onVis()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', onPageShow)
    }
  }, [track])

  // Wake Lock — best-effort on browsers that support it. Audio playback via a
  // real <audio> element does NOT actually need this to keep playing through
  // a screen lock (MediaSession + audio focus handle that), but on some
  // mobile browsers it helps prevent aggressive tab suspension.
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const anyNav = navigator as any
    if (!anyNav.wakeLock) return
    let sentinel: any = null
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
    return () => { document.removeEventListener('visibilitychange', onVis); void release() }
  }, [playing])

  return (
    <Ctx.Provider value={{ track, queue, playing, loading, progress, duration, play, enqueue, removeFromQueue, clearQueue, next, toggle, seek, stop }}>
      {children}
    </Ctx.Provider>
  )
}

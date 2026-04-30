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
  autoRadio: boolean
  setAutoRadio: (v: boolean) => void
  // play() is intentionally SYNCHRONOUS so the YouTube IFrame Player API call
  // happens inside the originating click frame and the browser keeps the
  // user-gesture activation (required for autoplay on iOS/Android).
  play: (track: PlayerTrack) => void
  enqueue: (track: PlayerTrack) => void
  playNext: (track: PlayerTrack) => void
  removeFromQueue: (id: string) => void
  clearQueue: () => void
  next: () => void
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
export function extractVideoId(url: string): string | null {
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

const AUTO_RADIO_KEY = 'dz-tube-auto-radio'
function loadAutoRadio(): boolean {
  if (typeof window === 'undefined') return false
  try { return localStorage.getItem(AUTO_RADIO_KEY) === '1' } catch { return false }
}

// ── YouTube IFrame Player API loader ────────────────────────────────────────
// The IFrame API loads a global window.YT object and calls
// window.onYouTubeIframeAPIReady when ready. We load it once on first need.
declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
    __dzYtReadyPromise?: Promise<any>
    __dzYtPlayer?: any
  }
}
function loadYouTubeIframeAPI(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (window.__dzYtReadyPromise) return window.__dzYtReadyPromise
  window.__dzYtReadyPromise = new Promise(resolve => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      try { prev && prev() } catch {}
      resolve(window.YT)
    }
    if (!document.getElementById('dz-yt-iframe-api')) {
      const s = document.createElement('script')
      s.id = 'dz-yt-iframe-api'
      s.src = 'https://www.youtube.com/iframe_api'
      s.async = true
      document.head.appendChild(s)
    }
  })
  return window.__dzYtReadyPromise
}

export function MiniPlayerProvider({ children }: { children: ReactNode }) {
  const initial = loadPersisted()
  const [track, setTrack] = useState<PlayerTrack | null>(initial.track)
  const [queue, setQueue] = useState<PlayerTrack[]>(initial.queue)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(initial.progress)
  const [duration, setDuration] = useState(initial.track?.duration || 0)
  const [autoRadio, setAutoRadioState] = useState<boolean>(loadAutoRadio())
  const setAutoRadio = useCallback((v: boolean) => {
    setAutoRadioState(v)
    try { localStorage.setItem(AUTO_RADIO_KEY, v ? '1' : '0') } catch {}
  }, [])

  // Recently-played ids — sent to /related as exclusion list so the
  // auto-radio doesn't loop the same 3-4 tracks. Capped at 25.
  const recentRef = useRef<string[]>([])
  // Lock to avoid concurrent /related fetches when the user mashes "next".
  const fetchingRelatedRef = useRef<boolean>(false)
  const autoRadioRef = useRef<boolean>(autoRadio)
  useEffect(() => { autoRadioRef.current = autoRadio }, [autoRadio])

  // YouTube IFrame Player singleton + state refs
  const ytPlayerRef = useRef<any>(null)
  const ytReadyRef = useRef<boolean>(false)
  const queueRef = useRef<PlayerTrack[]>([])
  const restoredRef = useRef<boolean>(false)
  const resumeAtRef = useRef<number>(initial.progress)
  // Pending track to play once the YT API finishes loading. Without this the
  // first click on a track right after page load would silently no-op.
  const pendingPlayRef = useRef<{ track: PlayerTrack; resumeAt: number } | null>(null)
  // Tracks user intent so visibility/recovery handlers know whether to resume.
  const wantPlayingRef = useRef<boolean>(false)
  const trackRef = useRef<PlayerTrack | null>(initial.track)
  const nextRef = useRef<() => void>(() => {})
  // Currently bound video id — used to skip redundant loadVideoById() calls
  // (which would otherwise re-buffer the same track and cause a hiccup).
  const currentVideoIdRef = useRef<string | null>(null)
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { trackRef.current = track }, [track])

  // ── YT.Player singleton creation ──────────────────────────────────────────
  // Mount a hidden host div ONCE, load the IFrame API, then construct a
  // single YT.Player. All subsequent track changes call loadVideoById() on
  // this same instance — never destroy + recreate. This eliminates the
  // "infinite loading" race that happens when a player is recreated on
  // every play().
  useEffect(() => {
    if (typeof window === 'undefined') return
    let host = document.getElementById('dz-yt-host')
    if (!host) {
      host = document.createElement('div')
      host.id = 'dz-yt-host'
      // Keep present in the DOM (mobile browsers refuse iframe playback if
      // the element is display:none) but visually invisible. 1×1 px in the
      // bottom-right corner is invisible to the user but accepted by every
      // engine we tested (Chrome Android, iOS Safari, Firefox).
      host.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden'
      document.body.appendChild(host)
      // Inner div is what YT.Player replaces with the iframe.
      const inner = document.createElement('div')
      inner.id = 'dz-yt-inner'
      host.appendChild(inner)
    }

    let cancelled = false
    let progressTimer: number | null = null
    let stuckTimer: number | null = null

    loadYouTubeIframeAPI().then(YT => {
      if (cancelled) return
      if (ytPlayerRef.current) return
      const initialId = trackRef.current ? extractVideoId(trackRef.current.url) || trackRef.current.id : ''
      // Build the options dict conditionally — YT.Player rejects an
      // explicitly-undefined videoId at construction time. When we have no
      // restored track we omit the field entirely and call loadVideoById()
      // on the first user click instead.
      const playerOpts: any = {
        // Do NOT autoplay on initial mount — that would be an autoplay-block
        // violation (no user gesture). The user clicks Play on the restored
        // track to start it, just like any music app.
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            ytReadyRef.current = true
            window.__dzYtPlayer = ytPlayerRef.current
            // If a track was restored from localStorage, queue it (paused)
            // so its metadata loads but it doesn't autoplay.
            const t = trackRef.current
            if (t && initialId && resumeAtRef.current > 1) {
              try { ytPlayerRef.current.cueVideoById({ videoId: initialId, startSeconds: resumeAtRef.current }) } catch {}
            }
            // Drain a pending click that fired before YT finished loading.
            const pending = pendingPlayRef.current
            if (pending) {
              pendingPlayRef.current = null
              startVideo(pending.track, pending.resumeAt)
            }
            // Restore user volume/rate prefs, if any.
            try {
              const raw = localStorage.getItem('dz-tube-player-prefs')
              if (raw) {
                const p = JSON.parse(raw)
                if (typeof p.volume === 'number') ytPlayerRef.current.setVolume(Math.max(0, Math.min(100, p.volume * 100)))
                if (p.muted) ytPlayerRef.current.mute()
                if (typeof p.rate === 'number') {
                  try { ytPlayerRef.current.setPlaybackRate(p.rate) } catch {}
                }
              }
            } catch {}
          },
          onStateChange: (e: any) => {
            // YT states: -1 unstarted, 0 ended, 1 playing, 2 paused,
            // 3 buffering, 5 cued.
            const s = e?.data
            if (s === 1) {
              setPlaying(true); setLoading(false)
              wantPlayingRef.current = true
            } else if (s === 2) {
              setPlaying(false)
              // Don't mutate wantPlayingRef here — pause may be browser-issued
              // (window blur, tab throttle); user-pause toggles wantPlaying.
            } else if (s === 3) {
              setLoading(true)
            } else if (s === 5) {
              setLoading(false); setPlaying(false)
            } else if (s === 0) {
              setPlaying(false); setLoading(false)
              const q = queueRef.current
              if (q.length > 0 || (autoRadioRef.current && trackRef.current)) {
                void nextRef.current()
              } else {
                wantPlayingRef.current = false
              }
            }
          },
          onError: (e: any) => {
            // YT error codes: 2 invalid param, 5 HTML5 player error,
            // 100 video not found, 101/150 embed disabled. For 101/150 we
            // skip to the next track since this video can never play.
            const code = e?.data
            console.warn('[mini-player] YT error', code)
            setLoading(false)
            if (code === 101 || code === 150 || code === 100) {
              if (queueRef.current.length > 0 || autoRadioRef.current) {
                window.setTimeout(() => { void nextRef.current() }, 400)
              } else {
                setPlaying(false)
                wantPlayingRef.current = false
              }
            }
          },
        },
      }
      if (initialId && /^[A-Za-z0-9_-]{11}$/.test(initialId)) {
        playerOpts.videoId = initialId
      }
      ytPlayerRef.current = new YT.Player('dz-yt-inner', playerOpts)
    }).catch(err => {
      console.warn('[mini-player] YT API load failed', err)
      setLoading(false)
    })

    // Poll currentTime / duration so the progress bar updates smoothly.
    progressTimer = window.setInterval(() => {
      const p = ytPlayerRef.current
      if (!p || !ytReadyRef.current) return
      try {
        const cur = typeof p.getCurrentTime === 'function' ? p.getCurrentTime() : 0
        const dur = typeof p.getDuration === 'function' ? p.getDuration() : 0
        if (Number.isFinite(cur)) setProgress(cur)
        if (Number.isFinite(dur) && dur > 0) setDuration(dur)
      } catch {}
    }, 500) as unknown as number

    // Stuck detector: if the user wants playback but the player is in PAUSED
    // state for >5s without a user pause, attempt one resume. Bounded so it
    // doesn't fight a real pause.
    let lastResumeAt = 0
    stuckTimer = window.setInterval(() => {
      const p = ytPlayerRef.current
      if (!p || !ytReadyRef.current) return
      if (!wantPlayingRef.current) return
      try {
        const state = typeof p.getPlayerState === 'function' ? p.getPlayerState() : -1
        // 2 = paused. We only auto-resume from a paused-while-wanting state.
        if (state === 2 && Date.now() - lastResumeAt > 5000) {
          lastResumeAt = Date.now()
          p.playVideo()
        }
      } catch {}
    }, 4000) as unknown as number

    return () => {
      cancelled = true
      if (progressTimer != null) clearInterval(progressTimer)
      if (stuckTimer != null) clearInterval(stuckTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Internal: start a video on the singleton player ──────────────────────
  // Called synchronously from the user-gesture frame so YT can autoplay.
  const startVideo = useCallback((t: PlayerTrack, resumeAt: number) => {
    const videoId = extractVideoId(t.url) || t.id
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      console.warn('[mini-player] invalid videoId', t.id, t.url)
      setLoading(false)
      return
    }
    setLoading(true)
    setProgress(resumeAt > 1 ? resumeAt : 0)
    setDuration(t.duration && t.duration > 0 ? t.duration : 0)
    wantPlayingRef.current = true
    // If the YT API isn't ready yet, queue the click. onReady will drain it.
    if (!ytPlayerRef.current || !ytReadyRef.current) {
      pendingPlayRef.current = { track: t, resumeAt }
      return
    }
    try {
      // Skip redundant reloads of the same id — the player already has the
      // buffered stream; just resume / play.
      if (currentVideoIdRef.current === videoId) {
        if (resumeAt > 1) {
          try { ytPlayerRef.current.seekTo(resumeAt, true) } catch {}
        }
        ytPlayerRef.current.playVideo()
      } else {
        currentVideoIdRef.current = videoId
        // loadVideoById starts playback immediately on most engines; we still
        // call playVideo() right after to cover engines that only "cue".
        ytPlayerRef.current.loadVideoById({
          videoId,
          startSeconds: resumeAt > 1 ? resumeAt : 0,
        })
        // Some browsers honour autoplay only with this explicit nudge.
        try { ytPlayerRef.current.playVideo() } catch {}
      }
    } catch (err) {
      console.warn('[mini-player] startVideo failed', err)
      setLoading(false)
    }

    // Update Media Session metadata so the OS shows track info on the
    // lockscreen / notification shade.
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

  // SYNC by design — see MiniPlayerCtx.play comment for why we cannot await.
  const playInternal = useCallback((t: PlayerTrack, autoplay: boolean = true) => {
    setTrack(t)
    const resumeAt = resumeAtRef.current
    resumeAtRef.current = 0
    if (autoplay) {
      startVideo(t, resumeAt)
    } else {
      // Cue (don't play) — used for restore-on-mount.
      const videoId = extractVideoId(t.url) || t.id
      currentVideoIdRef.current = videoId
      if (ytPlayerRef.current && ytReadyRef.current && videoId) {
        try { ytPlayerRef.current.cueVideoById({ videoId, startSeconds: resumeAt > 1 ? resumeAt : 0 }) } catch {}
      } else {
        // Keep the resume position around for when the user finally hits play.
        resumeAtRef.current = resumeAt
      }
      setProgress(resumeAt > 1 ? resumeAt : 0)
      setDuration(t.duration && t.duration > 0 ? t.duration : 0)
    }
  }, [startVideo])

  // Pull a fresh batch of related tracks for the seed and append them to the
  // queue. Used by the auto-radio loop. Returns the list it appended (may be
  // empty on network/extractor failure).
  const fetchRadio = useCallback(async (seedId: string): Promise<PlayerTrack[]> => {
    if (fetchingRelatedRef.current) return []
    fetchingRelatedRef.current = true
    try {
      const exclude = encodeURIComponent(recentRef.current.slice(0, 20).join(','))
      const r = await fetch(`/api/dz-tube/related?id=${encodeURIComponent(seedId)}&limit=10&exclude=${exclude}`)
      if (!r.ok) return []
      const data = await r.json()
      const items: PlayerTrack[] = (data.results || [])
        .filter((x: any) => x && x.id && /^[A-Za-z0-9_-]{11}$/.test(x.id))
        .map((x: any) => ({
          id: x.id,
          url: x.url || `https://www.youtube.com/watch?v=${x.id}`,
          title: x.title || 'بدون عنوان',
          thumbnail: x.thumbnail || `https://i.ytimg.com/vi/${x.id}/hqdefault.jpg`,
          channel: x.channel || '',
          duration: x.duration || 0,
        }))
      return items
    } catch {
      return []
    } finally {
      fetchingRelatedRef.current = false
    }
  }, [])

  const next = useCallback(() => {
    const q = queueRef.current
    if (q.length > 0) {
      const [head, ...rest] = q
      setQueue(rest)
      const leaving = trackRef.current?.id
      if (leaving && !recentRef.current.includes(leaving)) {
        recentRef.current = [leaving, ...recentRef.current].slice(0, 25)
      }
      playInternal(head)
      return
    }
    if (autoRadioRef.current && trackRef.current) {
      const seedId = trackRef.current.id
      void fetchRadio(seedId).then(radio => {
        if (radio.length === 0) return
        const [head, ...rest] = radio
        setQueue(rest)
        if (seedId && !recentRef.current.includes(seedId)) {
          recentRef.current = [seedId, ...recentRef.current].slice(0, 25)
        }
        playInternal(head)
      })
    }
  }, [playInternal, fetchRadio])
  useEffect(() => { nextRef.current = next }, [next])

  // Auto-radio top-up: when the queue gets thin (≤1) while autoRadio is on,
  // pre-fetch the next batch so the user experiences zero gap between tracks.
  useEffect(() => {
    if (!autoRadio) return
    if (!track) return
    if (queue.length > 1) return
    if (fetchingRelatedRef.current) return
    let cancelled = false
    void (async () => {
      const items = await fetchRadio(track.id)
      if (cancelled || items.length === 0) return
      setQueue(prev => {
        const have = new Set(prev.map(t => t.id))
        const seedId = trackRef.current?.id
        const merged = [...prev]
        for (const it of items) {
          if (have.has(it.id)) continue
          if (it.id === seedId) continue
          merged.push(it)
        }
        return merged
      })
    })()
    return () => { cancelled = true }
  }, [autoRadio, track, queue.length, fetchRadio])

  const play = useCallback((t: PlayerTrack) => { playInternal(t) }, [playInternal])

  // Restore previous track on first mount (cued, ready to resume on click).
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
      let cur = 0
      try {
        const p = ytPlayerRef.current
        if (p && ytReadyRef.current && typeof p.getCurrentTime === 'function') cur = p.getCurrentTime() || 0
      } catch {}
      persist({ track, queue: queueRef.current, progress: cur })
    }, 4000)
    return () => clearInterval(id)
  }, [track])

  const enqueue = useCallback((t: PlayerTrack) => {
    setQueue(prev => prev.find(x => x.id === t.id) ? prev : [...prev, t])
  }, [])

  const playNext = useCallback((t: PlayerTrack) => {
    setQueue(prev => {
      const without = prev.filter(x => x.id !== t.id)
      return [t, ...without]
    })
  }, [])

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(t => t.id !== id))
  }, [])

  const clearQueue = useCallback(() => setQueue([]), [])

  const toggle = useCallback(() => {
    const p = ytPlayerRef.current
    const t = trackRef.current
    if (!t) return
    // If YT isn't ready yet, treat this as a play request and queue it.
    if (!p || !ytReadyRef.current) {
      pendingPlayRef.current = { track: t, resumeAt: progress }
      wantPlayingRef.current = true
      setLoading(true)
      return
    }
    try {
      const state = typeof p.getPlayerState === 'function' ? p.getPlayerState() : -1
      // States 1=playing, 3=buffering count as "is playing" → pause.
      if (state === 1 || state === 3) {
        wantPlayingRef.current = false
        p.pauseVideo()
      } else {
        wantPlayingRef.current = true
        // If video was never bound (e.g. fresh restore) bind it now.
        const videoId = extractVideoId(t.url) || t.id
        if (currentVideoIdRef.current !== videoId) {
          startVideo(t, progress)
        } else {
          p.playVideo()
        }
      }
    } catch (err) {
      console.warn('[mini-player] toggle failed', err)
    }
  }, [progress, startVideo])

  const seek = useCallback((sec: number) => {
    const p = ytPlayerRef.current
    if (!p || !ytReadyRef.current) return
    const target = Math.max(0, sec)
    try { p.seekTo(target, true); setProgress(target) } catch {}
  }, [])

  const stop = useCallback(() => {
    wantPlayingRef.current = false
    const p = ytPlayerRef.current
    if (p && ytReadyRef.current) {
      try { p.stopVideo() } catch {}
    }
    currentVideoIdRef.current = null
    setTrack(null)
    setPlaying(false)
    setProgress(0)
    setDuration(0)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  // Background-play resilience: when the tab becomes visible again, if the
  // user wanted playback but the engine paused us, resume.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const p = ytPlayerRef.current
      if (!p || !ytReadyRef.current) return
      if (!wantPlayingRef.current) return
      try {
        const state = typeof p.getPlayerState === 'function' ? p.getPlayerState() : -1
        if (state === 2 || state === 5 || state === -1) p.playVideo()
      } catch {}
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [])

  // Wire up Media Session action handlers (lockscreen / headset buttons).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        const p = ytPlayerRef.current
        if (!p || !ytReadyRef.current) return
        wantPlayingRef.current = true
        try { p.playVideo() } catch {}
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        const p = ytPlayerRef.current
        if (!p || !ytReadyRef.current) return
        wantPlayingRef.current = false
        try { p.pauseVideo() } catch {}
      })
      navigator.mediaSession.setActionHandler('nexttrack', () => { void next() })
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        // We don't keep a "previous" stack, but rewinding to track start is
        // the universal "previous" fallback that music apps expose.
        const p = ytPlayerRef.current
        if (!p || !ytReadyRef.current) return
        try { p.seekTo(0, true); p.playVideo() } catch {}
      })
      navigator.mediaSession.setActionHandler('seekbackward', (d: any) => {
        const p = ytPlayerRef.current
        if (!p || !ytReadyRef.current) return
        try {
          const cur = p.getCurrentTime() || 0
          p.seekTo(Math.max(0, cur - (d?.seekOffset || 10)), true)
        } catch {}
      })
      navigator.mediaSession.setActionHandler('seekforward', (d: any) => {
        const p = ytPlayerRef.current
        if (!p || !ytReadyRef.current) return
        try {
          const cur = p.getCurrentTime() || 0
          p.seekTo(cur + (d?.seekOffset || 10), true)
        } catch {}
      })
      navigator.mediaSession.setActionHandler('seekto', (d: any) => {
        const p = ytPlayerRef.current
        if (!p || !ytReadyRef.current || typeof d?.seekTime !== 'number') return
        try { p.seekTo(d.seekTime, true) } catch {}
      })
    } catch {}
  }, [next])

  // Keep MediaSession position state in sync so the lockscreen scrubber works.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (!('setPositionState' in navigator.mediaSession)) return
    if (!duration || !Number.isFinite(duration)) return
    try {
      ;(navigator.mediaSession as any).setPositionState({
        duration,
        playbackRate: 1,
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

  return (
    <Ctx.Provider value={{ track, queue, playing, loading, progress, duration, autoRadio, setAutoRadio, play, enqueue, playNext, removeFromQueue, clearQueue, next, toggle, seek, stop }}>
      {children}
    </Ctx.Provider>
  )
}

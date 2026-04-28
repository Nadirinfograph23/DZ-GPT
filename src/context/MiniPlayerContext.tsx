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
  play: (track: PlayerTrack) => Promise<void>
  enqueue: (track: PlayerTrack) => void
  playNext: (track: PlayerTrack) => void
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
// (/api/dz-tube/audio-pipe) resolves the signed googlevideo URL AND
// streams the bytes through our server with full Range support.
//
// Why audio-pipe and NOT audio-proxy:
// audio-proxy answers with HTTP 307 → googlevideo.com directly. That
// looks faster, but googlevideo signs the URL with the SERVER's IP.
// When the browser follows the redirect from a different client IP,
// google often returns a silent 403 / connection close — and on some
// browsers the <audio> element doesn't even fire `error`. Result:
// the spinner spins forever and playback never starts. audio-pipe
// avoids this by never exposing the IP-bound URL to the browser.
function buildAudioSrc(track: PlayerTrack, cacheBust?: number): string {
  const yt = track.url || `https://www.youtube.com/watch?v=${track.id}`
  const cb = cacheBust ? `&_r=${cacheBust}` : ''
  return `/api/dz-tube/audio-pipe?url=${encodeURIComponent(yt)}${cb}`
}

const AUTO_RADIO_KEY = 'dz-tube-auto-radio'
function loadAutoRadio(): boolean {
  if (typeof window === 'undefined') return false
  try { return localStorage.getItem(AUTO_RADIO_KEY) === '1' } catch { return false }
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

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<PlayerTrack[]>([])
  const restoredRef = useRef<boolean>(false)
  const resumeAtRef = useRef<number>(initial.progress)
  // Counter to discard late stream-resolution responses when the user
  // quickly switches tracks.
  const loadTokenRef = useRef<number>(0)
  // Track id currently bound to <audio>.src — used to skip redundant reloads.
  const currentSrcIdRef = useRef<string | null>(null)
  // Auto-recovery state: how many times have we tried to silently reload the
  // current track after an `error`/`stalled` event, and when did we last try.
  // Resets on every successful play / track change so a long-lived song can
  // recover many times across its full duration.
  const recoverAttemptsRef = useRef<number>(0)
  const lastRecoverAtRef = useRef<number>(0)
  const recoverTimerRef = useRef<number | null>(null)
  const trackRef = useRef<PlayerTrack | null>(initial.track)
  const wantPlayingRef = useRef<boolean>(false)
  const nextRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { trackRef.current = track }, [track])

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
    const onPlay = () => {
      setPlaying(true); setLoading(false)
      wantPlayingRef.current = true
      // A successful play resets the recovery budget so the next mid-stream
      // failure (URL expiry, network blip) gets its own retry quota.
      recoverAttemptsRef.current = 0
    }
    const onPause = () => {
      setPlaying(false)
      // CRITICAL: do NOT mutate wantPlayingRef here. The browser fires `pause`
      // for many reasons we don't control (error, stalled, source swap,
      // device wake-up, codec hiccup) and they often race ahead of `error`.
      // wantPlayingRef tracks USER intent only — it is set to false exclusively
      // by user actions (toggle/stop) and the media-session pause handler.
      // This was the #1 cause of "player stops mid-track and never resumes".
    }
    const onWaiting = () => { setLoading(true) }
    const onPlaying = () => { setLoading(false) }
    const onCanPlay = () => { setLoading(false) }
    const onEnded = () => {
      // Premature `ended` is the #2 cause of mid-track stops. The browser
      // fires `ended` whenever the stream socket is closed cleanly — and
      // when an expired googlevideo URL drops the connection without a
      // proper error code, the browser treats that as natural EOF.
      // Real EOF only counts when currentTime is within ~3s of the known
      // duration. Anything earlier is a connection drop → recover the same
      // track from the last position so the user never notices.
      const a = audioRef.current
      const cur = a?.currentTime || 0
      const d = a && Number.isFinite(a.duration) ? a.duration : 0
      const realEnd = d > 0 ? cur >= d - 3 : false
      if (!realEnd && wantPlayingRef.current && trackRef.current) {
        console.warn('[mini-player] premature ended at', cur, '/', d, '— recovering')
        scheduleRecovery(0)
        return
      }
      setPlaying(false)
      // If the user wants the auto-radio to keep going, hand off to next()
      // which knows how to fall back to /related when the queue is empty.
      // We deliberately keep wantPlayingRef=true so loadAndPlay's onPlay
      // event for the new track flows through cleanly.
      if (queueRef.current.length > 0 || (autoRadioRef.current && trackRef.current)) {
        void nextRef.current()
        return
      }
      wantPlayingRef.current = false
    }

    // ── Auto-recovery ────────────────────────────────────────────────────
    // The byte-pipe on the server already retries when googlevideo expires,
    // but a few classes of failures still surface to the <audio> element:
    //   • our own server returns 502 because both extractors failed once,
    //   • the client lost connectivity for a few seconds,
    //   • the browser dropped the source for memory pressure.
    // In every case the right answer is the same: rebind the same track
    // with a cache-bust and resume from the last known position. We bound
    // attempts at 6 within a sliding 90s window so a truly broken track
    // doesn't loop forever.
    const scheduleRecovery = (delayMs: number) => {
      if (recoverTimerRef.current) return
      const t = trackRef.current
      if (!t) return
      const now = Date.now()
      // Throttle: if we've burned through the rapid-retry quota in the last
      // 90s, fall back to a long cooldown (30s) instead of giving up. A
      // truly broken track stays paused but a flaky network or expired URL
      // cycle eventually recovers — even after hours of listening.
      if (now - lastRecoverAtRef.current > 90_000) recoverAttemptsRef.current = 0
      const overQuota = recoverAttemptsRef.current >= 6
      const effectiveDelay = overQuota ? Math.max(delayMs, 30_000) : delayMs
      recoverAttemptsRef.current += 1
      lastRecoverAtRef.current = now
      const resumeAt = el!.currentTime || 0
      recoverTimerRef.current = window.setTimeout(() => {
        recoverTimerRef.current = null
        const cur = trackRef.current
        if (!cur || cur.id !== t.id) return
        try {
          resumeAtRef.current = resumeAt
          el!.src = buildAudioSrc(cur, Date.now())
          currentSrcIdRef.current = cur.id
          el!.load()
          // ALWAYS attempt to resume after a recovery rebind. wantPlayingRef
          // can be momentarily desynced by browser-issued pause events that
          // race the error handler, so we trust the recovery context: if
          // the user hadn't actively paused/stopped (those paths cancel
          // the timer + reset the flag), we want this to play.
          const p = el!.play()
          if (p && typeof (p as Promise<void>).catch === 'function') {
            ;(p as Promise<void>).catch(() => {/* will retry via error handler */})
          }
        } catch (e) {
          console.warn('[mini-player] recovery rebind failed', e)
        }
      }, effectiveDelay) as unknown as number
    }

    const onError = () => {
      console.warn('[mini-player] audio error', el!.error?.code, el!.error?.message)
      setLoading(true) // keep buffering UI while we retry
      // Backoff: 600ms, 1.2s, 2s, 3s, 4s, 5s
      const backoff = [600, 1200, 2000, 3000, 4000, 5000]
      const i = Math.min(recoverAttemptsRef.current, backoff.length - 1)
      scheduleRecovery(backoff[i])
    }
    const onStalled = () => {
      // Stalled fires when the network can't deliver enough data. Give the
      // network a couple seconds before forcing a rebind — most stalls
      // resolve on their own.
      if (recoverTimerRef.current) return
      window.setTimeout(() => {
        if (!trackRef.current) return
        const a = audioRef.current
        if (!a) return
        // Still stalled? buffered range hasn't grown past currentTime → rebind.
        const buffEnd = a.buffered.length ? a.buffered.end(a.buffered.length - 1) : 0
        if (a.paused || buffEnd > a.currentTime + 0.25) return
        scheduleRecovery(0)
      }, 2500)
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
    el.addEventListener('stalled', onStalled)

    // STUCK DETECTOR — the safety net that makes "works for an hour or two"
    // become "works forever". The browser sometimes fails to fire `error`
    // or `stalled` when an audio stream silently dies (mid-stream socket
    // close after a backgrounded tab is throttled, expired googlevideo URL
    // returning bytes that decode to nothing, etc). We poll every 4s: if
    // the user wants playback, the element claims to not be paused, but
    // currentTime hasn't advanced in 8s, force a recovery rebind from the
    // last known position with a fresh cache-bust query.
    let lastSeenTime = el.currentTime
    let lastSeenAt = Date.now()
    const stuckTimer = window.setInterval(() => {
      const a = audioRef.current
      if (!a) return
      if (!wantPlayingRef.current) { lastSeenTime = a.currentTime; lastSeenAt = Date.now(); return }
      if (a.paused) { lastSeenTime = a.currentTime; lastSeenAt = Date.now(); return }
      if (a.readyState < 2) return // still loading initial data — let it
      const advanced = Math.abs(a.currentTime - lastSeenTime) > 0.25
      if (advanced) {
        lastSeenTime = a.currentTime
        lastSeenAt = Date.now()
        return
      }
      if (Date.now() - lastSeenAt > 8000) {
        console.warn('[mini-player] stuck for >8s, forcing recovery')
        lastSeenAt = Date.now() // reset window to avoid recovery loop
        scheduleRecovery(0)
      }
    }, 4000) as unknown as number

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
      el!.removeEventListener('stalled', onStalled)
      if (recoverTimerRef.current) { clearTimeout(recoverTimerRef.current); recoverTimerRef.current = null }
      clearInterval(stuckTimer)
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

  const next = useCallback(async () => {
    let q = queueRef.current
    // Auto-radio: when the queue is empty but the user wants continuous play,
    // pull a fresh batch of related tracks for the current seed and use the
    // first one as "next". The remaining tracks land in the queue so the
    // radio survives even if the next /related call fails.
    if (q.length === 0 && autoRadioRef.current && trackRef.current) {
      const radio = await fetchRadio(trackRef.current.id)
      if (radio.length > 0) {
        const [head, ...rest] = radio
        setQueue(rest)
        // Track the seed so the next radio call doesn't return it again.
        const id = trackRef.current.id
        if (id && !recentRef.current.includes(id)) {
          recentRef.current = [id, ...recentRef.current].slice(0, 25)
        }
        await playInternal(head)
        return
      }
    }
    q = queueRef.current
    if (q.length === 0) return
    const [head, ...rest] = q
    setQueue(rest)
    // Remember the track we're leaving so the radio doesn't loop back to it.
    const leaving = trackRef.current?.id
    if (leaving && !recentRef.current.includes(leaving)) {
      recentRef.current = [leaving, ...recentRef.current].slice(0, 25)
    }
    await playInternal(head)
  }, [playInternal, fetchRadio])
  useEffect(() => { nextRef.current = next }, [next])

  // Auto-radio top-up: when the queue gets thin (≤1) while autoRadio is
  // on, opportunistically pre-fetch the next batch in the background so
  // the user experiences zero gap between tracks. Runs whenever the
  // queue length or current track changes.
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

  // Insert a track at the FRONT of the queue so it plays right after the
  // currently playing one. If the same track is already in the queue, move
  // it to the front instead of duplicating.
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
    const el = audioRef.current
    if (!el || !track) return
    if (el.paused || el.ended) {
      wantPlayingRef.current = true
      recoverAttemptsRef.current = 0
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
      wantPlayingRef.current = false
      // Cancel any in-flight recovery so it doesn't restart playback after
      // a user-issued pause. Without this, pressing pause during a recovery
      // window could result in the timer resuming playback seconds later.
      if (recoverTimerRef.current) { clearTimeout(recoverTimerRef.current); recoverTimerRef.current = null }
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
    wantPlayingRef.current = false
    if (recoverTimerRef.current) { clearTimeout(recoverTimerRef.current); recoverTimerRef.current = null }
    recoverAttemptsRef.current = 0
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

  // Background-play resilience: when the tab becomes visible again, if the
  // user wanted playback to continue but the browser paused our audio (some
  // mobile browsers do this on long backgrounding), resume it. We never
  // pause on `hidden` — the whole point is to keep playing in the background.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const el = audioRef.current
      const t = trackRef.current
      if (!el || !t) return
      if (wantPlayingRef.current && el.paused) {
        // If the source was unloaded by the browser, rebind it first.
        if (!el.src || currentSrcIdRef.current !== t.id) {
          try {
            el.src = buildAudioSrc(t, Date.now())
            currentSrcIdRef.current = t.id
            el.load()
          } catch {}
        }
        const p = el.play()
        if (p && typeof (p as Promise<void>).catch === 'function') {
          ;(p as Promise<void>).catch(() => {})
        }
      }
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
        const el = audioRef.current
        if (el && el.paused) {
          wantPlayingRef.current = true
          recoverAttemptsRef.current = 0
          const p = el.play()
          if (p && typeof (p as Promise<void>).catch === 'function') {
            ;(p as Promise<void>).catch(() => {})
          }
        }
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        const el = audioRef.current
        if (el && !el.paused) {
          wantPlayingRef.current = false
          if (recoverTimerRef.current) { clearTimeout(recoverTimerRef.current); recoverTimerRef.current = null }
          try { el.pause() } catch {}
        }
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
    <Ctx.Provider value={{ track, queue, playing, loading, progress, duration, autoRadio, setAutoRadio, play, enqueue, playNext, removeFromQueue, clearQueue, next, toggle, seek, stop }}>
      {children}
    </Ctx.Provider>
  )
}

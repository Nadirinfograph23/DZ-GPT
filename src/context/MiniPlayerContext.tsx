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

export function MiniPlayerProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<PlayerTrack | null>(null)
  const [queue, setQueue] = useState<PlayerTrack[]>([])
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<PlayerTrack[]>([])
  useEffect(() => { queueRef.current = queue }, [queue])

  if (!audioRef.current && typeof window !== 'undefined') {
    audioRef.current = new Audio()
    audioRef.current.preload = 'auto'
  }

  const playInternal = useCallback(async (t: PlayerTrack) => {
    const a = audioRef.current
    if (!a) return
    setLoading(true)
    setTrack(t)
    try {
      a.src = `/api/dz-tube/audio-stream?url=${encodeURIComponent(t.url)}`
      await a.play()
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title, artist: t.channel,
          artwork: [{ src: t.thumbnail, sizes: '480x360', type: 'image/jpeg' }],
        })
      }
    } catch (e) {
      console.error(e)
      setPlaying(false)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const next = useCallback(async () => {
    const q = queueRef.current
    if (q.length === 0) return
    const [head, ...rest] = q
    setQueue(rest)
    await playInternal(head)
  }, [playInternal])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => setProgress(a.currentTime)
    const onMeta = () => setDuration(a.duration || 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnd = () => {
      setPlaying(false)
      if (queueRef.current.length > 0) next()
    }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnd)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnd)
    }
  }, [next])

  const play = useCallback(async (t: PlayerTrack) => { await playInternal(t) }, [playInternal])

  const enqueue = useCallback((t: PlayerTrack) => {
    setQueue(prev => prev.find(x => x.id === t.id) ? prev : [...prev, t])
  }, [])

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(t => t.id !== id))
  }, [])

  const clearQueue = useCallback(() => setQueue([]), [])

  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a || !track) return
    if (a.paused) a.play(); else a.pause()
  }, [track])

  const seek = useCallback((sec: number) => {
    const a = audioRef.current
    if (a) a.currentTime = sec
  }, [])

  const stop = useCallback(() => {
    const a = audioRef.current
    if (a) { a.pause(); a.removeAttribute('src'); a.load() }
    setTrack(null)
    setPlaying(false)
    setProgress(0)
  }, [])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', toggle)
    navigator.mediaSession.setActionHandler('pause', toggle)
    navigator.mediaSession.setActionHandler('nexttrack', () => { void next() })
  }, [toggle, next])

  return (
    <Ctx.Provider value={{ track, queue, playing, loading, progress, duration, play, enqueue, removeFromQueue, clearQueue, next, toggle, seek, stop }}>
      {children}
    </Ctx.Provider>
  )
}

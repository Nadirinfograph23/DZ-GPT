import { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react'

export interface RadioStation {
  stationuuid: string
  name: string
  url: string
  url_resolved: string
  favicon: string
  tags: string
  country: string
  language: string
  votes: number
  codec: string
  bitrate: number
}

interface RadioPlayerCtx {
  stations: RadioStation[]
  searchResults: RadioStation[]
  loadingStations: boolean
  currentStation: RadioStation | null
  playing: boolean
  loading: boolean
  error: string | null
  volume: number
  muted: boolean
  searchQuery: string
  setSearchQuery: (q: string) => void
  searchStations: (q: string) => Promise<void>
  playStation: (station: RadioStation) => void
  stop: () => void
  toggle: () => void
  setVolume: (v: number) => void
  setMuted: (m: boolean) => void
}

const Ctx = createContext<RadioPlayerCtx | null>(null)

export function useRadioPlayer() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useRadioPlayer must be inside RadioPlayerProvider')
  return c
}

const RADIO_STORAGE_KEY = 'dz-radio-state'
const PROXY_BASE = '/api/radio/browser'

function loadPersisted(): RadioStation | null {
  try {
    const raw = localStorage.getItem(RADIO_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

const FALLBACK_STATIONS: RadioStation[] = [
  {
    stationuuid: 'algerie-chaine1',
    name: 'Algérie Chaine 1',
    url: 'https://radiochaine1.ice.infomaniak.ch/chaine1.mp3',
    url_resolved: 'https://radiochaine1.ice.infomaniak.ch/chaine1.mp3',
    favicon: '',
    tags: 'national,algeria',
    country: 'Algeria',
    language: 'arabic',
    votes: 500,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    stationuuid: 'algerie-chaine2',
    name: 'Algérie Chaine 2',
    url: 'https://radiochaine2.ice.infomaniak.ch/chaine2.mp3',
    url_resolved: 'https://radiochaine2.ice.infomaniak.ch/chaine2.mp3',
    favicon: '',
    tags: 'culture,algeria',
    country: 'Algeria',
    language: 'arabic',
    votes: 300,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    stationuuid: 'algerie-chaine3',
    name: 'Algérie Chaîne 3',
    url: 'https://radiochaine3.ice.infomaniak.ch/chaine3.mp3',
    url_resolved: 'https://radiochaine3.ice.infomaniak.ch/chaine3.mp3',
    favicon: '',
    tags: 'french,algeria',
    country: 'Algeria',
    language: 'french',
    votes: 280,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    stationuuid: 'beurfm',
    name: 'Beur FM',
    url: 'https://beurfm.ice.infomaniak.ch/beurfm-high.mp3',
    url_resolved: 'https://beurfm.ice.infomaniak.ch/beurfm-high.mp3',
    favicon: '',
    tags: 'music,algerian',
    country: 'Algeria',
    language: 'arabic,french',
    votes: 6992,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    stationuuid: 'ghorbadz',
    name: 'GhorbaDz',
    url: 'https://stream-150.zeno.fm/y9rchc1djgavv',
    url_resolved: 'https://stream-150.zeno.fm/y9rchc1djgavv',
    favicon: '',
    tags: 'music,algeria',
    country: 'Algeria',
    language: 'arabic',
    votes: 3030,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    stationuuid: 'quran-radio',
    name: 'إذاعة القرآن الكريم',
    url: 'https://n0a.radiojar.com/0tpy1h0kxtzuv',
    url_resolved: 'https://n0a.radiojar.com/0tpy1h0kxtzuv',
    favicon: '',
    tags: 'quran,islamic',
    country: 'Algeria',
    language: 'arabic',
    votes: 10156,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    stationuuid: 'antinea',
    name: 'Antinea Radio',
    url: 'https://listen.radioking.com/radio/6640/stream/347',
    url_resolved: 'https://listen.radioking.com/radio/6640/stream/347',
    favicon: '',
    tags: 'music,pop,algeria',
    country: 'Algeria',
    language: 'arabic,french',
    votes: 20924,
    codec: 'MP3',
    bitrate: 128,
  },
]

export function RadioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [stations, setStations] = useState<RadioStation[]>(FALLBACK_STATIONS)
  const [searchResults, setSearchResults] = useState<RadioStation[]>([])
  const [loadingStations, setLoadingStations] = useState(true)
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(loadPersisted)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolumeState] = useState(0.8)
  const [muted, setMutedState] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Create audio element once
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audioRef.current = audio

    const onPlaying = () => { setPlaying(true); setLoading(false); setError(null) }
    const onWaiting  = () => setLoading(true)
    const onStalled  = () => setLoading(true)
    const onError    = () => {
      setPlaying(false); setLoading(false)
      setError('تعذّر الاتصال — جرّب إذاعة أخرى')
    }
    const onPause = () => setPlaying(false)

    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('error',   onError)
    audio.addEventListener('pause',   onPause)

    return () => {
      audio.pause()
      audio.src = ''
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('error',   onError)
      audio.removeEventListener('pause',   onPause)
    }
  }, [])

  // Sync volume/muted
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume
    }
  }, [volume, muted])

  // Fetch Algeria stations from API
  useEffect(() => {
    let cancelled = false
    setLoadingStations(true)
    fetch(`${PROXY_BASE}/algeria`)
      .then(r => r.json())
      .then((data: RadioStation[]) => {
        if (cancelled) return
        const valid = data.filter(s =>
          s.url_resolved && s.url_resolved.startsWith('http') && s.name?.trim()
        )
        if (valid.length > 0) setStations(valid)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingStations(false) })
    return () => { cancelled = true }
  }, [])

  const searchStations = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    try {
      const r = await fetch(`${PROXY_BASE}/search?name=${encodeURIComponent(q)}`)
      const data: RadioStation[] = await r.json()
      setSearchResults(data.filter(s => s.url_resolved?.startsWith('http')))
    } catch {
      setSearchResults([])
    }
  }, [])

  const playStation = useCallback((station: RadioStation) => {
    const audio = audioRef.current
    if (!audio) return

    // Toggle if same station
    if (currentStation?.stationuuid === station.stationuuid && (playing || loading)) {
      audio.pause()
      setPlaying(false)
      setLoading(false)
      return
    }

    audio.pause()
    setCurrentStation(station)
    setPlaying(false)
    setLoading(true)
    setError(null)

    // Persist
    try { localStorage.setItem(RADIO_STORAGE_KEY, JSON.stringify(station)) } catch {}

    const url = station.url_resolved || station.url
    audio.src = url
    audio.volume = muted ? 0 : volume
    audio.load()
    audio.play().catch(() => {
      // Try original url as fallback
      if (url !== station.url) {
        audio.src = station.url
        audio.load()
        audio.play().catch(() => {
          setLoading(false)
          setError('تعذّر الاتصال — جرّب إذاعة أخرى')
        })
      } else {
        setLoading(false)
        setError('تعذّر الاتصال — جرّب إذاعة أخرى')
      }
    })
  }, [currentStation, playing, loading, volume, muted])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.src = ''
    setPlaying(false)
    setLoading(false)
    setCurrentStation(null)
    try { localStorage.removeItem(RADIO_STORAGE_KEY) } catch {}
  }, [])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !currentStation) return
    if (playing) {
      audio.pause()
    } else {
      audio.play().catch(() => setError('تعذّر الاتصال'))
    }
  }, [playing, currentStation])

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    setMutedState(false)
    if (audioRef.current) audioRef.current.volume = v
  }, [])

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m)
    if (audioRef.current) audioRef.current.volume = m ? 0 : volume
  }, [volume])

  return (
    <Ctx.Provider value={{
      stations, searchResults, loadingStations,
      currentStation, playing, loading, error,
      volume, muted, searchQuery, setSearchQuery,
      searchStations, playStation, stop, toggle, setVolume, setMuted,
    }}>
      {children}
    </Ctx.Provider>
  )
}

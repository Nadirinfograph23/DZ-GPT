import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Radio, Play, Pause, Volume2, VolumeX,
  Loader2, Wifi, WifiOff, RefreshCw,
} from 'lucide-react'
import '../styles/dz-radio.css'

interface Station {
  id: string
  name: string
  nameAr: string
  genre: string
  genreAr: string
  emoji: string
  color: string
  website?: string
}

const STATIONS: Station[] = [
  {
    id: 'coran',
    name: 'Radio Coran',
    nameAr: 'إذاعة القرآن الكريم',
    genre: 'Quran',
    genreAr: 'قرآن كريم',
    emoji: '🕌',
    color: '#2ecc71',
    website: 'https://www.radioalgerie.dz',
  },
  {
    id: 'chaine1',
    name: 'Chaîne 1',
    nameAr: 'الإذاعة الوطنية',
    genre: 'National',
    genreAr: 'وطنية',
    emoji: '🇩🇿',
    color: '#3498db',
    website: 'https://www.radioalgerie.dz',
  },
  {
    id: 'chaine2',
    name: 'Chaîne 2',
    nameAr: 'الإذاعة الثقافية',
    genre: 'Culture',
    genreAr: 'ثقافية',
    emoji: '🎭',
    color: '#9b59b6',
    website: 'https://www.radioalgerie.dz',
  },
  {
    id: 'chaine3',
    name: 'Chaîne 3',
    nameAr: 'إذاعة فرانس',
    genre: 'Française',
    genreAr: 'فرنسية',
    emoji: '🎙️',
    color: '#e67e22',
    website: 'https://www.radioalgerie.dz',
  },
  {
    id: 'jil',
    name: 'Jil FM',
    nameAr: 'جيل إف إم',
    genre: 'Music',
    genreAr: 'موسيقى',
    emoji: '🎵',
    color: '#e74c3c',
    website: 'https://www.jilfm.dz',
  },
  {
    id: 'bahdja',
    name: 'El Bahdja',
    nameAr: 'البهجة',
    genre: 'Music',
    genreAr: 'موسيقى',
    emoji: '🎶',
    color: '#f39c12',
    website: 'https://www.elbahdjafm.dz',
  },
  {
    id: 'ifrikiya',
    name: 'Ifrikiya Sound',
    nameAr: 'إفريقيا ساوند',
    genre: 'Maghreb',
    genreAr: 'مغاربية',
    emoji: '🌍',
    color: '#1abc9c',
  },
  {
    id: 'alger_chaines',
    name: 'Algérie Inter.',
    nameAr: 'جزائر الدولية',
    genre: 'International',
    genreAr: 'دولية',
    emoji: '🌐',
    color: '#667eea',
    website: 'https://www.radioalgerie.dz',
  },
]

type PlayerState = 'idle' | 'loading' | 'playing' | 'error'

export default function DZRadio() {
  const navigate = useNavigate()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [activeStation, setActiveStation] = useState<string | null>(null)
  const [playerState, setPlayerState] = useState<PlayerState>('idle')
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [visualizer, setVisualizer] = useState<number[]>([])

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio

    const onPlaying = () => setPlayerState('playing')
    const onWaiting  = () => setPlayerState('loading')
    const onError    = () => { setPlayerState('error'); setErrorMsg('تعذّر الاتصال بالإذاعة') }
    const onStalled  = () => setPlayerState('loading')

    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('waiting',  onWaiting)
    audio.addEventListener('error',    onError)
    audio.addEventListener('stalled',  onStalled)

    return () => {
      audio.pause()
      audio.src = ''
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('waiting',  onWaiting)
      audio.removeEventListener('error',    onError)
      audio.removeEventListener('stalled',  onStalled)
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume
    }
  }, [volume, muted])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    if (playerState === 'playing') {
      interval = setInterval(() => {
        const bars = Array.from({ length: 12 }, () => Math.random() * 80 + 20)
        setVisualizer(bars)
      }, 120)
    } else {
      setVisualizer([])
    }
    return () => { if (interval) clearInterval(interval) }
  }, [playerState])

  const playStation = useCallback((stationId: string) => {
    const audio = audioRef.current
    if (!audio) return

    if (activeStation === stationId && playerState === 'playing') {
      audio.pause()
      audio.src = ''
      setActiveStation(null)
      setPlayerState('idle')
      return
    }

    audio.pause()
    setActiveStation(stationId)
    setPlayerState('loading')
    setErrorMsg('')

    const streamUrl = `/api/radio/stream/${stationId}`
    audio.src = streamUrl
    audio.volume = muted ? 0 : volume
    audio.play().catch(() => {
      setPlayerState('error')
      setErrorMsg('يتعذّر تشغيل البث — حاول مجدداً')
    })
  }, [activeStation, playerState, volume, muted])

  const retry = () => {
    if (activeStation) {
      const audio = audioRef.current
      if (audio) {
        audio.load()
        audio.play().catch(() => setPlayerState('error'))
        setPlayerState('loading')
      }
    }
  }

  const activeInfo = STATIONS.find(s => s.id === activeStation)

  return (
    <div className="dzradio-page">
      <div className="dzradio-header">
        <button className="dzradio-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div className="dzradio-header-title">
          <Radio size={22} className="dzradio-icon-spin" />
          <span>DZ Radio</span>
          <span className="dzradio-subtitle">راديو جزائري مباشر</span>
        </div>
        <div className="dzradio-live-badge">
          <span className="dzradio-live-dot" />
          LIVE
        </div>
      </div>

      {activeStation && (
        <div className="dzradio-now-playing" style={{ '--station-color': activeInfo?.color } as React.CSSProperties}>
          <div className="dzradio-np-left">
            <span className="dzradio-np-emoji">{activeInfo?.emoji}</span>
            <div className="dzradio-np-info">
              <span className="dzradio-np-name">{activeInfo?.nameAr}</span>
              <span className="dzradio-np-genre">{activeInfo?.genreAr}</span>
            </div>
          </div>
          <div className="dzradio-np-right">
            {playerState === 'loading' && (
              <div className="dzradio-np-status">
                <Loader2 size={16} className="dzradio-spin" />
                <span>جاري الاتصال...</span>
              </div>
            )}
            {playerState === 'playing' && (
              <div className="dzradio-visualizer">
                {visualizer.map((h, i) => (
                  <div key={i} className="dzradio-bar" style={{ height: `${h}%` }} />
                ))}
              </div>
            )}
            {playerState === 'error' && (
              <div className="dzradio-np-status dzradio-error">
                <WifiOff size={14} />
                <span>{errorMsg}</span>
                <button className="dzradio-retry-btn" onClick={retry}>
                  <RefreshCw size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="dzradio-volume-bar">
        <button className="dzradio-mute-btn" onClick={() => setMuted(m => !m)}>
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={muted ? 0 : volume}
          onChange={e => { setVolume(+e.target.value); setMuted(false) }}
          className="dzradio-volume-slider"
        />
        <span className="dzradio-volume-val">{Math.round((muted ? 0 : volume) * 100)}%</span>
      </div>

      <div className="dzradio-grid">
        {STATIONS.map(station => {
          const isActive = activeStation === station.id
          const isLoading = isActive && playerState === 'loading'
          const isPlaying = isActive && playerState === 'playing'
          const isError   = isActive && playerState === 'error'

          return (
            <button
              key={station.id}
              className={`dzradio-card ${isActive ? 'dzradio-card--active' : ''} ${isError ? 'dzradio-card--error' : ''}`}
              style={{ '--card-color': station.color } as React.CSSProperties}
              onClick={() => playStation(station.id)}
            >
              <div className="dzradio-card-emoji">{station.emoji}</div>
              <div className="dzradio-card-body">
                <span className="dzradio-card-name">{station.nameAr}</span>
                <span className="dzradio-card-genre">{station.genreAr}</span>
              </div>
              <div className="dzradio-card-btn">
                {isLoading ? (
                  <Loader2 size={18} className="dzradio-spin" />
                ) : isPlaying ? (
                  <Pause size={18} />
                ) : isError ? (
                  <WifiOff size={18} />
                ) : (
                  <Play size={18} />
                )}
              </div>
              {isPlaying && (
                <div className="dzradio-card-wave">
                  {[1,2,3].map(i => <span key={i} className="dzradio-card-wave-bar" />)}
                </div>
              )}
              {isActive && <div className="dzradio-card-glow" />}
            </button>
          )
        })}
      </div>

      <div className="dzradio-footer">
        <Wifi size={13} />
        <span>البث مباشر عبر الإنترنت — تأكد من اتصالك</span>
      </div>
    </div>
  )
}

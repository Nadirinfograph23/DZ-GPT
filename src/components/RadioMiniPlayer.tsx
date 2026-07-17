import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Radio, Pause, Play, X, Volume2, VolumeX, Loader2 } from 'lucide-react'
import { useRadioPlayer } from '../context/RadioPlayerContext'
import '../styles/radio-mini-player.css'

const HIDE_ON = ['/dz-tube', '/dztube']

function getStationEmoji(station: { name: string; tags: string; language: string }) {
  const n = station.name.toLowerCase()
  const t = (station.tags || '').toLowerCase()
  if (n.includes('quran') || n.includes('قرآن') || t.includes('quran') || t.includes('islamic')) return '🕌'
  if (n.includes('chaine 1') || n.includes('chain 1') || n.includes('وطنية')) return '🇩🇿'
  if (n.includes('chaine 2') || n.includes('chain 2') || n.includes('ثقافية')) return '🎭'
  if (n.includes('chaine 3') || n.includes('chain 3') || n.includes('française') || n.includes('french')) return '🎙️'
  if (n.includes('beur') || n.includes('maghreb') || n.includes('france')) return '🌍'
  if (n.includes('jil') || n.includes('hit') || n.includes('hits')) return '🎵'
  if (n.includes('bahdja') || n.includes('bahja')) return '🎶'
  if (t.includes('jazz')) return '🎷'
  if (t.includes('rock')) return '🎸'
  if (t.includes('classical') || t.includes('classique')) return '🎻'
  if (t.includes('news') || t.includes('actualité') || t.includes('info')) return '📰'
  if (t.includes('sport')) return '⚽'
  return '📻'
}

export default function RadioMiniPlayer() {
  const { pathname } = useLocation()
  const { currentStation, playing, loading, error, volume, muted, toggle, stop, setVolume, setMuted } = useRadioPlayer()
  const [bars, setBars] = useState<number[]>([])
  const [showVolume, setShowVolume] = useState(false)

  // Animated equalizer bars
  useEffect(() => {
    if (!playing) { setBars([]); return }
    const id = setInterval(() => {
      setBars(Array.from({ length: 5 }, () => Math.random() * 70 + 30))
    }, 150)
    return () => clearInterval(id)
  }, [playing])

  // إضافة class على body عند ظهور شريط الراديو لمنع تغطية خانة الكتابة
  const isVisible = !!currentStation && !HIDE_ON.some(p => pathname.startsWith(p)) && pathname !== '/radio'
  useEffect(() => {
    if (isVisible) {
      document.body.classList.add('rmp-active')
    } else {
      document.body.classList.remove('rmp-active')
    }
    return () => { document.body.classList.remove('rmp-active') }
  }, [isVisible])

  if (!isVisible) return null

  const emoji = getStationEmoji(currentStation)

  return (
    <div className={`rmp-bar${error ? ' rmp-bar--error' : ''}`}>
      <div className="rmp-left">
        <span className="rmp-emoji">{emoji}</span>
        <div className="rmp-info">
          <span className="rmp-name">{currentStation.name}</span>
          <span className="rmp-status">
            {error ? error : loading ? 'جاري الاتصال...' : playing ? 'يُبثّ الآن' : 'متوقف'}
          </span>
        </div>
      </div>

      <div className="rmp-center">
        {playing && bars.length > 0 && (
          <div className="rmp-bars">
            {bars.map((h, i) => (
              <div key={i} className="rmp-bar-item" style={{ height: `${h}%` }} />
            ))}
          </div>
        )}
        {loading && <Loader2 size={14} className="rmp-spin" />}
      </div>

      <div className="rmp-controls">
        <div className="rmp-vol-wrap">
          <button
            className="rmp-btn rmp-vol-btn"
            onClick={() => setShowVolume(v => !v)}
            title="الصوت"
          >
            {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          {showVolume && (
            <div className="rmp-vol-popup">
              <input
                type="range" min={0} max={1} step={0.02}
                value={muted ? 0 : volume}
                onChange={e => { setVolume(+e.target.value); setMuted(false) }}
                className="rmp-vol-slider"
              />
              <button className="rmp-mute-small" onClick={() => setMuted(!muted)}>
                {muted ? 'صوت' : 'كتم'}
              </button>
            </div>
          )}
        </div>

        <button className="rmp-btn rmp-play-btn" onClick={toggle} title={playing ? 'إيقاف' : 'تشغيل'}>
          {loading ? <Loader2 size={16} className="rmp-spin" /> : playing ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <button className="rmp-btn rmp-stop-btn" onClick={stop} title="إيقاف وإغلاق">
          <X size={15} />
        </button>

        <span className="rmp-label">
          <Radio size={11} />
          <span>LIVE</span>
        </span>
      </div>
    </div>
  )
}

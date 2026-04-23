import { Play, Pause, X, Loader2 } from 'lucide-react'
import { useMiniPlayer } from '../context/MiniPlayerContext'

function fmt(s: number): string {
  if (!isFinite(s) || s <= 0) return '0:00'
  const m = Math.floor(s / 60), ss = Math.floor(s % 60)
  return `${m}:${ss.toString().padStart(2, '0')}`
}

export default function MiniPlayer() {
  const { track, playing, loading, progress, duration, toggle, seek, stop } = useMiniPlayer()
  if (!track) return null
  return (
    <div className="mini-player">
      <img className="mini-player-thumb" src={track.thumbnail} alt="" />
      <div className="mini-player-info">
        <span className="mini-player-title" title={track.title}>{track.title}</span>
        <span className="mini-player-meta">{track.channel}</span>
        <div className="mini-player-bar" onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - r.left) / r.width
          if (duration) seek(ratio * duration)
        }}>
          <div className="mini-player-fill" style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }} />
        </div>
        <span className="mini-player-time">{fmt(progress)} / {fmt(duration)}</span>
      </div>
      <button className="mini-player-btn" onClick={toggle} title={playing ? 'إيقاف' : 'تشغيل'}>
        {loading ? <Loader2 size={18} className="dzt-spin" /> : playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button className="mini-player-close" onClick={stop} title="إغلاق">
        <X size={16} />
      </button>
    </div>
  )
}

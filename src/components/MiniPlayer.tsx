import { useState } from 'react'
import { Play, Pause, X, Loader2, SkipForward, ListMusic, Trash2 } from 'lucide-react'
import { useMiniPlayer } from '../context/MiniPlayerContext'

function fmt(s: number): string {
  if (!isFinite(s) || s <= 0) return '0:00'
  const m = Math.floor(s / 60), ss = Math.floor(s % 60)
  return `${m}:${ss.toString().padStart(2, '0')}`
}

export default function MiniPlayer() {
  const { track, queue, playing, loading, progress, duration, toggle, seek, stop, next, removeFromQueue, clearQueue } = useMiniPlayer()
  const [queueOpen, setQueueOpen] = useState(false)
  if (!track && queue.length === 0) return null

  return (
    <>
      {track && (
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
          <button
            className="mini-player-side"
            onClick={() => next()}
            disabled={queue.length === 0}
            title="التالي"
          >
            <SkipForward size={15} />
          </button>
          <button
            className={`mini-player-side ${queueOpen ? 'active' : ''}`}
            onClick={() => setQueueOpen(o => !o)}
            title="قائمة التشغيل"
          >
            <ListMusic size={15} />
            {queue.length > 0 && <span className="mini-player-queue-count">{queue.length}</span>}
          </button>
          <button className="mini-player-close" onClick={stop} title="إغلاق">
            <X size={16} />
          </button>
        </div>
      )}

      {queueOpen && (
        <div className="mini-queue-panel">
          <div className="mini-queue-header">
            <span><ListMusic size={14} /> قائمة التشغيل ({queue.length})</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {queue.length > 0 && (
                <button className="mini-queue-clear" onClick={clearQueue} title="حذف الكل"><Trash2 size={13} /></button>
              )}
              <button className="mini-queue-clear" onClick={() => setQueueOpen(false)}><X size={13} /></button>
            </div>
          </div>
          <div className="mini-queue-body">
            {queue.length === 0 ? (
              <div className="mini-queue-empty">القائمة فارغة. أضف مقاطع من DZ Tube.</div>
            ) : queue.map((t, i) => (
              <div key={t.id} className="mini-queue-item">
                <span className="mini-queue-idx">{i + 1}</span>
                <img className="mini-queue-thumb" src={t.thumbnail} alt="" />
                <div className="mini-queue-info">
                  <span className="mini-queue-title" title={t.title}>{t.title}</span>
                  <span className="mini-queue-channel">{t.channel}</span>
                </div>
                <button className="mini-queue-remove" onClick={() => removeFromQueue(t.id)} title="حذف">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

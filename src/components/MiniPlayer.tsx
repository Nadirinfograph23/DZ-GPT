import { useEffect, useRef, useState } from 'react'
import { Play, Pause, X, Loader2, SkipForward, ListMusic, Trash2, ChevronDown, ChevronUp, Music2, Radio } from 'lucide-react'
import { useMiniPlayer } from '../context/MiniPlayerContext'
import { useEnhancedMiniPlayer, recordSkip } from '../utils/playerEnhancements'

function fmt(s: number): string {
  if (!isFinite(s) || s <= 0) return '0:00'
  const m = Math.floor(s / 60), ss = Math.floor(s % 60)
  return `${m}:${ss.toString().padStart(2, '0')}`
}

export default function MiniPlayer() {
  const { track, queue, playing, loading, progress, duration, autoRadio, setAutoRadio, toggle, seek, stop, next, removeFromQueue, clearQueue, play } = useMiniPlayer()
  const [queueOpen, setQueueOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const touchStartY = useRef<number | null>(null)
  const touchDeltaY = useRef<number>(0)

  // Mini Player V2 enhancement layer — preload-next, persisted volume/speed/mute,
  // hidden keyboard shortcuts (+/- volume, ,/. speed, M mute), analytics beacons.
  // Pure side-effect hook — does not touch rendered output or context API.
  useEnhancedMiniPlayer({
    trackId: track?.id ?? null,
    trackUrl: track?.url ?? null,
    trackTitle: track?.title ?? null,
    queueHeadUrl: queue[0]?.url ?? null,
    queueLength: queue.length,
    playing,
    loading,
    progress,
    duration,
  })

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    touchDeltaY.current = 0
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return
    touchDeltaY.current = e.touches[0].clientY - touchStartY.current
  }
  const onTouchEndBar = () => {
    if (touchDeltaY.current < -40) setExpanded(true)
    touchStartY.current = null; touchDeltaY.current = 0
  }
  const onTouchEndFull = () => {
    if (touchDeltaY.current > 60) setExpanded(false)
    touchStartY.current = null; touchDeltaY.current = 0
  }

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [expanded])

  // Toggle a global body class while the mini-player bar is visible so that
  // fixed/sticky chat input areas can lift themselves above the player and
  // stay readable while the user types. Matching CSS lives in mini-player.css
  // (body.dz-mini-active .input-area / .dz-input-area / .dzc-input-wrap).
  useEffect(() => {
    if (!track) return
    document.body.classList.add('dz-mini-active')
    return () => { document.body.classList.remove('dz-mini-active') }
  }, [track])

  useEffect(() => {
    if (!track) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case ' ':
        case 'Spacebar':
          e.preventDefault(); toggle(); break
        case 'ArrowLeft':
          e.preventDefault(); seek(Math.max(0, progress - 10)); break
        case 'ArrowRight':
          e.preventDefault(); seek(Math.min(duration || progress + 10, progress + 10)); break
        case 'n': case 'N':
          if (queue.length > 0) { e.preventDefault(); void next() }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [track, toggle, seek, progress, duration, next, queue.length])

  if (!track && queue.length === 0) return null

  return (
    <>
      {track && (
        <div className="mini-player" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEndBar}>
          <img className="mini-player-thumb" src={track.thumbnail} alt="" onClick={() => setExpanded(true)} style={{ cursor: 'pointer' }} />
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
            onClick={() => { recordSkip(track.id, progress, duration); next() }}
            disabled={queue.length === 0 && !autoRadio}
            title="التالي"
          >
            <SkipForward size={15} />
          </button>
          <button
            className={`mini-player-side ${autoRadio ? 'active' : ''}`}
            onClick={() => setAutoRadio(!autoRadio)}
            title={autoRadio ? 'إيقاف الإذاعة التلقائية' : 'تشغيل الإذاعة التلقائية'}
          >
            <Radio size={15} />
          </button>
          <button
            className={`mini-player-side ${queueOpen ? 'active' : ''}`}
            onClick={() => setQueueOpen(o => !o)}
            title="قائمة التشغيل"
          >
            <ListMusic size={15} />
            {queue.length > 0 && <span className="mini-player-queue-count">{queue.length}</span>}
          </button>
          <button className="mini-player-side" onClick={() => setExpanded(true)} title="توسيع">
            <ChevronUp size={15} />
          </button>
          <button className="mini-player-close" onClick={stop} title="إغلاق">
            <X size={16} />
          </button>
        </div>
      )}

      {track && expanded && (
        <div
          className="mini-player-full"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEndFull}
        >
          <div className="mpf-bg" style={{ backgroundImage: `url(${track.thumbnail})` }} />
          <div className="mpf-overlay" />
          <div className="mpf-content">
            <div className="mpf-handle" />
            <div className="mpf-topbar">
              <button className="mpf-icon-btn" onClick={() => setExpanded(false)} title="تصغير">
                <ChevronDown size={22} />
              </button>
              <span className="mpf-now"><Music2 size={14} /> يُشغَّل الآن</span>
              <button className="mpf-icon-btn" onClick={stop} title="إغلاق">
                <X size={22} />
              </button>
            </div>

            <div className="mpf-art-wrap">
              <img className="mpf-art" src={track.thumbnail} alt="" />
            </div>

            <div className="mpf-meta">
              <h2 className="mpf-title">{track.title}</h2>
              <p className="mpf-channel">{track.channel}</p>
            </div>

            <div className="mpf-progress">
              <div className="mpf-bar" onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                const ratio = (e.clientX - r.left) / r.width
                if (duration) seek(ratio * duration)
              }}>
                <div className="mpf-fill" style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }} />
              </div>
              <div className="mpf-times">
                <span>{fmt(progress)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            <div className="mpf-controls">
              <button className="mpf-side" onClick={() => seek(Math.max(0, progress - 10))} title="-10s">−10</button>
              <button className="mpf-play" onClick={toggle} title={playing ? 'إيقاف' : 'تشغيل'}>
                {loading ? <Loader2 size={32} className="dzt-spin" /> : playing ? <Pause size={32} /> : <Play size={32} />}
              </button>
              <button className="mpf-side" onClick={() => seek(Math.min(duration || progress + 10, progress + 10))} title="+10s">+10</button>
            </div>

            <div className="mpf-extra">
              <button className="mpf-extra-btn" onClick={() => { recordSkip(track.id, progress, duration); next() }} disabled={queue.length === 0 && !autoRadio}>
                <SkipForward size={16} /> التالي
              </button>
              <button
                className={`mpf-extra-btn ${autoRadio ? 'active' : ''}`}
                onClick={() => setAutoRadio(!autoRadio)}
                title={autoRadio ? 'إيقاف الإذاعة التلقائية' : 'تشغيل الإذاعة التلقائية'}
              >
                <Radio size={16} /> {autoRadio ? 'الإذاعة مفعّلة' : 'إذاعة تلقائية'}
              </button>
              <button className="mpf-extra-btn" onClick={() => setQueueOpen(o => !o)}>
                <ListMusic size={16} /> القائمة ({queue.length})
              </button>
            </div>
          </div>
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
            ) : queue.map((t, i) => {
              const isCurrent = track?.id === t.id
              // SYNC by design: play() must be invoked in the same task as the
              // click so the user-gesture activation is preserved (mobile Safari
              // autoplay). Remove from queue afterwards so the queue reflects
              // "upcoming tracks" only. See MiniPlayerCtx.play() comment.
              const onPlayClick = () => {
                if (isCurrent) { toggle(); return }
                play({ id: t.id, url: t.url, title: t.title, thumbnail: t.thumbnail, channel: t.channel, duration: t.duration })
                removeFromQueue(t.id)
              }
              return (
                <div
                  key={t.id}
                  className={`mini-queue-item${isCurrent ? ' is-playing' : ''}`}
                  onClick={onPlayClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlayClick() } }}
                  style={{ cursor: 'pointer' }}
                  title={isCurrent ? (playing ? 'إيقاف' : 'تشغيل') : 'تشغيل في المشغّل المصغّر'}
                >
                  <span className="mini-queue-idx">
                    {isCurrent ? (loading ? <Loader2 size={12} className="dzt-spin" /> : playing ? <Pause size={12} /> : <Play size={12} />) : i + 1}
                  </span>
                  <img className="mini-queue-thumb" src={t.thumbnail} alt="" />
                  <div className="mini-queue-info">
                    <span className="mini-queue-title" title={t.title}>{t.title}</span>
                    <span className="mini-queue-channel">{t.channel}</span>
                  </div>
                  <button
                    className="mini-queue-remove"
                    onClick={(e) => { e.stopPropagation(); removeFromQueue(t.id) }}
                    title="حذف"
                  >
                    <X size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

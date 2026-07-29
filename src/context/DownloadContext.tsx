import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { createPortal } from 'react-dom'

// ══════════════════════════════════════════════════════════════════
// 📥 GLOBAL DOWNLOAD CONTEXT — شريط التحميل العالمي
// يظهر في كل الصفحات عبر createPortal على document.body
// ══════════════════════════════════════════════════════════════════

export interface DownloadJob {
  id: string
  filename: string
  ext: string
  platform: string | null
  platformIcon: string
  progress: number    // 0–100
  speed: number       // bytes/sec
  eta: number         // seconds remaining
  loaded: number
  total: number
  status: 'downloading' | 'done' | 'error'
  error?: string
  blobUrl?: string    // kept alive for playback after download
  isVideo?: boolean   // mp4/webm/mov → show play button
}

interface DownloadCtx {
  jobs: DownloadJob[]
  startDownload: (params: {
    cdnUrl: string
    filename: string
    ext: string
    platform: string | null
    size: number | null
  }) => void
  dismiss: (id: string) => void
}

const Ctx = createContext<DownloadCtx | null>(null)

export function useDownload() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDownload outside DownloadProvider')
  return c
}

const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'])
const AUDIO_EXTS = new Set(['mp3', 'm4a', 'aac', 'ogg', 'wav', 'webm', 'flac'])

// ── Platform metadata ─────────────────────────────────────────────
const PLATFORM_META: Record<string, { icon: string; color: string; label: string }> = {
  youtube:     { icon: '📺', color: '#ff0000', label: 'YouTube' },
  facebook:    { icon: '📘', color: '#1877f2', label: 'Facebook' },
  tiktok:      { icon: '🎵', color: '#69c9d0', label: 'TikTok' },
  instagram:   { icon: '📸', color: '#e1306c', label: 'Instagram' },
  twitter:     { icon: '🐦', color: '#1d9bf0', label: 'Twitter/X' },
  pinterest:   { icon: '📌', color: '#e60023', label: 'Pinterest' },
  vimeo:       { icon: '🎬', color: '#1ab7ea', label: 'Vimeo' },
  dailymotion: { icon: '🎥', color: '#0066dc', label: 'Dailymotion' },
}
export const getPlatformMeta = (p: string | null) =>
  PLATFORM_META[p || ''] ?? { icon: '⬇️', color: '#10a37f', label: 'وسائط' }

function fmtBytes(b: number) {
  if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`
  if (b > 1e3) return `${(b / 1e3).toFixed(0)} KB`
  return `${b} B`
}
function fmtEta(s: number) {
  if (s > 3600) return `${Math.floor(s / 3600)}س ${Math.floor((s % 3600) / 60)}د`
  if (s > 60)   return `${Math.floor(s / 60)}د ${Math.floor(s % 60)}ث`
  return `${Math.floor(s)}ث`
}

// ══════════════════════════════════════════════════════════════════
// VideoPlayerModal — modal player shown when user clicks ▶ تشغيل
// ══════════════════════════════════════════════════════════════════
function VideoPlayerModal({ job, onClose }: { job: DownloadJob; onClose: () => void }) {
  const isAudio = AUDIO_EXTS.has(job.ext) && !VIDEO_EXTS.has(job.ext)
  return createPortal(
    <div className="gdl-player-overlay" onClick={onClose}>
      <div className="gdl-player-modal" onClick={e => e.stopPropagation()}>
        <div className="gdl-player-header">
          <span className="gdl-player-title">
            {job.platformIcon} {job.filename.length > 45 ? job.filename.slice(0, 45) + '…' : job.filename}
            <span className="gdl-player-ext">.{job.ext}</span>
          </span>
          <button className="gdl-player-close" onClick={onClose} title="إغلاق">✕</button>
        </div>
        {isAudio ? (
          <audio
            src={job.blobUrl}
            controls
            autoPlay
            className="gdl-player-audio"
          />
        ) : (
          <video
            src={job.blobUrl}
            controls
            autoPlay
            className="gdl-player-video"
            playsInline
          />
        )}
      </div>
    </div>,
    document.body,
  )
}

// ══════════════════════════════════════════════════════════════════
// GlobalDownloadBar — fixed bottom, visible on every page
// ══════════════════════════════════════════════════════════════════
function GlobalDownloadBar({ jobs, dismiss }: { jobs: DownloadJob[]; dismiss: (id: string) => void }) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  if (jobs.length === 0) return null

  const playingJob = playingId ? jobs.find(j => j.id === playingId) : null

  return createPortal(
    <>
      <div className="gdl-container">
        {jobs.map(job => {
          const pm = getPlatformMeta(job.platform)
          const isDone  = job.status === 'done'
          const isErr   = job.status === 'error'
          const prog    = Math.min(100, Math.max(0, job.progress))
          const barColor = isErr ? '#ef4444' : isDone ? '#22c55e' : pm.color
          const canPlay  = isDone && !!job.blobUrl

          return (
            <div key={job.id} className={`gdl-job ${isDone ? 'gdl-job--done' : ''} ${isErr ? 'gdl-job--err' : ''}`}>
              {/* Platform icon + filename */}
              <div className="gdl-info">
                <span className="gdl-icon">{pm.icon}</span>
                <div className="gdl-text">
                  <span className="gdl-filename">
                    {job.filename.length > 38 ? job.filename.slice(0, 38) + '…' : job.filename}
                    <span className="gdl-ext">.{job.ext}</span>
                  </span>
                  <span className="gdl-sub">
                    {isErr
                      ? `⚠️ ${job.error || 'خطأ في التحميل'}`
                      : isDone
                      ? '✅ اكتمل التحميل بنجاح'
                      : <>
                          {job.total > 0 && <>{fmtBytes(job.loaded)} / {fmtBytes(job.total)} &nbsp;·&nbsp;</>}
                          {job.speed > 0 && <>{fmtBytes(job.speed)}/ث &nbsp;·&nbsp;</>}
                          {job.eta > 0 && <>متبقي {fmtEta(job.eta)}</>}
                          {job.total === 0 && job.loaded > 0 && <>{fmtBytes(job.loaded)} مُحمَّل</>}
                        </>
                    }
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="gdl-bar-wrap">
                <div
                  className={`gdl-bar-fill ${job.total === 0 && !isDone && !isErr ? 'gdl-bar-fill--indeterminate' : ''}`}
                  style={{
                    width: job.total === 0 && !isDone ? undefined : `${isDone ? 100 : prog}%`,
                    background: barColor,
                    boxShadow: !isDone && !isErr ? `0 0 8px ${barColor}80` : 'none',
                  }}
                />
              </div>

              {/* Play button + Percent + dismiss */}
              <div className="gdl-right">
                {canPlay && (
                  <button
                    className="gdl-play-btn"
                    onClick={() => setPlayingId(job.id)}
                    title={job.isVideo ? 'تشغيل الفيديو' : 'تشغيل الصوت'}
                  >
                    {job.isVideo ? '▶ فيديو' : '🎵 صوت'}
                  </button>
                )}
                <span className="gdl-pct" style={{ color: barColor }}>
                  {isErr ? '✕' : isDone ? '100%' : job.total > 0 ? `${prog}%` : '…'}
                </span>
                <button className="gdl-dismiss" onClick={() => dismiss(job.id)} title="إغلاق">✕</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Video/Audio Player Modal */}
      {playingJob && playingJob.blobUrl && (
        <VideoPlayerModal job={playingJob} onClose={() => setPlayingId(null)} />
      )}
    </>,
    document.body,
  )
}

// ══════════════════════════════════════════════════════════════════
// DownloadProvider — manages download jobs
// Strategy:
//   1. Try DIRECT browser fetch (works for Vimeo CDN, TikTok CDN, Twitter CDN)
//   2. Fall back to server proxy if CORS/error (Instagram, Facebook, Pinterest)
// ══════════════════════════════════════════════════════════════════
export function DownloadProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<DownloadJob[]>([])
  const counter = useRef(0)
  // Map of jobId → timeout handle for deferred blob revocation
  const blobRevokeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const updateJob = useCallback((id: string, patch: Partial<DownloadJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }, [])

  const dismiss = useCallback((id: string) => {
    // Revoke blob URL when job is dismissed
    setJobs(prev => {
      const job = prev.find(j => j.id === id)
      if (job?.blobUrl) {
        const t = blobRevokeTimers.current.get(id)
        if (t) { clearTimeout(t); blobRevokeTimers.current.delete(id) }
        URL.revokeObjectURL(job.blobUrl)
      }
      return prev.filter(j => j.id !== id)
    })
  }, [])

  const startDownload = useCallback(async ({
    cdnUrl, filename, ext, platform, size,
  }: {
    cdnUrl: string; filename: string; ext: string; platform: string | null; size: number | null
  }) => {
    const id = `dl-${Date.now()}-${++counter.current}`
    const pm = getPlatformMeta(platform)
    const isVideo = VIDEO_EXTS.has(ext.toLowerCase())
    const isMedia = isVideo || AUDIO_EXTS.has(ext.toLowerCase())

    setJobs(prev => [...prev, {
      id, filename, ext, platform, platformIcon: pm.icon,
      progress: 0, speed: 0, eta: 0, loaded: 0, total: size ?? 0,
      status: 'downloading', isVideo,
    }])

    // ── shared streaming logic ──────────────────────────────────
    const streamResponse = async (resp: Response) => {
      const contentLength = resp.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : (size ?? 0)
      updateJob(id, { total })

      if (!resp.body) {
        const blob = await resp.blob()
        finishDownload(blob)
        return
      }

      const reader = resp.body.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0
      let lastLoaded = 0
      let lastTime = Date.now()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.byteLength

        const now = Date.now()
        if (now - lastTime >= 300) {
          const dt = (now - lastTime) / 1000
          const speed = Math.round((loaded - lastLoaded) / dt)
          const progress = total > 0 ? Math.round((loaded / total) * 100) : 0
          const eta = speed > 0 && total > 0 ? Math.round((total - loaded) / speed) : 0
          updateJob(id, { loaded, total, progress, speed, eta })
          lastLoaded = loaded
          lastTime = now
        }
      }

      finishDownload(new Blob(chunks, { type: `${isVideo ? 'video' : 'audio'}/${ext}` }))
    }

    const finishDownload = (blob: Blob) => {
      // Create a stable blob URL for playback (keep alive 5 min)
      const blobUrl = URL.createObjectURL(blob)

      // Trigger file download
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${filename}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      // Update job with blob URL for playback
      updateJob(id, {
        progress: 100,
        loaded: blob.size,
        total: blob.size,
        status: 'done',
        blobUrl: isMedia ? blobUrl : undefined,
      })

      // Auto-dismiss after 5 min (or immediately if not media)
      const dismissDelay = isMedia ? 5 * 60 * 1000 : 8000
      const timer = setTimeout(() => {
        URL.revokeObjectURL(blobUrl)
        blobRevokeTimers.current.delete(id)
        setJobs(prev => prev.filter(j => j.id !== id))
      }, dismissDelay)
      blobRevokeTimers.current.set(id, timer)
    }

    // ── Strategy 1: Direct browser fetch (residential IP, works for most CDNs) ──
    try {
      const resp = await fetch(cdnUrl, { mode: 'cors' })
      if (resp.ok) {
        await streamResponse(resp)
        return
      }
      console.warn('[Download] direct fetch non-OK:', resp.status, '— trying proxy')
    } catch (directErr) {
      console.warn('[Download] direct fetch failed:', directErr, '— trying proxy')
    }

    // ── Strategy 2: Server proxy (bypasses some CDN restrictions) ──
    try {
      const proxyUrl = `/api/dz-agent/download-proxy?url=${encodeURIComponent(cdnUrl)}&filename=${encodeURIComponent(filename)}&ext=${encodeURIComponent(ext)}`
      const resp = await fetch(proxyUrl)
      if (!resp.ok) {
        const text = await resp.text().catch(() => `HTTP ${resp.status}`)
        throw new Error(text.slice(0, 200))
      }
      await streamResponse(resp)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ غير معروف'
      updateJob(id, { status: 'error', error: msg.slice(0, 120) })
    }
  }, [updateJob, setJobs])

  return (
    <Ctx.Provider value={{ jobs, startDownload, dismiss }}>
      {children}
      <GlobalDownloadBar jobs={jobs} dismiss={dismiss} />
    </Ctx.Provider>
  )
}

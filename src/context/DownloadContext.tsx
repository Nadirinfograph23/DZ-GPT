import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { createPortal } from 'react-dom'

// ══════════════════════════════════════════════════════════════════
// 📥 GLOBAL DOWNLOAD CONTEXT — شريط التحميل العالمي
// ══════════════════════════════════════════════════════════════════

export interface DownloadJob {
  id: string
  filename: string
  ext: string
  platform: string | null
  platformIcon: string
  proxyUrl: string
  progress: number    // 0–100
  speed: number       // bytes/sec
  eta: number         // seconds remaining
  loaded: number
  total: number
  status: 'downloading' | 'done' | 'error'
  error?: string
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

// ── Helpers ─────────────────────────────────────────────────────
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
// GlobalDownloadBar — يُعرض داخل Portal على body
// ══════════════════════════════════════════════════════════════════
function GlobalDownloadBar({ jobs, dismiss }: { jobs: DownloadJob[]; dismiss: (id: string) => void }) {
  if (jobs.length === 0) return null
  return createPortal(
    <div className="gdl-container">
      {jobs.map(job => {
        const pm = getPlatformMeta(job.platform)
        const isDone  = job.status === 'done'
        const isErr   = job.status === 'error'
        const prog    = Math.min(100, Math.max(0, job.progress))
        const barColor = isErr ? '#ef4444' : isDone ? '#22c55e' : pm.color

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
                    ? '✅ اكتمل التحميل'
                    : <>
                        {job.total > 0 && <>{fmtBytes(job.loaded)} / {fmtBytes(job.total)} &nbsp;·&nbsp;</>}
                        {job.speed > 0 && <>{fmtBytes(job.speed)}/ث &nbsp;·&nbsp;</>}
                        {job.eta > 0 && <>متبقي {fmtEta(job.eta)}</>}
                      </>
                  }
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="gdl-bar-wrap">
              <div
                className="gdl-bar-fill"
                style={{
                  width: `${isDone ? 100 : prog}%`,
                  background: barColor,
                  boxShadow: !isDone && !isErr ? `0 0 8px ${barColor}80` : 'none',
                }}
              />
            </div>

            {/* Percent + dismiss */}
            <div className="gdl-right">
              <span className="gdl-pct" style={{ color: barColor }}>
                {isErr ? '✕' : isDone ? '100%' : `${prog}%`}
              </span>
              <button className="gdl-dismiss" onClick={() => dismiss(job.id)} title="إغلاق">✕</button>
            </div>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}

// ══════════════════════════════════════════════════════════════════
// DownloadProvider
// ══════════════════════════════════════════════════════════════════
export function DownloadProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<DownloadJob[]>([])
  const counter = useRef(0)

  const updateJob = useCallback((id: string, patch: Partial<DownloadJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }, [])

  const dismiss = useCallback((id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id))
  }, [])

  const startDownload = useCallback(async ({
    cdnUrl, filename, ext, platform, size,
  }: {
    cdnUrl: string; filename: string; ext: string; platform: string | null; size: number | null
  }) => {
    const id = `dl-${Date.now()}-${++counter.current}`
    const pm = getPlatformMeta(platform)
    const job: DownloadJob = {
      id, filename, ext, platform, platformIcon: pm.icon,
      proxyUrl: cdnUrl,
      progress: 0, speed: 0, eta: 0, loaded: 0, total: size ?? 0,
      status: 'downloading',
    }
    setJobs(prev => [...prev, job])

    try {
      const proxyUrl = `/api/dz-agent/download-proxy?url=${encodeURIComponent(cdnUrl)}&filename=${encodeURIComponent(filename)}&ext=${encodeURIComponent(ext)}`
      const resp = await fetch(proxyUrl)
      if (!resp.ok) {
        const text = await resp.text().catch(() => `HTTP ${resp.status}`)
        throw new Error(text.slice(0, 200))
      }

      const contentLength = resp.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : (size ?? 0)

      const reader = resp.body!.getReader()
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
        if (now - lastTime >= 250) {
          const dt = (now - lastTime) / 1000
          const speed = (loaded - lastLoaded) / dt
          const progress = total > 0 ? Math.round((loaded / total) * 100) : 0
          const eta = speed > 0 && total > 0 ? Math.round((total - loaded) / speed) : 0
          updateJob(id, { loaded, total, progress, speed, eta })
          lastLoaded = loaded
          lastTime = now
        }
      }

      // Trigger browser download
      const blob = new Blob(chunks)
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${filename}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 8000)

      updateJob(id, { progress: 100, loaded: total || loaded, status: 'done' })
      setTimeout(() => setJobs(prev => prev.filter(j => j.id !== id)), 5000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ غير معروف'
      updateJob(id, { status: 'error', error: msg })
    }
  }, [updateJob])

  return (
    <Ctx.Provider value={{ jobs, startDownload, dismiss }}>
      {children}
      <GlobalDownloadBar jobs={jobs} dismiss={dismiss} />
    </Ctx.Provider>
  )
}

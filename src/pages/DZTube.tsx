import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Loader2, Search, Music, Video, Eye, Clock, User, History, Trash2, RotateCw, X } from 'lucide-react'
import '../styles/dz-tube.css'

interface HistoryItem {
  id: string
  url: string
  title: string
  thumbnail: string | null
  format: 'mp4' | 'mp3'
  quality: string
  timestamp: number
}

const HISTORY_KEY = 'dz-tube-history'
const HISTORY_MAX = 30

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function saveHistory(items: HistoryItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX))) } catch {}
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'الآن'
  if (diff < 3600) return `قبل ${Math.floor(diff / 60)} د`
  if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} س`
  return `قبل ${Math.floor(diff / 86400)} يوم`
}

interface VideoInfo {
  title: string
  thumbnail: string | null
  duration: number
  uploader: string
  view_count: number
  heights: number[]
  available: { mp4: boolean; mp3: boolean }
}

const QUALITIES = ['360', '720', '1080'] as const
type Quality = typeof QUALITIES[number]
type Format = 'mp4' | 'mp3'

function formatDuration(s: number): string {
  if (!s) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

function formatViews(n: number): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function DZTube() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [format, setFormat] = useState<Format>('mp4')
  const [quality, setQuality] = useState<Quality>('720')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory())
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => { saveHistory(history) }, [history])

  const addHistory = useCallback((item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    setHistory(prev => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const next = [{ ...item, id, timestamp: Date.now() }, ...prev.filter(h => !(h.url === item.url && h.format === item.format && h.quality === item.quality))]
      return next.slice(0, HISTORY_MAX)
    })
  }, [])

  const removeHistory = useCallback((id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id))
  }, [])

  const clearHistory = useCallback(() => {
    if (confirm('هل تريد حذف كل سجل التحميلات؟')) setHistory([])
  }, [])

  const fetchInfo = async () => {
    const u = url.trim()
    if (!u) return
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      const r = await fetch('/api/dz-tube/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'تعذر جلب الفيديو')
      setInfo(d)
      const available = (d.heights as number[]).map(String)
      const preferred: Quality = (['720', '1080', '360'] as Quality[]).find(q => available.includes(q)) || '720'
      setQuality(preferred)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع')
    } finally {
      setLoading(false)
    }
  }

  const startDownload = async () => {
    if (!info || downloading) return
    setDownloading(true)
    setProgress(0)
    setError(null)
    try {
      const params = new URLSearchParams({ url: url.trim(), format, quality })
      const r = await fetch(`/api/dz-tube/download?${params.toString()}`)
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        throw new Error(txt || 'فشل التحميل')
      }
      const total = Number(r.headers.get('content-length') || 0)
      const reader = r.body?.getReader()
      if (!reader) throw new Error('Streaming not supported')
      const chunks: Uint8Array[] = []
      let received = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.length
          if (total > 0) setProgress(Math.round((received / total) * 100))
        }
      }
      const mime = format === 'mp3' ? 'audio/mpeg' : 'video/mp4'
      const blob = new Blob(chunks as BlobPart[], { type: mime })
      const safeTitle = (info.title || 'video').replace(/[^\w\u0600-\u06FF\s.-]/g, '').replace(/\s+/g, '_').slice(0, 80) || 'video'
      const filename = format === 'mp3' ? `${safeTitle}.mp3` : `${safeTitle}_${quality}p.mp4`
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      setProgress(100)
      addHistory({ url: url.trim(), title: info.title, thumbnail: info.thumbnail, format, quality })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل')
    } finally {
      setDownloading(false)
    }
  }

  const availableQualities = info
    ? QUALITIES.filter(q => info.heights.includes(Number(q)))
    : ([...QUALITIES] as Quality[])

  const reDownload = useCallback((item: HistoryItem) => {
    setUrl(item.url)
    setFormat(item.format)
    setQuality(item.quality as Quality)
    setHistoryOpen(false)
    setTimeout(() => fetchInfo(), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="dzt-app">
      <header className="dzt-header">
        <button className="dzt-back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={18} />
          <span>رجوع</span>
        </button>
        <div className="dzt-logo">
          <Video size={22} className="dzt-logo-icon" />
          <span>DZ Tube</span>
        </div>
        <button
          className="dzt-history-btn"
          onClick={() => setHistoryOpen(p => !p)}
          title="سجل التحميلات"
        >
          <History size={16} />
          <span>السجل</span>
          {history.length > 0 && <span className="dzt-history-count">{history.length}</span>}
        </button>
      </header>

      <main className="dzt-main">
        <div className="dzt-intro">
          <h1>تحميل من YouTube داخل التطبيق</h1>
          <p>الصق رابط الفيديو واختر الصيغة والجودة — التحميل يتم مباشرة عبر النظام بدون تحويل لمواقع خارجية.</p>
        </div>

        <div className="dzt-search-row">
          <input
            className="dzt-input"
            type="url"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') fetchInfo() }}
            disabled={loading || downloading}
            dir="ltr"
          />
          <button
            className="dzt-search-btn"
            onClick={fetchInfo}
            disabled={loading || downloading || !url.trim()}
          >
            {loading ? <Loader2 size={16} className="dzt-spin" /> : <Search size={16} />}
            <span>بحث</span>
          </button>
        </div>

        {error && <div className="dzt-error">{error}</div>}

        {info && (
          <div className="dzt-card">
            {info.thumbnail && (
              <img className="dzt-thumb" src={info.thumbnail} alt={info.title} loading="lazy" />
            )}
            <div className="dzt-card-body">
              <h2 className="dzt-title">{info.title}</h2>
              <div className="dzt-meta">
                {info.uploader && <span><User size={12} /> {info.uploader}</span>}
                <span><Clock size={12} /> {formatDuration(info.duration)}</span>
                <span><Eye size={12} /> {formatViews(info.view_count)}</span>
              </div>

              <div className="dzt-options">
                <div className="dzt-option-group">
                  <label className="dzt-option-label">الصيغة</label>
                  <div className="dzt-format-row">
                    <button
                      className={`dzt-chip ${format === 'mp4' ? 'dzt-chip--active' : ''}`}
                      onClick={() => setFormat('mp4')}
                      disabled={downloading}
                    >
                      <Video size={14} /> MP4 (فيديو)
                    </button>
                    <button
                      className={`dzt-chip ${format === 'mp3' ? 'dzt-chip--active' : ''}`}
                      onClick={() => setFormat('mp3')}
                      disabled={downloading}
                    >
                      <Music size={14} /> MP3 (صوت)
                    </button>
                  </div>
                </div>

                {format === 'mp4' && (
                  <div className="dzt-option-group">
                    <label className="dzt-option-label">الجودة</label>
                    <div className="dzt-quality-row">
                      {availableQualities.map(q => (
                        <button
                          key={q}
                          className={`dzt-chip ${quality === q ? 'dzt-chip--active' : ''}`}
                          onClick={() => setQuality(q)}
                          disabled={downloading}
                        >
                          {q}p
                        </button>
                      ))}
                      {availableQualities.length === 0 && (
                        <span className="dzt-hint">لا توجد جودات قياسية متوفرة</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                className="dzt-download-btn"
                onClick={startDownload}
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <Loader2 size={16} className="dzt-spin" />
                    <span>جاري التحميل... {progress > 0 ? `${progress}%` : ''}</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    <span>تحميل {format === 'mp3' ? 'MP3' : `MP4 ${quality}p`}</span>
                  </>
                )}
              </button>

              {downloading && progress > 0 && (
                <div className="dzt-progress">
                  <div className="dzt-progress-bar" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {historyOpen && (
        <>
          <div className="dzt-history-overlay" onClick={() => setHistoryOpen(false)} />
          <aside className="dzt-history-panel">
            <div className="dzt-history-header">
              <span className="dzt-history-title">
                <History size={16} /> سجل التحميلات
              </span>
              <div className="dzt-history-actions">
                {history.length > 0 && (
                  <button className="dzt-history-clear" onClick={clearHistory} title="حذف الكل">
                    <Trash2 size={14} />
                  </button>
                )}
                <button className="dzt-history-close" onClick={() => setHistoryOpen(false)}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="dzt-history-body">
              {history.length === 0 ? (
                <div className="dzt-history-empty">
                  <History size={28} />
                  <p>لا توجد تحميلات بعد</p>
                </div>
              ) : (
                history.map(h => (
                  <div key={h.id} className="dzt-history-item">
                    {h.thumbnail && (
                      <img className="dzt-history-thumb" src={h.thumbnail} alt={h.title} loading="lazy" />
                    )}
                    <div className="dzt-history-info">
                      <span className="dzt-history-item-title" title={h.title}>{h.title}</span>
                      <span className="dzt-history-meta">
                        {h.format === 'mp3' ? 'MP3' : `MP4 ${h.quality}p`} · {timeAgo(h.timestamp)}
                      </span>
                    </div>
                    <div className="dzt-history-item-actions">
                      <button
                        className="dzt-history-redo"
                        onClick={() => reDownload(h)}
                        title="إعادة التحميل"
                      >
                        <RotateCw size={13} />
                      </button>
                      <button
                        className="dzt-history-remove"
                        onClick={() => removeHistory(h.id)}
                        title="حذف"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

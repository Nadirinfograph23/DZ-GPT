import { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Loader2, Search, Music, Video, Eye, Clock, History, Trash2, RotateCw, X, Play, Headphones, ChevronDown, Plus } from 'lucide-react'
import { useMiniPlayer } from '../context/MiniPlayerContext'
import '../styles/dz-tube.css'

interface SearchResult {
  id: string
  title: string
  url: string
  thumbnail: string
  duration: number
  channel: string
  views: number
}

interface HistoryItem {
  id: string
  url: string
  title: string
  thumbnail: string | null
  format: 'mp4' | 'mp3'
  quality: string
  timestamp: number
}

type Quality = '360' | '720' | '1080'
const QUALITIES: Quality[] = ['1080', '720', '360']
const HISTORY_KEY = 'dz-tube-history'
const HISTORY_MAX = 30

function loadHistory(): HistoryItem[] {
  try { const r = localStorage.getItem(HISTORY_KEY); return r ? (JSON.parse(r) || []) : [] } catch { return [] }
}
function saveHistory(items: HistoryItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX))) } catch {}
}
function timeAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 1000)
  if (d < 60) return 'الآن'
  if (d < 3600) return `قبل ${Math.floor(d / 60)} د`
  if (d < 86400) return `قبل ${Math.floor(d / 3600)} س`
  return `قبل ${Math.floor(d / 86400)} يوم`
}
function fmtDuration(s: number): string {
  if (!s) return ''
  const m = Math.floor(s / 60), ss = Math.floor(s % 60)
  if (m >= 60) { const h = Math.floor(m / 60); return `${h}:${(m % 60).toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}` }
  return `${m}:${ss.toString().padStart(2, '0')}`
}
function fmtViews(n: number): string {
  if (!n) return ''
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}
function isYouTubeUrl(u: string): boolean {
  try { const x = new URL(u); return /youtube\.com|youtu\.be/i.test(x.hostname) } catch { return false }
}

export default function DZTube() {
  const navigate = useNavigate()
  const player = useMiniPlayer()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [embedId, setEmbedId] = useState<string | null>(null)
  const [downloadMenuFor, setDownloadMenuFor] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory())
  const [historyOpen, setHistoryOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { saveHistory(history) }, [history])
  useEffect(() => { inputRef.current?.focus() }, [])

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setError(null)
    setSearching(true)
    setResults([])
    setEmbedId(null)
    try {
      // If user pasted a URL, fetch info & open embed directly
      if (isYouTubeUrl(trimmed)) {
        const r = await fetch('/api/dz-tube/info', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'فشل')
        const m = trimmed.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/)
        const id = m?.[1] || ''
        setResults([{ id, title: d.title, url: trimmed, thumbnail: d.thumbnail, duration: d.duration, channel: d.uploader, views: d.view_count }])
        if (id) setEmbedId(id)
      } else {
        const r = await fetch(`/api/dz-tube/search?q=${encodeURIComponent(trimmed)}&limit=15`)
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'فشل البحث')
        setResults(d.results || [])
      }
      setTimeout(() => resultsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل البحث')
    } finally {
      setSearching(false)
    }
  }, [])

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); search(query) }
  }

  const playInBackground = useCallback(async (r: SearchResult) => {
    setEmbedId(null)
    await player.play({ id: r.id, url: r.url, title: r.title, thumbnail: r.thumbnail, channel: r.channel })
  }, [player])

  const playInFrame = useCallback((r: SearchResult) => {
    player.stop()
    setEmbedId(r.id)
    setTimeout(() => document.querySelector('.dzt-embed')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }, [player])

  const startDownload = useCallback(async (r: SearchResult, format: 'mp4' | 'mp3', quality: Quality) => {
    setDownloadMenuFor(null)
    setDownloadingId(r.id)
    setError(null)
    try {
      const params = new URLSearchParams({ url: r.url, format, quality })
      const resp = await fetch(`/api/dz-tube/download?${params}`)
      if (!resp.ok) throw new Error(await resp.text() || 'فشل التحميل')
      const blob = await resp.blob()
      const ext = format === 'mp3' ? 'mp3' : 'mp4'
      const safeTitle = r.title.replace(/[^\w\u0600-\u06FF\s.-]/g, '').slice(0, 80).trim() || 'video'
      const filename = format === 'mp3' ? `${safeTitle}.mp3` : `${safeTitle}_${quality}p.${ext}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setHistory(prev => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        return [{ id, url: r.url, title: r.title, thumbnail: r.thumbnail, format, quality, timestamp: Date.now() }, ...prev.filter(h => !(h.url === r.url && h.format === format && h.quality === quality))].slice(0, HISTORY_MAX)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل')
    } finally {
      setDownloadingId(null)
    }
  }, [])

  const removeHistory = (id: string) => setHistory(prev => prev.filter(h => h.id !== id))
  const clearHistory = () => { if (confirm('حذف كل السجل؟')) setHistory([]) }

  return (
    <div className="dzt-app">
      <header className="dzt-header">
        <button className="dzt-back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={18} /><span>رجوع</span>
        </button>
        <div className="dzt-logo">
          <Video size={22} className="dzt-logo-icon" />
          <span>DZ Tube</span>
        </div>
        <button className="dzt-history-btn" onClick={() => setHistoryOpen(p => !p)} title="السجل">
          <History size={16} /><span>السجل</span>
          {history.length > 0 && <span className="dzt-history-count">{history.length}</span>}
        </button>
      </header>

      <main className="dzt-chat">
        {results.length === 0 && !searching && !error && (
          <div className="dzt-welcome">
            <Video size={48} className="dzt-welcome-icon" />
            <h1>DZ Tube</h1>
            <p>ابحث عن أي فيديو على YouTube، شاهده داخل التطبيق، أو حمّله بصيغة فيديو أو صوت</p>
            <div className="dzt-suggestions">
              {[
                'القرآن الكريم سعود الشريم',
                'القرآن الكريم المشاري',
                'الشروق نيوز بث مباشر',
                'النهار TV بث مباشر',
                'الجزائرية One بث مباشر',
                'الجزيرة مباشر',
                'العربية بث مباشر',
                'بي إن سبورت مباشر',
                'دروس تعليمية',
                'الجزائر سياحة',
              ].map(s => (
                <button key={s} className="dzt-suggestion" onClick={() => { setQuery(s); search(s) }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {error && <div className="dzt-alert">{error}</div>}

        {embedId && (
          <div className="dzt-embed">
            <div className="dzt-embed-frame">
              <iframe
                src={`https://www.youtube.com/embed/${embedId}?autoplay=1&rel=0`}
                title="YouTube player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
              />
            </div>
            <button className="dzt-embed-close" onClick={() => setEmbedId(null)}>
              <X size={14} /> إغلاق المشغل
            </button>
          </div>
        )}

        {searching && (
          <div className="dzt-searching"><Loader2 className="dzt-spin" size={18} /> جارٍ البحث...</div>
        )}

        {results.length > 0 && (
          <div className="dzt-results">
            {results.map(r => (
              <div key={r.id} className="dzt-card">
                <div className="dzt-card-thumb-wrap" onClick={() => playInFrame(r)}>
                  <img className="dzt-card-thumb" src={r.thumbnail} alt={r.title} loading="lazy" />
                  {r.duration > 0 && <span className="dzt-card-duration"><Clock size={10} /> {fmtDuration(r.duration)}</span>}
                  <div className="dzt-card-play-overlay"><Play size={28} fill="#fff" /></div>
                </div>
                <div className="dzt-card-body">
                  <h3 className="dzt-card-title" title={r.title}>{r.title}</h3>
                  <div className="dzt-card-meta">
                    {r.channel && <span>{r.channel}</span>}
                    {r.views > 0 && <span><Eye size={11} /> {fmtViews(r.views)}</span>}
                  </div>
                  <div className="dzt-card-actions">
                    <button className="dzt-act dzt-act-play" onClick={() => playInFrame(r)}>
                      <Play size={13} /> تشغيل
                    </button>
                    <button className="dzt-act dzt-act-bg" onClick={() => playInBackground(r)} title="تشغيل في الخلفية (صوت فقط)">
                      <Headphones size={13} /> خلفية
                    </button>
                    <button
                      className="dzt-act dzt-act-q"
                      onClick={() => player.enqueue({ id: r.id, url: r.url, title: r.title, thumbnail: r.thumbnail, channel: r.channel })}
                      title="إضافة لقائمة التشغيل"
                    >
                      <Plus size={13} /> للقائمة
                    </button>
                    <div className="dzt-act-dl-wrap">
                      <button
                        className="dzt-act dzt-act-dl"
                        onClick={() => setDownloadMenuFor(downloadMenuFor === r.id ? null : r.id)}
                        disabled={downloadingId === r.id}
                      >
                        {downloadingId === r.id
                          ? <><Loader2 size={13} className="dzt-spin" /> جارٍ التحميل</>
                          : <><Download size={13} /> تحميل <ChevronDown size={11} /></>
                        }
                      </button>
                      {downloadMenuFor === r.id && (
                        <div className="dzt-dl-menu">
                          <div className="dzt-dl-section-title">الفيديو</div>
                          {QUALITIES.map(q => (
                            <button key={q} className="dzt-dl-option" onClick={() => startDownload(r, 'mp4', q)}>
                              <Video size={12} /> MP4 {q}p
                            </button>
                          ))}
                          <div className="dzt-dl-section-title">الصوت</div>
                          <button className="dzt-dl-option" onClick={() => startDownload(r, 'mp3', '720')}>
                            <Music size={12} /> MP3
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={resultsEndRef} />
          </div>
        )}
      </main>

      <div className="dzt-input-bar">
        <div className="dzt-input-wrap">
          <Search size={16} className="dzt-input-icon" />
          <input
            ref={inputRef}
            className="dzt-input"
            placeholder="ابحث عن فيديو على YouTube أو الصق رابطاً..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            disabled={searching}
          />
          <button className="dzt-send" onClick={() => search(query)} disabled={searching || !query.trim()}>
            {searching ? <Loader2 size={16} className="dzt-spin" /> : <Search size={16} />}
            <span>بحث</span>
          </button>
        </div>
      </div>

      {historyOpen && (
        <>
          <div className="dzt-history-overlay" onClick={() => setHistoryOpen(false)} />
          <aside className="dzt-history-panel">
            <div className="dzt-history-header">
              <span className="dzt-history-title"><History size={16} /> سجل التحميلات</span>
              <div className="dzt-history-actions">
                {history.length > 0 && (
                  <button className="dzt-history-clear" onClick={clearHistory}><Trash2 size={14} /></button>
                )}
                <button className="dzt-history-close" onClick={() => setHistoryOpen(false)}><X size={16} /></button>
              </div>
            </div>
            <div className="dzt-history-body">
              {history.length === 0 ? (
                <div className="dzt-history-empty"><History size={28} /><p>لا توجد تحميلات بعد</p></div>
              ) : history.map(h => (
                <div key={h.id} className="dzt-history-item">
                  {h.thumbnail && <img className="dzt-history-thumb" src={h.thumbnail} alt={h.title} loading="lazy" />}
                  <div className="dzt-history-info">
                    <span className="dzt-history-item-title" title={h.title}>{h.title}</span>
                    <span className="dzt-history-meta">{h.format === 'mp3' ? 'MP3' : `MP4 ${h.quality}p`} · {timeAgo(h.timestamp)}</span>
                  </div>
                  <div className="dzt-history-item-actions">
                    <button className="dzt-history-redo" onClick={() => { setQuery(h.url); setHistoryOpen(false); search(h.url) }} title="فتح مجدداً">
                      <RotateCw size={13} />
                    </button>
                    <button className="dzt-history-remove" onClick={() => removeHistory(h.id)}><X size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback, useRef, KeyboardEvent, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, Loader2, Search, Music, Video, Eye, Clock, History, Trash2,
  RotateCw, X, Play, Headphones, ChevronDown, Plus, Sparkles, Radio, BookOpen,
  GraduationCap, Trophy, Newspaper, Film, TrendingUp,
} from 'lucide-react'
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

interface Category {
  key: string
  label: string
  query: string
  icon: typeof Sparkles
}

const CATEGORIES: Category[] = [
  { key: 'trending',  label: 'الأكثر رواجاً',  query: 'trending Algeria',                icon: TrendingUp },
  { key: 'quran',     label: 'القرآن الكريم',  query: 'القرآن الكريم سعود الشريم',       icon: BookOpen },
  { key: 'news',      label: 'أخبار مباشر',    query: 'الشروق نيوز بث مباشر',           icon: Newspaper },
  { key: 'live',      label: 'قنوات حية',      query: 'قنوات جزائرية بث مباشر',         icon: Radio },
  { key: 'sports',    label: 'رياضة',          query: 'بي إن سبورت مباشر',              icon: Trophy },
  { key: 'edu',       label: 'تعليم',          query: 'دروس تعليمية الجزائر',           icon: GraduationCap },
  { key: 'music',     label: 'موسيقى',         query: 'lofi music',                      icon: Music },
  { key: 'movies',    label: 'أفلام',          query: 'أفلام جزائرية',                  icon: Film },
]

const QUICK_SUGGESTIONS = [
  'القرآن الكريم سعود الشريم',
  'القرآن الكريم المشاري',
  'الشروق نيوز بث مباشر',
  'النهار TV بث مباشر',
  'الجزائرية One بث مباشر',
  'الجزيرة مباشر',
  'العربية بث مباشر',
  'بي إن سبورت مباشر',
]

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
  const [embedTitle, setEmbedTitle] = useState<string>('')
  const [downloadMenuFor, setDownloadMenuFor] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }, [])
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsTopRef = useRef<HTMLDivElement>(null)

  useEffect(() => { saveHistory(history) }, [history])
  useEffect(() => { inputRef.current?.focus() }, [])

  const search = useCallback(async (q: string, categoryKey: string | null = null) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setError(null)
    setSearching(true)
    setResults([])
    setEmbedId(null)
    setActiveCategory(categoryKey)
    try {
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
        if (id) { setEmbedId(id); setEmbedTitle(d.title || '') }
      } else {
        const r = await fetch(`/api/dz-tube/search?q=${encodeURIComponent(trimmed)}&limit=18`)
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'فشل البحث')
        setResults(d.results || [])
      }
      setTimeout(() => resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
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
    showToast(`جاري تحميل: ${r.title.slice(0, 50)}…`)
    try {
      await player.play({ id: r.id, url: r.url, title: r.title, thumbnail: r.thumbnail, channel: r.channel })
      showToast('▶ يتم التشغيل في الخلفية')
    } catch {
      showToast('تعذر تشغيل الصوت', 'err')
    }
  }, [player, showToast])

  const playInFrame = useCallback((r: SearchResult) => {
    player.stop()
    setEmbedId(r.id)
    setEmbedTitle(r.title)
    setTimeout(() => document.querySelector('.dzt-embed')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }, [player])

  const startDownload = useCallback(async (r: SearchResult, format: 'mp4' | 'mp3', quality: Quality) => {
    setDownloadMenuFor(null)
    setDownloadingId(r.id)
    setError(null)
    try {
      const params = new URLSearchParams({ url: r.url, format, quality })
      showToast(`⏳ جاري تحضير ${format === 'mp3' ? 'الصوت' : 'الفيديو'}…`)
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
      showToast('✅ تم التحميل بنجاح')
      setHistory(prev => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        return [{ id, url: r.url, title: r.title, thumbnail: r.thumbnail, format, quality, timestamp: Date.now() }, ...prev.filter(h => !(h.url === r.url && h.format === format && h.quality === quality))].slice(0, HISTORY_MAX)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل')
      showToast('فشل التحميل', 'err')
    } finally {
      setDownloadingId(null)
    }
  }, [showToast])

  const removeHistory = (id: string) => setHistory(prev => prev.filter(h => h.id !== id))
  const clearHistory = () => { if (confirm('حذف كل السجل؟')) setHistory([]) }

  const showWelcome = useMemo(() => results.length === 0 && !searching && !error && !embedId, [results, searching, error, embedId])

  return (
    <div className="dzt-app">
      <header className="dzt-header">
        <button className="dzt-back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={18} /><span>رجوع</span>
        </button>
        <div className="dzt-logo">
          <div className="dzt-logo-badge"><Video size={18} /></div>
          <div className="dzt-logo-text">
            <span className="dzt-logo-title">DZ Tube</span>
            <span className="dzt-logo-sub">شاهد · حمّل · استمع</span>
          </div>
        </div>
        <button className="dzt-history-btn" onClick={() => setHistoryOpen(p => !p)} title="السجل">
          <History size={16} /><span className="dzt-history-label">السجل</span>
          {history.length > 0 && <span className="dzt-history-count">{history.length}</span>}
        </button>
      </header>

      <div className="dzt-search-bar">
        <div className="dzt-search-wrap">
          <Search size={18} className="dzt-search-icon" />
          <input
            ref={inputRef}
            className="dzt-search-input"
            placeholder="ابحث على YouTube أو الصق رابط الفيديو..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            disabled={searching}
          />
          {query && !searching && (
            <button className="dzt-search-clear" onClick={() => { setQuery(''); inputRef.current?.focus() }}>
              <X size={14} />
            </button>
          )}
          <button className="dzt-search-btn" onClick={() => search(query)} disabled={searching || !query.trim()}>
            {searching ? <Loader2 size={16} className="dzt-spin" /> : <Sparkles size={16} />}
            <span>بحث</span>
          </button>
        </div>
      </div>

      <nav className="dzt-categories" aria-label="فئات">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon
          const active = activeCategory === cat.key
          return (
            <button
              key={cat.key}
              className={`dzt-cat${active ? ' dzt-cat-active' : ''}`}
              onClick={() => { setQuery(cat.query); search(cat.query, cat.key) }}
              disabled={searching}
            >
              <Icon size={14} />
              <span>{cat.label}</span>
            </button>
          )
        })}
      </nav>

      <main className="dzt-main">
        {showWelcome && (
          <div className="dzt-welcome">
            <div className="dzt-welcome-hero">
              <div className="dzt-welcome-glow" />
              <Video size={56} className="dzt-welcome-icon" />
              <h1 className="dzt-welcome-title">DZ <span>Tube</span></h1>
              <p className="dzt-welcome-credit">تطوير نذير حوامرية</p>
              <p className="dzt-welcome-sub">
                ابحث عن أي فيديو على YouTube، شاهده داخل التطبيق، أو حمّله بصيغة فيديو أو صوت بأعلى جودة
              </p>
            </div>
            <div className="dzt-quick-grid">
              <h3 className="dzt-quick-title"><Sparkles size={14} /> اقتراحات سريعة</h3>
              <div className="dzt-suggestions">
                {QUICK_SUGGESTIONS.map(s => (
                  <button key={s} className="dzt-suggestion" onClick={() => { setQuery(s); search(s) }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="dzt-alert">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X size={14} /></button>
          </div>
        )}

        {embedId && (
          <div className="dzt-embed">
            <div className="dzt-embed-header">
              <div className="dzt-now-playing">
                <span className="dzt-live-dot" /> قيد التشغيل
              </div>
              <button className="dzt-embed-close" onClick={() => setEmbedId(null)}>
                <X size={14} /> إغلاق
              </button>
            </div>
            <div className="dzt-embed-frame">
              <iframe
                src={`https://www.youtube.com/embed/${embedId}?autoplay=1&rel=0&modestbranding=1`}
                title={embedTitle || 'YouTube player'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
              />
            </div>
            {embedTitle && <div className="dzt-embed-title">{embedTitle}</div>}
          </div>
        )}

        {searching && (
          <div className="dzt-skeleton-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="dzt-skeleton-card">
                <div className="dzt-skeleton-thumb" />
                <div className="dzt-skeleton-line dzt-skeleton-line-lg" />
                <div className="dzt-skeleton-line dzt-skeleton-line-sm" />
              </div>
            ))}
          </div>
        )}

        <div ref={resultsTopRef} />

        {results.length > 0 && (
          <>
            <div className="dzt-results-header">
              <h2><Video size={16} /> النتائج <span className="dzt-results-count">{results.length}</span></h2>
            </div>
            <div className="dzt-results-grid">
              {results.map(r => (
                <article key={r.id} className="dzt-card">
                  <div className="dzt-card-thumb-wrap" onClick={() => playInFrame(r)}>
                    <img className="dzt-card-thumb" src={r.thumbnail} alt={r.title} loading="lazy" />
                    {r.duration > 0 && (
                      <span className="dzt-card-duration">
                        <Clock size={10} /> {fmtDuration(r.duration)}
                      </span>
                    )}
                    <div className="dzt-card-play-overlay">
                      <div className="dzt-play-circle"><Play size={26} fill="#fff" /></div>
                    </div>
                  </div>
                  <div className="dzt-card-body">
                    <h3 className="dzt-card-title" title={r.title}>{r.title}</h3>
                    <div className="dzt-card-meta">
                      {r.channel && <span className="dzt-card-channel">{r.channel}</span>}
                      {r.views > 0 && (
                        <span className="dzt-card-views"><Eye size={11} /> {fmtViews(r.views)}</span>
                      )}
                    </div>
                    <div className="dzt-card-actions">
                      <button className="dzt-act dzt-act-play" onClick={() => playInFrame(r)} title="تشغيل داخل الإطار">
                        <Play size={13} fill="currentColor" /> تشغيل
                      </button>
                      <button className="dzt-act dzt-act-bg" onClick={() => playInBackground(r)} title="استمع في الخلفية">
                        <Headphones size={13} />
                      </button>
                      <button
                        className="dzt-act dzt-act-q"
                        onClick={() => {
                          player.enqueue({ id: r.id, url: r.url, title: r.title, thumbnail: r.thumbnail, channel: r.channel })
                          showToast('➕ أُضيف إلى قائمة التشغيل')
                        }}
                        title="إضافة للقائمة"
                      >
                        <Plus size={13} />
                      </button>
                      <div className="dzt-act-dl-wrap">
                        <button
                          className="dzt-act dzt-act-dl"
                          onClick={() => setDownloadMenuFor(downloadMenuFor === r.id ? null : r.id)}
                          disabled={downloadingId === r.id}
                          title="تحميل"
                        >
                          {downloadingId === r.id
                            ? <Loader2 size={13} className="dzt-spin" />
                            : <><Download size={13} /> <ChevronDown size={11} /></>
                          }
                        </button>
                        {downloadMenuFor === r.id && (
                          <>
                            <div className="dzt-dl-overlay" onClick={() => setDownloadMenuFor(null)} />
                            <div className="dzt-dl-menu">
                              <div className="dzt-dl-section-title"><Video size={11} /> فيديو</div>
                              {QUALITIES.map(q => (
                                <button key={q} className="dzt-dl-option" onClick={() => startDownload(r, 'mp4', q)}>
                                  <span>MP4</span>
                                  <span className="dzt-dl-quality">{q}p</span>
                                </button>
                              ))}
                              <div className="dzt-dl-section-title"><Music size={11} /> صوت</div>
                              <button className="dzt-dl-option" onClick={() => startDownload(r, 'mp3', '720')}>
                                <span>MP3</span>
                                <span className="dzt-dl-quality">عالي</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>

      {toast && (
        <div className={`dzt-toast dzt-toast-${toast.kind}`} role="status">
          {toast.msg}
        </div>
      )}

      {historyOpen && (
        <>
          <div className="dzt-history-overlay" onClick={() => setHistoryOpen(false)} />
          <aside className="dzt-history-panel">
            <div className="dzt-history-header">
              <span className="dzt-history-title"><History size={16} /> سجل التحميلات</span>
              <div className="dzt-history-actions">
                {history.length > 0 && (
                  <button className="dzt-history-clear" onClick={clearHistory} title="مسح الكل"><Trash2 size={14} /></button>
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

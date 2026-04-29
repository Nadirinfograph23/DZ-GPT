import { useState, useEffect, useCallback, useRef, KeyboardEvent, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, Loader2, Search, Music, Video, Eye, Clock, History, Trash2,
  RotateCw, X, Play, Headphones, ChevronDown, Plus, Sparkles, Radio, BookOpen,
  GraduationCap, Trophy, Newspaper, Film, TrendingUp, CheckSquare, Square, ListChecks,
  SkipForward, Heart,
} from 'lucide-react'
import { useMiniPlayer } from '../context/MiniPlayerContext'
import { warmTrackUrl } from '../utils/playerEnhancements'
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
  format: 'mp4' | 'mp3' | 'audio'
  quality: string
  timestamp: number
}

type Quality = string
const HISTORY_KEY = 'dz-tube-history'
const HISTORY_MAX = 30
const FAVORITES_KEY = 'dz-tube-favorites'
const FAVORITES_MAX = 100

interface FavoriteItem {
  id: string
  url: string
  title: string
  thumbnail: string
  channel: string
  duration: number
  addedAt: number
}
function loadFavorites(): FavoriteItem[] {
  try { const r = localStorage.getItem(FAVORITES_KEY); return r ? (JSON.parse(r) || []) : [] } catch { return [] }
}
function saveFavorites(items: FavoriteItem[]) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(items.slice(0, FAVORITES_MAX))) } catch {}
}

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
  'تعلم اللغة الإنجليزية للمبتدئين',
  'English conversation practice for beginners',
  'BBC Learning English',
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
  const [qualityCache, setQualityCache] = useState<Record<string, { qualities: Quality[]; loading: boolean; err: boolean }>>({})
  // Active (in-flight) downloads keyed by `${videoId}-${format}-${quality}`.
  // We render a progress bar + percent for each one in the history panel
  // and a small percent badge on the result card while it's downloading.
  interface ActiveDl {
    key: string
    videoId: string
    title: string
    thumbnail: string | null
    format: 'mp4' | 'mp3' | 'audio'
    quality: Quality
    loaded: number
    total: number
    status: 'downloading' | 'failed'
    xhr?: XMLHttpRequest
  }
  const [activeDownloads, setActiveDownloads] = useState<Record<string, ActiveDl>>({})
  // Batch (multi-select) download state. The user toggles "select mode" from
  // the header, ticks one or more cards, then triggers a single batch
  // download. Items are queued sequentially through `startDownload` so we
  // never hammer the server with N parallel requests.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [batchPending, setBatchPending] = useState<number>(0)
  const [batchTotal, setBatchTotal] = useState<number>(0)
  const batchAbortRef = useRef<boolean>(false)
  const activeForCardPct = useCallback((videoId: string): number | null => {
    const list = Object.values(activeDownloads).filter(d => d.videoId === videoId && d.status === 'downloading')
    if (list.length === 0) return null
    const d = list[0]
    if (d.total <= 0) return null
    return Math.min(99, Math.floor((d.loaded / d.total) * 100))
  }, [activeDownloads])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => loadFavorites())
  const favoriteIds = useMemo(() => new Set(favorites.map(f => f.id)), [favorites])
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
  useEffect(() => { saveFavorites(favorites) }, [favorites])
  useEffect(() => { inputRef.current?.focus() }, [])

  const toggleFavorite = useCallback((r: Pick<SearchResult, 'id' | 'url' | 'title' | 'thumbnail' | 'channel' | 'duration'>) => {
    setFavorites(prev => {
      if (prev.some(f => f.id === r.id)) {
        showToast('💔 أُزيل من المفضلة')
        return prev.filter(f => f.id !== r.id)
      }
      showToast('❤️ أُضيف للمفضلة')
      return [{
        id: r.id, url: r.url, title: r.title, thumbnail: r.thumbnail,
        channel: r.channel, duration: r.duration, addedAt: Date.now(),
      }, ...prev].slice(0, FAVORITES_MAX)
    })
  }, [showToast])

  const playFavorite = useCallback((f: FavoriteItem) => {
    void player.play({ id: f.id, url: f.url, title: f.title, thumbnail: f.thumbnail, channel: f.channel, duration: f.duration })
    showToast('▶️ يُشغَّل الآن')
  }, [player, showToast])

  // Lock background scroll while the download modal is open and close on Esc
  useEffect(() => {
    if (!downloadMenuFor) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setDownloadMenuFor(null) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [downloadMenuFor])

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

  const fetchQualities = useCallback(async (r: SearchResult) => {
    if (qualityCache[r.id]?.qualities || qualityCache[r.id]?.loading) return
    setQualityCache(prev => ({ ...prev, [r.id]: { qualities: [], loading: true, err: false } }))
    try {
      const resp = await fetch('/api/dz-tube/info', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: r.url }),
      })
      const d = await resp.json()
      if (!resp.ok) throw new Error(d.error || 'فشل')
      const qualities: Quality[] = (d.downloadableHeights || []).map((h: number) => String(h))
      setQualityCache(prev => ({ ...prev, [r.id]: { qualities, loading: false, err: false } }))
    } catch {
      setQualityCache(prev => ({ ...prev, [r.id]: { qualities: ['360'], loading: false, err: true } }))
    }
  }, [qualityCache])

  // SYNC by design: must call player.play() in the same task as the user's
  // click so HTMLMediaElement.play() inherits the gesture activation. Any
  // `await` between click and play() triggers NotAllowedError on Safari/iOS
  // and increasingly on Chrome too. See MiniPlayerCtx.play comment.
  const playInBackground = useCallback((r: SearchResult) => {
    if (!r.id || !r.url) {
      showToast('بيانات الفيديو غير مكتملة', 'err')
      return
    }
    setEmbedId(null)
    showToast(`جاري تحميل: ${r.title.slice(0, 50)}…`)
    player.play({
      id: r.id,
      url: r.url,
      title: r.title,
      thumbnail: r.thumbnail,
      channel: r.channel,
      duration: r.duration,
    })
  }, [player, showToast])

  const playInFrame = useCallback((r: SearchResult) => {
    player.stop()
    setEmbedId(r.id)
    setEmbedTitle(r.title)
    setTimeout(() => document.querySelector('.dzt-embed')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }, [player])

  // Best-effort OS notification when a download finishes. Silently no-ops
  // if the browser doesn't support Notifications or the user denied them.
  const notifyDone = useCallback((title: string, body: string, icon?: string | null) => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) return
      const fire = () => {
        try { new Notification(title, { body, icon: icon || undefined, tag: 'dz-tube-download' }) } catch {}
      }
      if (Notification.permission === 'granted') fire()
      else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => { if (p === 'granted') fire() }).catch(() => {})
      }
    } catch {}
  }, [])

  // Returns a Promise that resolves to `true` on success and `false` on
  // failure / cancel. The Promise version is what makes the batch queue
  // possible (it awaits each download before starting the next one).
  // `opts.silent` skips the per-item start toast and history-panel auto-open
  // so a batch run doesn't spam the user with N "بدأ التحميل" toasts.
  const startDownload = useCallback((r: SearchResult, format: 'mp4' | 'mp3' | 'audio', quality: Quality, opts?: { silent?: boolean }): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setDownloadMenuFor(null)
      setDownloadingId(r.id)
      setError(null)
      const dlKey = `${r.id}-${format}-${quality}`
      const isAudioReq = format === 'mp3' || format === 'audio'

      if (!opts?.silent) {
        // Open the history panel automatically so the user can watch the
        // percentage advance — and show a clear "started" toast.
        setHistoryOpen(true)
        showToast('⬇️ بدأ التحميل الآن')
      }

      const params = new URLSearchParams({ url: r.url, format, quality })
      const xhr = new XMLHttpRequest()
      xhr.open('GET', `/api/dz-tube/download?${params}`)
      xhr.responseType = 'blob'

      setActiveDownloads(prev => ({
        ...prev,
        [dlKey]: { key: dlKey, videoId: r.id, title: r.title, thumbnail: r.thumbnail, format, quality, loaded: 0, total: 0, status: 'downloading', xhr },
      }))
      xhr.onprogress = (e) => {
        setActiveDownloads(prev => {
          const cur = prev[dlKey]; if (!cur) return prev
          return { ...prev, [dlKey]: { ...cur, loaded: e.loaded, total: e.lengthComputable ? e.total : 0 } }
        })
      }
      xhr.onabort = () => {
        // User clicked the X on the active item — drop it from state and
        // resolve with false so any awaiting batch loop moves on.
        setActiveDownloads(prev => { const n = { ...prev }; delete n[dlKey]; return n })
        setDownloadingId(null)
        resolve(false)
      }
      xhr.onerror = () => {
        setActiveDownloads(prev => prev[dlKey] ? { ...prev, [dlKey]: { ...prev[dlKey], status: 'failed' } } : prev)
        setTimeout(() => setActiveDownloads(prev => { const n = { ...prev }; delete n[dlKey]; return n }), 4000)
        setError('فشل التحميل')
        if (!opts?.silent) showToast('فشل التحميل', 'err')
        setDownloadingId(null)
        resolve(false)
      }
      xhr.onload = () => {
        try {
          if (xhr.status < 200 || xhr.status >= 300) {
            setActiveDownloads(prev => prev[dlKey] ? { ...prev, [dlKey]: { ...prev[dlKey], status: 'failed' } } : prev)
            setTimeout(() => setActiveDownloads(prev => { const n = { ...prev }; delete n[dlKey]; return n }), 4000)
            throw new Error(`HTTP ${xhr.status}`)
          }
          const blob = xhr.response as Blob
          // Server may downgrade mp3 → m4a if ffmpeg isn't available; respect the
          // returned Content-Disposition / Content-Type so the file extension matches.
          const cd = xhr.getResponseHeader('content-disposition') || ''
          const ct = (xhr.getResponseHeader('content-type') || '').toLowerCase()
          const cdMatch = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
          const safeTitle = r.title.replace(/[^\w\u0600-\u06FF\s.-]/g, '').slice(0, 80).trim() || 'video'
          let serverName = ''
          try { serverName = cdMatch ? decodeURIComponent(cdMatch[1]) : '' } catch { serverName = cdMatch?.[1] || '' }
          let ext: string
          if (serverName && /\.(mp3|m4a|webm|mp4)$/i.test(serverName)) {
            ext = serverName.split('.').pop()!.toLowerCase()
          } else if (ct.includes('audio/mpeg')) ext = 'mp3'
          else if (ct.includes('audio/mp4')) ext = 'm4a'
          else if (ct.includes('audio/webm')) ext = 'webm'
          else if (isAudioReq) ext = format === 'mp3' ? 'mp3' : 'm4a'
          else ext = 'mp4'
          const filename = isAudioReq ? `${safeTitle}.${ext}` : `${safeTitle}_${quality}p.${ext}`
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = filename
          document.body.appendChild(a); a.click(); document.body.removeChild(a)
          setTimeout(() => URL.revokeObjectURL(url), 1000)

          if (!opts?.silent) showToast('✅ تم التحميل بنجاح')
          notifyDone('DZ Tube — اكتمل التحميل', filename, r.thumbnail)
          setActiveDownloads(prev => { const n = { ...prev }; delete n[dlKey]; return n })
          setHistory(prev => {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            return [{ id, url: r.url, title: r.title, thumbnail: r.thumbnail, format, quality, timestamp: Date.now() }, ...prev.filter(h => !(h.url === r.url && h.format === format && h.quality === quality))].slice(0, HISTORY_MAX)
          })
          resolve(true)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'فشل التحميل')
          if (!opts?.silent) showToast('فشل التحميل', 'err')
          resolve(false)
        } finally {
          setDownloadingId(null)
        }
      }
      xhr.send()
    })
  }, [showToast, notifyDone])

  const cancelActiveDownload = useCallback((key: string) => {
    setActiveDownloads(prev => {
      const cur = prev[key]; if (!cur) return prev
      try { cur.xhr?.abort() } catch {}
      const n = { ...prev }; delete n[key]; return n
    })
    setDownloadingId(null)
  }, [])

  // Sequentially download every selected card. We resolve each one before
  // starting the next so the user sees a clear single-progress flow rather
  // than 10 simultaneous bars at 0%.
  const runBatchDownload = useCallback(async (items: SearchResult[], format: 'mp4' | 'mp3' | 'audio', quality: Quality) => {
    if (items.length === 0) return
    batchAbortRef.current = false
    setBatchTotal(items.length)
    setBatchPending(items.length)
    setHistoryOpen(true)
    showToast(`⬇️ بدأ التحميل الدفعي · ${items.length} مقاطع`)
    let okCount = 0
    for (let i = 0; i < items.length; i++) {
      if (batchAbortRef.current) break
      const r = items[i]
      const success = await startDownload(r, format, quality, { silent: true })
      if (success) okCount++
      setBatchPending(items.length - i - 1)
    }
    const aborted = batchAbortRef.current
    setBatchPending(0)
    setBatchTotal(0)
    setSelectedIds(new Set())
    setSelectMode(false)
    if (aborted) {
      showToast(`⏹ أُوقف الطابور — اكتمل ${okCount} من ${items.length}`)
    } else {
      showToast(`✅ تم التحميل الدفعي · ${okCount} من ${items.length}`)
    }
  }, [showToast, startDownload])

  const cancelBatch = useCallback(() => {
    batchAbortRef.current = true
    // Also abort the currently-running item so the loop exits immediately.
    setActiveDownloads(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        try { next[k].xhr?.abort() } catch {}
        delete next[k]
      }
      return next
    })
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(results.map(r => r.id)))
  }, [results])
  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

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
        <div className="dzt-header-actions">
          {results.length > 0 && (
            <button
              className={`dzt-history-btn${selectMode ? ' dzt-select-active' : ''}`}
              onClick={() => { if (selectMode) exitSelectMode(); else setSelectMode(true) }}
              title={selectMode ? 'إلغاء التحديد' : 'تحديد متعدد'}
              disabled={batchTotal > 0}
            >
              <ListChecks size={16} />
              <span className="dzt-history-label">{selectMode ? 'إلغاء' : 'تحديد'}</span>
              {selectedIds.size > 0 && <span className="dzt-history-count">{selectedIds.size}</span>}
            </button>
          )}
          <button className="dzt-history-btn" onClick={() => setHistoryOpen(p => !p)} title="السجل">
            <History size={16} /><span className="dzt-history-label">السجل</span>
            {(history.length > 0 || Object.values(activeDownloads).length > 0) && (
              <span className="dzt-history-count">{Object.values(activeDownloads).length || history.length}</span>
            )}
          </button>
        </div>
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
            {favorites.length > 0 && (
              <div className="dzt-fav-section">
                <h3 className="dzt-fav-title">
                  <Heart size={14} fill="currentColor" /> المفضلة
                  <span className="dzt-fav-count">{favorites.length}</span>
                </h3>
                <div className="dzt-fav-grid">
                  {favorites.map(f => (
                    <article key={f.id} className="dzt-fav-card">
                      <button className="dzt-fav-thumb-btn" onClick={() => playFavorite(f)} title="تشغيل">
                        <img className="dzt-fav-thumb" src={f.thumbnail} alt={f.title} loading="lazy" />
                        <span className="dzt-fav-play-overlay"><Play size={20} fill="currentColor" /></span>
                        {f.duration > 0 && <span className="dzt-fav-dur">{fmtDuration(f.duration)}</span>}
                      </button>
                      <div className="dzt-fav-info">
                        <div className="dzt-fav-card-title" title={f.title}>{f.title}</div>
                        {f.channel && <div className="dzt-fav-channel">{f.channel}</div>}
                      </div>
                      <div className="dzt-fav-actions">
                        <button
                          className="dzt-fav-act"
                          onClick={() => playFavorite(f)}
                          title="تشغيل"
                        >
                          <Play size={12} fill="currentColor" />
                        </button>
                        <button
                          className="dzt-fav-act dzt-fav-act-mp3"
                          onClick={() => {
                            showToast('🎵 جاري تنزيل MP3…')
                            void startDownload({ id: f.id, url: f.url, title: f.title, thumbnail: f.thumbnail, channel: f.channel, duration: f.duration, views: 0 }, 'mp3', '720', { silent: true })
                          }}
                          title="تنزيل MP3"
                        >
                          <Music size={12} />
                        </button>
                        <button
                          className="dzt-fav-act dzt-fav-act-rm"
                          onClick={() => toggleFavorite(f)}
                          title="إزالة من المفضلة"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
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
              {results.map(r => {
                const isSelected = selectedIds.has(r.id)
                const onCardThumbClick = () => {
                  if (selectMode) toggleSelect(r.id)
                  else playInFrame(r)
                }
                return (
                <article
                  key={r.id}
                  className={`dzt-card${selectMode ? ' dzt-card-selectable' : ''}${isSelected ? ' dzt-card-selected' : ''}`}
                  onMouseEnter={() => warmTrackUrl(r.url)}
                  onTouchStart={() => warmTrackUrl(r.url)}
                >
                  <div className="dzt-card-thumb-wrap" onClick={onCardThumbClick}>
                    <img className="dzt-card-thumb" src={r.thumbnail} alt={r.title} loading="lazy" />
                    {r.duration > 0 && (
                      <span className="dzt-card-duration">
                        <Clock size={10} /> {fmtDuration(r.duration)}
                      </span>
                    )}
                    {selectMode ? (
                      <div className="dzt-card-select-overlay">
                        {isSelected
                          ? <CheckSquare size={42} className="dzt-card-check-on" />
                          : <Square size={42} className="dzt-card-check-off" />
                        }
                      </div>
                    ) : (
                      <div className="dzt-card-play-overlay">
                        <div className="dzt-play-circle"><Play size={26} fill="#fff" /></div>
                      </div>
                    )}
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
                          player.playNext({ id: r.id, url: r.url, title: r.title, thumbnail: r.thumbnail, channel: r.channel, duration: r.duration })
                          showToast('⏭️ سيُشغَّل بعد المقطع الحالي')
                        }}
                        title="تشغيل بعد الحالي"
                      >
                        <SkipForward size={13} />
                      </button>
                      <button
                        className="dzt-act dzt-act-q"
                        onClick={() => {
                          player.enqueue({ id: r.id, url: r.url, title: r.title, thumbnail: r.thumbnail, channel: r.channel, duration: r.duration })
                          showToast('➕ أُضيف إلى قائمة التشغيل')
                        }}
                        title="إضافة للقائمة"
                      >
                        <Plus size={13} />
                      </button>
                      <button
                        className={`dzt-act dzt-act-fav${favoriteIds.has(r.id) ? ' active' : ''}`}
                        onClick={() => toggleFavorite(r)}
                        title={favoriteIds.has(r.id) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                      >
                        <Heart size={13} fill={favoriteIds.has(r.id) ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        className="dzt-act dzt-act-mp3"
                        onClick={() => {
                          if (downloadingId === r.id) return
                          showToast('🎵 جاري تنزيل MP3…')
                          void startDownload(r, 'mp3', '720', { silent: true })
                        }}
                        disabled={downloadingId === r.id}
                        title="تنزيل MP3 مباشرة"
                      >
                        <Music size={13} />
                      </button>
                      <div className="dzt-act-dl-wrap">
                        <button
                          className="dzt-act dzt-act-dl"
                          onClick={() => {
                            if (downloadMenuFor === r.id) { setDownloadMenuFor(null); return }
                            setDownloadMenuFor(r.id)
                            fetchQualities(r)
                          }}
                          disabled={downloadingId === r.id}
                          title="تحميل (خيارات الجودة)"
                        >
                          {downloadingId === r.id ? (
                            (() => {
                              const pct = activeForCardPct(r.id)
                              return pct == null
                                ? <Loader2 size={13} className="dzt-spin" />
                                : <span className="dzt-act-pct">{pct}%</span>
                            })()
                          ) : (
                            <><Download size={13} /> <ChevronDown size={11} /></>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )})}
            </div>
          </>
        )}
      </main>

      {downloadMenuFor && (() => {
        const r = results.find(x => x.id === downloadMenuFor)
        if (!r) return null
        const cache = qualityCache[r.id]
        return createPortal(
          <div className="dzt-dl-modal-root" role="dialog" aria-modal="true" aria-labelledby="dzt-dl-modal-title">
            <div className="dzt-dl-modal-overlay" onClick={() => setDownloadMenuFor(null)} />
            <div className="dzt-dl-modal-card" onClick={(e) => e.stopPropagation()}>
              <header className="dzt-dl-modal-head">
                <div className="dzt-dl-modal-head-l">
                  <div className="dzt-dl-modal-icon"><Download size={16} /></div>
                  <div>
                    <h3 id="dzt-dl-modal-title" className="dzt-dl-modal-title">تحميل الفيديو</h3>
                    <p className="dzt-dl-modal-sub" title={r.title}>{r.title}</p>
                  </div>
                </div>
                <button className="dzt-dl-modal-close" onClick={() => setDownloadMenuFor(null)} aria-label="إغلاق">
                  <X size={18} />
                </button>
              </header>

              <div className="dzt-dl-modal-body">
                <div className="dzt-dl-section">
                  <div className="dzt-dl-section-title"><Video size={12} /> فيديو (MP4)</div>
                  {cache?.loading && (
                    <div className="dzt-dl-loading"><Loader2 size={14} className="dzt-spin" /> جاري فحص الجودات…</div>
                  )}
                  {!cache?.loading && (cache?.qualities || []).length === 0 && (
                    <div className="dzt-dl-empty">لا توجد جودات فيديو متاحة لهذا المقطع</div>
                  )}
                  {!cache?.loading && (cache?.qualities || []).length > 0 && (
                    <div className="dzt-dl-grid">
                      {(cache?.qualities || []).map(q => {
                        const n = Number(q)
                        const tag = n >= 2160 ? '4K' : n >= 1440 ? '2K' : n >= 1080 ? 'HD' : n >= 720 ? 'HD' : 'SD'
                        return (
                          <button key={q} className="dzt-dl-tile" onClick={() => startDownload(r, 'mp4', q)} title={`MP4 ${q}p`}>
                            <span className="dzt-dl-tile-q">{q}p</span>
                            <span className="dzt-dl-tile-tag">{tag} · MP4</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="dzt-dl-divider" />

                <div className="dzt-dl-section">
                  <div className="dzt-dl-section-title"><Music size={12} /> صوت فقط</div>
                  <div className="dzt-dl-grid">
                    <button className="dzt-dl-tile dzt-dl-tile-audio" onClick={() => startDownload(r, 'audio', '720')} title="استخراج الصوت بصيغة M4A">
                      <span className="dzt-dl-tile-q">M4A</span>
                      <span className="dzt-dl-tile-tag">صوت أصلي</span>
                    </button>
                    <button className="dzt-dl-tile dzt-dl-tile-audio" onClick={() => startDownload(r, 'mp3', '720')} title="تحويل إلى MP3">
                      <span className="dzt-dl-tile-q">MP3</span>
                      <span className="dzt-dl-tile-tag">جودة عالية</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      })()}

      {(selectMode && selectedIds.size > 0) || batchTotal > 0 ? (
        <div className="dzt-batch-bar" role="region" aria-label="شريط التحميل الدفعي">
          {batchTotal > 0 ? (
            <>
              <div className="dzt-batch-bar-info">
                <Loader2 size={16} className="dzt-spin" />
                <div className="dzt-batch-bar-text">
                  <span className="dzt-batch-bar-title">جارٍ التحميل الدفعي</span>
                  <span className="dzt-batch-bar-sub">
                    تبقى {batchPending} من {batchTotal}
                  </span>
                </div>
              </div>
              <div className="dzt-batch-bar-actions">
                <button className="dzt-batch-btn dzt-batch-btn-ghost" onClick={cancelBatch}>
                  <X size={14} /> إيقاف الطابور
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="dzt-batch-bar-info">
                <ListChecks size={16} />
                <div className="dzt-batch-bar-text">
                  <span className="dzt-batch-bar-title">{selectedIds.size} محدد</span>
                  <span className="dzt-batch-bar-sub">اختر صيغة التحميل</span>
                </div>
              </div>
              <div className="dzt-batch-bar-actions">
                <button
                  className="dzt-batch-btn dzt-batch-btn-ghost"
                  onClick={selectAll}
                  title="تحديد الكل"
                >
                  الكل
                </button>
                <button
                  className="dzt-batch-btn"
                  onClick={() => runBatchDownload(results.filter(r => selectedIds.has(r.id)), 'mp4', '720')}
                  title="تحميل الكل بصيغة MP4 720p"
                >
                  <Video size={14} /> MP4 720p
                </button>
                <button
                  className="dzt-batch-btn"
                  onClick={() => runBatchDownload(results.filter(r => selectedIds.has(r.id)), 'audio', '720')}
                  title="تحميل الكل صوت M4A"
                >
                  <Headphones size={14} /> M4A
                </button>
                <button className="dzt-batch-btn dzt-batch-btn-ghost" onClick={exitSelectMode} title="إلغاء">
                  <X size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

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
              {Object.values(activeDownloads).length > 0 && (
                <div className="dzt-active-dl-section">
                  <div className="dzt-active-dl-title">
                    <Loader2 size={12} className="dzt-spin" /> تحميلات جارية
                  </div>
                  {Object.values(activeDownloads).map(d => {
                    const pct = d.total > 0 ? Math.min(100, Math.floor((d.loaded / d.total) * 100)) : 0
                    const mb = (d.loaded / 1048576).toFixed(1)
                    const totalMb = d.total > 0 ? (d.total / 1048576).toFixed(1) : null
                    const failed = d.status === 'failed'
                    return (
                      <div key={d.key} className={`dzt-active-dl-item${failed ? ' dzt-active-dl-failed' : ''}`}>
                        {d.thumbnail && <img className="dzt-history-thumb" src={d.thumbnail} alt="" />}
                        <div className="dzt-active-dl-info">
                          <span className="dzt-history-item-title" title={d.title}>{d.title}</span>
                          <div className="dzt-active-dl-meta">
                            <span>{d.format === 'mp3' ? 'MP3' : d.format === 'audio' ? 'M4A' : `MP4 ${d.quality}p`}</span>
                            <span>·</span>
                            {failed ? (
                              <span className="dzt-active-dl-fail-text">فشل التحميل</span>
                            ) : totalMb ? (
                              <span>{mb} / {totalMb} م.ب</span>
                            ) : (
                              <span>{mb} م.ب</span>
                            )}
                          </div>
                          <div className="dzt-active-dl-bar">
                            <div
                              className={`dzt-active-dl-fill${d.total > 0 ? '' : ' dzt-active-dl-fill-indet'}`}
                              style={d.total > 0 ? { width: `${pct}%` } : undefined}
                            />
                          </div>
                        </div>
                        <div className="dzt-active-dl-side">
                          {d.total > 0 && !failed && <span className="dzt-active-dl-pct">{pct}%</span>}
                          <button
                            className="dzt-history-remove"
                            onClick={() => cancelActiveDownload(d.key)}
                            title="إلغاء"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {history.length === 0 && Object.values(activeDownloads).length === 0 ? (
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

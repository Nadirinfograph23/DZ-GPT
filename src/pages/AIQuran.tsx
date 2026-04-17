import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Play, Pause, Volume2, Bot, Send,
  Menu, X, Headphones, Loader2, BookOpen,
  Home, Bot as BotIcon,
  Bookmark, BookmarkCheck, Trash2, MoreVertical,
  SkipBack, SkipForward,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import '../styles/ai-quran.css'

const QURAN_API = 'https://api.quran.com/api/v4'

interface Chapter {
  id: number
  revelation_place: string
  name_simple: string
  name_arabic: string
  verses_count: number
  translated_name: { name: string }
}

interface Verse {
  id: number
  verse_key: string
  text_uthmani: string
  translations?: { text: string }[]
}

interface Reciter {
  id: number
  reciter_name: string
  style: { name: string } | null
}

interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

interface BookmarkedAyah {
  id: string
  verse_key: string
  text_uthmani: string
  chapter_name: string
  chapter_id: number
  savedAt: number
}

interface AyahMenu {
  verse: Verse
  chapterName: string
  chapterId: number
  x: number
  y: number
}

const normalizeQuranSearch = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .trim()
    .toLowerCase()

const verseIncludesQuery = (text: string, query: string) => {
  const normalizedQuery = normalizeQuranSearch(query)
  if (!normalizedQuery) return false
  return normalizeQuranSearch(text).includes(normalizedQuery)
}

const BOOKMARKS_KEY = 'aq-bookmarks'

function loadBookmarks(): BookmarkedAyah[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveBookmarks(bm: BookmarkedAyah[]) {
  try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bm)) } catch {}
}

export default function AIQuran() {
  const navigate = useNavigate()

  const [chapters, setChapters] = useState<Chapter[]>([])
  const [chaptersLoading, setChaptersLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [verseSearch, setVerseSearch] = useState('')
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null)

  const [activeTab, setActiveTab] = useState<'reading' | 'audio'>('reading')

  const [verses, setVerses] = useState<Verse[]>([])
  const [versesLoading, setVersesLoading] = useState(false)

  const [reciters, setReciters] = useState<Reciter[]>([])
  const [selectedReciter, setSelectedReciter] = useState<Reciter | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [verseAudioUrl, setVerseAudioUrl] = useState<string | null>(null)
  const [verseAudioKey, setVerseAudioKey] = useState<string | null>(null)
  const [verseAudioLoading, setVerseAudioLoading] = useState(false)
  const [verseAudioPlaying, setVerseAudioPlaying] = useState(false)
  const verseAudioRef = useRef<HTMLAudioElement | null>(null)

  const [aiMessages, setAiMessages] = useState<AiMessage[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [wordOccurrences, setWordOccurrences] = useState<{ word: string; count: number; surahs: string[] } | null>(null)
  const [wordSearchLoading, setWordSearchLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [ayahMenu, setAyahMenu] = useState<AyahMenu | null>(null)
  const [bookmarks, setBookmarks] = useState<BookmarkedAyah[]>(loadBookmarks)
  const [bookmarksPanelOpen, setBookmarksPanelOpen] = useState(false)

  const touchStartXRef = useRef<number | null>(null)

  useEffect(() => {
    fetch(`${QURAN_API}/chapters?language=ar`)
      .then(r => r.json())
      .then(d => {
        setChapters(d.chapters || [])
        const fatiha = (d.chapters || [])[0]
        if (fatiha) setSelectedChapter(fatiha)
      })
      .catch(() => {})
      .finally(() => setChaptersLoading(false))

    fetch(`${QURAN_API}/resources/recitations?language=ar`)
      .then(r => r.json())
      .then(d => {
        const list: Reciter[] = d.recitations || []
        setReciters(list)
        if (list.length > 0) setSelectedReciter(list[0])
      })
      .catch(() => {})
  }, [])

  const loadVerses = useCallback(async (chapterId: number) => {
    setVersesLoading(true)
    setVerses([])
    try {
      const params = new URLSearchParams({
        language: 'ar',
        per_page: '300',
        fields: 'text_uthmani',
        translations: '169',
      })
      const r = await fetch(`${QURAN_API}/verses/by_chapter/${chapterId}?${params}`)
      const d = await r.json()
      setVerses(d.verses || [])
    } catch {}
    finally { setVersesLoading(false) }
  }, [])

  useEffect(() => {
    if (!selectedChapter) return
    loadVerses(selectedChapter.id)
  }, [selectedChapter, loadVerses])

  const loadAudio = useCallback(async (reciterId: number, chapterId: number) => {
    setAudioLoading(true)
    setAudioUrl(null)
    setIsPlaying(false)
    try {
      const r = await fetch(`${QURAN_API}/chapter_recitations/${reciterId}/${chapterId}`)
      const d = await r.json()
      const url = d.audio_file?.audio_url
      if (url) setAudioUrl(url.startsWith('http') ? url : `https://${url}`)
    } catch {}
    finally { setAudioLoading(false) }
  }, [])

  useEffect(() => {
    if (activeTab === 'audio' && selectedChapter && selectedReciter) {
      loadAudio(selectedReciter.id, selectedChapter.id)
    }
  }, [activeTab, selectedChapter, selectedReciter, loadAudio])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    audio.src = audioUrl
    audio.playbackRate = playbackRate
    if (isPlaying) audio.play().catch(() => setIsPlaying(false))
  }, [audioUrl])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) audio.play().catch(() => setIsPlaying(false))
    else audio.pause()
  }, [isPlaying])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  useEffect(() => {
    saveBookmarks(bookmarks)
  }, [bookmarks])

  useEffect(() => {
    const va = verseAudioRef.current
    if (!va || !verseAudioUrl) return
    va.src = verseAudioUrl
    va.play().catch(() => setVerseAudioPlaying(false))
    setVerseAudioPlaying(true)
  }, [verseAudioUrl])

  useEffect(() => {
    const va = verseAudioRef.current
    if (!va) return
    if (verseAudioPlaying) va.play().catch(() => setVerseAudioPlaying(false))
    else va.pause()
  }, [verseAudioPlaying])

  const handleSelectChapter = (ch: Chapter) => {
    setSelectedChapter(ch)
    setMobileSidebarOpen(false)
    setIsPlaying(false)
    setAudioUrl(null)
    stopVerseAudio()
    setAyahMenu(null)
  }

  const goToPrevChapter = useCallback(() => {
    if (!selectedChapter || selectedChapter.id <= 1) return
    const prev = chapters.find(c => c.id === selectedChapter.id - 1)
    if (prev) handleSelectChapter(prev)
  }, [selectedChapter, chapters])

  const goToNextChapter = useCallback(() => {
    if (!selectedChapter || selectedChapter.id >= 114) return
    const next = chapters.find(c => c.id === selectedChapter.id + 1)
    if (next) handleSelectChapter(next)
  }, [selectedChapter, chapters])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current
    touchStartXRef.current = null
    if (Math.abs(deltaX) < 70) return
    if (deltaX > 0) goToNextChapter()
    else goToPrevChapter()
  }

  const stopVerseAudio = () => {
    verseAudioRef.current?.pause()
    setVerseAudioPlaying(false)
    setVerseAudioUrl(null)
    setVerseAudioKey(null)
  }

  const playVerseAudio = useCallback(async (verseKey: string) => {
    if (!selectedReciter) return
    if (verseAudioKey === verseKey) {
      setVerseAudioPlaying(p => !p)
      return
    }
    stopVerseAudio()
    setVerseAudioLoading(true)
    setVerseAudioKey(verseKey)
    try {
      const r = await fetch(`${QURAN_API}/recitations/${selectedReciter.id}/by_ayah/${verseKey}`)
      const d = await r.json()
      const audioFile = d.audio_files?.[0]
      if (audioFile?.url) {
        const url = audioFile.url.startsWith('http') ? audioFile.url : `https://${audioFile.url}`
        setVerseAudioUrl(url)
      } else if (audioFile?.audio_url) {
        const url = audioFile.audio_url.startsWith('http') ? audioFile.audio_url : `https://${audioFile.audio_url}`
        setVerseAudioUrl(url)
      }
    } catch {}
    finally { setVerseAudioLoading(false) }
  }, [selectedReciter, verseAudioKey])

  const isBookmarked = (verseKey: string) => bookmarks.some(b => b.verse_key === verseKey)

  const toggleBookmark = (verse: Verse, chapterName: string, chapterId: number) => {
    const existing = bookmarks.find(b => b.verse_key === verse.verse_key)
    if (existing) {
      setBookmarks(prev => prev.filter(b => b.verse_key !== verse.verse_key))
    } else {
      const newBm: BookmarkedAyah = {
        id: verse.verse_key,
        verse_key: verse.verse_key,
        text_uthmani: verse.text_uthmani,
        chapter_name: chapterName,
        chapter_id: chapterId,
        savedAt: Date.now(),
      }
      setBookmarks(prev => [newBm, ...prev])
    }
  }

  const openAyahMenu = (e: React.MouseEvent, verse: Verse) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selectedChapter) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setAyahMenu({
      verse,
      chapterName: selectedChapter.name_arabic,
      chapterId: selectedChapter.id,
      x: rect.left,
      y: rect.bottom + 4,
    })
  }

  const closeAyahMenu = () => setAyahMenu(null)

  const handleAyahAction = (action: 'bookmark' | 'listen' | 'assistant') => {
    if (!ayahMenu) return
    const { verse, chapterName, chapterId } = ayahMenu
    if (action === 'bookmark') {
      toggleBookmark(verse, chapterName, chapterId)
    } else if (action === 'listen') {
      playVerseAudio(verse.verse_key)
    } else if (action === 'assistant') {
      setAiOpen(true)
      setAiInput(`فسّر لي هذه الآية الكريمة كاملةً وبيّن معناها وأسباب نزولها إن وجدت:\n\n${verse.text_uthmani}\n\n(${verse.verse_key})`)
      setBookmarksPanelOpen(false)
    }
    closeAyahMenu()
  }

  const sendAiMessage = async () => {
    const text = aiInput.trim()
    if (!text || aiLoading) return
    const userMsg: AiMessage = { role: 'user', content: text }
    const newMessages = [...aiMessages, userMsg]
    setAiMessages(newMessages)
    setAiInput('')
    setAiLoading(true)
    try {
      const context = selectedChapter
        ? `السورة الحالية: ${selectedChapter.name_arabic} (${selectedChapter.name_simple}) - رقمها: ${selectedChapter.id} - عدد الآيات: ${selectedChapter.verses_count} - نوع السورة: ${selectedChapter.revelation_place === 'makkah' ? 'مكية' : 'مدنية'}`
        : ''
      const wordCtx = wordOccurrences
        ? `الكلمة المُحللة: «${wordOccurrences.word}» — وردت ${wordOccurrences.count} مرة`
        : ''
      const systemPrompt = `أنت مساعد قرآني ذكي متخصص اسمه AI QURAN. تعمل داخل تطبيق DZ-GPT.

مجالات تخصصك:
1. **التفسير**: تفسير الآيات الكريمة بناءً على التفاسير المعتمدة (ابن كثير، الطبري، السعدي، القرطبي)
2. **المعنى**: شرح مفردات القرآن ومعاني الآيات بشكل دقيق
3. **أسباب النزول**: متى ولماذا نزلت الآيات إن توفرت روايات
4. **تصنيف السور**: مكية أو مدنية مع الشرح
5. **إحصاءات القرآن**: كم مرة وردت كلمة، في كم سورة، أبرز مواضعها
6. **الأحكام الشرعية**: ما تضمنته الآيات من أحكام
7. **الملخصات**: ملخص موضوعات أي سورة

تعليمات الذكاء السياقي:
- حلّل الكلمات المفتاحية في سؤال المستخدم لتحديد نوع الطلب (تفسير، معنى، سبب نزول، إلخ)
- استخدم السياق الحالي (السورة المختارة) لتعزيز دقة إجابتك
- إذا كان السؤال عن آية محددة، اشرحها شرحاً وافياً

${context ? `السياق الحالي: ${context}` : ''}
${wordCtx ? wordCtx : ''}

قواعد مهمة:
- أجب دائماً باللغة العربية
- استشهد بالآيات بشكل دقيق (السورة: الآية)
- إذا سُئلت عن شيء ليس في القرآن أو علومه، أجب باختصار ومهنية
- لا تخترع آيات أو تفسيرات
- إذا لم تعرف، قل ذلك بوضوح واقترح المصادر المناسبة`

      const messages = [
        { role: 'system', content: systemPrompt },
        ...newMessages.map(m => ({ role: m.role, content: m.content })),
      ]
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model: 'llama-70b' }),
      })
      const d = await r.json()
      setAiMessages(prev => [...prev, { role: 'assistant', content: d.content || 'حدث خطأ، حاول مجدداً.' }])
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'تعذر الاتصال، حاول لاحقاً.' }])
    } finally {
      setAiLoading(false)
    }
  }

  const filteredChapters = chapters.filter(ch =>
    ch.name_arabic.includes(search) ||
    ch.name_simple.toLowerCase().includes(search.toLowerCase()) ||
    String(ch.id).includes(search)
  )

  const normalizedVerseSearch = normalizeQuranSearch(verseSearch)
  const displayedVerses = normalizedVerseSearch
    ? verses.filter(v => verseIncludesQuery(v.text_uthmani, verseSearch))
    : verses
  const matchingVersesCount = normalizedVerseSearch ? displayedVerses.length : 0

  const handleWordClick = useCallback(async (word: string) => {
    const cleaned = word.replace(/[^\u0600-\u06FF\u0750-\u077F]/g, '').trim()
    if (!cleaned || cleaned.length < 2) return
    setVerseSearch(cleaned)
    setWordOccurrences(null)
    setWordSearchLoading(true)
    try {
      const r = await fetch(`${QURAN_API}/search?q=${encodeURIComponent(cleaned)}&size=100&language=ar`)
      const d = await r.json()
      const results = d.search?.results || []
      const surahSet = new Set<string>()
      for (const res of results) {
        const surahNum = res.verse_key?.split(':')[0]
        if (surahNum) surahSet.add(surahNum)
      }
      const surahNames = chapters
        .filter(ch => surahSet.has(String(ch.id)))
        .map(ch => `${ch.id}. ${ch.name_arabic}`)
      setWordOccurrences({ word: cleaned, count: results.length, surahs: surahNames.slice(0, 15) })
    } catch {
      setWordOccurrences({ word: cleaned, count: 0, surahs: [] })
    } finally {
      setWordSearchLoading(false)
    }
  }, [chapters])

  return (
    <div className="aq-root" dir="rtl" onClick={() => ayahMenu && closeAyahMenu()}>
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          const a = audioRef.current
          if (a) setAudioProgress(a.currentTime)
        }}
        onLoadedMetadata={() => {
          const a = audioRef.current
          if (a) setAudioDuration(a.duration)
        }}
        onEnded={() => setIsPlaying(false)}
      />
      <audio
        ref={verseAudioRef}
        onEnded={() => { setVerseAudioPlaying(false); setVerseAudioKey(null) }}
      />

      {/* ===== AYAH CONTEXT MENU ===== */}
      {ayahMenu && (
        <div
          className="aq-ayah-menu"
          style={{ top: Math.min(ayahMenu.y, window.innerHeight - 200), left: Math.max(8, Math.min(ayahMenu.x, window.innerWidth - 220)) }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="aq-ayah-menu-item"
            onClick={() => handleAyahAction('bookmark')}
          >
            {isBookmarked(ayahMenu.verse.verse_key)
              ? <><BookmarkCheck size={14} className="aq-ayah-menu-icon aq-ayah-menu-icon--saved" /> إزالة العلامة</>
              : <><Bookmark size={14} className="aq-ayah-menu-icon" /> حفظ العلامة</>
            }
          </button>
          <button className="aq-ayah-menu-item" onClick={() => handleAyahAction('listen')}>
            <Volume2 size={14} className="aq-ayah-menu-icon" /> استماع للآية
          </button>
          <button className="aq-ayah-menu-item aq-ayah-menu-item--assistant" onClick={() => handleAyahAction('assistant')}>
            <Bot size={14} className="aq-ayah-menu-icon" /> اسأل المساعد الذكي
          </button>
        </div>
      )}

      {/* Verse Audio Mini Player */}
      {verseAudioKey && (
        <div className="aq-verse-audio-player" dir="rtl">
          <span className="aq-verse-audio-key">الآية {verseAudioKey}</span>
          {verseAudioLoading
            ? <Loader2 size={14} className="aq-spin" />
            : (
              <button className="aq-verse-audio-btn" onClick={() => setVerseAudioPlaying(p => !p)}>
                {verseAudioPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
            )
          }
          <button className="aq-verse-audio-close" onClick={stopVerseAudio}><X size={12} /></button>
        </div>
      )}

      {/* ===== HEADER ===== */}
      <header className="aq-header">
        <div className="aq-header-left">
          <button className="aq-nav-btn" onClick={() => navigate('/')} title="Home">
            <Home size={15} /> الرئيسية
          </button>
        </div>
        <div className="aq-header-right">
          <button
            className={`aq-bookmarks-btn ${bookmarksPanelOpen ? 'aq-bookmarks-btn--active' : ''}`}
            onClick={() => setBookmarksPanelOpen(p => !p)}
            title={`العلامات المرجعية (${bookmarks.length})`}
          >
            <BookmarkCheck size={15} />
            {bookmarks.length > 0 && <span className="aq-bookmarks-count">{bookmarks.length}</span>}
          </button>
          <button
            className={`aq-ai-toggle-header ${aiOpen ? 'aq-ai-toggle-header--active' : ''}`}
            onClick={() => setAiOpen(p => !p)}
            title="المساعد الذكي"
          >
            <BotIcon size={15} />
            <span>المساعد الذكي</span>
          </button>
          <button className="aq-mobile-menu-btn" onClick={() => setMobileSidebarOpen(true)}>
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* ===== BOOKMARKS PANEL ===== */}
      {bookmarksPanelOpen && (
        <div className="aq-bookmarks-panel" dir="rtl">
          <div className="aq-bookmarks-header">
            <span className="aq-bookmarks-title"><BookmarkCheck size={15} /> علاماتي المرجعية</span>
            <button className="aq-bookmarks-close-btn" onClick={() => setBookmarksPanelOpen(false)}><X size={16} /></button>
          </div>
          {bookmarks.length === 0 ? (
            <div className="aq-bookmarks-empty">لا توجد علامات محفوظة بعد.<br />انقر على أي آية وحدد «حفظ العلامة».</div>
          ) : (
            <div className="aq-bookmarks-list">
              {bookmarks.map(bm => (
                <div key={bm.id} className="aq-bookmark-card">
                  <div className="aq-bookmark-meta">
                    <span className="aq-bookmark-surah">{bm.chapter_name} — {bm.verse_key}</span>
                    <div className="aq-bookmark-actions">
                      <button
                        className="aq-bookmark-action-btn"
                        title="استماع"
                        onClick={() => {
                          playVerseAudio(bm.verse_key)
                          setBookmarksPanelOpen(false)
                        }}
                      >
                        <Volume2 size={12} />
                      </button>
                      <button
                        className="aq-bookmark-action-btn"
                        title="المساعد"
                        onClick={() => {
                          setAiOpen(true)
                          setAiInput(`فسّر لي هذه الآية الكريمة كاملةً وبيّن معناها وأسباب نزولها إن وجدت:\n\n${bm.text_uthmani}\n\n(${bm.verse_key})`)
                          setBookmarksPanelOpen(false)
                        }}
                      >
                        <Bot size={12} />
                      </button>
                      <button
                        className="aq-bookmark-action-btn aq-bookmark-action-btn--del"
                        title="حذف"
                        onClick={() => setBookmarks(prev => prev.filter(b => b.id !== bm.id))}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <button
                    className="aq-bookmark-text"
                    onClick={() => {
                      const ch = chapters.find(c => c.id === bm.chapter_id)
                      if (ch) { handleSelectChapter(ch); setBookmarksPanelOpen(false) }
                    }}
                  >
                    {bm.text_uthmani.substring(0, 120)}{bm.text_uthmani.length > 120 ? '...' : ''}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== LAYOUT ===== */}
      <div className="aq-layout">

        {/* ===== RIGHT SIDEBAR — SURAH INDEX (first in DOM = rightmost in RTL) ===== */}
        <aside className={`aq-sidebar ${mobileSidebarOpen ? 'aq-sidebar--open' : ''}`}>
          <div className="aq-sidebar-header">
            <span className="aq-sidebar-title">فهرس السور</span>
            <button className="aq-sidebar-close" onClick={() => setMobileSidebarOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="aq-search-wrap">
            <Search size={13} className="aq-search-icon" />
            <input
              className="aq-search-input"
              placeholder="ابحث عن سورة..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="aq-chapter-list">
            {chaptersLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aq-skeleton aq-skeleton--chapter" />
              ))
            ) : (
              filteredChapters.map(ch => (
                <button
                  key={ch.id}
                  className={`aq-chapter-item ${selectedChapter?.id === ch.id ? 'aq-chapter-item--active' : ''}`}
                  onClick={() => handleSelectChapter(ch)}
                >
                  <span className="aq-chapter-num">{ch.id}</span>
                  <div className="aq-chapter-info">
                    <span className="aq-chapter-arabic">{ch.name_arabic}</span>
                    <span className="aq-chapter-simple">{ch.name_simple}</span>
                  </div>
                  <span className="aq-chapter-type">
                    {ch.revelation_place === 'makkah' ? 'مكية' : 'مدنية'}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ===== CENTER — MAIN CONTENT ===== */}
        <main
          className="aq-center"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Surah Title Banner */}
          {selectedChapter && (
            <div className="aq-surah-banner">
              <div className="aq-surah-banner-name">{selectedChapter.name_arabic}</div>
              <div className="aq-surah-banner-meta">
                {selectedChapter.name_simple} · {selectedChapter.translated_name?.name} ·{' '}
                {selectedChapter.verses_count} آية ·{' '}
                {selectedChapter.revelation_place === 'makkah' ? 'مكية' : 'مدنية'}
              </div>
              {selectedChapter.id !== 1 && selectedChapter.id !== 9 && (
                <div className="aq-basmala">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="aq-tabs">
            <button
              className={`aq-tab ${activeTab === 'reading' ? 'aq-tab--active' : ''}`}
              onClick={() => setActiveTab('reading')}
            >
              <BookOpen size={14} /> قراءة
            </button>
            <button
              className={`aq-tab ${activeTab === 'audio' ? 'aq-tab--active' : ''}`}
              onClick={() => setActiveTab('audio')}
            >
              <Headphones size={14} /> استماع
            </button>
          </div>

          <div className="aq-verse-search-panel">
            <div className="aq-verse-search-wrap">
              <Search size={14} className="aq-search-icon" />
              <input
                className="aq-verse-search-input"
                placeholder="ابحث داخل آيات السورة..."
                value={verseSearch}
                onChange={e => setVerseSearch(e.target.value)}
              />
            </div>
            {normalizedVerseSearch && (
              <div className={`aq-search-result ${matchingVersesCount > 0 ? 'aq-search-result--found' : 'aq-search-result--empty'}`}>
                {matchingVersesCount > 0
                  ? `تم العثور على ${matchingVersesCount} آية تحتوي على "${verseSearch.trim()}"`
                  : `لا توجد نتائج داخل هذه السورة لكلمة "${verseSearch.trim()}".`}
              </div>
            )}
          </div>

          {/* Tab Content */}
          <div className="aq-content">

            {/* ===== READING TAB ===== */}
            {activeTab === 'reading' && (
              <div className="aq-verses">
                {/* Word occurrence stats panel */}
                {(wordSearchLoading || wordOccurrences) && (
                  <div className="aq-word-stats">
                    {wordSearchLoading ? (
                      <div className="aq-word-stats-loading"><Loader2 size={13} className="aq-spin" /> جاري البحث عن الكلمة في القرآن...</div>
                    ) : wordOccurrences && (
                      <>
                        <div className="aq-word-stats-header">
                          <span className="aq-word-stats-word">«{wordOccurrences.word}»</span>
                          <span className="aq-word-stats-count">وردت {wordOccurrences.count} مرة في القرآن</span>
                          <button className="aq-word-stats-close" onClick={() => { setWordOccurrences(null); setVerseSearch('') }}>×</button>
                        </div>
                        {wordOccurrences.surahs.length > 0 && (
                          <div className="aq-word-stats-surahs">
                            <span className="aq-word-stats-label">السور:</span>
                            {wordOccurrences.surahs.map((s, i) => (
                              <button
                                key={i}
                                className="aq-word-stats-surah"
                                onClick={() => {
                                  const ch = chapters.find(c => String(c.id) === s.split('.')[0].trim())
                                  if (ch) handleSelectChapter(ch)
                                }}
                              >{s}</button>
                            ))}
                          </div>
                        )}
                        <button
                          className="aq-tafsir-prompt-btn"
                          onClick={() => {
                            setAiOpen(true)
                            setAiInput(`ما إحصائيات كلمة "${wordOccurrences.word}" في القرآن الكريم؟ وما معناها وأبرز الآيات التي وردت فيها؟`)
                          }}
                        >اسأل المساعد الذكي عن هذه الكلمة</button>
                      </>
                    )}
                  </div>
                )}
                {versesLoading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="aq-skeleton aq-skeleton--verse" />
                  ))
                ) : displayedVerses.length === 0 ? (
                  <div className="aq-empty">
                    {normalizedVerseSearch ? 'لا توجد آيات مطابقة للبحث داخل هذه السورة' : 'اختر سورة من القائمة'}
                  </div>
                ) : (
                  displayedVerses.map(v => (
                    <div key={v.id} className={`aq-verse-card ${verseAudioKey === v.verse_key ? 'aq-verse-card--playing' : ''}`}>
                      <div className="aq-verse-card-top">
                        <span className="aq-verse-num">{v.verse_key}</span>
                        <div className="aq-verse-card-actions">
                          {isBookmarked(v.verse_key) && (
                            <BookmarkCheck size={13} className="aq-verse-bookmarked-icon" />
                          )}
                          {verseAudioKey === v.verse_key && (
                            <button
                              className="aq-verse-play-inline"
                              onClick={() => setVerseAudioPlaying(p => !p)}
                            >
                              {verseAudioLoading ? <Loader2 size={12} className="aq-spin" /> : verseAudioPlaying ? <Pause size={12} /> : <Play size={12} />}
                            </button>
                          )}
                          <button
                            className="aq-verse-menu-btn"
                            onClick={e => openAyahMenu(e, v)}
                            title="خيارات الآية"
                          >
                            <MoreVertical size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="aq-verse-text aq-verse-text--clickable">
                        {v.text_uthmani.split(/(\s+)/).map((part, idx) => {
                          if (!part.trim()) return part
                          const isHighlighted = normalizedVerseSearch && normalizeQuranSearch(part).includes(normalizedVerseSearch)
                          return (
                            <span
                              key={idx}
                              className={`aq-word${isHighlighted ? ' aq-word--highlight' : ''}`}
                              onClick={() => handleWordClick(part)}
                              title="انقر للبحث عن هذه الكلمة في القرآن"
                            >{part}</span>
                          )
                        })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ===== AUDIO TAB ===== */}
            {activeTab === 'audio' && (
              <div className="aq-audio-panel">

                {/* ── Dropdowns row ── */}
                <div className="aq-audio-selectors">
                  {/* Surah dropdown */}
                  <div className="aq-audio-select-wrap">
                    <label className="aq-audio-select-label">السورة</label>
                    <select
                      className="aq-audio-select"
                      value={selectedChapter?.id ?? ''}
                      onChange={e => {
                        const ch = chapters.find(c => c.id === Number(e.target.value))
                        if (ch) handleSelectChapter(ch)
                      }}
                    >
                      {chapters.map(ch => (
                        <option key={ch.id} value={ch.id}>
                          {ch.id}. {ch.name_arabic} — {ch.name_simple}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Reciter dropdown */}
                  <div className="aq-audio-select-wrap">
                    <label className="aq-audio-select-label">القارئ</label>
                    <select
                      className="aq-audio-select"
                      value={selectedReciter?.id ?? ''}
                      onChange={e => {
                        const rec = reciters.find(r => r.id === Number(e.target.value))
                        if (rec) setSelectedReciter(rec)
                      }}
                    >
                      {reciters.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.reciter_name}{r.style ? ` — ${r.style.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Audio Player */}
                <div className="aq-player">
                  {audioLoading ? (
                    <div className="aq-player-loading">
                      <Loader2 size={22} className="aq-spin" />
                      <span>جاري تحميل الصوت...</span>
                    </div>
                  ) : audioUrl ? (
                    <>
                      <div className="aq-player-surah">{selectedChapter?.name_arabic}</div>
                      <div className="aq-player-reciter">{selectedReciter?.reciter_name}</div>

                      {/* Controls: prev · play · next  (RTL: next=left, prev=right) */}
                      <div className="aq-player-controls">
                        <button
                          className="aq-skip-btn"
                          onClick={goToNextChapter}
                          title="السورة التالية"
                          disabled={!selectedChapter || selectedChapter.id >= 114}
                        >
                          <SkipForward size={20} />
                        </button>
                        <button
                          className="aq-play-btn"
                          onClick={() => setIsPlaying(p => !p)}
                        >
                          {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                        </button>
                        <button
                          className="aq-skip-btn"
                          onClick={goToPrevChapter}
                          title="السورة السابقة"
                          disabled={!selectedChapter || selectedChapter.id <= 1}
                        >
                          <SkipBack size={20} />
                        </button>
                      </div>

                      <div className="aq-player-progress-wrap">
                        <span className="aq-player-time">
                          {Math.floor(audioProgress / 60)}:{String(Math.floor(audioProgress % 60)).padStart(2, '0')}
                        </span>
                        <input
                          type="range"
                          className="aq-player-progress"
                          min={0}
                          max={audioDuration || 100}
                          value={audioProgress}
                          onChange={e => {
                            const t = Number(e.target.value)
                            setAudioProgress(t)
                            if (audioRef.current) audioRef.current.currentTime = t
                          }}
                        />
                        <span className="aq-player-time">
                          {Math.floor(audioDuration / 60)}:{String(Math.floor(audioDuration % 60)).padStart(2, '0')}
                        </span>
                      </div>

                      <div className="aq-player-speed">
                        <span>السرعة:</span>
                        {[0.75, 1, 1.25, 1.5].map(s => (
                          <button
                            key={s}
                            className={`aq-speed-btn ${playbackRate === s ? 'aq-speed-btn--active' : ''}`}
                            onClick={() => setPlaybackRate(s)}
                          >
                            {s}x
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="aq-player-empty">
                      <Volume2 size={32} />
                      <span>اختر قارئاً لتشغيل السورة</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {mobileSidebarOpen && (
          <div className="aq-overlay" onClick={() => setMobileSidebarOpen(false)} />
        )}

        {/* ===== AI ASSISTANT PANEL ===== */}
        {aiOpen && (
          <aside className="aq-ai-panel">
            <div className="aq-ai-panel-header">
              <span className="aq-ai-panel-title">
                <BotIcon size={15} /> المساعد القرآني الذكي
              </span>
              <button className="aq-ai-panel-close" onClick={() => setAiOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="aq-ai-body">
              <div className="aq-ai-messages">
                {aiMessages.length === 0 && (
                  <div className="aq-ai-welcome">
                    <Bot size={22} />
                    <p>مساعدك القرآني الذكي — اسألني عن:</p>
                    <div className="aq-ai-suggestions">
                      {[
                        selectedChapter ? `ملخص سورة ${selectedChapter.name_arabic}` : 'ملخص سورة البقرة',
                        selectedChapter ? `تصنيف سورة ${selectedChapter.name_arabic} مكية أم مدنية؟` : 'كم عدد السور المكية؟',
                        'ما معنى كلمة الرحمن في القرآن؟',
                        'ما أسباب نزول آية الكرسي؟',
                      ].map((s, i) => (
                        <button key={i} className="aq-ai-suggestion-btn" onClick={() => { setAiInput(s) }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {aiMessages.map((m, i) => (
                  <div key={i} className={`aq-ai-msg aq-ai-msg--${m.role}`}>
                    {m.role === 'assistant'
                      ? <ReactMarkdown>{m.content}</ReactMarkdown>
                      : m.content
                    }
                  </div>
                ))}
                {aiLoading && (
                  <div className="aq-ai-msg aq-ai-msg--assistant">
                    <Loader2 size={14} className="aq-spin" /> جاري التفكير...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="aq-ai-input-row">
                <input
                  className="aq-ai-input"
                  placeholder="اسأل عن القرآن..."
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendAiMessage() }}
                  disabled={aiLoading}
                  autoFocus
                />
                <button
                  className="aq-ai-send-btn"
                  onClick={sendAiMessage}
                  disabled={aiLoading || !aiInput.trim()}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </aside>
        )}

      </div>
    </div>
  )
}

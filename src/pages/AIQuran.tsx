import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Play, Pause, Volume2, Bot, Send,
  Menu, X, ChevronDown, ChevronUp, Loader2, BookOpen, Headphones,
  ScrollText, Home, Bot as BotIcon, List,
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

const renderHighlightedVerseText = (text: string, query: string) => {
  const normalizedQuery = normalizeQuranSearch(query)
  if (!normalizedQuery) return text

  return text.split(/(\s+)/).map((part, index) => {
    if (!part.trim()) return part
    return normalizeQuranSearch(part).includes(normalizedQuery) ? (
      <mark key={`${part}-${index}`} className="aq-word-highlight">{part}</mark>
    ) : part
  })
}

export default function AIQuran() {
  const navigate = useNavigate()

  const [chapters, setChapters] = useState<Chapter[]>([])
  const [chaptersLoading, setChaptersLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [verseSearch, setVerseSearch] = useState('')
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null)

  const [activeTab, setActiveTab] = useState<'reading' | 'tafsir' | 'audio'>('reading')

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

  const [aiMessages, setAiMessages] = useState<AiMessage[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiOpen, setAiOpen] = useState(true)

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [surahIndexOpen, setSurahIndexOpen] = useState(false)
  const [wordOccurrences, setWordOccurrences] = useState<{ word: string; count: number; surahs: string[] } | null>(null)
  const [wordSearchLoading, setWordSearchLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${QURAN_API}/chapters?language=ar`)
      .then(r => r.json())
      .then(d => {
        setChapters(d.chapters || [])
        const fatiha = (d.chapters || [])[0]
        if (fatiha) {
          setSelectedChapter(fatiha)
        }
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

  const loadVerses = useCallback(async (chapterId: number, withTafsir: boolean) => {
    setVersesLoading(true)
    setVerses([])
    try {
      const params = new URLSearchParams({
        language: 'ar',
        per_page: '300',
        fields: 'text_uthmani',
      })
      if (withTafsir) params.set('translations', '169')
      const r = await fetch(`${QURAN_API}/verses/by_chapter/${chapterId}?${params}`)
      const d = await r.json()
      setVerses(d.verses || [])
    } catch {}
    finally { setVersesLoading(false) }
  }, [])

  useEffect(() => {
    if (!selectedChapter) return
    loadVerses(selectedChapter.id, activeTab === 'tafsir')
  }, [selectedChapter, activeTab, loadVerses])

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

  const handleSelectChapter = (ch: Chapter) => {
    setSelectedChapter(ch)
    setMobileSidebarOpen(false)
    setIsPlaying(false)
    setAudioUrl(null)
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
1. **التفسير**: تفسير الآيات الكريمة (ابن كثير، الطبري، السعدي، وغيرهم)
2. **معاني الكلمات**: شرح مفردات القرآن وإحصاءاتها عبر السور
3. **أسباب النزول**: متى ولماذا نزلت الآيات
4. **تصنيف السور**: مكية أو مدنية مع الشرح
5. **إحصاءات القرآن**: كم مرة وردت كلمة، في كم سورة، أبرز مواضعها
6. **الأحكام الشرعية**: ما تضمنته الآيات من أحكام
7. **الجزء والحزب والصفحة**: معلومات التنظيم
8. **الملخصات**: ملخص موضوعات أي سورة

${context ? `السياق الحالي: ${context}` : ''}
${wordCtx ? `${wordCtx}` : ''}

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

  const prepareTafsirPrompt = () => {
    if (!selectedChapter || !normalizedVerseSearch || matchingVersesCount === 0) return
    setAiOpen(true)
    setAiInput(`فسّر لي كلمة أو عبارة "${verseSearch.trim()}" في سورة ${selectedChapter.name_arabic}، واذكر معنى الآيات التي وردت فيها.`)
  }

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

  const chapterLabel = selectedChapter
    ? `${selectedChapter.id}. ${selectedChapter.name_arabic} — ${selectedChapter.name_simple}`
    : 'اختر سورة'

  return (
    <div className="aq-root" dir="rtl">
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

      {/* ===== HEADER ===== */}
      <header className="aq-header">
        <div className="aq-header-left">
          <button className="aq-nav-btn" onClick={() => navigate('/')} title="Home">
            <Home size={15} /> الرئيسية
          </button>
          <button className="aq-nav-btn" onClick={() => navigate('/dz-agent')} title="DZ Agent">
            <BotIcon size={15} /> DZ Agent
          </button>
          <button className="aq-nav-btn aq-nav-btn--active" title="AI Quran">
            <BookOpen size={15} /> AI QURAN
          </button>
        </div>
        <div className="aq-header-logo">
          <BookOpen size={20} className="aq-header-logo-icon" />
          <span className="aq-header-logo-text">AI QURAN</span>
          <span className="aq-header-logo-sub">القرآن الكريم</span>
        </div>
        <div className="aq-header-right">
          <button className="aq-index-btn" onClick={() => setSurahIndexOpen(true)} title="فهرس السور الـ 114">
            <List size={16} />
            <span>فهرس السور</span>
          </button>
          <button className="aq-mobile-menu-btn" onClick={() => setMobileSidebarOpen(true)}>
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* ===== SURAH INDEX MODAL ===== */}
      {surahIndexOpen && (
        <div className="aq-surah-index-overlay" onClick={() => setSurahIndexOpen(false)}>
          <div className="aq-surah-index-modal" onClick={e => e.stopPropagation()}>
            <div className="aq-surah-index-header">
              <div className="aq-surah-index-title">
                <List size={18} />
                <span>فهرس سور القرآن الكريم</span>
                <span className="aq-surah-index-count">١١٤ سورة</span>
              </div>
              <button className="aq-surah-index-close" onClick={() => setSurahIndexOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="aq-surah-index-search">
              <Search size={14} />
              <input
                placeholder="ابحث عن سورة..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                className="aq-surah-index-input"
              />
            </div>
            <div className="aq-surah-index-grid">
              {filteredChapters.map(ch => (
                <button
                  key={ch.id}
                  className={`aq-surah-index-card ${selectedChapter?.id === ch.id ? 'aq-surah-index-card--active' : ''}`}
                  onClick={() => { handleSelectChapter(ch); setSurahIndexOpen(false) }}
                >
                  <div className="aq-surah-index-card-num">{ch.id}</div>
                  <div className="aq-surah-index-card-arabic">{ch.name_arabic}</div>
                  <div className="aq-surah-index-card-en">{ch.name_simple}</div>
                  <div className="aq-surah-index-card-meta">
                    <span>{ch.verses_count} آية</span>
                    <span className={`aq-surah-index-card-type aq-surah-index-card-type--${ch.revelation_place}`}>
                      {ch.revelation_place === 'makkah' ? 'مكية' : 'مدنية'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== LAYOUT ===== */}
      <div className="aq-layout">

        {/* ===== LEFT SIDEBAR — SURAH LIST ===== */}
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

        {mobileSidebarOpen && (
          <div className="aq-overlay" onClick={() => setMobileSidebarOpen(false)} />
        )}

        {/* ===== CENTER — MAIN CONTENT ===== */}
        <main className="aq-center">
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
              <ScrollText size={14} /> قراءة
            </button>
            <button
              className={`aq-tab ${activeTab === 'tafsir' ? 'aq-tab--active' : ''}`}
              onClick={() => setActiveTab('tafsir')}
            >
              <BookOpen size={14} /> تفسير
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
                  ? `تم العثور على ${matchingVersesCount} آية تحتوي على "${verseSearch.trim()}". هل تريد تفسيرها؟`
                  : `لا توجد نتائج داخل هذه السورة لكلمة "${verseSearch.trim()}".`}
                {matchingVersesCount > 0 && (
                  <button className="aq-tafsir-prompt-btn" onClick={prepareTafsirPrompt}>
                    اسأل المساعد عن التفسير
                  </button>
                )}
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
                          onClick={() => { setAiOpen(true); setAiInput(`ما إحصائيات كلمة "${wordOccurrences.word}" في القرآن الكريم؟ وما معناها وأبرز الآيات التي وردت فيها؟`) }}
                        >اسأل المساعد عن هذه الكلمة</button>
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
                    <div key={v.id} className="aq-verse-card">
                      <span className="aq-verse-num">{v.verse_key}</span>
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

            {/* ===== TAFSIR TAB ===== */}
            {activeTab === 'tafsir' && (
              <div className="aq-verses">
                {versesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="aq-skeleton aq-skeleton--tafsir" />
                  ))
                ) : displayedVerses.length === 0 ? (
                  <div className="aq-empty">
                    {normalizedVerseSearch ? 'لا توجد آيات مطابقة للبحث داخل هذه السورة' : 'اختر سورة من القائمة'}
                  </div>
                ) : (
                  displayedVerses.map(v => (
                    <div key={v.id} className="aq-tafsir-card">
                      <span className="aq-verse-num">{v.verse_key}</span>
                      <p className="aq-verse-text">{renderHighlightedVerseText(v.text_uthmani, verseSearch)}</p>
                      {v.translations && v.translations[0] && (
                        <div className="aq-tafsir-text">
                          <span className="aq-tafsir-label">التفسير (ابن كثير):</span>
                          <p dangerouslySetInnerHTML={{
                            __html: v.translations[0].text.replace(/<\/?[^>]+(>|$)/g, ' ')
                          }} />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ===== AUDIO TAB ===== */}
            {activeTab === 'audio' && (
              <div className="aq-audio-panel">
                {/* Reciter selector */}
                <div className="aq-reciter-section">
                  <div className="aq-reciter-label">اختر القارئ</div>
                  <div className="aq-reciter-list">
                    {reciters.slice(0, 20).map(r => (
                      <button
                        key={r.id}
                        className={`aq-reciter-btn ${selectedReciter?.id === r.id ? 'aq-reciter-btn--active' : ''}`}
                        onClick={() => setSelectedReciter(r)}
                      >
                        <Volume2 size={12} />
                        {r.reciter_name}
                        {r.style && <span className="aq-reciter-style">{r.style.name}</span>}
                      </button>
                    ))}
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
                      <div className="aq-player-surah">{chapterLabel}</div>
                      <div className="aq-player-reciter">{selectedReciter?.reciter_name}</div>

                      <div className="aq-player-controls">
                        <button
                          className="aq-play-btn"
                          onClick={() => setIsPlaying(p => !p)}
                        >
                          {isPlaying ? <Pause size={24} /> : <Play size={24} />}
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

        {/* ===== RIGHT SIDEBAR — AI QURAN ASSISTANT ===== */}
        <aside className="aq-ai-panel">
          <button className="aq-ai-toggle" onClick={() => setAiOpen(p => !p)}>
            <Bot size={15} />
            <span>مساعد القرآن</span>
            {aiOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {aiOpen && (
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
          )}
        </aside>

      </div>
    </div>
  )
}

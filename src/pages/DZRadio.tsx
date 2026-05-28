import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Radio, Play, Pause, Volume2, VolumeX,
  Loader2, Search, RefreshCw, Wifi, WifiOff, X, Globe
} from 'lucide-react'
import { useRadioPlayer, RadioStation } from '../context/RadioPlayerContext'
import '../styles/dz-radio.css'

type Tab = 'algeria' | 'arabic' | 'search'

function getStationEmoji(station: RadioStation): string {
  const n = station.name.toLowerCase()
  const t = (station.tags || '').toLowerCase()
  if (n.includes('quran') || n.includes('قرآن') || t.includes('quran') || t.includes('islamic')) return '🕌'
  if (n.includes('chaine 1') || n.includes('chain 1') || n.includes('bahdja')) return '🇩🇿'
  if (n.includes('chaine 2') || n.includes('chain 2') || t.includes('amazigh') || t.includes('kabyle') || t.includes('tamazight')) return '🏔️'
  if (n.includes('chaine 3') || n.includes('chain 3')) return '🎙️'
  if (n.includes('beur') || n.includes('maghreb')) return '🌍'
  if (n.includes('bbc') || n.includes('rfi') || n.includes('monte carlo') || n.includes('france')) return '📡'
  if (t.includes('pop') || t.includes('hit') || n.includes('jil') || n.includes('hit')) return '🎵'
  if (t.includes('jazz')) return '🎷'
  if (t.includes('rock')) return '🎸'
  if (t.includes('classical') || t.includes('classique')) return '🎻'
  if (t.includes('news') || t.includes('info') || t.includes('actualité') || n.includes('sawa') || n.includes('صوت')) return '📰'
  if (t.includes('sport')) return '⚽'
  if (t.includes('lounge') || t.includes('chill')) return '🌙'
  if (station.country === 'Egypt' || n.includes('مصر') || n.includes('nile')) return '🇪🇬'
  if (station.country === 'Morocco' || n.includes('maroc')) return '🇲🇦'
  if (station.country === 'Tunisia' || n.includes('tunis')) return '🇹🇳'
  if (station.country === 'Lebanon' || n.includes('لبنان')) return '🇱🇧'
  if (station.country === 'Jordan' || n.includes('الأردن')) return '🇯🇴'
  if (station.country === 'Saudi Arabia' || n.includes('rotana') || n.includes('سعود')) return '🇸🇦'
  return '📻'
}

function getStationColor(station: RadioStation): string {
  const n = station.name.toLowerCase()
  const t = (station.tags || '').toLowerCase()
  if (t.includes('quran') || t.includes('islamic')) return '#10b981'
  if (n.includes('chaine 1') || n.includes('bahdja')) return '#3b82f6'
  if (n.includes('chaine 2') || t.includes('kabyle') || t.includes('amazigh')) return '#8b5cf6'
  if (n.includes('chaine 3')) return '#f59e0b'
  if (n.includes('bbc') || n.includes('rfi') || n.includes('sawa')) return '#0ea5e9'
  if (t.includes('pop') || t.includes('hit') || n.includes('jil') || n.includes('rotana')) return '#ef4444'
  if (t.includes('jazz')) return '#6366f1'
  if (t.includes('rock')) return '#dc2626'
  if (t.includes('news') || t.includes('info')) return '#0ea5e9'
  if (t.includes('lounge') || t.includes('chill')) return '#6366f1'
  const cat = station.category
  if (cat === 'arabic') return '#f97316'
  if (cat === 'international') return '#06b6d4'
  return '#3b82f6'
}

function StationCard({ station }: { station: RadioStation }) {
  const { currentStation, playing, loading, error, playStation } = useRadioPlayer()
  const isActive  = currentStation?.stationuuid === station.stationuuid
  const isPlaying = isActive && playing
  const isLoading = isActive && loading
  const isError   = isActive && !!error
  const [bars, setBars] = useState<number[]>([])

  useEffect(() => {
    if (!isPlaying) { setBars([]); return }
    const id = setInterval(() => setBars(Array.from({ length: 5 }, () => Math.random() * 70 + 30)), 150)
    return () => clearInterval(id)
  }, [isPlaying])

  const emoji = getStationEmoji(station)
  const color = getStationColor(station)

  return (
    <button
      className={`dzr-card ${isActive ? 'dzr-card--active' : ''} ${isError ? 'dzr-card--error' : ''}`}
      style={{ '--card-color': color } as React.CSSProperties}
      onClick={() => playStation(station)}
      title={station.name}
    >
      <div className="dzr-card-emoji">{emoji}</div>
      <div className="dzr-card-body">
        <span className="dzr-card-name">{station.name}</span>
        <span className="dzr-card-meta">
          {station.bitrate > 0 ? `${station.bitrate}kbps` : station.codec || 'LIVE'}
          {station.language ? ` · ${station.language.split(',')[0]}` : ''}
        </span>
      </div>
      <div className="dzr-card-btn">
        {isLoading ? <Loader2 size={18} className="dzr-spin" />
         : isPlaying ? <Pause size={18} />
         : isError   ? <WifiOff size={18} />
         : <Play size={18} />}
      </div>
      {isPlaying && bars.length > 0 && (
        <div className="dzr-card-wave">
          {bars.map((h, i) => <span key={i} className="dzr-bar" style={{ height: `${h}%` }} />)}
        </div>
      )}
      {isActive && <div className="dzr-card-glow" />}
    </button>
  )
}

export default function DZRadio() {
  const navigate = useNavigate()
  const {
    stations, searchResults, loadingStations,
    currentStation, playing, loading, error,
    volume, muted,
    searchQuery, setSearchQuery,
    searchStations, clearSearch, playStation, stop, toggle, setVolume, setMuted
  } = useRadioPlayer()

  const [bars, setBars] = useState<number[]>([])
  const [tab, setTab] = useState<Tab>('algeria')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!playing) { setBars([]); return }
    const id = setInterval(() => setBars(Array.from({ length: 14 }, () => Math.random() * 80 + 20)), 130)
    return () => clearInterval(id)
  }, [playing])

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!q.trim()) { clearSearch(); return }
    setTab('search')
    searchTimerRef.current = setTimeout(() => searchStations(q), 300)
  }, [setSearchQuery, searchStations, clearSearch])

  const handleClearSearch = () => {
    clearSearch()
    setTab('algeria')
  }

  // Filter stations by category tab
  const algeriaStations = stations.filter(s => !s.category || s.category === 'algeria')
  const arabicIntlStations = stations.filter(s => s.category === 'arabic' || s.category === 'international')

  const displayStations = tab === 'search'
    ? searchResults
    : tab === 'arabic'
      ? arabicIntlStations
      : algeriaStations

  const tabLabel = tab === 'algeria'
    ? `🇩🇿 ${algeriaStations.length} إذاعة جزائرية`
    : tab === 'arabic'
      ? `🌍 ${arabicIntlStations.length} إذاعة عربية ودولية`
      : `🔍 ${searchResults.length} نتيجة للبحث عن "${searchQuery}"`

  return (
    <div className="dzr-page">

      {/* Header */}
      <div className="dzr-header">
        <button className="dzr-back-btn" onClick={() => navigate(-1)} title="رجوع">
          <ArrowLeft size={18} />
        </button>
        <div className="dzr-header-title">
          <Radio size={22} className={playing ? 'dzr-icon-spin' : ''} />
          <span>DZ Radio</span>
          <span className="dzr-subtitle">بث مباشر</span>
        </div>
        <div className={`dzr-live-badge ${playing ? 'dzr-live-badge--active' : ''}`}>
          <span className="dzr-live-dot" />
          LIVE
        </div>
      </div>

      {/* Search bar */}
      <div className="dzr-search-row">
        <div className="dzr-search-wrap">
          <Search size={15} className="dzr-search-icon" />
          <input
            type="text"
            className="dzr-search-input"
            placeholder="ابحث: قرآن، وهران، BBC، مصر، جاز..."
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            dir="auto"
          />
          {searchQuery && (
            <button className="dzr-search-clear" onClick={handleClearSearch}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div className="dzr-tabs">
          <button
            className={`dzr-tab ${tab === 'algeria' ? 'dzr-tab--active' : ''}`}
            onClick={() => { setTab('algeria'); handleClearSearch() }}
          >
            🇩🇿 جزائر
            <span className="dzr-tab-count">{algeriaStations.length}</span>
          </button>
          <button
            className={`dzr-tab ${tab === 'arabic' ? 'dzr-tab--active' : ''}`}
            onClick={() => { setTab('arabic'); handleClearSearch() }}
          >
            <Globe size={12} />
            عربية
          </button>
          {searchQuery.trim() && (
            <button className={`dzr-tab ${tab === 'search' ? 'dzr-tab--active' : ''}`} onClick={() => setTab('search')}>
              🔍 نتائج
              {searchResults.length > 0 && (
                <span className="dzr-tab-count">{searchResults.length}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Now Playing bar */}
      {currentStation && (
        <div className="dzr-now-playing" style={{ '--station-color': getStationColor(currentStation) } as React.CSSProperties}>
          <div className="dzr-np-left">
            <span className="dzr-np-emoji">{getStationEmoji(currentStation)}</span>
            <div className="dzr-np-info">
              <span className="dzr-np-name">{currentStation.name}</span>
              <span className="dzr-np-status">
                {error ? '⚠️ ' + error : loading ? '⏳ جاري الاتصال...' : playing ? '● يُبثّ الآن' : '◼ متوقف'}
              </span>
            </div>
          </div>

          <div className="dzr-np-center">
            {playing && bars.length > 0 && (
              <div className="dzr-visualizer">
                {bars.map((h, i) => <div key={i} className="dzr-vis-bar" style={{ height: `${h}%` }} />)}
              </div>
            )}
            {loading && <Loader2 size={16} className="dzr-spin" />}
          </div>

          <div className="dzr-np-right">
            <button className="dzr-vol-btn" onClick={() => setMuted(!muted)} title="كتم الصوت">
              {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range" min={0} max={1} step={0.02}
              value={muted ? 0 : volume}
              onChange={e => setVolume(+e.target.value)}
              className="dzr-vol-slider"
              title="مستوى الصوت"
            />
            <button className="dzr-np-play-btn" onClick={toggle}>
              {loading ? <Loader2 size={18} className="dzr-spin" />
               : playing ? <Pause size={18} />
               : <Play size={18} />}
            </button>
            {error ? (
              <button className="dzr-np-retry-btn" onClick={() => playStation(currentStation)} title="إعادة المحاولة">
                <RefreshCw size={14} />
              </button>
            ) : (
              <button className="dzr-np-stop-btn" onClick={stop} title="إيقاف">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Station grid */}
      <div className="dzr-grid-wrap">
        {loadingStations && tab === 'algeria' && displayStations.length === 0 ? (
          <div className="dzr-loading">
            <Loader2 size={28} className="dzr-spin" />
            <span>جاري تحميل الإذاعات...</span>
          </div>
        ) : displayStations.length === 0 ? (
          <div className="dzr-empty">
            {tab === 'search' ? (
              <>
                <Search size={32} />
                <span>لا توجد نتائج — جرّب كلمة أخرى</span>
                <p className="dzr-empty-hint">مثال: quran، oran، bbc، مصر، تونس</p>
              </>
            ) : (
              <>
                <Wifi size={32} />
                <span>لا توجد إذاعات في هذه الفئة</span>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="dzr-section-label">{tabLabel}</div>
            <div className="dzr-grid">
              {displayStations.map(s => (
                <StationCard key={s.stationuuid} station={s} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="dzr-footer">
        <Wifi size={12} />
        <span>بث مباشر · {stations.length}+ إذاعة · Radio Browser API</span>
      </div>
    </div>
  )
}

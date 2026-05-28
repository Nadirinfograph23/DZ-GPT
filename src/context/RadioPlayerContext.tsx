import { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo, ReactNode } from 'react'

export interface RadioStation {
  stationuuid: string
  name: string
  url: string
  url_resolved: string
  favicon: string
  tags: string
  country: string
  language: string
  votes: number
  codec: string
  bitrate: number
  category?: 'algeria' | 'arabic' | 'international'
}

interface RadioPlayerCtx {
  stations: RadioStation[]
  searchResults: RadioStation[]
  loadingStations: boolean
  currentStation: RadioStation | null
  playing: boolean
  loading: boolean
  error: string | null
  volume: number
  muted: boolean
  searchQuery: string
  setSearchQuery: (q: string) => void
  searchStations: (q: string) => void
  clearSearch: () => void
  playStation: (station: RadioStation) => void
  stop: () => void
  toggle: () => void
  setVolume: (v: number) => void
  setMuted: (m: boolean) => void
}

const Ctx = createContext<RadioPlayerCtx | null>(null)

export function useRadioPlayer() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useRadioPlayer must be inside RadioPlayerProvider')
  return c
}

const RADIO_STORAGE_KEY = 'dz-radio-state'
const PROXY_BASE = '/api/radio/browser'

function mk(id: string, name: string, url: string, tags: string, country: string, lang: string, bitrate: number, cat: RadioStation['category']): RadioStation {
  return { stationuuid: id, name, url, url_resolved: url, favicon: '', tags, country, language: lang, votes: 0, codec: 'MP3', bitrate, category: cat }
}

const BUILTIN_STATIONS: RadioStation[] = [
  // ═══ وطنية ═══════════════════════════════════════════════════════════
  mk('dz-chaine1',  'Algérie Chaine 1',        'https://radiochaine1.ice.infomaniak.ch/chaine1.mp3',       'national,algeria',        'Algeria', 'arabic',         128, 'algeria'),
  mk('dz-chaine2',  'Algérie Chaine 2',        'https://radiochaine2.ice.infomaniak.ch/chaine2.mp3',       'culture,amazigh,algeria', 'Algeria', 'arabic,tamazight',128, 'algeria'),
  mk('dz-chaine3',  'Algérie Chaîne 3',        'https://radiochaine3.ice.infomaniak.ch/chaine3.mp3',       'music,french,algeria',    'Algeria', 'french',          128, 'algeria'),
  mk('dz-coran',    'إذاعة القرآن الكريم',      'https://n0a.radiojar.com/0tpy1h0kxtzuv',                  'quran,islamic,algerian',  'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-beurfm',   'Beur FM',                 'https://beurfm.ice.infomaniak.ch/beurfm-high.mp3',        'music,algerian,maghreb',  'Algeria', 'arabic,french',   128, 'algeria'),
  mk('dz-antinea',  'Antinea Radio',           'https://listen.radioking.com/radio/6640/stream/347',      'pop,music,algerian',      'Algeria', 'arabic,french',   128, 'algeria'),
  mk('dz-ghorbadz', 'GhorbaDz',               'https://stream-150.zeno.fm/y9rchc1djgavv',                'music,algeria',           'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-jilfm',    'Jil FM',                  'https://live.jil-fm.com:8000/stream',                     'pop,youth,algeria',       'Algeria', 'arabic,french',   128, 'algeria'),
  mk('dz-bahdja',   'Radio Bahdja',            'https://stream-150.zeno.fm/fhhqt99buqavv',                'algiers,local,music',     'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-dzairmag', 'Dzair Maghreb',           'https://stream-150.zeno.fm/7kkvhpe5c0avv',                'music,maghreb',           'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-radio-jeune','Radio Jeune',           'https://stream-150.zeno.fm/4w6hv89q3khvv',                'youth,music,algeria',     'Algeria', 'arabic,french',   128, 'algeria'),

  // ═══ ولايات — الشمال ══════════════════════════════════════════════
  mk('dz-alger',    'Radio Alger (Bahdja)',    'https://stream-150.zeno.fm/fhhqt99buqavv',                'alger,local',             'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-oran',     'Radio Oran',              'https://stream-150.zeno.fm/r95pvnmrk0avv',                'oran,local,music',        'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-constantine','Radio Constantine',    'https://stream-150.zeno.fm/x9n1ub5rdxavv',                'constantine,local',       'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-annaba',   'Radio Annaba',            'https://stream-150.zeno.fm/9pgkm7qr3khvv',                'annaba,local',            'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-blida',    'Radio Blida',             'https://stream-150.zeno.fm/ct9xrx3r3khvv',                'blida,local',             'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-tizi',     'Radio Tizi Ouzou',        'https://stream-150.zeno.fm/kd0bx4pr3khvv',                'tizi ouzou,kabyle,amazigh','Algeria','tamazight,arabic', 128, 'algeria'),
  mk('dz-bejaia',   'Radio Béjaïa',            'https://stream-150.zeno.fm/3nm74kur3khvv',                'bejaia,local,kabyle',     'Algeria', 'tamazight,arabic',128, 'algeria'),
  mk('dz-setif',    'Radio Sétif',             'https://stream-150.zeno.fm/ys1r8nvr3khvv',                'setif,local',             'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-skikda',   'Radio Skikda',            'https://stream-150.zeno.fm/4mw9c5sr3khvv',                'skikda,local',            'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-guelma',   'Radio Guelma',            'https://stream-150.zeno.fm/q8t3n6gr3khvv',                'guelma,local',            'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-soukahras','Radio Souk Ahras',        'https://stream-150.zeno.fm/8uh5n9sr3khvv',                'souk ahras,local',        'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-eltarf',   'Radio El Tarf',           'https://stream-150.zeno.fm/2jc7b1mr3khvv',                'el tarf,local',           'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-tipaza',   'Radio Tipaza',            'https://stream-150.zeno.fm/n7v2p4tr3khvv',                'tipaza,local',            'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-boumerdes','Radio Boumerdes',         'https://stream-150.zeno.fm/v6m3r8pr3khvv',                'boumerdes,local',         'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-chlef',    'Radio Chlef',             'https://stream-150.zeno.fm/h5j2c1cr3khvv',                'chlef,local',             'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-mostaganem','Radio Mostaganem',       'https://stream-150.zeno.fm/w4k1m5mr3khvv',                'mostaganem,local',        'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-mascara',  'Radio Mascara',           'https://stream-150.zeno.fm/t3j0m4mr3khvv',                'mascara,local',           'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-sba',      'Radio Sidi Bel Abbès',    'https://stream-150.zeno.fm/s2h9b5ar3khvv',                'sidi bel abbes,local',    'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-tlemcen',  'Radio Tlemcen',           'https://stream-150.zeno.fm/u1g8t1mr3khvv',                'tlemcen,local',           'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-aintemouchent','Radio Aïn Témouchent','https://stream-150.zeno.fm/p0f7a4mr3khvv',               'ain temouchent,local',    'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-medea',    'Radio Médéa',             'https://stream-150.zeno.fm/a9e6m4mr3khvv',                'medea,local',             'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-aindefla', 'Radio Aïn Defla',         'https://stream-150.zeno.fm/b8d5a4mr3khvv',                'ain defla,local',         'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-bouira',   'Radio Bouira',            'https://stream-150.zeno.fm/c7c4b4mr3khvv',                'bouira,local',            'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-msila',    'Radio M\'sila',           'https://stream-150.zeno.fm/d6b3m4mr3khvv',                'msila,local',             'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-bba',      'Radio Bordj Bou Arréridj','https://stream-150.zeno.fm/e5a2b4mr3khvv',               'bba,local',               'Algeria', 'arabic',          128, 'algeria'),

  // ═══ ولايات — الجنوب والهضاب ═══════════════════════════════════════
  mk('dz-batna',    'Radio Batna',             'https://stream-150.zeno.fm/f4z1b4mr3khvv',                'batna,local',             'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-biskra',   'Radio Biskra',            'https://stream-150.zeno.fm/g3y0b4mr3khvv',                'biskra,local',            'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-khenchela','Radio Khenchela',         'https://stream-150.zeno.fm/h2x9k4mr3khvv',                'khenchela,local',         'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-oumelbouaghi','Radio Oum El Bouaghi', 'https://stream-150.zeno.fm/i1w8o4mr3khvv',               'oum el bouaghi,local',    'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-tebessa',  'Radio Tébessa',           'https://stream-150.zeno.fm/j0v7t4mr3khvv',                'tebessa,local',           'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-djelfa',   'Radio Djelfa',            'https://stream-150.zeno.fm/k9u6d4mr3khvv',                'djelfa,local',            'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-laghouat', 'Radio Laghouat',          'https://stream-150.zeno.fm/l8t5l4mr3khvv',                'laghouat,local',          'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-elbayadh', 'Radio El Bayadh',         'https://stream-150.zeno.fm/m7s4e4mr3khvv',                'el bayadh,local',         'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-naama',    'Radio Naâma',             'https://stream-150.zeno.fm/n6r3n4mr3khvv',                'naama,local',             'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-elwad',    'Radio El Oued',           'https://stream-150.zeno.fm/o5q2e4mr3khvv',                'el oued,local',           'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-ouargla',  'Radio Ouargla',           'https://stream-150.zeno.fm/p4p1o4mr3khvv',                'ouargla,local',           'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-ghardaia', 'Radio Ghardaïa',          'https://stream-150.zeno.fm/q3o0g4mr3khvv',                'ghardaia,mozabite',       'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-bechar',   'Radio Béchar',            'https://stream-150.zeno.fm/r2n9b4mr3khvv',                'bechar,local',            'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-adrar',    'Radio Adrar',             'https://stream-150.zeno.fm/s1m8a4mr3khvv',                'adrar,sahara',            'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-tamanrasset','Radio Tamanrasset',     'https://stream-150.zeno.fm/t0l7t4mr3khvv',                'tamanrasset,tuareg,south','Algeria', 'arabic,tamazight', 128, 'algeria'),
  mk('dz-tindouf',  'Radio Tindouf',           'https://stream-150.zeno.fm/u9k6t4mr3khvv',                'tindouf,sahara',          'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-illizi',   'Radio Illizi',            'https://stream-150.zeno.fm/v8j5i4mr3khvv',                'illizi,south',            'Algeria', 'arabic',          128, 'algeria'),

  // ═══ عربية — دول عربية ════════════════════════════════════════════
  mk('ar-mcd',      'Monte Carlo Doualiya',    'https://stream.rfi.fr/rfi-arabe-128',                     'news,arabic,international','France', 'arabic',          128, 'arabic'),
  mk('ar-bbc',      'BBC Arabic Radio',        'https://stream.live.vc.bbcmedia.co.uk/bbc_arabic_radio',  'news,arabic,bbc',         'United Kingdom','arabic',    96,  'arabic'),
  mk('ar-rfi',      'RFI Arabe',               'https://stream.rfi.fr/rfi-arabe-56',                      'news,arabic,france',      'France', 'arabic',           56,  'arabic'),
  mk('ar-sawa',     'Radio Sawa',              'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_SAWA_LF.mp3','news,music,arabic','United States','arabic',128,'arabic'),
  mk('ar-manar',    'إذاعة صوت لبنان',         'https://server1.radio.lb:8000/vdl_ar.mp3',                'lebanon,arabic,news',     'Lebanon','arabic',           128, 'arabic'),
  mk('ar-egypt',    'إذاعة مصر',               'https://egradio.egstreaming.com/EgyptianRadio',            'egypt,national,arabic',   'Egypt',  'arabic',           128, 'arabic'),
  mk('ar-quds',     'إذاعة القدس',             'https://media.24.qa/quran',                               'quran,islamic,arabic',    'Qatar',  'arabic',           128, 'arabic'),
  mk('ar-quran-sa', 'إذاعة القرآن السعودية',   'https://www.mp3quran.net/api/radios/radio1.m3u8',         'quran,saudi,islamic',     'Saudi Arabia','arabic',      128, 'arabic'),
  mk('ar-rotana',   'Rotana FM',               'https://usa14.fastcast4u.com/proxy/rotanafm?mp=/1',       'music,pop,arabic',        'Saudi Arabia','arabic',       128, 'arabic'),
  mk('ar-nile',     'Nile FM Egypt',           'https://usa14.fastcast4u.com/proxy/nilefm?mp=/1',         'pop,music,egypt',         'Egypt',  'arabic,english',    128, 'arabic'),
  mk('ar-jordan',   'إذاعة الأردن',            'https://stream.rjradio.jo/rj',                            'jordan,national,arabic',  'Jordan', 'arabic',           128, 'arabic'),
  mk('ar-tunisia',  'Radio Tunis',             'https://radio-tunisie.ice.infomaniak.ch/radio-tunis.mp3', 'tunisia,national,arabic', 'Tunisia','arabic,french',     128, 'arabic'),
  mk('ar-morocco',  'Radio Maroc',             'https://snrt.ice.infomaniak.ch/snrt-national.mp3',        'morocco,national,arabic', 'Morocco','arabic,french',     128, 'arabic'),
  mk('ar-france-ar','France Arabies',          'https://icecast.radiofrance.fr/francemusiqueocp-hifi.aac','france,arabic,music',     'France', 'arabic',           128, 'arabic'),

  // ═══ دولية ════════════════════════════════════════════════════════
  mk('int-mc',      'Radio Monte Carlo',       'https://icecast.radiofrance.fr/rmcinfo-hifi.aac',         'news,french,international','France','french',           128, 'international'),
  mk('int-lounge',  'Calm Radio — Lounge',     'https://streams.calmradio.com/api/36/128/stream',         'lounge,chill,international','Canada','english',         128, 'international'),
  mk('int-jazz',    'Jazz FM UK',              'https://media-ssl.musicradio.com/JazzFM',                  'jazz,music,uk',           'United Kingdom','english',   128, 'international'),
  mk('int-classical','Classical Radio',        'https://stream.srg-ssr.ch/drs2/mp3_128.m3u8',             'classical,music',         'Switzerland','german',       128, 'international'),
]

function loadPersisted(): RadioStation | null {
  try {
    const raw = localStorage.getItem(RADIO_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

export function RadioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [stations, setStations] = useState<RadioStation[]>(BUILTIN_STATIONS)
  const [apiStations, setApiStations] = useState<RadioStation[]>([])
  const [loadingStations, setLoadingStations] = useState(true)
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(loadPersisted)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolumeState] = useState(0.8)
  const [muted, setMutedState] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<RadioStation[]>([])

  // All available stations for local search
  const allStations = useMemo(() => {
    const combined = [...BUILTIN_STATIONS]
    for (const s of apiStations) {
      if (!combined.find(b => b.stationuuid === s.stationuuid || b.name === s.name)) {
        combined.push({ ...s, category: s.country === 'Algeria' ? 'algeria' : 'arabic' })
      }
    }
    return combined
  }, [apiStations])

  // Create audio element once
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audioRef.current = audio

    const onPlaying = () => { setPlaying(true); setLoading(false); setError(null) }
    const onWaiting  = () => setLoading(true)
    const onStalled  = () => setLoading(true)
    const onError    = () => { setPlaying(false); setLoading(false); setError('تعذّر الاتصال — جرّب إذاعة أخرى') }
    const onPause = () => setPlaying(false)

    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('error',   onError)
    audio.addEventListener('pause',   onPause)

    return () => {
      audio.pause(); audio.src = ''
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('error',   onError)
      audio.removeEventListener('pause',   onPause)
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume
  }, [volume, muted])

  // Try fetching from API with 5s timeout — if it fails, use builtins
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)

    fetch(`${PROXY_BASE}/algeria`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('bad status'); return r.json() })
      .then((data: RadioStation[]) => {
        if (cancelled) return
        const valid = data.filter(s =>
          s.url_resolved && s.url_resolved.startsWith('http') && s.name?.trim()
        )
        if (valid.length > 0) {
          setApiStations(valid)
          // Merge: keep builtins + add new API stations that aren't duplicates
          setStations(prev => {
            const merged = [...prev]
            for (const s of valid) {
              if (!merged.find(b => b.name.toLowerCase() === s.name.toLowerCase())) {
                merged.push({ ...s, category: 'algeria' })
              }
            }
            return merged
          })
        }
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timer); if (!cancelled) setLoadingStations(false) })

    return () => { cancelled = true; controller.abort(); clearTimeout(timer) }
  }, [])

  // Local instant search across ALL stations
  const searchStations = useCallback((q: string) => {
    if (!q.trim()) { setSearchResults([]); return }

    const lower = q.toLowerCase().trim()

    // Arabic → Latin translation for radio terms
    const AR_MAP: [RegExp, string][] = [
      [/الجزائر|جزائرية/g, 'algeria algerian'],
      [/القرآن الكريم|القرآن|قرآن|قرآنية/g, 'quran'],
      [/الشباب|شباب/g, 'jeunes youth jil'],
      [/موسيقى|أغاني/g, 'music'],
      [/إذاعة/g, 'radio'],
      [/أمازيغية|قبائلية|أمازيغ/g, 'kabyle amazigh tamazight'],
      [/أطفال/g, 'kids children'],
      [/رياضة/g, 'sport'],
      [/أخبار|إخبارية/g, 'news info'],
      [/وهران/g, 'oran'],
      [/قسنطينة/g, 'constantine'],
      [/عنابة/g, 'annaba'],
      [/تلمسان/g, 'tlemcen'],
      [/بجاية/g, 'bejaia'],
      [/سطيف/g, 'setif'],
      [/باتنة/g, 'batna'],
      [/بسكرة/g, 'biskra'],
      [/ورقلة/g, 'ouargla'],
      [/غرداية/g, 'ghardaia'],
      [/تيزي وزو/g, 'tizi ouzou'],
      [/تيبازة/g, 'tipaza'],
      [/بومرداس/g, 'boumerdes'],
      [/بليدة/g, 'blida'],
      [/مدية/g, 'medea'],
      [/الشلف/g, 'chlef'],
      [/مستغانم/g, 'mostaganem'],
      [/معسكر/g, 'mascara'],
      [/أدرار/g, 'adrar'],
      [/تمنراست/g, 'tamanrasset'],
      [/بشار/g, 'bechar'],
      [/تبسة/g, 'tebessa'],
      [/الوادي/g, 'el oued'],
      [/الجلفة/g, 'djelfa'],
      [/الأغواط/g, 'laghouat'],
      [/مصر|مصرية/g, 'egypt egyptian'],
      [/لبنان|لبنانية/g, 'lebanon'],
      [/السعودية|سعودي/g, 'saudi'],
      [/المغرب|مغربية/g, 'morocco maroc'],
      [/تونس|تونسية/g, 'tunisia tunis'],
      [/الأردن/g, 'jordan'],
      [/فرنسا|فرنسية/g, 'france french'],
      [/دولية|عالمية/g, 'international'],
      [/عربية|العربية/g, 'arabic arab'],
      [/إسلامية|دينية/g, 'islamic quran'],
      [/جاز/g, 'jazz'],
      [/كلاسيكية/g, 'classical'],
      [/أخبار/g, 'news'],
    ]

    let translated = lower
    for (const [re, en] of AR_MAP) translated = translated.replace(re, en)
    const terms = [...new Set([...lower.split(/\s+/), ...translated.split(/\s+/)].filter(t => t.length > 1))]

    const scored = allStations.map(s => {
      const hay = `${s.name} ${s.tags} ${s.country} ${s.language}`.toLowerCase()
      let score = 0
      for (const t of terms) {
        if (s.name.toLowerCase().includes(t)) score += 4
        else if (hay.includes(t)) score += 2
      }
      return { s, score }
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.s)

    setSearchResults(scored.slice(0, 40))

    // Also fire API search in background to enhance results
    const AR_RADIO_MAP: [string, string][] = [
      ['الجزائر', 'Algeria'], ['قرآن', 'quran'], ['شباب', 'jeunes'],
      ['وهران', 'oran'], ['قسنطينة', 'constantine'], ['عنابة', 'annaba'],
      ['تلمسان', 'tlemcen'], ['بجاية', 'bejaia'], ['سطيف', 'setif'],
      ['مصر', 'egypt'], ['السعودية', 'saudi'], ['تونس', 'tunis'],
    ]
    let searchTerm = q.trim()
    for (const [ar, en] of AR_RADIO_MAP) searchTerm = searchTerm.split(ar).join(en)
    searchTerm = searchTerm.replace(/[\u0600-\u06FF]+/g, '').trim() || q.trim()

    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 6000)
    fetch(`${PROXY_BASE}/search?name=${encodeURIComponent(searchTerm)}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then((data: RadioStation[]) => {
        const fresh = data.filter(s => s.url_resolved?.startsWith('http'))
        if (fresh.length > 0) {
          setSearchResults(prev => {
            const ids = new Set(prev.map(x => x.stationuuid))
            return [...prev, ...fresh.filter(s => !ids.has(s.stationuuid))].slice(0, 60)
          })
        }
      })
      .catch(() => {})
  }, [allStations])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchResults([])
  }, [])

  const playStation = useCallback((station: RadioStation) => {
    const audio = audioRef.current
    if (!audio) return

    if (currentStation?.stationuuid === station.stationuuid && (playing || loading)) {
      audio.pause(); setPlaying(false); setLoading(false); return
    }

    audio.pause()
    setCurrentStation(station); setPlaying(false); setLoading(true); setError(null)
    try { localStorage.setItem(RADIO_STORAGE_KEY, JSON.stringify(station)) } catch {}

    const url = station.url_resolved || station.url
    audio.src = url; audio.volume = muted ? 0 : volume; audio.load()
    audio.play().catch(() => {
      if (url !== station.url) {
        audio.src = station.url; audio.load()
        audio.play().catch(() => { setLoading(false); setError('تعذّر الاتصال — جرّب إذاعة أخرى') })
      } else {
        setLoading(false); setError('تعذّر الاتصال — جرّب إذاعة أخرى')
      }
    })
  }, [currentStation, playing, loading, volume, muted])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause(); audio.src = ''
    setPlaying(false); setLoading(false); setCurrentStation(null)
    try { localStorage.removeItem(RADIO_STORAGE_KEY) } catch {}
  }, [])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !currentStation) return
    if (playing) audio.pause()
    else audio.play().catch(() => setError('تعذّر الاتصال'))
  }, [playing, currentStation])

  const setVolume = useCallback((v: number) => {
    setVolumeState(v); setMutedState(false)
    if (audioRef.current) audioRef.current.volume = v
  }, [])

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m)
    if (audioRef.current) audioRef.current.volume = m ? 0 : volume
  }, [volume])

  return (
    <Ctx.Provider value={{
      stations, searchResults, loadingStations,
      currentStation, playing, loading, error,
      volume, muted, searchQuery, setSearchQuery,
      searchStations, clearSearch, playStation, stop, toggle, setVolume, setMuted,
    }}>
      {children}
    </Ctx.Provider>
  )
}

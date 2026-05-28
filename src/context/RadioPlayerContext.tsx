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
  // ═══ وطنية — إذاعات وطنية جزائرية ═══════════════════════════════════
  mk('dz-chaine1',    'Algérie Chaine 1',        'https://radiochaine1.ice.infomaniak.ch/chaine1.mp3',              'national,algeria',          'Algeria', 'arabic',          128, 'algeria'),
  mk('dz-chaine2',    'Algérie Chaine 2',        'https://radiochaine2.ice.infomaniak.ch/chaine2.mp3',              'culture,amazigh,algeria',   'Algeria', 'arabic,tamazight', 128, 'algeria'),
  mk('dz-chaine3',    'Algérie Chaîne 3',        'https://radiochaine3.ice.infomaniak.ch/chaine3.mp3',              'music,french,algeria',      'Algeria', 'french',           128, 'algeria'),
  mk('dz-coran',      'إذاعة القرآن الكريم',      'https://n0a.radiojar.com/0tpy1h0kxtzuv',                         'quran,islamic,algerian',    'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-radiocoran', 'Radio Coran (ENRS)',       'https://radiocoran.ice.infomaniak.ch/coran.mp3',                 'quran,islamic,algeria',     'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-culture',    'Radio Culture',            'https://radioculture.ice.infomaniak.ch/culture.mp3',             'culture,amazigh,algeria',   'Algeria', 'tamazight,arabic', 128, 'algeria'),
  mk('dz-internat',   'Radio Internationale',    'https://radiointernationale.ice.infomaniak.ch/internationale.mp3','news,international,algeria','Algeria', 'arabic,french',    128, 'algeria'),
  mk('dz-beurfm',     'Beur FM',                 'https://beurfm.ice.infomaniak.ch/beurfm-high.mp3',               'music,algerian,maghreb',    'Algeria', 'arabic,french',    128, 'algeria'),
  mk('dz-frmag2',     'France Maghreb 2',        'https://francemaghreb2.ice.infomaniak.ch/francemaghreb2-high.mp3','maghreb,news,france',       'France',  'arabic,french',    128, 'algeria'),
  mk('dz-antinea',    'Antinea Radio',           'https://listen.radioking.com/radio/6640/stream/347',             'pop,music,algerian',        'Algeria', 'arabic,french',    128, 'algeria'),
  mk('dz-hits1',      'Hits 1 Algérie',          'https://radio12.pro-fhi.net/listen/whmnrlow/stream',             'hits,pop,music,algeria',    'Algeria', 'arabic,french',    128, 'algeria'),
  mk('dz-jilfm',      'Jil FM',                  'https://radiojeunesse.ice.infomaniak.ch/jeunesse.mp3',            'pop,youth,algeria',         'Algeria', 'arabic,french',    128, 'algeria'),
  mk('dz-bahdja',     'Radio El Bahdja',         'https://radioelbahdja.ice.infomaniak.ch/elbahdja.mp3',           'algiers,local,music',       'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-zaman',      'Zaman FM',                'https://radiozamen.ice.infomaniak.ch/zamen.mp3',                 'music,nostalgia,algeria',   'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-tiaret',     'Radio Tiaret',            'https://radiotiaret.ice.infomaniak.ch/tiaret.mp3',               'tiaret,local',              'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-saida',      'Radio Saïda',             'https://radiosaida.ice.infomaniak.ch/saida.mp3',                 'saida,local',               'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-jijel',      'Radio Jijel',             'https://radiojijel.ice.infomaniak.ch/jijel.mp3',                 'jijel,local',               'Algeria', 'arabic',           128, 'algeria'),

  // ═══ ولايات — الشمال (مُتحقق من الروابط) ═══════════════════════════
  mk('dz-oran',       'Radio Oran',              'https://radiooran.ice.infomaniak.ch/oran.mp3',                   'oran,local,music',          'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-constantine','Radio Constantine',       'https://radioconstantine.ice.infomaniak.ch/constantine.mp3',    'constantine,local',         'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-annaba',     'Radio Annaba',            'https://radioannaba.ice.infomaniak.ch/annaba.mp3',              'annaba,local',              'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-blida',      'Radio Blida',             'https://radioblida.ice.infomaniak.ch/blida.mp3',                'blida,local',               'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-tizi',       'Radio Tizi Ouzou',        'https://radiotiziouzou.ice.infomaniak.ch/tiziouzou.mp3',        'tizi ouzou,kabyle,amazigh', 'Algeria', 'tamazight,arabic', 128, 'algeria'),
  mk('dz-bejaia',     'Radio Béjaïa',            'https://radiobejaia.ice.infomaniak.ch/bejaia.mp3',             'bejaia,local,kabyle',       'Algeria', 'tamazight,arabic', 128, 'algeria'),
  mk('dz-setif',      'Radio Sétif',             'https://radiosetif.ice.infomaniak.ch/setif.mp3',               'setif,local',               'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-skikda',     'Radio Skikda',            'https://radioskikda.ice.infomaniak.ch/skikda.mp3',             'skikda,local',              'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-guelma',     'Radio Guelma',            'https://radioguelma.ice.infomaniak.ch/guelma.mp3',             'guelma,local',              'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-soukahras',  'Radio Souk Ahras',        'https://radiosoukahras.ice.infomaniak.ch/soukahras.mp3',       'souk ahras,local',          'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-tipaza',     'Radio Tipaza',            'https://radiotipaza.ice.infomaniak.ch/tipaza.mp3',             'tipaza,local',              'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-boumerdes',  'Radio Boumerdes',         'https://radioboumerdes.ice.infomaniak.ch/boumerdes.mp3',       'boumerdes,local',           'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-chlef',      'Radio Chlef',             'https://radiochlef.ice.infomaniak.ch/chlef.mp3',               'chlef,local',               'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-mostaganem', 'Radio Mostaganem',        'https://radiomostaganem.ice.infomaniak.ch/mostaganem.mp3',     'mostaganem,local',          'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-mascara',    'Radio Mascara',           'https://radiomascara.ice.infomaniak.ch/mascara.mp3',           'mascara,local',             'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-sba',        'Radio Sidi Bel Abbès',    'https://radiosidibelabes.ice.infomaniak.ch/sidibelabes.mp3',   'sidi bel abbes,local',      'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-tlemcen',    'Radio Tlemcen',           'https://radiotlemcen.ice.infomaniak.ch/tlemcen.mp3',           'tlemcen,local',             'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-medea',      'Radio Médéa',             'https://radiomedea.ice.infomaniak.ch/medea.mp3',               'medea,local',               'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-aindefla',   'Radio Aïn Defla',         'https://radioaindefla.ice.infomaniak.ch/aindefla.mp3',         'ain defla,local',           'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-bouira',     'Radio Bouira',            'https://radiobouira.ice.infomaniak.ch/bouira.mp3',             'bouira,local',              'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-msila',      "Radio M'sila",            'https://radiomsila.ice.infomaniak.ch/msila.mp3',               'msila,local',               'Algeria', 'arabic',           128, 'algeria'),

  // ═══ ولايات — الجنوب والهضاب ═══════════════════════════════════════
  mk('dz-batna',      'Radio Batna',             'https://radiobatna.ice.infomaniak.ch/batna.mp3',               'batna,local',               'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-biskra',     'Radio Biskra',            'https://radiobiskra.ice.infomaniak.ch/biskra.mp3',             'biskra,local',              'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-khenchela',  'Radio Khenchela',         'https://radiokhenchela.ice.infomaniak.ch/khenchela.mp3',       'khenchela,local',           'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-oumelbouaghi','Radio Oum Bouaghi',      'https://radiooumbouaghi.ice.infomaniak.ch/oumbouaghi.mp3',    'oum el bouaghi,local',      'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-tebessa',    'Radio Tébessa',           'https://radiotebessa-1.ice.infomaniak.ch/tebessa.mp3',         'tebessa,local',             'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-djelfa',     'Radio Djelfa',            'https://radiodjelfa.ice.infomaniak.ch/djelfa.mp3',             'djelfa,local',              'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-laghouat',   'Radio Laghouat',          'https://radiolaghouat.ice.infomaniak.ch/laghouat.mp3',         'laghouat,local',            'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-elbayadh',   'Radio El Bayadh',         'https://radioelbayedh.ice.infomaniak.ch/radioelbayedh.mp3',   'el bayadh,local',           'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-naama',      'Radio Naâma',             'https://radionaama.ice.infomaniak.ch/naama.mp3',               'naama,local',               'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-ouargla',    'Radio Ouargla',           'https://radioouargla.ice.infomaniak.ch/ouargla.mp3',           'ouargla,local',             'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-ghardaia',   'Radio Ghardaïa',          'https://radioghardaia.ice.infomaniak.ch/ghardaia.mp3',         'ghardaia,mozabite',         'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-bechar',     'Radio Béchar',            'https://radiobechar.ice.infomaniak.ch/bechar.mp3',             'bechar,local',              'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-adrar',      'Radio Adrar',             'https://radioadrar.ice.infomaniak.ch/adrar.mp3',               'adrar,sahara',              'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-tamanrasset','Radio Tamanrasset',       'https://radiotamanrasset.ice.infomaniak.ch/tamanrasset.mp3',   'tamanrasset,tuareg,south',  'Algeria', 'arabic,tamazight', 128, 'algeria'),
  mk('dz-tindouf',    'Radio Tindouf',           'https://radiotindouf.ice.infomaniak.ch/tindouf.mp3',           'tindouf,sahara',            'Algeria', 'arabic',           128, 'algeria'),
  mk('dz-illizi',     'Radio Illizi',            'https://radioillizi.ice.infomaniak.ch/illizi.mp3',             'illizi,south',              'Algeria', 'arabic',           128, 'algeria'),

  // ═══ عربية — إذاعات عربية دولية ══════════════════════════════════
  mk('ar-bbc',        'BBC Arabic Radio',        'https://stream.live.vc.bbcmedia.co.uk/bbc_arabic_radio',       'news,arabic,bbc',           'United Kingdom', 'arabic',    96,  'arabic'),
  mk('ar-mcd',        'Monte Carlo Doualiya',    'https://stream.rfi.fr/rfi-arabe-128',                          'news,arabic,international', 'France',         'arabic',    128, 'arabic'),
  mk('ar-rfi',        'RFI Arabe',               'https://stream.rfi.fr/rfi-arabe-56',                           'news,arabic,france',        'France',         'arabic',    56,  'arabic'),
  mk('ar-maher',      'إذاعة ماهر المعيقلي',    'https://backup.qurango.net/radio/maher',                       'quran,maher,islamic',       'Saudi Arabia',   'arabic',    128, 'arabic'),
  mk('ar-qurango',    'قرآنجو — تلاوات',         'https://qurango.net/radio/salma',                              'quran,recitation,islamic',  'International',  'arabic',    128, 'arabic'),
  mk('ar-classicfm',  'Classic FM UK',           'https://media-ssl.musicradio.com/ClassicFM',                   'classical,music,uk',        'United Kingdom', 'english',   128, 'arabic'),
  mk('ar-srf2',       'SRF 2 Classical',         'https://stream.srg-ssr.ch/m/drs2/mp3_128',                     'classical,music,switzerland','Switzerland',   'german',    128, 'international'),

  // ═══ دولية ════════════════════════════════════════════════════════
  mk('int-classicfm', 'Classic FM UK',           'https://media-ssl.musicradio.com/ClassicFM',                   'classical,music,uk',        'United Kingdom', 'english',   128, 'international'),
  mk('int-srf2',      'SRF 2 Classical',         'https://stream.srg-ssr.ch/m/drs2/mp3_128',                     'classical,swiss',           'Switzerland',    'german',    128, 'international'),
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

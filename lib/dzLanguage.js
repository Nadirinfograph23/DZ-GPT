// DZ Agent — Language Layer V2 (Algerian Darja Understanding System)
// Provides:
//   - normalizeDarija(text)        : Franco-Arab / Darja → normalized Arabic
//   - detectStyle(text)            : 'darija' | 'msa' | 'french' | 'franco' | 'mixed' | 'unknown'
//   - detectIntent(text)           : full intent detection with subtype & confidence
//   - extractEntities(text)        : location, serviceType, language, timeframe
//   - buildResponseStyle(style, intent) : instruction string for AI response style
//   - detectLightIntent(text)      : legacy lightweight intent (kept for compat)
//   - moderateMessage(text)        : profanity guard
//   - recordPendingLearning(entry) : self-learning loop
//   - darijaDictionary             : Darja → MSA lexicon

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ═══════════════════════════════════════════════════════════════════
// PHRASE MAP — Franco-Arab / Darja phrases → Arabic equivalents
// Processed BEFORE token-level map to avoid partial corruption.
// ═══════════════════════════════════════════════════════════════════
const PHRASE_MAP = [
  // ── Greetings ──
  [/\bwach\s+rak\b/gi,       'واش راك'],
  [/\bwech\s+rak\b/gi,       'واش راك'],
  [/\bach\s+rak\b/gi,        'واش راك'],
  [/\bwach\s+raki\b/gi,      'واش راكي'],
  [/\bwach\s+rakom\b/gi,     'واش راكم'],
  [/\bwach\s+kayn\b/gi,      'واش كاين'],
  [/\bwach\s+labas\b/gi,     'واش لاباس'],
  [/\bwach\s+d?dir\b/gi,     'واش دير'],
  [/\bwa(c?h|sh|ch)\b/gi,    'واش'],
  [/\bwech\b/gi,             'واش'],
  [/\bach\b/gi,              'واش'],
  [/\brani\s+mlih\b/gi,      'راني مليح'],
  [/\brani\s+labas\b/gi,     'راني لاباس'],
  [/\brani\s+bikhir\b/gi,    'راني بخير'],
  [/\brak\s+mlih\b/gi,       'راك مليح'],
  [/\brak\s+labas\b/gi,      'راك لاباس'],
  [/\bna\s*nchallah\b/gi,    'إن شاء الله'],
  [/\bnchallah\b/gi,         'إن شاء الله'],
  [/\binchallah\b/gi,        'إن شاء الله'],
  [/\bmachallah\b/gi,        'ما شاء الله'],
  [/\bmashallah\b/gi,        'ما شاء الله'],
  [/\bhamdoulah\b/gi,        'الحمد لله'],
  [/\balhamdoulilah\b/gi,    'الحمد لله'],
  [/\bbarakallahou\s+fik\b/gi,'بارك الله فيك'],
  [/\bbarakalah\b/gi,        'بارك الله فيك'],
  [/\bsa7it?\b/gi,           'صحيت'],
  [/\bsahit?\b/gi,           'صحيت'],
  // ── Questions ──
  [/\bkifach\s+ndir\b/gi,    'كيفاش ندير'],
  [/\bkifach\s+dir\b/gi,     'كيفاش دير'],
  [/\bkifach\s+tdir\b/gi,    'كيفاش تدير'],
  [/\bkifach\s+y?dir\b/gi,   'كيفاش يدير'],
  [/\bkifach\b/gi,           'كيفاش'],
  [/\bkifesh\b/gi,           'كيفاش'],
  [/\bki\s+ndah?a\b/gi,      'كيفاش ندير'],
  [/\b3lah\b/gi,             'علاه'],
  [/\b3la\s+what\b/gi,       'علاه'],
  [/\b3la\s+ch\b/gi,         'علاش'],
  [/\b3lasch\b/gi,           'علاش'],
  [/\bwi?n\s+ndir\b/gi,      'وين ندير'],
  [/\bwi?n\s+nlqa\b/gi,      'وين نلقى'],
  [/\bwi?n\s+nlqa[a]?\b/gi,  'وين نلقى'],
  [/\bwi?n\s+kayn\b/gi,      'وين كاين'],
  [/\bwi?nk\b/gi,            'وينك'],
  [/\bwin\b/gi,              'وين'],
  [/\bfin\b/gi,              'وين'],
  [/\bsh?kun\b/gi,           'شكون'],
  [/\bshk?un\b/gi,           'شكون'],
  [/\bq?dasch\b/gi,          'قداش'],
  [/\bkdach\b/gi,            'قداش'],
  [/\bch7al\b/gi,            'قداش'],
  [/\bch7al\s+fil\b/gi,      'قداش في'],
  [/\b7mar\b/gi,             'حمار'],
  // ── Requests / Actions ──
  [/\bdir\s*li\b/gi,         'ديرلي'],
  [/\bdirli\b/gi,            'ديرلي'],
  [/\bdir\s*l?ha\b/gi,       'ديرها'],
  [/\b3aw?e?n?i\b/gi,        'عاوني'],
  [/\bsah?bek\b/gi,          'صاحبك'],
  [/\bsah?bi\b/gi,           'صاحبي'],
  [/\bhh?alem\b/gi,          'حلم'],
  [/\bbg?hi?t\b/gi,          'بغيت'],
  [/\bnheb\b/gi,             'نحب'],
  [/\bnh?eb\s+n/gi,          'نحب ن'],
  [/\bni\s*dir\b/gi,         'ندير'],
  // ── Common expressions ──
  [/\bbsah?\b/gi,            'بصح'],
  [/\bbessah\b/gi,           'بصح'],
  [/\bwa\s*lah\b/gi,         'والله'],
  [/\bwallah\b/gi,           'والله'],
  [/\bwellah\b/gi,           'والله'],
  [/\byallah\b/gi,           'يلا'],
  [/\byala\b/gi,             'يلا'],
  [/\bya\s*lah\b/gi,         'يلا'],
  [/\bdaba\b/gi,             'دابا'],
  [/\bdro[uw]k\b/gi,         'دروك'],
  [/\bt[ow][wa]?\b/gi,       'توا'],
  [/\bbezzef\b/gi,           'بزاف'],
  [/\bbarcha\b/gi,           'برشا'],
  [/\bch[ow]i[yw]?a\b/gi,    'شوية'],
  [/\bchuya\b/gi,            'شوية'],
  [/\bwalou\b/gi,            'والو'],
  [/\bblak\b/gi,             'بلاك'],
  [/\bbalak\b/gi,            'بلاك'],
  [/\bmakanch\b/gi,          'ماكانش'],
  [/\bkayn\s+la\b/gi,        'ماكانش'],
  // ── French shortforms ──
  [/\bcv\b/gi,               'ça va'],
  [/\bstp\b/gi,              "s'il te plaît"],
  [/\bsvp\b/gi,              "s'il vous plaît"],
  [/\bjsp\b/gi,              'je ne sais pas'],
  [/\bmdr\b/gi,              'mort de rire'],
  [/\btlm\b/gi,              'tout le monde'],
  // ── Place search Darja ──
  [/\bwin\s+nlq[aá]\b/gi,    'وين نلقى'],
  [/\bwi?n\s+nsh?ri\b/gi,    'وين نشري'],
  [/\bwi?n\s+nakul\b/gi,     'وين ناكل'],
  [/\bkayn\s+shi\b/gi,       'كاين شي'],
  [/\bkayn\s+ch[iy]\b/gi,    'كاين شي'],
]

// ═══════════════════════════════════════════════════════════════════
// TOKEN MAP — single-word Franco-Arabic → Arabic
// Applied only in detected Darja context.
// ═══════════════════════════════════════════════════════════════════
const TOKEN_MAP = {
  // State / presence
  rak:'راك', raki:'راكي', rakom:'راكم', rahom:'راهم', rahoum:'راهم',
  rani:'راني', rana:'رانا', raha:'راها', rah:'راه',
  kayn:'كاين', kayna:'كاينة', makach:'ماكانش', makanch:'ماكانش',
  makanche:'ماكانش', mkaynch:'ماكانش',
  // Quality
  mlih:'مليح', mliha:'مليحة', labas:'لاباس', bikhir:'بخير',
  mzyan:'مزيان', mzyana:'مزيانة', mezyan:'مزيان',
  // Logic
  bsah:'بصح', bessah:'بصح', walakin:'لكن', wlaken:'لكن',
  kifach:'كيفاش', kifesh:'كيفاش', kima:'كيما',
  // Location / direction
  win:'وين', winek:'وينك', fin:'وين', hna:'هنا', lhih:'هنا',
  temma:'تما', ltemma:'هنا', dak:'داك', dik:'ديك', hada:'هذا',
  hadi:'هذه', hadik:'ذلك',
  // Time
  bezzef:'بزاف', barcha:'برشا', chwiya:'شوية', chuya:'شوية',
  walou:'والو', balak:'بلاك', yallah:'يلا', yala:'يلا',
  daba:'دابا', toa:'توا', drouk:'دروك', zwine:'زوين',
  // People
  khoya:'خويا', khouya:'خويا', khoti:'ختي', khti:'ختي',
  ana:'أنا', enta:'أنت', enti:'أنتِ', houwa:'هو', hiya:'هي',
  hna:'هنا', ntoma:'أنتم', houma:'هم',
  // Verbs / actions
  dir:'دير', diri:'ديري', ndir:'ندير', tdir:'تدير', ydir:'يدير',
  bghit:'بغيت', nbghi:'نبغي', nheb:'نحب', bgha:'بغى',
  shri:'اشري', nshri:'نشري', biya3:'بياع', shter:'اشترى',
  klam:'كلام', gal:'قال', galt:'قالت', ngolek:'نقولك',
  semah:'سامح', smah:'سامح', smahli:'سامحلي',
  // Social
  habib:'حبيب', habibi:'حبيبي', sahbi:'صاحبي', sahebi:'صاحبي',
  khir:'خير', baraka:'بركة', rahma:'رحمة',
  // Questions (extra)
  shku:'شكون', shkun:'شكون', chdach:'قداش', kdach:'قداش',
  ch7al:'قداش', qddach:'قداش',
  // Common objects
  mra:'مرة', rajl:'راجل', oulad:'أولاد', drari:'درارية',
  khedma:'خدمة', flos:'فلوس', tomobil:'سيارة',
}

// Arabizi digit heuristic (2=a/ء, 3=ع, 5=خ, 7=ح, 9=ق)
const ARABIZI_DIGIT_RE = /\b\w*[23579]\w*\b|\b[23579][a-z]+\b/i

function hasArabic(s) { return /[\u0600-\u06FF]/.test(String(s || '')) }
function hasLatin(s)  { return /[A-Za-z]/.test(String(s || '')) }

// ═══════════════════════════════════════════════════════════════════
// STYLE DETECTION
// ═══════════════════════════════════════════════════════════════════
const FRENCH_HINTS = [
  'bonjour','salut','merci','svp','stp','oui','non','pourquoi','comment','quoi','où',
  'aide','aidez','peux','pouvez','je','tu','vous','nous','c\'est','il y a','faire',
  'comment faire','s\'il vous plaît','s\'il te plaît','est-ce que','qu\'est-ce',
  'restaurant','pharmacie','hôpital','site web','application','comment',
]
const DARIJA_HINTS_LAT = [
  'wach','wech','rak','raki','rani','kayn','kayna','mlih','bsah','bessah',
  'kifach','kifesh','khoya','sahbi','bezzef','barcha','chwiya','yallah','yala',
  'daba','drouk','walou','balak','bghit','nbghi','makanch','makach',
  'dirli','3lah','3la','winek','fin','win ',
]
const DARIJA_HINTS_AR = [
  'واش','راك','راكي','راني','كاين','بزاف','مليح','بصح','كيفاش','وينك','يلا',
  'خويا','دابا','توا','دروك','والو','بلاك','ماكانش','بغيت','ديرلي','علاه',
  'شكون','قداش','بصاح','برشا','شوية','مزيان',
]

export function detectStyle(text) {
  if (!text || typeof text !== 'string') return 'unknown'
  const t = text.toLowerCase()
  const ar = hasArabic(t)
  const la = hasLatin(t)
  const arabiziScore = ARABIZI_DIGIT_RE.test(t) ? 2 : 0
  const darijaLatScore = DARIJA_HINTS_LAT.filter(w => t.includes(w)).length
  const darijaArScore  = DARIJA_HINTS_AR.filter(w => t.includes(w)).length
  const frenchScore    = FRENCH_HINTS.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(t)).length

  const darijaTotal = darijaLatScore + darijaArScore + arabiziScore

  if (darijaTotal >= 1) {
    if (ar && la) return 'mixed'
    if (la) return 'franco'
    return 'darija'
  }
  if (frenchScore >= 2 && !ar) return 'french'
  if (frenchScore >= 1 && !ar && !ar) return 'french'
  if (ar && la) return 'mixed'
  if (ar) return 'msa'
  if (la) {
    // Could be French or English — check for French indicators
    return frenchScore >= 1 ? 'french' : 'unknown'
  }
  return 'unknown'
}

// ═══════════════════════════════════════════════════════════════════
// NORMALIZATION ENGINE V2
// ═══════════════════════════════════════════════════════════════════
export function normalizeDarija(text) {
  if (!text || typeof text !== 'string') return { normalized: text || '', changed: false, hits: 0 }
  let out = text
  let hits = 0

  // Phase 1: Phrase-level substitution
  for (const [re, rep] of PHRASE_MAP) {
    const before = out
    out = out.replace(re, rep)
    if (out !== before) hits++
  }

  // Phase 2: Token-level (only if Darja context confirmed)
  const darijaContext = hits > 0
    || ARABIZI_DIGIT_RE.test(text)
    || DARIJA_HINTS_LAT.some(w => text.toLowerCase().includes(w))
    || DARIJA_HINTS_AR.some(w => text.includes(w))

  if (darijaContext) {
    out = out.replace(/\b([A-Za-z]{2,14})\b/g, (m) => {
      const k = m.toLowerCase()
      if (TOKEN_MAP[k]) { hits++; return TOKEN_MAP[k] }
      return m
    })
  }

  // Phase 3: Arabizi digit substitution (e.g. 3lah → علاه)
  out = out
    .replace(/\b3lah\b/gi, 'علاه')
    .replace(/\b3la\b/gi,  'على')
    .replace(/\b7ta\b/gi,  'حتى')
    .replace(/\b7na\b/gi,  'هنا')
    .replace(/\b9al\b/gi,  'قال')
    .replace(/\b9ult\b/gi, 'قلت')
    .replace(/\b5u\b/gi,   'أخو')
    .replace(/\b5ti\b/gi,  'أختي')
    .replace(/\b2ana\b/gi, 'أنا')
    .replace(/\bwa7ed\b/gi,'واحد')
    .replace(/\bzouj\b/gi, 'زوج')
    .replace(/\btlata\b/gi,'ثلاثة')

  out = out.replace(/\s+/g, ' ').trim()
  return { normalized: out, changed: out !== text, hits }
}

// ═══════════════════════════════════════════════════════════════════
// DARJA DICTIONARY (understanding only — never shown to user)
// ═══════════════════════════════════════════════════════════════════
export const darijaDictionary = Object.freeze({
  'واش':'ماذا', 'واش راك':'كيف حالك', 'راك':'أنت', 'راكي':'أنتِ',
  'راني':'أنا', 'كاين':'يوجد', 'ماكانش':'لا يوجد', 'مليح':'جيد',
  'بصح':'لكن', 'كيفاش':'كيف', 'وينك':'أين أنت', 'بزاف':'كثيراً',
  'يلا':'هيا', 'خويا':'أخي', 'صحيت':'شكراً', 'دروك':'الآن',
  'توا':'الآن', 'بخير':'بخير', 'لاباس':'بخير', 'بغيت':'أريد',
  'ديرلي':'اصنع لي / أعطني', 'علاه':'لماذا', 'شكون':'من',
  'قداش':'كم', 'برشا':'كثير', 'شوية':'قليل', 'مزيان':'جيد',
  'والو':'لا شيء', 'بلاك':'ربما', 'دابا':'الآن', 'وين':'أين',
})

// ═══════════════════════════════════════════════════════════════════
// INTENT DETECTION V2 — Full intent system with 20 intents
// ═══════════════════════════════════════════════════════════════════

// Unicode-aware intent matching:
// \b does NOT work with Arabic/non-Latin chars in JS. We use:
//   - Latin terms: keep \b
//   - Arabic terms: match via includes() helper OR use (^|[\s\u0600-\u06FF]) boundary
// Helper: build a combined tester from multiple patterns
function _any(text, ...pats) { return pats.some(p => p.test(text)) }

// Arabic-safe include check (works without \b)
function _arHas(t, ...words) { return words.some(w => t.includes(w)) }

const INTENT_CONFIG = [
  {
    type: 'greeting',
    test: t =>
      _arHas(t, 'سلام','مرحبا','أهلا','صباح الخير','مساء الخير','السلام عليكم','كيف حالك','واش راك','واش راكي') ||
      /\b(salam|salem|aslama|bonjour|bonsoir|salut|hi|hello|hey|wach\s+rak|wach\s+raki|ahlan)\b/i.test(t),
  },
  {
    type: 'thanks',
    test: t =>
      _arHas(t, 'شكرا','شكراً','بارك الله','صحيت') ||
      /\b(merci|sahit|sa7it|thanks|thank\s+you|jazak)\b/i.test(t),
  },
  {
    type: 'farewell',
    test: t =>
      _arHas(t, 'بسلامة','وداعاً','مع السلامة','نراك','نشوفك') ||
      /\b(bslama|au\s+revoir|bye|ciao|tchao)\b/i.test(t),
  },
  {
    type: 'search_places',
    test: t =>
      _arHas(t, 'مطعم','مطاعم','ماكلة','كافيه','قهوة','فندق','فنادق','سوق','محل','محلات') ||
      _arHas(t, 'وين نلقى','وين كاين','كاين شي','وين نشري','وين ناكل') ||
      /\b(restaurant|resto|cafe|cafeteria|hotel|sport|marché|boutique|magasin|win\s+nlqa|kayn\s+shi)\b/i.test(t),
  },
  {
    type: 'search_pharmacy',
    test: t =>
      _arHas(t, 'صيدلية','صيدليات','دواء','أدوية','دوا') ||
      /\b(pharmacie|pharmac|médicament|dawa)\b/i.test(t),
  },
  {
    type: 'search_hospital',
    test: t =>
      _arHas(t, 'مستشفى','مستشفيات','عيادة','طبيب','أطباء','دكتور','إسعاف','اسعاف') ||
      /\b(hôpital|hopital|clinique|médecin|docteur|urgences|sbitar)\b/i.test(t),
  },
  {
    type: 'generate_website',
    test: t =>
      _arHas(t, 'ديرلي موقع','اصنع موقع','أنشئ موقع','ابني موقع','صفحة ويب','موقع ويب') ||
      /\b(dir\s*li\s+site|dirli\s+site|generate\s+website|create\s+website|landing\s+page|portfolio|portfolyo|site\s+web)\b/i.test(t) ||
      (/\b(موقع|website|site)\b/i.test(t) && /\b(احترافي|design|professionnel|portfolio|html)\b/i.test(t)) ||
      (/بغيت|نبغي|ديرلي/.test(t) && /موقع/.test(t)),
  },
  {
    type: 'coding_help',
    test: t =>
      _arHas(t, 'كود','برمجة','خطأ','إصلاح','دالة') ||
      _arHas(t, 'ما يعمل','ما يخدم','لا يعمل','لا يخدم','ma ykhdemch','ma y3') ||
      /\b(code|programming|error|bug|debug|fix|html|css|javascript|js|python|react|nodejs|api|server|backend|frontend|function|component|class|typescript)\b/i.test(t) ||
      (/علاه|3lah|pourquoi/.test(t) && /site|code|ykhdem|y3mel/.test(t)),
  },
  {
    type: 'map_query',
    test: t =>
      _arHas(t, 'خريطة','خرائط','موقع جغرافي','أين تقع') ||
      /\b(map|maps|carte|localisation|leaflet|openstreetmap|geolocation)\b/i.test(t),
  },
  {
    type: 'weather',
    test: t =>
      _arHas(t, 'طقس','درجة حرارة','حرارة','بارد','حار','مطر','رياح','شمس') ||
      /\b(weather|météo|meteo|temperature|vent|pluie|soleil|forecast)\b/i.test(t),
  },
  {
    type: 'news',
    test: t =>
      _arHas(t, 'أخبار','خبر','جديد','آخر أخبار','ماذا حدث','أحداث','واش صرا') ||
      /\b(news|actualités|actualite|ch\s+sara)\b/i.test(t),
  },
  {
    type: 'education',
    test: t =>
      _arHas(t, 'درس','دروس','تمرين','بكالوريا','امتحان','شرح','تعلم','مادة') ||
      /\b(cours|exercice|bac|baccalauréat|examen|explain|explique|learn|apprendre|eddirasa|sujet)\b/i.test(t),
  },
  {
    type: 'translation',
    test: t =>
      _arHas(t, 'ترجم','معنى','معنى كلمة') ||
      /\b(translate|traduire|traduis|traduction|ma3na|signifie|meaning)\b/i.test(t),
  },
  {
    type: 'explanation',
    test: t =>
      _arHas(t, 'واش هو','واش هي','واش هذا','ما هو','ما هي','ما معنى') ||
      /\b(wach\s+hada|c'est\s+quoi|qu'est-ce\s+que|explique|expliquer|what\s+is|what's)\b/i.test(t),
  },
  {
    type: 'question',
    test: t =>
      /[؟?]/.test(t) ||
      _arHas(t, 'واش','كيفاش','كيف','متى','أين','لماذا','ماذا','قداش','علاه','شكون') ||
      /^\s*\b(wach|wech|kifach|combien|comment|pourquoi|quand|où|qui|quoi|how|what|when|where|why|who)\b/i.test(t),
  },
  {
    type: 'request',
    test: t =>
      _arHas(t, 'عاوني','عاونّي','ساعدني','نحتاج','بغيت','أبغي','أريد','ديرلي') ||
      /\b(aide|aidez|je\s+veux|je\s+voudrais|peux-tu|peut-on|stp|svp|please|can\s+you|help|3awni|dirli)\b/i.test(t),
  },
]

export function detectIntent(text) {
  const t = String(text || '').trim()
  if (!t) return { type: 'other', subtype: null, confidence: 0, keywords: [] }

  const hits = []
  for (const cfg of INTENT_CONFIG) {
    // Support both new test() format and legacy patterns[] format
    let matched = false
    if (typeof cfg.test === 'function') {
      matched = cfg.test(t)
      if (matched) hits.push({ type: cfg.type, keyword: cfg.type })
    } else if (Array.isArray(cfg.patterns)) {
      for (const pat of cfg.patterns) {
        const m = t.match(pat)
        if (m) { hits.push({ type: cfg.type, keyword: m[0] }); break }
      }
    }
  }

  if (hits.length === 0) return { type: 'other', subtype: null, confidence: 0.1, keywords: [] }

  // Priority: more specific intents win over generic ones
  const PRIORITY = {
    generate_website: 10, coding_help: 10, map_query: 9, search_pharmacy: 9,
    search_hospital: 9, search_places: 8, weather: 8, news: 8, education: 8,
    translation: 7, explanation: 7, greeting: 6, thanks: 6, farewell: 6,
    request: 5, question: 4, other: 1,
  }
  hits.sort((a, b) => (PRIORITY[b.type] || 1) - (PRIORITY[a.type] || 1))

  const primary = hits[0]
  const confidence = Math.min(0.95, 0.6 + hits.length * 0.1)

  return {
    type: primary.type,
    subtype: hits.length > 1 ? hits[1].type : null,
    confidence: Math.round(confidence * 100) / 100,
    keywords: hits.map(h => h.keyword),
    allIntents: hits.map(h => h.type),
  }
}

// Backward-compatible alias
export function detectLightIntent(text) {
  const r = detectIntent(text)
  const SIMPLE = { generate_website:'request', coding_help:'request', map_query:'question',
    search_places:'question', search_pharmacy:'question', search_hospital:'question',
    weather:'question', news:'question', education:'question', translation:'request',
    explanation:'question', greeting:'greeting', thanks:'thanks', farewell:'other',
    request:'request', question:'question', other:'other' }
  return { type: SIMPLE[r.type] || r.type, keywords: r.keywords }
}

// ═══════════════════════════════════════════════════════════════════
// ENTITY EXTRACTION V2
// ═══════════════════════════════════════════════════════════════════

// Algerian wilayas — Arabic, French, common nicknames
const WILAYA_PATTERNS = [
  { code: '01', ar: 'أدرار',           fr: 'adrar',            alt: [] },
  { code: '02', ar: 'الشلف',           fr: 'chlef',            alt: ['الأصنام'] },
  { code: '03', ar: 'الأغواط',         fr: 'laghouat',         alt: [] },
  { code: '04', ar: 'أم البواقي',       fr: 'oum el bouaghi',   alt: [] },
  { code: '05', ar: 'باتنة',           fr: 'batna',            alt: [] },
  { code: '06', ar: 'بجاية',           fr: 'bejaia',           alt: ['béjaïa','bgayet'] },
  { code: '07', ar: 'بسكرة',           fr: 'biskra',           alt: [] },
  { code: '08', ar: 'بشار',            fr: 'bechar',           alt: ['béchar'] },
  { code: '09', ar: 'البليدة',         fr: 'blida',            alt: [] },
  { code: '10', ar: 'البويرة',         fr: 'bouira',           alt: [] },
  { code: '11', ar: 'تمنراست',         fr: 'tamanrasset',      alt: ['tamenghest'] },
  { code: '12', ar: 'تبسة',           fr: 'tebessa',           alt: ['tébessa'] },
  { code: '13', ar: 'تلمسان',         fr: 'tlemcen',           alt: [] },
  { code: '14', ar: 'تيارت',          fr: 'tiaret',            alt: [] },
  { code: '15', ar: 'تيزي وزو',       fr: 'tizi ouzou',       alt: ['tizi-ouzou'] },
  { code: '16', ar: 'الجزائر',        fr: 'alger',             alt: ['algiers','dzair','dzayer','العاصمة'] },
  { code: '17', ar: 'الجلفة',         fr: 'djelfa',            alt: [] },
  { code: '18', ar: 'جيجل',           fr: 'jijel',             alt: [] },
  { code: '19', ar: 'سطيف',           fr: 'setif',             alt: ['sétif'] },
  { code: '20', ar: 'سعيدة',          fr: 'saida',             alt: ['saïda'] },
  { code: '21', ar: 'سكيكدة',         fr: 'skikda',            alt: [] },
  { code: '22', ar: 'سيدي بلعباس',    fr: 'sidi bel abbes',   alt: ['sidi bel abbès'] },
  { code: '23', ar: 'عنابة',          fr: 'annaba',            alt: [] },
  { code: '24', ar: 'قالمة',          fr: 'guelma',            alt: [] },
  { code: '25', ar: 'قسنطينة',        fr: 'constantine',       alt: ['قسنطيني'] },
  { code: '26', ar: 'المدية',         fr: 'medea',             alt: ['médéa'] },
  { code: '27', ar: 'مستغانم',        fr: 'mostaganem',        alt: [] },
  { code: '28', ar: 'المسيلة',        fr: 'msila',             alt: ["m'sila"] },
  { code: '29', ar: 'معسكر',          fr: 'mascara',           alt: [] },
  { code: '30', ar: 'ورقلة',          fr: 'ouargla',           alt: ['warqla'] },
  { code: '31', ar: 'وهران',          fr: 'oran',              alt: ['wahran'] },
  { code: '32', ar: 'البيض',          fr: 'el bayadh',         alt: [] },
  { code: '33', ar: 'إليزي',          fr: 'illizi',            alt: [] },
  { code: '34', ar: 'برج بوعريريج',   fr: 'bordj bou arreridj',alt: ['bba'] },
  { code: '35', ar: 'بومرداس',        fr: 'boumerdes',         alt: ['boumerdès'] },
  { code: '36', ar: 'الطارف',         fr: 'el tarf',           alt: [] },
  { code: '37', ar: 'تندوف',          fr: 'tindouf',           alt: [] },
  { code: '38', ar: 'تيسمسيلت',      fr: 'tissemsilt',        alt: [] },
  { code: '39', ar: 'الوادي',         fr: 'el oued',           alt: ['eloued'] },
  { code: '40', ar: 'خنشلة',          fr: 'khenchela',         alt: [] },
  { code: '41', ar: 'سوق أهراس',      fr: 'souk ahras',       alt: [] },
  { code: '42', ar: 'تيبازة',         fr: 'tipaza',            alt: ['tipasa'] },
  { code: '43', ar: 'ميلة',           fr: 'mila',              alt: [] },
  { code: '44', ar: 'عين الدفلى',     fr: 'ain defla',         alt: ['aïn defla'] },
  { code: '45', ar: 'النعامة',        fr: 'naama',             alt: ['naâma'] },
  { code: '46', ar: 'عين تموشنت',     fr: 'ain temouchent',    alt: ['aïn témouchent'] },
  { code: '47', ar: 'غرداية',         fr: 'ghardaia',          alt: ['ghardaïa'] },
  { code: '48', ar: 'غليزان',         fr: 'relizane',          alt: [] },
  { code: '49', ar: 'تيميمون',        fr: 'timimoun',          alt: [] },
  { code: '50', ar: 'برج باجي مختار', fr: 'bordj badji mokhtar',alt: [] },
  { code: '51', ar: 'أولاد جلال',     fr: 'ouled djellal',     alt: [] },
  { code: '52', ar: 'بني عباس',       fr: 'beni abbes',        alt: ['béni abbès'] },
  { code: '53', ar: 'عين صالح',       fr: 'in salah',          alt: ['in-salah'] },
  { code: '54', ar: 'عين قزام',       fr: 'in guezzam',        alt: [] },
  { code: '55', ar: 'تقرت',           fr: 'touggourt',         alt: [] },
  { code: '56', ar: 'جانت',           fr: 'djanet',            alt: [] },
  { code: '57', ar: 'المغير',         fr: 'el mghair',         alt: ["el m'ghair"] },
  { code: '58', ar: 'المنيعة',        fr: 'el meniaa',         alt: ['el ménia'] },
]

const SERVICE_KEYWORDS = {
  restaurant:  { ar:['مطعم','مطاعم','ماكلة','أكل','شواء','كسكس'], fr:['restaurant','resto','manger','bouffe'], dz:['makla','klana'] },
  cafe:        { ar:['قهوة','مقهى','كافيه','كافيتيريا'], fr:['café','coffee','cafétéria'], dz:['kahwa','gahwa'] },
  pharmacy:    { ar:['صيدلية','صيدليات','دواء','أدوية'], fr:['pharmacie','médicament'], dz:['farmasyan','dawa'] },
  hospital:    { ar:['مستشفى','عيادة','طبيب','دكتور','إسعاف'], fr:['hôpital','clinique','médecin','urgences'], dz:['sbitar','doktour'] },
  school:      { ar:['مدرسة','ثانوية','متوسطة','جامعة','كلية'], fr:['école','lycée','collège','université'], dz:[] },
  market:      { ar:['سوق','أسواق','تسوق'], fr:['marché','supermarché','magasin'], dz:['souk'] },
  bank:        { ar:['بنك','بنوك','صراف','ماكينة'], fr:['banque','DAB','ATM','distributeur'], dz:['banka'] },
  mosque:      { ar:['مسجد','جامع','مساجد'], fr:['mosquée'], dz:['djame3'] },
  hotel:       { ar:['فندق','فنادق','إقامة','نزل'], fr:['hôtel','hébergement'], dz:['ôtel'] },
  gym:         { ar:['نادي رياضي','ملعب','صالة رياضية'], fr:['salle de sport','gymnase'], dz:['gym','salle'] },
  station:     { ar:['محطة','موقف','حافلة','قطار'], fr:['gare','station','bus'], dz:['mhatta'] },
  park:        { ar:['حديقة','حدائق','متنزه'], fr:['parc','jardin'], dz:[] },
}

export function extractEntities(text) {
  const t = String(text || '').toLowerCase()
  const result = { location: null, wilayaCode: null, serviceType: null, language: null, timeframe: null }

  // Location detection
  for (const w of WILAYA_PATTERNS) {
    if (t.includes(w.ar) || t.includes(w.fr.toLowerCase()) || w.alt.some(a => t.includes(a))) {
      result.location = w.ar
      result.wilayaCode = w.code
      break
    }
  }

  // "هنا" / "هون" / "ici" / "here" → user's current location
  if (!result.location && /(هنا|هون|ici|here|lhih)\b/i.test(t)) {
    result.location = 'موقعك الحالي'
  }

  // Service type detection
  for (const [type, kws] of Object.entries(SERVICE_KEYWORDS)) {
    const all = [...kws.ar, ...kws.fr, ...(kws.dz || [])]
    if (all.some(k => t.includes(k.toLowerCase()))) {
      result.serviceType = type
      break
    }
  }

  // Language preference
  if (/(بالعربية|عربي|arabic)\b/i.test(t))   result.language = 'ar'
  if (/(بالفرنسية|français|french)\b/i.test(t)) result.language = 'fr'
  if (/(بالإنجليزية|english|anglais)\b/i.test(t)) result.language = 'en'

  // Timeframe
  if (/(اليوم|today|aujourd'hui|دابا)\b/i.test(t)) result.timeframe = 'today'
  if (/(غدا|tomorrow|demain)\b/i.test(t))          result.timeframe = 'tomorrow'
  if (/(الأسبوع|this week|cette semaine)\b/i.test(t)) result.timeframe = 'week'

  return result
}

// ═══════════════════════════════════════════════════════════════════
// RESPONSE STYLE ENGINE
// Returns an instruction string for the AI model.
// ═══════════════════════════════════════════════════════════════════
const STYLE_TEMPLATES = {
  darija: {
    default:    'أجب بالدارجة الجزائرية المحترمة. استخدم كلمات مثل "كاين، راني، بزاف، واش، يلا" بشكل طبيعي. كن ودياً وقريباً من المستخدم.',
    technical:  'أجب بالدارجة مع مصطلحات تقنية فصحى عند الضرورة. مثال: "شوف هذا الكود، كاين مشكلة في..." ثم الشرح بالدارجة.',
    search:     'أجب بالدارجة وأعطِ معلومات عملية مباشرة. استخدم: "كاين...", "تلقى...", "روح لـ..."',
    formal:     'أجب بالعربية الفصحى مع الحفاظ على الودية.',
  },
  franco: {
    default:    'أجب بمزيج فرانكو-عربي جزائري طبيعي (مثل: "wach rak, ana rani..." أو دارجة مكتوبة بالحروف اللاتينية). كن ودياً.',
    technical:  'أجب بالفرانكو-عربي مع مصطلحات تقنية بالفرنسية أو الإنجليزية عند الحاجة.',
    search:     'أجب بالفرانكو-عربي وأعطِ معلومات عملية.',
    formal:     'أجب بالعربية أو الفرنسية.',
  },
  mixed: {
    default:    'أجب بمزيج طبيعي من الدارجة والعربية والفرنسية — كما يتحدث الجزائريون. لا تختر لغة واحدة فقط.',
    technical:  'أجب بالدارجة مع مصطلحات تقنية بالفرنسية/الإنجليزية. مثال: "هذا الcode كاين فيه bug..."',
    search:     'أجب بمزيج دارجة-فرنسية وأعطِ معلومات عملية.',
    formal:     'أجب بالعربية الفصحى أو الفرنسية.',
  },
  french: {
    default:    'Réponds en français naturel et amical.',
    technical:  'Réponds en français avec des termes techniques clairs.',
    search:     'Réponds en français avec des informations pratiques et directes.',
    formal:     'Réponds en français formel et professionnel.',
  },
  msa: {
    default:    'أجب بالعربية الفصحى السلسة المفهومة. كن واضحاً ومباشراً.',
    technical:  'أجب بالعربية الفصحى مع المصطلحات التقنية المناسبة.',
    search:     'أجب بالعربية الفصحى مع معلومات عملية ومنظمة.',
    formal:     'أجب بالعربية الفصحى الرسمية.',
  },
}

const TECHNICAL_INTENTS = new Set(['coding_help', 'generate_website', 'explanation', 'map_query'])
const SEARCH_INTENTS    = new Set(['search_places', 'search_pharmacy', 'search_hospital', 'weather', 'news', 'map_query'])

export function buildResponseStyle(style, intentObj) {
  const intentType = typeof intentObj === 'string' ? intentObj : (intentObj?.type || 'other')
  const templates = STYLE_TEMPLATES[style] || STYLE_TEMPLATES.msa

  let subTemplate = 'default'
  if (TECHNICAL_INTENTS.has(intentType)) subTemplate = 'technical'
  else if (SEARCH_INTENTS.has(intentType)) subTemplate = 'search'

  const instruction = templates[subTemplate] || templates.default

  // Intent-specific extras
  const extras = []
  if (intentType === 'greeting') extras.push('رد على التحية بتحية مماثلة وودية.')
  if (intentType === 'thanks')   extras.push('رد على الشكر بترحيب ودود.')
  if (intentType === 'search_places') extras.push('إذا طُلب موقع محدد، اذكر عنواناً وخريطة إن أمكن.')
  if (intentType === 'coding_help')   extras.push('قدّم كوداً قابلاً للتشغيل مباشرة، مع شرح مختصر بلغة المستخدم.')
  if (intentType === 'generate_website') extras.push('ولّد HTML + CSS + JS كاملاً ومتجاوباً (responsive).')
  if (intentType === 'education')    extras.push('اشرح خطوة بخطوة بأسلوب بسيط يناسب التلميذ الجزائري.')

  return [instruction, ...extras].join(' ')
}

// ═══════════════════════════════════════════════════════════════════
// MODERATION — Profanity guard (DZ Darja + French + Arabic)
// ═══════════════════════════════════════════════════════════════════
const PROFANITY_ROOTS = [
  'كلب','كلبه','حمار','حمارة','بهيمة','حقير','وسخ',
  'زبي','طيز','طيزك','نيك','يلعن','العن','يلعنك',
  'قحبه','قحبة','شرموطه','شرموطة','زامل','عرص','عرصة',
  'ابن الكلب','ابن القحبه','ابن الزانيه','ابن الحرام',
  'يا حيوان','يا كلب','يا حمار','يا حقير',
  'kahba','9ahba','9a7ba','zebi','zebbi','tiz','tizek','niq','nik',
  'cherrmouta','chermota','3ars','3arss',
  'weld lkahba','weld lk9ahba','wld 9a7ba',
  'putain','pute','salope','enculé','connard','connasse',
  'fdp','tg','batard','bâtard',
]
const SEVERE_ROOTS = [
  'نيك ربك','يلعن دين','يلعن ربك','نيك امك',
  'nik om','nik omek','nik mok','nikomek',
  'ابن القحبه','ابن القحبة','ابن الزانيه',
  'weld lkahba','wld 9a7ba','enculé','enculer',
]

function deobfuscate(s) {
  let x = String(s || '').toLowerCase()
  x = x.replace(/(.)\1{2,}/g, '$1')
  x = x.replace(/3/g,'a').replace(/7/g,'h').replace(/9/g,'q')
       .replace(/2/g,'a').replace(/5/g,'kh').replace(/8/g,'gh')
  x = x.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g,'')
  x = x.replace(/[._\-*+~`'"!?,;:|/\\(){}\[\]<>]/g,' ')
  x = x.replace(/[\u064B-\u065F\u0670\u0640]/g,'')
  x = x.replace(/[إأآا]/g,'ا').replace(/[يى]/g,'ي').replace(/ة/g,'ه')
  return x.replace(/\s+/g,' ').trim()
}

export function moderateMessage(text) {
  if (!text || typeof text !== 'string') return { ok: true, severity: 'clean', reason: '', replyIfBlocked: '' }
  const probe = deobfuscate(text)
  for (const r of SEVERE_ROOTS) {
    if (probe.includes(deobfuscate(r))) {
      return { ok: false, severity: 'severe', reason: 'severe_profanity', replyIfBlocked: 'نقدر نعاونك، بصح حاول تستعمل كلام محترم 👍' }
    }
  }
  for (const r of PROFANITY_ROOTS) {
    const rr = deobfuscate(r)
    const re = new RegExp(`(^|\\s)${rr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`)
    if (re.test(' ' + probe + ' ')) {
      return { ok: false, severity: 'offensive', reason: 'profanity', replyIfBlocked: 'نقدر نعاونك، بصح حاول تستعمل كلام محترم 👍' }
    }
  }
  return { ok: true, severity: 'clean', reason: '', replyIfBlocked: '' }
}

// ═══════════════════════════════════════════════════════════════════
// SELF-LEARNING LOOP — stores unknown patterns for future improvement
// ═══════════════════════════════════════════════════════════════════
const LEARNING_PATH = path.resolve(__dirname, '..', 'data', 'pending_learning.json')
const MAX_LEARNING_ENTRIES = 1000
const URL_RE    = /(https?:\/\/|www\.)\S+/i
const EMAIL_RE  = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE_RE  = /(?:\+?213|00213|0)\s*[2-7](?:[\s.\-/]?\d){7,8}/

let learningQueue = null
let learningWriting = false
let learningDirty = false

async function loadLearning() {
  if (Array.isArray(learningQueue)) return learningQueue
  try {
    const raw = await fs.readFile(LEARNING_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    learningQueue = Array.isArray(parsed) ? parsed : []
  } catch { learningQueue = [] }
  return learningQueue
}

async function flushLearning() {
  if (learningWriting || !learningDirty) return
  learningWriting = true
  try {
    await fs.mkdir(path.dirname(LEARNING_PATH), { recursive: true })
    await fs.writeFile(LEARNING_PATH, JSON.stringify(learningQueue.slice(-MAX_LEARNING_ENTRIES), null, 0), 'utf8')
    learningDirty = false
  } catch (err) {
    console.warn('[dzLanguage] learning flush error:', err?.message || err)
  } finally { learningWriting = false }
}

export async function recordPendingLearning({ input, normalized }, opts = {}) {
  try {
    if (!input || typeof input !== 'string') return false
    if (input.length < 2 || input.length > 280) return false
    if (URL_RE.test(input) || EMAIL_RE.test(input) || PHONE_RE.test(input)) return false
    const mod = opts.moderation || moderateMessage(input)
    if (!mod.ok) return false
    await loadLearning()
    learningQueue.push({
      input: input.trim(),
      normalized: (normalized || '').trim() || input.trim(),
      style:  opts.style  || detectStyle(input),
      intent: opts.intent || detectIntent(input).type,
      entities: opts.entities || {},
      timestamp: Date.now(),
    })
    if (learningQueue.length > MAX_LEARNING_ENTRIES * 2) {
      learningQueue = learningQueue.slice(-MAX_LEARNING_ENTRIES)
    }
    learningDirty = true
    flushLearning()
    return true
  } catch { return false }
}

export async function getPendingLearningStats() {
  await loadLearning()
  return { count: learningQueue.length, capacity: MAX_LEARNING_ENTRIES }
}

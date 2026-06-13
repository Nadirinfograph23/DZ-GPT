/**
 * sports-agent.js — وكيل رياضي متعدد المصادر
 * ══════════════════════════════════════════════════════════════════════════════
 * مُخصّص لـ DZ Agent — يُجيب بالعربية على:
 *   ① البحث عن مباراة محددة (A ضد B / A بوليفيا)
 *   ② أخبار اللاعبين والانتقالات
 *   ③ الرزنامة (قادمة + منتهية)
 *   ④ تفاصيل المباراة (الموعد، الملعب، النوع، التشكيلة)
 *
 * قواعد صارمة:
 *   ✅ اللغوي (LLM) يُرتّب ويُنسّق فقط — لا يخترع بيانات
 *   ✅ إذا لم تُوجد بيانات حقيقية → رسالة صريحة "غير متوفر"
 *   ✅ الأولوية: FotMob ← SofaScore ← Kooora ← SearXNG ← TheSportsDB ← 365score
 *
 * المصادر (حسب الأولوية):
 *   FotMob → SofaScore → Kooora → SearXNG → DZ-Knowledge → TheSportsDB → 365score → CAF/FIFA
 * ══════════════════════════════════════════════════════════════════════════════
 */

import {
  getLiveMatches, getFixtures, getAlgeriaMatches,
  get365ScoreMatches, getKooraMatches, getPlayerIdentity,
  getTransfers, isUnavailable,
  getAlgeriaTeamMatches, searchAlgeriaMatchByOpponent,
  fetchWC2026Fixtures365, fetchKooraWC2026, fetchJdwelWC2026,
  fetchBeinSportsWC2026, fetchFotmobWC2026Scraper,
  KOORA_WC2026_URL, JDWEL_WC2026_URL, BEIN_WC2026_URL, FOTMOB_WC2026_URL,
} from './sports-data-router.js'

import {
  getLeagueFlag, getCountryFlag, formatMatchRow,
  formatStandingsTable, detectFootballQueryType,
} from './football-context-builder.js'

import {
  searchLocalKnowledge, buildLocalMatchBlock,
  buildWorldCup2026AlgeriaContext, isWorldCup2026Query,
  WORLD_CUP_2026, WC2026_FULL_FIXTURES,
  findWC2026TeamGroup,
  buildWC2026KnockoutContext,
  buildWC2026SameGroupContext,
  buildCleanNoDataResponse,
  detectWC2026TodayQuery,
  buildWC2026RichMatchCard,
  buildWC2026TodayFixtures,
  buildWC2026MatchVsResponse,
  sanitizeMatchesByTime,
} from './dz-sports-knowledge.js'

import {
  searchPlayerInfo,
  getWorldCupWins,
  getTeamTrophies,
  getLastChampion,
  buildPlayerInfoBlock,
  buildWorldCupTrophyBlock,
  buildAfconTrophyBlock,
  WORLD_CUP_HISTORY,
  AFCON_HISTORY,
  UCL_HISTORY,
  TEAM_TROPHIES,
} from './dz-sports-archive.js'

// ══════════════════════════════════════════════════════════════════════════════
// § 1 — ثوابت وخرائط
// ══════════════════════════════════════════════════════════════════════════════

const AGENT_TIMEOUT = 18000

const DEFAULT_TIMEOUT = 12000

// ── Result cache for MATCH_SEARCH (يمنع إعادة البحث عند retry) ─────────────
const _MATCH_SEARCH_CACHE = new Map()
const _MATCH_SEARCH_TTL   = 10 * 60 * 1000 // 10 دقائق

function _cacheGet(key) {
  const entry = _MATCH_SEARCH_CACHE.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > _MATCH_SEARCH_TTL) { _MATCH_SEARCH_CACHE.delete(key); return null }
  return entry.result
}
function _cacheSet(key, result) {
  if (_MATCH_SEARCH_CACHE.size > 200) {
    const oldest = [..._MATCH_SEARCH_CACHE.entries()].sort((a,b) => a[1].ts - b[1].ts)[0]
    if (oldest) _MATCH_SEARCH_CACHE.delete(oldest[0])
  }
  _MATCH_SEARCH_CACHE.set(key, { result, ts: Date.now() })
}

async function timedFetch(url, opts = {}) {
  const { timeout = DEFAULT_TIMEOUT, ...rest } = opts
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const r = await fetch(url, { signal: ctrl.signal, ...rest })
    clearTimeout(t)
    return r
  } catch (e) { clearTimeout(t); throw e }
}

// ══════════════════════════════════════════════════════════════════════════════
// § ANTI-HALLUCINATION GUARD — حارس صارم لمنع الهلوسة
// ══════════════════════════════════════════════════════════════════════════════

/**
 * رسالة "لا توجد بيانات" المعيارية — تُستخدم عند غياب المصدر
 * 🚫 ممنوع تمامًا استبدال هذه الرسالة بنتائج مخترعة أو مستنتجة
 */
export function buildStrictNoDataResponse(context = '') {
  const ctx = context ? `\n> 📌 السياق: ${context}` : ''
  return [
    `> ❌ **لا توجد بيانات مؤكدة لهذا الطلب حالياً من المصدر الرسمي.**`,
    ctx,
    `>`,
    `> **القواعد الصارمة للوكيل الرياضي:**`,
    `> - لا يتم تخمين أي نتيجة أو موعد`,
    `> - لا يتم ملء الفراغات ببيانات وهمية`,
    `> - كل البيانات المعروضة مصدرها API أو جدول رسمي موثوق`,
    `>`,
    `> **للاطلاع على بيانات حية:**`,
    `> 🏆 ⚽ 📊 🌐`,
  ].join('\n')
}

/**
 * يتحقق من صحة كائن مباراة قبل العرض
 * يرفض أي مباراة بدون مصدر أو بيانات أساسية
 */
export function validateMatchBeforeDisplay(match = {}) {
  const errors = []
  if (!match.homeTeam) errors.push('homeTeam مفقود')
  if (!match.awayTeam) errors.push('awayTeam مفقود')
  if (!match.date && !match.startTime) errors.push('التاريخ والوقت مفقودان')
  // التحقق من صحة التاريخ (ضمن نطاق كأس العالم 2026)
  if (match.date) {
    try {
      const d = new Date(match.date)
      const wc_start = new Date('2026-06-11')
      const wc_end   = new Date('2026-07-20')
      if (d < wc_start || d > wc_end) {
        errors.push(`تاريخ خارج نطاق WC2026: ${match.date}`)
      }
    } catch { errors.push('تاريخ غير صالح') }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * قواعد الوكيل الرياضي الصارمة (تُضاف للـ system prompt عند الحاجة)
 * تُطبَّق دائماً وتمنع أي هلوسة في البيانات الرياضية
 */
export const SPORTS_AGENT_STRICT_RULES = `
## 🔴 قواعد صارمة للوكيل الرياضي (Critical — يمنع مخالفتها)

1. **لا تخمن أبداً** — أي نتيجة، موعد، أو لاعب لا يوجد في البيانات الرسمية
2. **لا تملأ الفراغات** ببيانات وهمية أو مستنتجة أو من الذاكرة العامة
3. **لا تعرض مباراة** بدون مصدر موثوق أو ID من API
4. **إذا فشل المصدر** → توقف ورُدّ: "لا توجد بيانات مؤكدة لهذه المباراة حالياً من المصدر الرسمي."
5. **المصادر المسموحة فقط:** FIFA الرسمي، FotMob، 365score، SofaScore، Kooora، jdwel
6. **عرض المصادر:** أيقونات فقط (🏆⚽📊🌐) — بدون روابط URL أو أسماء طويلة أو IDs
7. **لغة العرض:** العربية أولاً في كل الردود
8. **الاستجابة عند غياب البيانات:** "غير متوفر حالياً من المصدر" — لا بديل آخر
`.trim()

// أعلام الدول للعرض
export const TEAM_FLAGS = {
  'الجزائر': '🇩🇿', 'Algeria': '🇩🇿', 'DZA': '🇩🇿',
  'المغرب': '🇲🇦', 'Morocco': '🇲🇦',
  'تونس': '🇹🇳', 'Tunisia': '🇹🇳',
  'مصر': '🇪🇬', 'Egypt': '🇪🇬',
  'ليبيا': '🇱🇾', 'Libya': '🇱🇾',
  'موريتانيا': '🇲🇷', 'Mauritania': '🇲🇷',
  'السنغال': '🇸🇳', 'Senegal': '🇸🇳',
  'نيجيريا': '🇳🇬', 'Nigeria': '🇳🇬',
  'الكاميرون': '🇨🇲', 'Cameroon': '🇨🇲',
  'غانا': '🇬🇭', 'Ghana': '🇬🇭',
  'كوت ديفوار': '🇨🇮', 'ساحل العاج': '🇨🇮', 'Ivory Coast': '🇨🇮',
  'مالي': '🇲🇱', 'Mali': '🇲🇱',
  'بوركينا فاسو': '🇧🇫', 'Burkina': '🇧🇫',
  'جنوب أفريقيا': '🇿🇦', 'South Africa': '🇿🇦',
  'إثيوبيا': '🇪🇹', 'Ethiopia': '🇪🇹',
  'فرنسا': '🇫🇷', 'France': '🇫🇷',
  'إسبانيا': '🇪🇸', 'Spain': '🇪🇸',
  'ألمانيا': '🇩🇪', 'Germany': '🇩🇪',
  'إيطاليا': '🇮🇹', 'Italy': '🇮🇹',
  'إنجلترا': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'البرتغال': '🇵🇹', 'Portugal': '🇵🇹',
  'هولندا': '🇳🇱', 'هولاندا': '🇳🇱', 'هولاند': '🇳🇱', 'Netherlands': '🇳🇱',
  'بلجيكا': '🇧🇪', 'Belgium': '🇧🇪',
  'تركيا': '🇹🇷', 'Turkey': '🇹🇷',
  'كرواتيا': '🇭🇷', 'Croatia': '🇭🇷',
  'السويد': '🇸🇪', 'Sweden': '🇸🇪',
  'الدنمارك': '🇩🇰', 'Denmark': '🇩🇰',
  'سويسرا': '🇨🇭', 'Switzerland': '🇨🇭',
  'البرازيل': '🇧🇷', 'Brazil': '🇧🇷',
  'الأرجنتين': '🇦🇷', 'Argentina': '🇦🇷',
  'أوروغواي': '🇺🇾', 'Uruguay': '🇺🇾',
  'كولومبيا': '🇨🇴', 'Colombia': '🇨🇴',
  'تشيلي': '🇨🇱', 'Chile': '🇨🇱',
  'بيرو': '🇵🇪', 'Peru': '🇵🇪',
  'المكسيك': '🇲🇽', 'Mexico': '🇲🇽',
  'كندا': '🇨🇦', 'Canada': '🇨🇦',
  'الولايات المتحدة': '🇺🇸', 'أمريكا': '🇺🇸', 'USA': '🇺🇸', 'United States': '🇺🇸',
  'قطر': '🇶🇦', 'Qatar': '🇶🇦',
  'السعودية': '🇸🇦', 'Saudi Arabia': '🇸🇦',
  'الإمارات': '🇦🇪', 'UAE': '🇦🇪',
  'العراق': '🇮🇶', 'Iraq': '🇮🇶',
  'سوريا': '🇸🇾', 'Syria': '🇸🇾',
  'الأردن': '🇯🇴', 'Jordan': '🇯🇴',
  'إيران': '🇮🇷', 'Iran': '🇮🇷',
  'أستراليا': '🇦🇺', 'Australia': '🇦🇺',
  'اليابان': '🇯🇵', 'Japan': '🇯🇵',
  'كوريا': '🇰🇷', 'South Korea': '🇰🇷',
  'بوليفيا': '🇧🇴', 'Bolivia': '🇧🇴',
  'الإكوادور': '🇪🇨', 'Ecuador': '🇪🇨',
  'باراغواي': '🇵🇾', 'Paraguay': '🇵🇾',
  'فنزويلا': '🇻🇪', 'Venezuela': '🇻🇪',
  'بوليفيا': '🇧🇴', 'Bolivia': '🇧🇴',
  'كوستاريكا': '🇨🇷', 'Costa Rica': '🇨🇷',
  'بنما': '🇵🇦', 'Panama': '🇵🇦',
  'جامايكا': '🇯🇲', 'Jamaica': '🇯🇲',
  'الكويت': '🇰🇼', 'Kuwait': '🇰🇼',
  'البحرين': '🇧🇭', 'Bahrain': '🇧🇭',
  'عُمان': '🇴🇲', 'Oman': '🇴🇲',
  'اليمن': '🇾🇪', 'Yemen': '🇾🇪',
  'لبنان': '🇱🇧', 'Lebanon': '🇱🇧',
  'فلسطين': '🇵🇸', 'Palestine': '🇵🇸',
}

// خريطة الترجمة: عربي → إنجليزي (للبحث في APIs)
const TEAM_AR_TO_EN = {
  'الجزائر': 'Algeria',
  'المغرب': 'Morocco',
  'تونس': 'Tunisia',
  'مصر': 'Egypt',
  'ليبيا': 'Libya',
  'السنغال': 'Senegal',
  'نيجيريا': 'Nigeria',
  'الكاميرون': 'Cameroon',
  'غانا': 'Ghana',
  'ساحل العاج': 'Ivory Coast',
  'كوت ديفوار': 'Ivory Coast',
  'مالي': 'Mali',
  'فرنسا': 'France',
  'إسبانيا': 'Spain',
  'ألمانيا': 'Germany',
  'إيطاليا': 'Italy',
  'إنجلترا': 'England',
  'البرتغال': 'Portugal',
  'هولندا': 'Netherlands',
  'هولاندا': 'Netherlands',
  'هولاند': 'Netherlands',
  'بلجيكا': 'Belgium',
  'تركيا': 'Turkey',
  'البرازيل': 'Brazil',
  'الأرجنتين': 'Argentina',
  'الارجنتين': 'Argentina',
  'النمسا': 'Austria',
  'الأردن': 'Jordan',
  'أوروغواي': 'Uruguay',
  'كولومبيا': 'Colombia',
  'تشيلي': 'Chile',
  'المكسيك': 'Mexico',
  'كندا': 'Canada',
  'الولايات المتحدة': 'USA',
  'أمريكا': 'USA',
  'قطر': 'Qatar',
  'السعودية': 'Saudi Arabia',
  'الإمارات': 'UAE',
  'العراق': 'Iraq',
  'أستراليا': 'Australia',
  'اليابان': 'Japan',
  'كوريا': 'South Korea',
  'بوليفيا': 'Bolivia',
  'الإكوادور': 'Ecuador',
  'كوستاريكا': 'Costa Rica',
  'الكويت': 'Kuwait',
  'البحرين': 'Bahrain',
  'عُمان': 'Oman',
  'فلسطين': 'Palestine',
}

// أنواع المباريات
const MATCH_TYPE_LABELS = {
  'friendly': '🤝 ودية',
  'World Cup': '🌐 كأس العالم',
  'AFCON': '🌍 كأس أمم أفريقيا',
  'Qualifiers': '🎯 تصفيات',
  'Nations League': '🌍 دوري الأمم',
  'UEFA Nations League': '🇪🇺 دوري الأمم الأوروبية',
  'Copa America': '🏆 كوبا أمريكا',
  'Euro': '🇪🇺 يورو',
  'Olympics': '🏅 أولمبياد',
  'U23': '🔷 تحت 23',
  'U21': '🔷 تحت 21',
  'U20': '🔷 تحت 20',
  'U17': '🔷 تحت 17',
}

function getMatchTypeLabel(competition = '') {
  const c = competition.toLowerCase()
  if (c.includes('friendly') || c.includes('international friendl') || c.includes('ودية') || c.includes('وديّة') || c.includes('amical') || c.includes('test match')) return '🤝 مباراة ودية'
  if (c.includes('world cup') || c.includes('كأس العالم') || c.includes('مونديال') || c.includes('fifa')) return '🌐 تصفيات/كأس العالم'
  if (c.includes('afcon') || c.includes('أمم أفريقيا') || c.includes('كان') || c.includes('caf')) return '🌍 كأس أمم أفريقيا'
  if (c.includes('qualifier') || c.includes('تصفيات') || c.includes('qualifying')) return '🎯 تصفيات'
  if (c.includes('nations league') || c.includes('دوري الأمم')) return '🌍 دوري الأمم'
  if (c.includes('copa america')) return '🏆 كوبا أمريكا'
  if (c.includes('euro') || c.includes('يورو')) return '🇪🇺 بطولة أوروبا'
  if (c.includes('olympic') || c.includes('أولمبياد')) return '🏅 أولمبياد'
  if (c.includes('u-23') || c.includes('u23') || c.includes('تحت 23')) return '🔷 تحت 23'
  if (c.includes('u-21') || c.includes('u21') || c.includes('تحت 21')) return '🔷 تحت 21'
  if (c.includes('u-20') || c.includes('u20')) return '🔷 تحت 20'
  if (c.includes('u-17') || c.includes('u17')) return '🔷 تحت 17'
  return '⚽ مباراة دولية'
}

// ══════════════════════════════════════════════════════════════════════════════
// § 2 — كاشف نوع الاستعلام الرياضي
// ══════════════════════════════════════════════════════════════════════════════

/**
 * تصنيف شامل لنوع الاستعلام الرياضي
 */
// ─── استخراج اسم اللاعب من الاستعلام ────────────────────────────────────────
function extractPlayerName(query = '') {
  // "أين يلعب X" / "ما نادي X" / "فريق X" / "أين X الآن"
  const patterns = [
    /(?:أين\s+(?:يلعب|يلعب\s+حالياً?|هو\s+حالياً?)|ما\s+(?:ناد[ي]?|فريق))\s+([\u0600-\u06FF\s]{3,35}?)(?:\s*[؟?]|$)/i,
    /(?:إلى\s+أين|أين)\s+انتقل\s+([\u0600-\u06FF\s]{3,35}?)(?:\s*[؟?]|$)/i,
    /(?:فريق|نادي|ناد[ي]?)\s+([\u0600-\u06FF\s]{3,35}?)(?:\s+(?:الآن|حالياً?|هذا\s+الموسم))?(?:\s*[؟?]|$)/i,
    /^([\u0600-\u06FF]{3,}\s+[\u0600-\u06FF]{3,})/,
  ]
  for (const p of patterns) {
    const m = query.match(p)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  return ''
}

// ─── استخراج الفريق والبطولة للأسئلة التاريخية ──────────────────────────────
function extractTrophyQuery(query = '') {
  // "متى فازت فرنسا بكأس العالم" → team = "فرنسا"
  // "كم مرة فازت الجزائر" → team = "الجزائر"
  const SKIP_WORDS = /^(?:متى|كم|كيف|من|هل|في|ب|ل|ما|مرة|مرات|سنة|عام|تاريخ)$/
  const teamPatterns = [
    // "فازت فرنسا بكأس"
    /(?:فاز|فازت|حصد|أحرز|كسب)\s+([\u0600-\u06FF]{2,20})\s+(?:بكأس|بلقب|ببطولة|في\s+كأس)/i,
    // "متى فازت فرنسا" — team is word AFTER فازت/فاز
    /(?:فاز|فازت)\s+([\u0600-\u06FF]{2,20})/i,
    // "الجزائر بطلة كأس"
    /([\u0600-\u06FF]{2,20})\s+(?:بطل|أبطال|فازت|فاز)\s+(?:كأس|بطولة)/i,
    // "لقب كأس العالم لـ فرنسا"
    /(?:لقب|بطولة|كأس)\s+(?:العالم|أفريقيا)\s+(?:ل|لـ|إلى)\s+([\u0600-\u06FF]{2,20})/i,
  ]
  let team = ''
  for (const p of teamPatterns) {
    const m = query.match(p)
    const candidate = m?.[1]?.trim()
    if (candidate && !SKIP_WORDS.test(candidate) && candidate.length >= 3) {
      team = candidate
      break
    }
  }

  const comp = /(عالم|مونديال|world\s*cup|كأس\s+العالم)/i.test(query) ? 'world'
    : /(أفريقيا|كان|afcon|أمم\s+أفريقيا)/i.test(query) ? 'afcon'
    : /(أوروب|يورو|euro)/i.test(query) ? 'euro'
    : /(أبطال\s+أوروبا|تشامبيونز)/i.test(query) ? 'ucl'
    : 'general'

  return { team, comp }
}

export function classifySportsQuery(query = '') {
  const q = query.trim()

  // ── ① أين يلعب اللاعب حالياً (أولوية عالية) ──────────────────────────────
  if (/(?:أين\s+يلعب|أين\s+هو\s+حالياً?|ما\s+ناد[ي]?|ما\s+فريق|في\s+أي\s+(?:فريق|نادي))\s+/i.test(q)) {
    const player = extractPlayerName(q)
    return { type: 'PLAYER_CURRENT_CLUB', query: q, player }
  }

  // ── ② إلى أين انتقل اللاعب ───────────────────────────────────────────────
  if (/(?:إلى\s+أين|أين)\s+انتقل/i.test(q) || /(?:انتقل|رحل|غادر)\s+(?:إلى|لـ|ل)\s+/i.test(q)) {
    const player = extractPlayerName(q)
    return { type: 'PLAYER_TRANSFER_SPECIFIC', query: q, player }
  }

  // ── ③ أسئلة تاريخ البطولات (متى فازت / كم مرة فاز) ─────────────────────
  if (/(?:متى\s+فاز|متى\s+فازت|كم\s+مرة\s+فاز|أبطال\s+(?:كأس|عالم)|من\s+فاز\s+بكأس|من\s+فاز\s+ب|آخر\s+مرة\s+فاز|سنة\s+الفوز|تاريخ\s+(?:كأس|بطولة))/i.test(q)) {
    const { team, comp } = extractTrophyQuery(q)
    return { type: 'HISTORICAL_TROPHY', query: q, team, comp }
  }

  // ── ④ نمط "A ضد B" أو "A vs B" أو "A × B" أو "A x B" ──────────────────
  const vsMatch = q.match(
    /([\u0600-\u06FFa-zA-Z][^\s،,\-–()[\]؟?×x]{1,25})\s+(?:ضد|vs\.?|contre|×|x)\s+([\u0600-\u06FFa-zA-Z][^\s،,\-–()[\]؟?×x]{1,25})/iu
  )
  if (vsMatch) {
    return {
      type: 'MATCH_SEARCH',
      team1: vsMatch[1].trim(),
      team2: vsMatch[2].trim(),
      temporal: detectTemporalContext(q),
    }
  }

  // ── ⑤ منتخبان بجوار بعض (الجزائر بوليفيا) ─────────────────────────────
  const teams = Object.keys(TEAM_AR_TO_EN)
  for (const t1 of teams) {
    for (const t2 of teams) {
      if (t1 === t2) continue
      if (q.includes(t1) && q.includes(t2)) {
        return {
          type: 'MATCH_SEARCH',
          team1: t1,
          team2: t2,
          temporal: detectTemporalContext(q),
        }
      }
    }
  }

  // ── ⑥ انتقالات وصفقات (عامة) ────────────────────────────────────────────
  if (/انتقل|انتقال|صفقة|تعاقد|ضم|اشترى|بيع|عرض.*شراء|رحل|غادر|وقّع|عقد|transfert|mercato/i.test(q)) {
    return { type: 'TRANSFER_NEWS', query: q }
  }

  // ── ⑦ أخبار لاعب ─────────────────────────────────────────────────────────
  if (/لاعب|player|إصابة|عاد.*ملاعب|عاد.*اللعب|إيقاف|تعليق|عقوبة|إنجاز|هدف.*لاعب|تشكيلة/i.test(q)) {
    return { type: 'PLAYER_INFO', query: q }
  }

  // ── ⑧ رزنامة / جدول مباريات ──────────────────────────────────────────────
  if (/رزنامة|جدول.*مباريات|fixture|schedule|برنامج.*مباريات|متى.*مباراة|موعد.*مباراة/i.test(q)) {
    return { type: 'FIXTURE_SCHEDULE', query: q }
  }

  // ── ⑨ أخبار رياضية عامة ──────────────────────────────────────────────────
  if (/خبر|أخبار|عاجل|مستجد|رياضة|كرة|football|soccer/i.test(q)) {
    return { type: 'SPORTS_NEWS', query: q }
  }

  return { type: 'GENERAL_SPORTS', query: q }
}

function detectTemporalContext(msg = '') {
  const LIVE_KW     = /(?:الآن|مباشر|مباشرة|جارية|هذه\s+اللحظة|الشوط|live\s*now|en\s+direct)/i
  const PAST_KW     = /(?:لعبت|انتهت|انتهى|نتيجة|فاز|ربح|هزم|كانت?|أمس|البارح|الأسبوع\s+الماضي|الشهر\s+الماضي|في\s+\d{4}|آخر\s+مباراة|قديمة|سابقة|أرشيف)/i
  const UPCOMING_KW = /(?:ستلعب|القادمة?|غداً?|بعد\s+غد|الأسبوع\s+القادم|موعد|متى\s+ست|برنامج|مرتقبة?|مقرر)/i
  if (LIVE_KW.test(msg))     return 'LIVE'
  if (PAST_KW.test(msg))     return 'PAST'
  if (UPCOMING_KW.test(msg)) return 'UPCOMING'
  return 'UNKNOWN'
}

// ══════════════════════════════════════════════════════════════════════════════
// § 2b — TheSportsDB — مصدر رئيسي لمباريات المنتخبات الوطنية (مجاني، موثوق)
// ══════════════════════════════════════════════════════════════════════════════

// خريطة: اسم الفريق العربي → TheSportsDB team ID
export const NATIONAL_TEAM_IDS = {
  'الجزائر':           '134516',
  'المغرب':            '134514',
  'تونس':              '134518',
  'مصر':               '134509',
  'ليبيا':             '134513',
  'موريتانيا':         '136188',
  'السنغال':           '134517',
  'نيجيريا':           '134530',
  'الكاميرون':         '134504',
  'غانا':              '134508',
  'ساحل العاج':        '134505',
  'كوت ديفوار':        '134505',
  'مالي':              '155726',
  'جنوب أفريقيا':      '134519',
  'فرنسا':             '134842',
  'إسبانيا':           '133629',
  'ألمانيا':           '133600',
  'إيطاليا':           '134829',
  'إنجلترا':           '133604',
  'البرتغال':          '134625',
  'هولندا':            '134612',
  'هولاندا':           '134612',
  'هولاند':            '134612',
  'بلجيكا':            '134581',
  'تركيا':             '134653',
  'كرواتيا':           '134592',
  'السويد':            '134647',
  'الدنمارك':          '134593',
  'سويسرا':            '134648',
  'البرازيل':          '136375',
  'الأرجنتين':         '136368',
  'أوروغواي':          '136474',
  'كولومبيا':          '136413',
  'تشيلي':             '136406',
  'بيرو':              '136451',
  'المكسيك':           '136442',
  'كندا':              '134872',
  'الولايات المتحدة':  '135029',
  'أمريكا':            '135029',
  'قطر':               '134903',
  'السعودية':          '134907',
  'الإمارات':          '134908',
  'العراق':            '134895',
  'إيران':             '134896',
  'أستراليا':          '134777',
  'اليابان':           '134858',
  'كوريا':             '134859',
  'بوليفيا':           '136470',
  'الإكوادور':         '136419',
  'باراغواي':          '136449',
  'فنزويلا':           '136475',
  'كوستاريكا':         '135012',
  'الكويت':            '134898',
  'البحرين':           '134889',
  'عُمان':             '134902',
  'فلسطين':            '134903',
  'بوركينا فاسو':      '155694',
  'بوركينا':           '155694',
}

// ترجمة أسماء الفرق إلى إنجليزي لـ TheSportsDB
const TSDB_EN_NAMES = {
  'الجزائر': 'Algeria',
  'المغرب': 'Morocco',
  'تونس': 'Tunisia',
  'مصر': 'Egypt',
  'بوليفيا': 'Bolivia',
  'السنغال': 'Senegal',
  'فرنسا': 'France',
  'إسبانيا': 'Spain',
  'البرازيل': 'Brazil',
  'الأرجنتين': 'Argentina',
  'ألمانيا': 'Germany',
  'إيطاليا': 'Italy',
  'إنجلترا': 'England',
}

/**
 * جلب مباريات منتخب وطني من TheSportsDB (الأحداث القادمة والماضية)
 */
async function fetchTheSportsDBFixtures(teamId, type = 'next') {
  if (!teamId) return []
  try {
    const endpoint = type === 'next'
      ? `https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${teamId}`
      : `https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${teamId}`

    const res = await timedFetch(endpoint, {
      headers: { 'User-Agent': 'DZ-GPT-SportsAgent/2.0' },
      timeout: 10000,
    })
    if (!res.ok) return []
    const data = await res.json()
    const events = data?.events || []

    return events.map(e => {
      // تحديد حالة المباراة
      const now = Date.now()
      const matchTs = e.dateEvent && e.strTime
        ? new Date(`${e.dateEvent}T${e.strTime}Z`).getTime()
        : e.dateEvent ? new Date(e.dateEvent).getTime() : 0

      let statusType = 'upcoming'
      if (type === 'last' || (matchTs && matchTs < now - 3600000)) statusType = 'finished'

      return {
        homeTeam: e.strHomeTeam || '',
        awayTeam: e.strAwayTeam || '',
        homeScore: e.intHomeScore != null && e.intHomeScore !== '' ? parseInt(e.intHomeScore) : null,
        awayScore: e.intAwayScore != null && e.intAwayScore !== '' ? parseInt(e.intAwayScore) : null,
        statusType,
        date: e.dateEvent || '',
        startTime: e.strTime ? e.strTime.slice(0, 5) : '',
        league: e.strLeague || '',
        competition: e.strLeague || '',
        venue: e.strVenue || '',
        city: e.strCity || '',
        country: e.strCountry || '',
        matchId: e.idEvent || '',
        link: e.idEvent
          ? `https://www.thesportsdb.com/event/${e.idEvent}`
          : 'https://www.thesportsdb.com',
        source: 'TheSportsDB',
        thumbnailUrl: e.strThumb || '',
        round: e.intRound ? `الجولة ${e.intRound}` : '',
      }
    })
  } catch (e) {
    console.warn('[TheSportsDB] fetch error:', e.message)
    return []
  }
}

/**
 * البحث عن مباراة بين فريقين في TheSportsDB
 * يجلب مباريات كلا الفريقين (القادمة + السابقة) ويجد التقاطع
 */
async function searchTheSportsDBMatch(team1 = '', team2 = '') {
  const id1 = NATIONAL_TEAM_IDS[team1] || NATIONAL_TEAM_IDS[
    Object.keys(NATIONAL_TEAM_IDS).find(k =>
      team1.includes(k) || k.includes(team1) ||
      (TSDB_EN_NAMES[k] || '').toLowerCase().includes(team1.toLowerCase()))
  ]
  const id2 = NATIONAL_TEAM_IDS[team2] || NATIONAL_TEAM_IDS[
    Object.keys(NATIONAL_TEAM_IDS).find(k =>
      team2.includes(k) || k.includes(team2) ||
      (TSDB_EN_NAMES[k] || '').toLowerCase().includes(team2.toLowerCase()))
  ]

  if (!id1 && !id2) return []

  const promises = []
  if (id1) {
    promises.push(fetchTheSportsDBFixtures(id1, 'next'))
    promises.push(fetchTheSportsDBFixtures(id1, 'last'))
  }
  if (id2 && id2 !== id1) {
    promises.push(fetchTheSportsDBFixtures(id2, 'next'))
    promises.push(fetchTheSportsDBFixtures(id2, 'last'))
  }

  const results = await Promise.allSettled(promises)
  const allMatches = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)

  // البحث عن المباراة المشتركة
  const terms1 = normalizeTeamSearch(team1)
  const terms2 = normalizeTeamSearch(team2)

  // أضف أسماء إنجليزية للبحث
  const en1 = TSDB_EN_NAMES[team1] || TEAM_AR_TO_EN[team1] || team1
  const en2 = TSDB_EN_NAMES[team2] || TEAM_AR_TO_EN[team2] || team2
  if (en1) terms1.push(en1.toLowerCase())
  if (en2) terms2.push(en2.toLowerCase())

  return allMatches.filter(m => {
    const h = (m.homeTeam || '').toLowerCase()
    const a = (m.awayTeam || '').toLowerCase()
    return (terms1.some(t => h.includes(t) || t.includes(h.split(' ')[0])) &&
            terms2.some(t => a.includes(t) || t.includes(a.split(' ')[0]))) ||
           (terms2.some(t => h.includes(t) || t.includes(h.split(' ')[0])) &&
            terms1.some(t => a.includes(t) || t.includes(a.split(' ')[0])))
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// § 3 — جلب مباريات FotMob بتواريخ متعددة (مُحسَّن)
// ══════════════════════════════════════════════════════════════════════════════

const FOTMOB_HDR = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'ar,en;q=0.9',
  'Referer': 'https://www.fotmob.com/',
}

const SOFA_HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.sofascore.com/',
}

const SCORE365_HDR = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
  'Referer': 'https://www.365scores.com/ar/',
  'Origin': 'https://www.365scores.com',
}

// جلب مباريات FotMob ليوم محدد
async function fetchFotmobForDate(dateStr) {
  try {
    const d = dateStr.replace(/-/g, '')
    const url = `https://www.fotmob.com/api/matches?date=${d}`
    const res = await timedFetch(url, { headers: FOTMOB_HDR, timeout: 10000 })
    if (!res.ok) return []
    const json = await res.json()
    const all = []
    for (const lg of (json?.leagues || [])) {
      for (const m of (lg.matches || [])) {
        const status = m.status?.finished ? 'finished' : m.status?.started ? 'live' : 'upcoming'
        const startTs = m.status?.utcTime ? new Date(m.status.utcTime) : null
        all.push({
          homeTeam: m.home?.name || m.home?.longName || '',
          awayTeam: m.away?.name || m.away?.longName || '',
          homeScore: m.home?.score ?? null,
          awayScore: m.away?.score ?? null,
          statusType: status,
          startTime: startTs ? startTs.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
          date: dateStr,
          league: lg.name || '',
          leagueId: lg.id,
          matchId: m.id,
          link: m.id ? `https://www.fotmob.com/matches/${m.id}` : 'https://www.fotmob.com',
          source: 'FotMob',
        })
      }
    }
    return all
  } catch (_) { return [] }
}

// جلب مباريات 365score ليوم محدد
async function fetch365ForDate(dateStr) {
  try {
    const dateParam = dateStr.replace(/-/g, '')
    const url = `https://webws.365scores.com/web/games/?appTypeId=5&langId=1&timezoneName=Africa%2FAlgiers&userCountryId=44&dates=${dateParam}`
    const res = await timedFetch(url, { headers: SCORE365_HDR, timeout: 10000 })
    if (!res.ok) return []
    const json = await res.json()
    const games = json?.games || []
    return games.map(g => {
      const statusId = g.status?.id
      const statusType = [2,3,4].includes(statusId) ? 'live' : statusId === 5 ? 'finished' : 'upcoming'
      const startTs = g.startTime ? new Date(g.startTime) : null
      return {
        homeTeam: g.homeCompetitor?.name || g.homeCompetitor?.shortName || '',
        awayTeam: g.awayCompetitor?.name || g.awayCompetitor?.shortName || '',
        homeScore: (statusType === 'live' || statusType === 'finished') ? (g.homeCompetitor?.score ?? null) : null,
        awayScore: (statusType === 'live' || statusType === 'finished') ? (g.awayCompetitor?.score ?? null) : null,
        statusType,
        startTime: startTs ? startTs.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
        date: dateStr,
        league: g.competitionDisplayName || '',
        leagueId: g.competitionId,
        venue: g.venue?.name || '',
        matchId: g.id,
        link: g.id ? `https://www.365scores.com/ar/football/match/${g.id}` : 'https://www.365scores.com/ar/',
        source: '365score',
      }
    }).filter(m => m.homeTeam && m.awayTeam)
  } catch (_) { return [] }
}

// جلب مباريات SofaScore ليوم محدد
async function fetchSofaForDate(dateStr) {
  try {
    const res = await timedFetch(
      `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${dateStr}`,
      { headers: SOFA_HDR, timeout: 10000 }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data?.events || []).map(e => {
      const startTs = e.startTimestamp ? new Date(e.startTimestamp * 1000) : null
      const isLive = e.status?.type === 'inprogress'
      const isFinished = e.status?.type === 'finished'
      return {
        homeTeam: e.homeTeam?.name || '',
        awayTeam: e.awayTeam?.name || '',
        homeScore: (isLive || isFinished) ? (e.homeScore?.current ?? null) : null,
        awayScore: (isLive || isFinished) ? (e.awayScore?.current ?? null) : null,
        statusType: e.status?.type || 'upcoming',
        startTime: startTs ? startTs.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
        date: dateStr,
        league: e.tournament?.name || '',
        country: e.tournament?.category?.country?.name || '',
        venue: e.venue?.city?.name || '',
        matchId: e.id,
        link: e.id ? `https://www.sofascore.com/event/${e.id}` : 'https://www.sofascore.com',
        source: 'SofaScore',
      }
    })
  } catch (_) { return [] }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 4 — جلب تفاصيل مباراة من FotMob (التشكيلة والملعب)
// ══════════════════════════════════════════════════════════════════════════════

async function fetchFotmobMatchDetails(matchId) {
  if (!matchId) return null
  try {
    const res = await timedFetch(
      `https://www.fotmob.com/api/matchDetails?matchId=${matchId}`,
      { headers: FOTMOB_HDR, timeout: 10000 }
    )
    if (!res.ok) return null
    const d = await res.json()
    const general = d?.general || {}
    const content  = d?.content || {}

    const homeLineup = content?.lineup?.homeTeam?.players || []
    const awayLineup = content?.lineup?.awayTeam?.players || []

    const extractSquad = (players) => players
      .flat()
      .filter(p => p?.name)
      .map(p => ({ name: p.name, position: p.positionBowId || '' }))
      .slice(0, 11)

    return {
      matchId,
      venue: general.venue?.name || '',
      city: general.venue?.city || '',
      competition: general.leagueName || '',
      round: general.roundName || '',
      homeSquad: extractSquad(homeLineup),
      awaySquad: extractSquad(awayLineup),
      referee: content?.matchFacts?.referee?.text || '',
      attendance: content?.matchFacts?.attendance?.text || '',
      source: 'FotMob',
    }
  } catch (_) { return null }
}

// جلب تفاصيل مباراة من SofaScore
async function fetchSofaMatchDetails(matchId) {
  if (!matchId) return null
  try {
    const [detailRes, lineupRes] = await Promise.allSettled([
      timedFetch(`https://api.sofascore.com/api/v1/event/${matchId}`, { headers: SOFA_HDR, timeout: 8000 }),
      timedFetch(`https://api.sofascore.com/api/v1/event/${matchId}/lineups`, { headers: SOFA_HDR, timeout: 8000 }),
    ])

    const detail = detailRes.status === 'fulfilled' && detailRes.value.ok
      ? await detailRes.value.json() : null
    const lineup = lineupRes.status === 'fulfilled' && lineupRes.value.ok
      ? await lineupRes.value.json() : null

    const e = detail?.event || {}
    const homeLineup = lineup?.home?.players || []
    const awayLineup = lineup?.away?.players || []

    const extractSquad = (players) => players
      .filter(p => p?.player?.name)
      .map(p => ({ name: p.player.name, position: p.player.position || '' }))
      .slice(0, 11)

    return {
      matchId,
      venue: e.venue?.city?.name || '',
      competition: e.tournament?.name || '',
      homeSquad: extractSquad(homeLineup),
      awaySquad: extractSquad(awayLineup),
      source: 'SofaScore',
    }
  } catch (_) { return null }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 5 — جلب أخبار CAF/FIFA عبر RSS
// ══════════════════════════════════════════════════════════════════════════════

async function fetchSportsNewsRSS(teamA = '', teamB = '') {
  const feeds = [
    { url: 'https://www.cafonline.com/feed/', name: 'CAF' },
    { url: 'https://www.fifa.com/en/news.rss', name: 'FIFA' },
    { url: 'https://www.alhaddaf.com/feed/', name: 'الهداف' },
  ]

  const queries = [teamA, teamB].filter(Boolean).map(t => t.toLowerCase())
  const results = []

  await Promise.allSettled(feeds.map(async feed => {
    try {
      const res = await timedFetch(feed.url, {
        headers: { 'User-Agent': 'DZ-GPT/1.0', 'Accept': 'application/rss+xml,text/xml,*/*' },
        timeout: 8000,
      })
      if (!res.ok) return
      const xml = await res.text()
      const items = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/gi) || []
      for (const item of items.slice(0, 20)) {
        const titleM = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)
        const linkM  = item.match(/<link>(https?:\/\/[^\s<]+)<\/link>/i)
        const dateM  = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)
        if (!titleM) continue
        const title = titleM[1].replace(/<[^>]+>/g, '').trim()
        const relevant = !queries.length || queries.some(q => title.toLowerCase().includes(q))
        if (relevant) {
          results.push({
            title,
            link: linkM?.[1] || feed.url,
            date: dateM?.[1]?.trim() || '',
            source: feed.name,
          })
        }
      }
    } catch (_) {}
  }))

  return results.slice(0, 8)
}

// ══════════════════════════════════════════════════════════════════════════════
// § 6 — دالة المطابقة بين اسم الفريق والمباريات
// ══════════════════════════════════════════════════════════════════════════════

function normalizeTeamSearch(name = '') {
  const n = name.toLowerCase().trim()
  // ترجمة عربي → إنجليزي
  const en = TEAM_AR_TO_EN[name] || TEAM_AR_TO_EN[
    Object.keys(TEAM_AR_TO_EN).find(k => n.includes(k.toLowerCase()) || k.toLowerCase().includes(n))
  ] || name
  return [n, en.toLowerCase(), name]
}

function matchesTeam(matchName = '', searchTerms = []) {
  const mn = matchName.toLowerCase().trim()
  return searchTerms.some(term => {
    const t = term.toLowerCase().trim()
    if (!t || !mn) return false
    // تطابق كامل أو احتواء
    if (mn === t) return true
    if (mn.includes(t) && t.length >= 4) return true
    if (t.includes(mn) && mn.length >= 4) return true
    // تطابق بادئة (6 أحرف على الأقل لمنع التطابق الزائف)
    if (mn.length >= 6 && t.length >= 6 && mn.slice(0, 6) === t.slice(0, 6)) return true
    return false
  })
}

function findMatchInList(matches = [], team1 = '', team2 = '') {
  const terms1 = normalizeTeamSearch(team1)
  const terms2 = normalizeTeamSearch(team2)
  return matches.filter(m => {
    const h = m.homeTeam || m.home || ''
    const a = m.awayTeam || m.away || ''
    return (matchesTeam(h, terms1) && matchesTeam(a, terms2)) ||
           (matchesTeam(h, terms2) && matchesTeam(a, terms1))
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// § 7 — البحث عن مباراة محددة عبر نطاق زمني واسع
// ══════════════════════════════════════════════════════════════════════════════

/**
 * searchMatchAcrossDates(team1, team2, options)
 *
 * استراتيجية البحث (بالأولوية):
 *   1. TheSportsDB — مباريات المنتخبات الوطنية (الأفضل للوديات والتصفيات)
 *   2. 365score + FotMob — بحث يومي على نطاق زمني واسع
 *
 * يُعيد مصفوفة مرتبة: القادمة أولاً ← الحية ← المنتهية
 */
export async function searchMatchAcrossDates(team1 = '', team2 = '', options = {}) {
  const { temporal = 'UNKNOWN', maxPastDays = 60, maxFutureDays = 120 } = options

  const found = []

  // ══ المرحلة 1: TheSportsDB (الأسرع والأموثوق للمنتخبات) ══════════════════
  try {
    const tsdbMatches = await searchTheSportsDBMatch(team1, team2)
    for (const m of tsdbMatches) {
      if (!found.some(f => f.date === m.date && f.homeTeam === m.homeTeam)) {
        found.push(m)
      }
    }
    if (found.length > 0) {
      console.log(`[SportsAgent:TSDB] ✅ Found ${found.length} matches via TheSportsDB`)
      return sortMatchResults(found)
    }
  } catch (e) {
    console.warn('[SportsAgent:TSDB] failed:', e.message)
  }

  // ══ المرحلة 2: بحث يومي في 365score + FotMob ══════════════════════════════
  const today = new Date()
  const dateList = []

  if (temporal === 'UPCOMING') {
    for (let i = 0; i <= maxFutureDays; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i)
      dateList.push({ str: d.toISOString().slice(0, 10), type: 'future' })
    }
  } else if (temporal === 'PAST') {
    for (let i = 1; i <= maxPastDays; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      dateList.push({ str: d.toISOString().slice(0, 10), type: 'past' })
    }
  } else {
    // UNKNOWN: اليوم + 3 أيام مستقبل + 14 يوم ماضٍ في coreRange (يجد الجزائر-هولندا فوراً)
    // ثم يوسّع للمستقبل البعيد والماضي البعيد في extendedRange
    for (let i = 0; i <= 3; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i)
      dateList.push({ str: d.toISOString().slice(0, 10), type: 'future' })
    }
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      dateList.push({ str: d.toISOString().slice(0, 10), type: 'past' })
    }
    // التوسيع: المستقبل 4-30 + الماضي 15-30
    for (let i = 4; i <= 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i)
      dateList.push({ str: d.toISOString().slice(0, 10), type: 'future' })
    }
    for (let i = 15; i <= 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      dateList.push({ str: d.toISOString().slice(0, 10), type: 'past' })
    }
  }

  const coreRange = dateList.slice(0, 15)
  const extendedRange = dateList.slice(15)

  const corePromises = coreRange.flatMap(({ str }) => [
    fetch365ForDate(str).then(ms => ({ date: str, matches: ms })),
    fetchFotmobForDate(str).then(ms => ({ date: str, matches: ms })),
  ])

  const coreResults = await Promise.allSettled(corePromises)
  for (const r of coreResults) {
    if (r.status !== 'fulfilled') continue
    const relevant = findMatchInList(r.value.matches, team1, team2)
    for (const m of relevant) {
      if (!found.some(f => f.date === r.value.date && f.homeTeam === m.homeTeam)) {
        found.push({ ...m, date: r.value.date })
      }
    }
  }

  if (found.length > 0) return sortMatchResults(found)

  const batchSize = 5
  for (let i = 0; i < Math.min(extendedRange.length, 45); i += batchSize) {
    const batch = extendedRange.slice(i, i + batchSize)
    const batchPromises = batch.flatMap(({ str }) => [
      fetch365ForDate(str).then(ms => ({ date: str, matches: ms })),
      fetchFotmobForDate(str).then(ms => ({ date: str, matches: ms })),
    ])
    const results = await Promise.allSettled(batchPromises)
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      const relevant = findMatchInList(r.value.matches, team1, team2)
      for (const m of relevant) {
        if (!found.some(f => f.date === r.value.date && f.homeTeam === m.homeTeam)) {
          found.push({ ...m, date: r.value.date })
        }
      }
    }
    if (found.length > 0) break
  }

  return sortMatchResults(found)
}

function sortMatchResults(matches = []) {
  const now = Date.now()
  const order = { live: 0, upcoming: 1, finished: 2 }
  return matches.sort((a, b) => {
    const orderDiff = (order[a.statusType] ?? 3) - (order[b.statusType] ?? 3)
    if (orderDiff !== 0) return orderDiff
    const da = a.date ? new Date(a.date).getTime() : now
    const db = b.date ? new Date(b.date).getTime() : now
    if (a.statusType === 'upcoming') return da - db
    return db - da
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// § 8 — بناء سياق المباراة المُفصَّل (نص منسق للـ LLM)
// ══════════════════════════════════════════════════════════════════════════════

function getTeamFlag(name = '') {
  const n = name.trim()
  if (TEAM_FLAGS[n]) return TEAM_FLAGS[n]
  for (const [key, flag] of Object.entries(TEAM_FLAGS)) {
    if (n.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(n.toLowerCase())) {
      return flag
    }
  }
  return getCountryFlag(n) || '🏴'
}

function formatDateArabic(dateStr = '') {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ar-DZ', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Africa/Algiers',
    })
  } catch (_) { return dateStr }
}

/**
 * buildMatchDetailedBlock(match, details?)
 * يبني كتلة نصية شاملة لمباراة محددة مع الأعلام والجداول
 */
export function buildMatchDetailedBlock(match = {}, details = null) {
  const flag1 = getTeamFlag(match.homeTeam || '')
  const flag2 = getTeamFlag(match.awayTeam || '')
  const competition = match.league || match.competition || ''
  const matchType = getMatchTypeLabel(competition)
  const dateLabel = formatDateArabic(match.date)

  const lines = []

  // ── 🏆 المباراة ───────────────────────────────────────────
  const statusBadge = match.statusType === 'live'
    ? '🔴 مباشر'
    : match.statusType === 'finished'
      ? '✅ انتهت'
      : '📅 قادمة'

  lines.push(`### 🏆 المباراة`)
  lines.push(`${flag1} **${match.homeTeam}** ضد **${match.awayTeam}** ${flag2}`)
  lines.push(`> ${statusBadge}${competition ? ` — ${competition}` : ''}${dateLabel ? ` — ${dateLabel}` : ''}`)
  lines.push('')

  // ── ⚽ النتيجة ────────────────────────────────────────────
  if (match.homeScore !== null && match.homeScore !== undefined &&
      match.awayScore !== null && match.awayScore !== undefined) {
    lines.push(`⚽ **النتيجة:** ${flag1} **${match.homeTeam} ${match.homeScore} – ${match.awayScore} ${match.awayTeam}** ${flag2}`)
  } else if (match.startTime) {
    lines.push(`⏰ **الموعد:** ${match.startTime} (توقيت الجزائر)`)
  }

  // ── تفاصيل المكان والنوع ───────────────────────────────────
  const venue = details?.venue || match.venue || ''
  const city  = details?.city  || match.city  || ''
  if (competition)         lines.push(`🏆 **البطولة:** ${competition}`)
  if (matchType)           lines.push(`🎯 **النوع:** ${matchType}`)
  if (venue)               lines.push(`🏟️ **الملعب:** ${venue}${city ? ` — ${city}` : ''}`)
  if (details?.referee)    lines.push(`👨‍⚖️ **الحكم:** ${details.referee}`)
  if (details?.attendance)  lines.push(`👥 **الحضور:** ${details.attendance.toLocaleString('ar')}`)

  // ── 🥅 الهدافون ───────────────────────────────────────────
  const goals = details?.goals || match.goals || []
  if (goals.length) {
    lines.push(`\n🥅 **الهدافون:**`)
    for (const g of goals) {
      const playerFlag = getTeamFlag(g.team || '')
      lines.push(`• ${playerFlag} **${g.player || '?'}** ${g.minute ? `(${g.minute}')` : ''} — ${g.team || ''}${g.assist ? ` ← تمريرة: ${g.assist}` : ''}`)
    }
  }

  // ── 🎯 صناع الأهداف ───────────────────────────────────────
  const assists = details?.assists || match.assists || []
  if (assists.length) {
    lines.push(`\n🎯 **صناع الأهداف:**`)
    for (const a of assists) {
      lines.push(`• **${a.player || '?'}** ${a.minute ? `(${a.minute}')` : ''} — ${a.team || ''}`)
    }
  }

  // ── 📋 التشكيلة ──────────────────────────────────────────
  if (details?.homeSquad?.length || details?.awaySquad?.length) {
    lines.push(`\n📋 **التشكيلة:**`)
    lines.push(`| ${flag1} ${match.homeTeam} | ${flag2} ${match.awayTeam} |`)
    lines.push(`|:---|:---|`)
    const maxLen = Math.max(details.homeSquad?.length || 0, details.awaySquad?.length || 0)
    for (let i = 0; i < maxLen; i++) {
      const hp = details.homeSquad?.[i]?.name || ''
      const ap = details.awaySquad?.[i]?.name || ''
      lines.push(`| ${hp} | ${ap} |`)
    }
  }

  // ── 📊 الإحصائيات ────────────────────────────────────────
  const stats = details?.stats || match.stats || null
  if (stats) {
    lines.push(`\n📊 **الإحصائيات:**`)
    lines.push(`| المؤشر | ${flag1} ${match.homeTeam} | ${flag2} ${match.awayTeam} |`)
    lines.push(`|:---|:---:|:---:|`)
    const statItems = [
      ['الاستحواذ', stats.homePossession, stats.awayPossession],
      ['التسديدات', stats.homeShots, stats.awayShots],
      ['على المرمى', stats.homeShotsOn, stats.awayShotsOn],
      ['الركنيات', stats.homeCorners, stats.awayCorners],
      ['الأخطاء', stats.homeFouls, stats.awayFouls],
      ['البطاقات الصفراء', stats.homeYellow, stats.awayYellow],
      ['البطاقات الحمراء', stats.homeRed, stats.awayRed],
    ]
    for (const [label, h, a] of statItems) {
      if (h != null || a != null) {
        lines.push(`| ${label} | ${h ?? '—'} | ${a ?? '—'} |`)
      }
    }
  }

  // ── ⭐ أفضل لاعب ──────────────────────────────────────────
  const motm = details?.motm || match.motm || null
  if (motm) {
    const motmFlag = getTeamFlag(motm.team || '')
    lines.push(`\n⭐ **أفضل لاعب:** ${motmFlag} **${motm.name || motm}**${motm.rating ? ` — تقييم: ${motm.rating}/10` : ''}`)
  }

  const _srcFavicon = {
    'FotMob':   `[![FotMob](https://www.google.com/s2/favicons?sz=32&domain=fotmob.com)](https://fotmob.com)`,
    '365score': `[![365score](https://www.google.com/s2/favicons?sz=32&domain=365scores.com)](https://365scores.com)`,
    'Kooora':   `[![Kooora](https://www.google.com/s2/favicons?sz=32&domain=kooora.com)](https://kooora.com)`,
    'SofaScore':`[![SofaScore](https://www.google.com/s2/favicons?sz=32&domain=sofascore.com)](https://sofascore.com)`,
    'jdwel':    `[![jdwel](https://www.google.com/s2/favicons?sz=32&domain=jdwel.com)](https://jdwel.com)`,
    'Kooora-Algeria': `[![Kooora](https://www.google.com/s2/favicons?sz=32&domain=kooora.com)](https://kooora.com)`,
  }
  const _srcBadge = _srcFavicon[match.source] || ''
  if (_srcBadge || match.link) {
    lines.push(`\n${_srcBadge}${match.link ? ` [↗](${match.link})` : ''}`)
  }

  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════════════
// § 9 — الوكيل الرياضي الرئيسي
// ══════════════════════════════════════════════════════════════════════════════

/**
 * runSportsAgent(query, history?)
 *
 * نقطة الدخول الرئيسية للوكيل الرياضي.
 *
 * يُعيد:
 * {
 *   found: boolean,
 *   type: 'MATCH_SEARCH' | 'PLAYER_INFO' | 'TRANSFER_NEWS' | 'SPORTS_NEWS' | ...,
 *   context: string,           // كتلة نصية منسقة للـ LLM
 *   matches?: [...],           // المباريات المُكتشفة
 *   details?: {...},           // تفاصيل المباراة
 *   sources: string[],
 *   fetchedAt: string,
 * }
 */
export async function runSportsAgent(query = '', history = []) {
  const classification = classifySportsQuery(query)
  const fetchedAt = new Date().toISOString()

  console.log(`[SportsAgent] 🏆 Query: "${query.slice(0, 80)}" → type=${classification.type}`)

  // ══ WC2026 EARLY INTERCEPT — فحص فوري للمباريات بين فرق WC2026 ══════════
  // يمنع runSportsAgent من الوصول إلى LLM أو APIs خارجية عندما يكون الفريقان في WC2026
  if (classification.type === 'MATCH_SEARCH' && classification.team1 && classification.team2) {
    try {
      const { detectAndBuildWC2026MatchVs, buildWC2026MatchVsResponse } = await import('./dz-sports-knowledge.js')
      // محاولة 1: اكتشاف تلقائي من نص الاستعلام
      const _wc2026mv = detectAndBuildWC2026MatchVs(query)
      if (_wc2026mv?.response) {
        console.log(`[SportsAgent:WC2026⚡] ${_wc2026mv.team1} ضد ${_wc2026mv.team2} → local WC2026 data`)
        return {
          found: true,
          type: 'WC2026_MATCHVS',
          team1: _wc2026mv.team1,
          team2: _wc2026mv.team2,
          context: _wc2026mv.response,
          userResponse: _wc2026mv.response,
          sources: ['DZ-Sports-Knowledge-WC2026'],
          wc2026: true,
          fetchedAt,
        }
      }
      // محاولة 2: باستخدام team1/team2 المستخرجَين من classifySportsQuery
      const _wc2026direct = buildWC2026MatchVsResponse(classification.team1, classification.team2)
      if (_wc2026direct) {
        console.log(`[SportsAgent:WC2026⚡] ${classification.team1} ضد ${classification.team2} → local WC2026 data`)
        return {
          found: true,
          type: 'WC2026_MATCHVS',
          team1: classification.team1,
          team2: classification.team2,
          context: _wc2026direct,
          userResponse: _wc2026direct,
          sources: ['DZ-Sports-Knowledge-WC2026'],
          wc2026: true,
          fetchedAt,
        }
      }
    } catch (_wc2026err) {
      console.warn('[SportsAgent:WC2026] intercept error (non-fatal):', _wc2026err?.message)
    }
  }
  // ══════════════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════════════
  // ── 🌟 PLAYER_CURRENT_CLUB — أين يلعب اللاعب حالياً ─────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (classification.type === 'PLAYER_CURRENT_CLUB' || classification.type === 'PLAYER_TRANSFER_SPECIFIC') {
    const rawPlayer = classification.player || ''
    console.log(`[SportsAgent] 👤 Player query: "${rawPlayer}"`)

    // ① بحث في الأرشيف المحلي أولاً (فوري، موثوق)
    const archiveResult = searchPlayerInfo(rawPlayer || query)
    if (archiveResult.found) {
      const block = buildPlayerInfoBlock(archiveResult.key, archiveResult.player)
      const isTransfer = classification.type === 'PLAYER_TRANSFER_SPECIFIC'
      const p = archiveResult.player
      let extra = ''
      if (isTransfer && p.transferHistory?.length) {
        const last = p.transferHistory[p.transferHistory.length - 1]
        extra = `\n\n📌 **آخر انتقال:** ${last.season || '?'}: من **${last.from}** إلى **${last.to}** (${last.type || ''})${last.fee ? ` — ${last.fee}` : ''}`
      }
      const ctx = block + extra
      return {
        found: true,
        type: classification.type,
        playerName: archiveResult.key,
        context: ctx,
        userResponse: ctx,
        sources: ['DZ-Sports-Archive'],
        fetchedAt,
      }
    }

    // ② fallback للـ API الخارجي
    if (rawPlayer) {
      try {
        const [identity, transfers] = await Promise.allSettled([
          getPlayerIdentity(rawPlayer),
          getTransfers(rawPlayer),
        ])
        const pid = identity.status === 'fulfilled' && !isUnavailable(identity.value) ? identity.value : null
        const trn = transfers.status === 'fulfilled' && !isUnavailable(transfers.value) ? transfers.value : null

        if (pid || trn) {
          const lines = [`━━━ ⚽ معلومات اللاعب: **${rawPlayer}** ━━━\n`]
          if (pid) {
            const flag = getTeamFlag(pid.nationality || '')
            lines.push(`👤 **${pid.name || rawPlayer}** ${flag}`)
            if (pid.nationality) lines.push(`🌍 الجنسية: ${pid.nationality}`)
            if (pid.club) lines.push(`🏟️ **النادي الحالي: ${pid.club}**`)
            if (pid.position) lines.push(`🎽 المركز: ${pid.position}`)
            if (pid.dob) lines.push(`📅 تاريخ الميلاد: ${pid.dob}`)
            if (pid.summary) lines.push(`\n📖 ${pid.summary.slice(0, 350)}...`)
          }
          if (trn?.transfers?.length) {
            lines.push(`\n### 🔄 سجل الانتقالات`)
            for (const t of trn.transfers.slice(0, 5)) {
              lines.push(`• ${t.date || '?'}: من ${t.from || '?'} ← **${t.to || '?'}** (${t.type || 'انتقال'})`)
            }
          }
          const ctx = lines.join('\n')
          return {
            found: true, type: classification.type,
            playerName: rawPlayer, context: ctx, userResponse: ctx,
            sources: ['Transfermarkt', 'Wikidata'],
            fetchedAt,
          }
        }
      } catch (_e) {
        console.warn('[SportsAgent] Player API fallback failed:', _e.message)
      }
    }

    // ③ لا يوجد
    const notFoundCtx = [
      `━━━ ⚽ معلومات اللاعب ━━━\n`,
      `⚠️ لم يُعثر على معلومات لـ **"${rawPlayer || query}"** في قاعدة البيانات.`,
      ``,
      `💡 **جرّب ذكر الاسم الكامل** مثل: "كريستيانو رونالدو"، "ليونيل ميسي"، "كيليان إمبابي"`,
    ].join('\n')
    return {
      found: false, type: classification.type,
      context: notFoundCtx, userResponse: notFoundCtx,
      sources: ['DZ-Sports-Archive'],
      fetchedAt,
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── 🏆 HISTORICAL_TROPHY — تاريخ البطولات ────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (classification.type === 'HISTORICAL_TROPHY') {
    const { team, comp } = classification
    console.log(`[SportsAgent] 🏆 Trophy query: team="${team}" comp="${comp}"`)

    // حالة خاصة: "من فاز بآخر كأس عالم / أفريقيا"
    if (!team && /(?:آخر|أحدث|أخير|last)\s+(?:بطل|فائز|من\s+فاز)/i.test(query)) {
      const lastChamp = getLastChampion(comp === 'afcon' ? 'afcon' : 'worldcup')
      if (lastChamp) {
        const ctx = comp === 'afcon'
          ? `**آخر بطل لكأس أمم أفريقيا:** ${lastChamp.flag} **${lastChamp.winner}** (${lastChamp.year}) — هزم ${lastChamp.runner} **${lastChamp.score}** في ${lastChamp.host}`
          : `**آخر بطل كأس العالم:** ${lastChamp.flag} **${lastChamp.winner}** (${lastChamp.year}) — هزم ${lastChamp.runner} **${lastChamp.score}** في ${lastChamp.host}`
        return { found: true, type: 'HISTORICAL_TROPHY', context: ctx, userResponse: ctx, sources: ['DZ-Sports-Archive'], fetchedAt }
      }
    }

    // حالة: "كل أبطال كأس العالم" أو "تاريخ كأس العالم"
    if (!team && (comp === 'world' || comp === 'general') && /(?:كل|قائمة|تاريخ|جدول)\s+(?:أبطال|فائز|بطل|كأس\s+العالم)/i.test(query)) {
      const lines = [`━━━ 🏆 قائمة أبطال كأس العالم ━━━\n`]
      for (const w of WORLD_CUP_HISTORY.slice(0, 12)) {
        lines.push(`• **${w.year}** (${w.host}): ${w.flag} **${w.winner}** ${w.score} ${w.runner}`)
      }
      const ctx = lines.join('\n')
      return { found: true, type: 'HISTORICAL_TROPHY', context: ctx, userResponse: ctx, sources: ['DZ-Sports-Archive'], fetchedAt }
    }

    // حالة: "كل أبطال كأس أمم أفريقيا"
    if (!team && comp === 'afcon' && /(?:كل|قائمة|تاريخ|جدول)/i.test(query)) {
      const lines = [`━━━ 🏆 قائمة أبطال كأس أمم أفريقيا ━━━\n`]
      for (const w of AFCON_HISTORY.slice(0, 15)) {
        lines.push(`• **${w.year}** (${w.host}): ${w.flag} **${w.winner}** ${w.score} أمام ${w.runner}`)
      }
      const ctx = lines.join('\n')
      return { found: true, type: 'HISTORICAL_TROPHY', context: ctx, userResponse: ctx, sources: ['DZ-Sports-Archive'], fetchedAt }
    }

    // البحث بالفريق
    if (team) {
      const trophyData = getTeamTrophies(team, comp)
      if (trophyData?.titles?.length) {
        let ctx = ''
        if (comp === 'world' || comp === 'general') {
          const wins = getWorldCupWins(team)
          if (wins.length) {
            ctx = buildWorldCupTrophyBlock(team, wins)
          }
        }
        if (!ctx && comp === 'afcon') {
          const afconWins = AFCON_HISTORY.filter(w =>
            w.winner.includes(team) || team.includes(w.winner)
          )
          ctx = buildAfconTrophyBlock(team, afconWins)
        }
        if (!ctx) {
          const lines = [`━━━ 🏆 **${team}** وكأس ${comp === 'afcon' ? 'أمم أفريقيا' : 'العالم'} ━━━\n`]
          lines.push(`✅ **عدد الألقاب:** ${trophyData.titles.length}`)
          for (const t of trophyData.titles) {
            lines.push(`• **${t.year}**${t.host ? ` — ${t.host}` : ''}`)
          }
          if (trophyData.note) lines.push(`\n📌 ${trophyData.note}`)
          ctx = lines.join('\n')
        }
        return { found: true, type: 'HISTORICAL_TROPHY', team, context: ctx, userResponse: ctx, sources: ['DZ-Sports-Archive'], fetchedAt }
      }

      // فريق لم يفز بهذه البطولة
      const noWinCtx = [
        `━━━ 🏆 **${team}** وكأس ${comp === 'afcon' ? 'أمم أفريقيا' : comp === 'world' ? 'العالم' : 'البطولة'} ━━━\n`,
        `ℹ️ لم يفز **${team}** بهذه البطولة وفق قاعدة بياناتنا.`,
      ].join('\n')
      return { found: false, type: 'HISTORICAL_TROPHY', team, context: noWinCtx, userResponse: noWinCtx, sources: ['DZ-Sports-Archive'], fetchedAt }
    }

    // fallback عام: ابحث في كل التاريخ بالنص الحر
    const qLow = query.toLowerCase()
    // هل يسأل عن فرنسا بشكل ضمني؟
    const FR_PATTERN = /فرنسا|فرنسي|france/i
    const DZ_PATTERN = /جزائر|خضر|algerie|algeria/i
    const ARG_PATTERN = /أرجنتين|messi|ميسي/i
    if (FR_PATTERN.test(query)) {
      const wins = getWorldCupWins('فرنسا')
      const ctx = buildWorldCupTrophyBlock('فرنسا', wins)
      return { found: true, type: 'HISTORICAL_TROPHY', context: ctx, userResponse: ctx, sources: ['DZ-Sports-Archive'], fetchedAt }
    }
    if (DZ_PATTERN.test(query) && comp === 'afcon') {
      const afconWins = AFCON_HISTORY.filter(w => w.winner === 'الجزائر')
      const ctx = buildAfconTrophyBlock('الجزائر', afconWins)
      return { found: true, type: 'HISTORICAL_TROPHY', context: ctx, userResponse: ctx, sources: ['DZ-Sports-Archive'], fetchedAt }
    }
    if (ARG_PATTERN.test(query)) {
      const wins = getWorldCupWins('الأرجنتين')
      const ctx = buildWorldCupTrophyBlock('الأرجنتين', wins)
      return { found: true, type: 'HISTORICAL_TROPHY', context: ctx, userResponse: ctx, sources: ['DZ-Sports-Archive'], fetchedAt }
    }

    // لا يوجد
    const fallbackCtx = `⚠️ لم يُعثر على بيانات تاريخية كافية لهذا الاستعلام: "${query.slice(0, 60)}"`
    return { found: false, type: 'HISTORICAL_TROPHY', context: fallbackCtx, userResponse: fallbackCtx, sources: ['DZ-Sports-Archive'], fetchedAt }
  }

  // ── 🌐 كأس العالم 2026 — أولوية قصوى ─────────────────────────────────────
  if (isWorldCup2026Query(query)) {
    console.log(`[SportsAgent] 🌐 World Cup 2026 query detected`)
    const wcContext = buildWorldCup2026AlgeriaContext()

    // إذا كان السؤال عن مباراة محددة في كأس العالم
    if (classification.type === 'MATCH_SEARCH') {
      const { team1, team2 } = classification
      const local = searchLocalKnowledge(team1, team2, 'UPCOMING')

      if (local.wcFixtures.length > 0) {
        const contextLines = [
          `━━━ 🌐 كأس العالم 2026 — مباريات الجزائر ━━━\n`,
        ]
        for (const fix of local.wcFixtures) {
          contextLines.push(buildLocalMatchBlock(fix))
          contextLines.push('')
        }
        contextLines.push(`\n---\n`)
        contextLines.push(wcContext)

        // بناء رد مركّز على المباراة المطلوبة تحديداً
        const _fix = local.wcFixtures[0]
        const _fH = { 'الجزائر':'🇩🇿','الأرجنتين':'🇦🇷','النمسا':'🇦🇹','الأردن':'🇯🇴' }
        const _fHome = _fH[_fix.homeTeam] || '🏴'
        const _fAway = _fH[_fix.awayTeam] || '🏴'
        const _dateStr = (() => {
          try {
            return new Date(_fix.date).toLocaleDateString('ar-DZ', { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Africa/Algiers' })
          } catch { return _fix.date }
        })()
        const _userResp = [
          `## ${_fHome} ${_fix.homeTeam} ضد ${_fAway} ${_fix.awayTeam}`,
          ``,
          `> ✅ مباراة **مقررة** ضمن فعاليات **${_fix.competition || 'كأس العالم FIFA 2026'}**`,
          ``,
          `| التفصيل | القيمة |`,
          `|---------|--------|`,
          `| 📅 التاريخ | **${_dateStr}** |`,
          `| ⏰ التوقيت | **${_fix.startTime || '?'}** (بتوقيت الجزائر) |`,
          `| 🎯 الجولة | **${_fix.round || '—'}** |`,
          `| 🏟️ الملعب | **${_fix.venue || '—'}** |`,
          `| 📍 المدينة | **${_fix.city || '—'}**, ${_fix.country || 'الولايات المتحدة'} |`,
          ``,
          `———`,
          ``,
          `💡 ستجد أسفل هذا الرد جدول **المجموعة J** الكامل مع جميع المباريات.`,
          ``,
          `[![FIFA](https://www.google.com/s2/favicons?sz=32&domain=fifa.com)](https://www.fifa.com/worldcup) [![jdwel](https://www.google.com/s2/favicons?sz=32&domain=jdwel.com)](https://jdwel.com/2026-world-cup-fixtures/) [![FotMob](https://www.google.com/s2/favicons?sz=32&domain=fotmob.com)](https://www.fotmob.com/ar/leagues/77/fixtures/world-cup)`,
        ].join('\n')

        return {
          found: true, type: 'WORLD_CUP_2026', team1, team2,
          context: contextLines.join('\n'),
          userResponse: _userResp,
          wcFixtures: local.wcFixtures,
          sources: ['DZ-Sports-Knowledge', 'FIFA'],
          fetchedAt,
        }
      }

      // الفريقان ليسا في نفس المجموعة — تحقق من سيناريو الأدوار الإقصائية
      try {
        const _matchVsCtx = buildWC2026MatchVsResponse(team1, team2)
        if (_matchVsCtx) {
          return {
            found: true, type: 'WORLD_CUP_2026',
            context: _matchVsCtx,
            userResponse: _matchVsCtx,
            sources: ['DZ-Sports-Knowledge', 'FIFA'],
            fetchedAt,
          }
        }
      } catch (_wve) {}
      return {
        found: true, type: 'WORLD_CUP_2026',
        context: wcContext,
        userResponse: wcContext,
        sources: ['DZ-Sports-Knowledge', 'FIFA'],
        fetchedAt,
      }
    }

    return {
      found: true, type: 'WORLD_CUP_2026',
      context: wcContext,
      userResponse: wcContext,
      sources: ['DZ-Sports-Knowledge', 'FIFA'],
      fetchedAt,
    }
  }

  // ── ① بحث عن مباراة محددة ──────────────────────────────────────────────
  if (classification.type === 'MATCH_SEARCH') {
    const { team1, team2, temporal } = classification
    console.log(`[SportsAgent] 🆚 ${team1} ضد ${team2} | temporal=${temporal}`)

    // ⚡ Result cache — يُعيد النتيجة فوراً عند retry (يمنع الـ 15-20s scan)
    const _ck = `ms:${team1}|${team2}|${temporal}`
    const _cached = _cacheGet(_ck)
    if (_cached) {
      console.log(`[SportsAgent:CACHE] ⚡ Hit for ${team1} vs ${team2} — returning cached result instantly`)
      return _cached
    }

    // ══ المرحلة 0: قاعدة البيانات المحلية أولاً (فورية، موثوقة) ══════════
    const localResult = searchLocalKnowledge(team1, team2, temporal)
    if (localResult.found) {
      // ⚡ كشف ذكي: إذا كانت المباراة "قادمة" في قاعدة البيانات لكن تاريخها مضى
      // → تجاوز القاعدة المحلية واستعمل المصادر الحية للحصول على النتيجة الحقيقية
      const _now = Date.now()
      const _allUpcomingButPast = localResult.matches.length > 0 &&
        localResult.matches.every(m => {
          if (m.statusType !== 'upcoming') return false
          if (!m.date) return false
          // أضف 3 ساعات (مدة أطول من أي مباراة) كهامش
          const matchEndTime = new Date(m.date).getTime() + 3 * 60 * 60 * 1000
          return matchEndTime < _now
        })
      const _wcAllUpcomingButPast = localResult.wcFixtures.length > 0 &&
        localResult.wcFixtures.every(fix => {
          if (fix.statusType !== 'upcoming') return false
          if (!fix.date) return false
          const matchEndTime = new Date(fix.date).getTime() + 3 * 60 * 60 * 1000
          return matchEndTime < _now
        })

      if (_allUpcomingButPast || _wcAllUpcomingButPast) {
        console.log(`[SportsAgent:LOCAL] ⏰ Match date passed (upcoming→finished?) — bypassing local DB, checking live sources`)
        // لا نعود من هنا — نكمل للمصادر الخارجية
      } else {
        console.log(`[SportsAgent:LOCAL] ✅ Found ${localResult.matches.length} matches in local DB`)

        // ── تحسين: إذا كانت المباراة منتهية وتنقص بيانات (venue أو scorers)
        // ← ابحث في المصادر الخارجية وادمج النتائج الإضافية ──────────────────
        // ── تحديد ما إذا كان أحد الفريقين هو الجزائر ─────────────────────
        const _isAlgQ =
          team1.includes('الجزائر') || team2.includes('الجزائر') ||
          team1.includes('الخضر')   || team2.includes('الخضر')   ||
          (team1||'').toLowerCase().includes('algeria') ||
          (team2||'').toLowerCase().includes('algeria')

        const _needsEnrichment = localResult.matches.some(m =>
          m.statusType === 'finished' && (!m.venue || !(m.scorers?.length))
        )

        // ── إثراء متوازٍ: Kooora Algeria + مصادر خارجية أخرى ──────────────
        let _kooraEnrichData = null

        if (_isAlgQ) {
          // دائماً نجلب Kooora Algeria لمباريات الجزائر (لإضافة رابط + تفاصيل)
          const _opp   = team1.includes('الجزائر') || team1.toLowerCase().includes('algeria') ? team2 : team1
          const _oppEn = TEAM_AR_TO_EN[_opp] || _opp
          console.log(`[SportsAgent:KooraEnrich] 🇩🇿 جلب Kooora Algeria لـ "${_opp}"`)
          try {
            _kooraEnrichData = await Promise.race([
              searchAlgeriaMatchByOpponent(_opp, _oppEn),
              new Promise(r => setTimeout(() => r(null), 5000)),
            ])
            if (_kooraEnrichData?.matches?.length) {
              console.log(`[SportsAgent:KooraEnrich] ✅ Kooora: ${_kooraEnrichData.total} مباراة`)
              // إثراء بيانات المباريات المحلية بما وجده Kooora
              for (const localM of localResult.matches) {
                const kM = _kooraEnrichData.matches.find(k => {
                  const kDate  = (k.date || '').slice(0,10)
                  const lDate  = (localM.date || '').slice(0,10)
                  return kDate && lDate && kDate === lDate
                })
                if (kM) {
                  if (!localM.venue   && kM.venue)              localM.venue   = kM.venue
                  if (!localM.city    && kM.city)               localM.city    = kM.city
                  if (kM.scorers?.length && !localM.scorers?.length) localM.scorers = kM.scorers
                  if (kM.link         && !localM.link)          localM.link    = kM.link
                  if (kM.homeScore !== null && localM.homeScore === null) {
                    localM.homeScore = kM.homeScore
                    localM.awayScore = kM.awayScore
                  }
                  console.log(`[SportsAgent:KooraEnrich] ✅ مُثرّى: venue="${kM.venue}" scorers=${kM.scorers?.length||0}`)
                }
              }
            }
          } catch (_ke) {
            console.warn('[SportsAgent:KooraEnrich] failed:', _ke.message)
          }
        }

        if (_needsEnrichment && !_kooraEnrichData?.matches?.length) {
          // فولباك: بحث في مصادر خارجية أخرى إن لم يُفدنا Kooora
          console.log(`[SportsAgent:LOCAL] 🔍 Kooora empty — trying other sources (max 4s)...`)
          try {
            const _extMatches = await Promise.race([
              searchMatchAcrossDates(team1, team2, { temporal }).catch(() => []),
              new Promise(r => setTimeout(() => r([]), 4000)),
            ])
            for (const localM of localResult.matches) {
              const _ext = _extMatches.find(e => {
                const sameDate = e.date && localM.date && e.date.slice(0,10) === localM.date.slice(0,10)
                const sameHome = (e.homeTeam||'').toLowerCase().includes((localM.homeTeamEn||localM.homeTeam||'').slice(0,4).toLowerCase())
                return sameDate || sameHome
              })
              if (_ext) {
                if (!localM.venue   && _ext.venue)                   localM.venue   = _ext.venue
                if (!localM.city    && _ext.city)                    localM.city    = _ext.city
                if (!localM.scorers?.length && _ext.scorers?.length) localM.scorers = _ext.scorers
                console.log(`[SportsAgent:ENRICH] ✅ ext enriched: venue="${_ext.venue}" scorers=${_ext.scorers?.length||0}`)
              }
            }
          } catch (_ee) {
            console.warn('[SportsAgent:ENRICH] enrichment failed:', _ee.message)
          }
        }

        // ── بناء الجواب النهائي ─────────────────────────────────────────────
        const contextLines = [
          `━━━ ⚽ بيانات الوكيل الرياضي (قاعدة البيانات الجزائرية) ━━━`,
          `[![FotMob](https://www.google.com/s2/favicons?sz=32&domain=fotmob.com)](https://www.fotmob.com)${_kooraEnrichData?.matches?.length ? ' [![Kooora](https://www.google.com/s2/favicons?sz=32&domain=kooora.com)](https://www.kooora.com)' : ''}`,
          ``,
        ]

        for (const m of localResult.matches.slice(0, 3)) {
          contextLines.push(buildLocalMatchBlock(m))
          // أضف رابط Kooora إن وُجد
          const kM = _kooraEnrichData?.matches?.find(k =>
            (k.date||'').slice(0,10) === (m.date||'').slice(0,10)
          )
          if (kM?.link) {
            contextLines.push(`   🔗 [تفاصيل المباراة على Kooora](${kM.link})`)
          }
          contextLines.push('')
        }

        if (localResult.wcFixtures.length > 0) {
          contextLines.push(`### 📅 مباريات كأس العالم 2026 ذات الصلة`)
          for (const fix of localResult.wcFixtures) {
            contextLines.push(buildLocalMatchBlock(fix))
            contextLines.push('')
          }
        }

        // ── قسم Kooora: عرض مباريات إضافية من كووورة لم تكن في قاعدتنا ──
        if (_kooraEnrichData?.matches?.length) {
          const _kooraExtra = _kooraEnrichData.matches.filter(k => {
            const kDate = (k.date||'').slice(0,10)
            return !localResult.matches.some(lm => (lm.date||'').slice(0,10) === kDate)
          }).slice(0, 3)

          if (_kooraExtra.length > 0) {
            contextLines.push(`---`)
            contextLines.push(`### 🌐 مباريات إضافية من Kooora.com`)
            for (const k of _kooraExtra) {
              const fl1 = getTeamFlag(k.homeTeam || '')
              const fl2 = getTeamFlag(k.awayTeam || '')
              const sc  = k.homeScore !== null ? `**${k.homeScore} – ${k.awayScore}**` : 'vs'
              contextLines.push(`✅ ${fl1} **${k.homeTeam}** ${sc} **${k.awayTeam}** ${fl2}`)
              if (k.date) contextLines.push(`   📅 ${k.date}${k.competition ? ` — ${k.competition}` : ''}`)
              if (k.link) contextLines.push(`   🔗 [تفاصيل](${k.link})`)
              contextLines.push('')
            }
          }

          contextLines.push(`🔗 [كل مباريات المنتخب على Kooora](${_kooraEnrichData.pageUrl || 'https://www.kooora.com/%D9%83%D8%B1%D8%A9-%D8%A7%D9%84%D9%82%D8%AF%D9%85/%D9%81%D8%B1%D9%8A%D9%82/%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D9%8A%D8%A4%D8%B1/%D9%85%D8%A8%D8%A7%D8%B1%D9%8A%D8%A7%D8%AA/cbx8lz7loz866tsoawwrpxyl9'})`)
        }

        contextLines.push(`\n✅ **البيانات محقّقة من قاعدة البيانات الجزائرية الرسمية.**`)

        const localCtx = contextLines.join('\n')
        const _r0 = {
          found: true, type: 'MATCH_SEARCH', team1, team2, temporal,
          matches: localResult.matches,
          wcFixtures: localResult.wcFixtures,
          context: localCtx,
          userResponse: localCtx,
          sources: _kooraEnrichData?.matches?.length
            ? ['DZ-Sports-Knowledge', 'Kooora-Algeria']
            : ['DZ-Sports-Knowledge'],
          fetchedAt,
        }
        _cacheSet(_ck, _r0)
        return _r0
      }
    }

    // ══ المرحلة 0.3: كووورة-الجزائر — صفحة مخصصة للمنتخب الجزائري ══════════
    // إذا أحد الفريقين هو الجزائر → نبحث مباشرة في صفحة مباريات المنتخب على كووورة
    const _isAlgeriaQuery =
      team1.includes('الجزائر') || team2.includes('الجزائر') ||
      (team1 || '').toLowerCase().includes('algeria') ||
      (team2 || '').toLowerCase().includes('algeria') ||
      team1.includes('الخضر') || team2.includes('الخضر')

    if (_isAlgeriaQuery) {
      try {
        const _opponent = team1.includes('الجزائر') || team1.toLowerCase().includes('algeria') ? team2 : team1
        const _opponentEn = TEAM_AR_TO_EN[_opponent] || _opponent
        console.log(`[SportsAgent:KooraAlgeria] 🇩🇿 Algeria query — searching Kooora team page for opponent: "${_opponent}"`)

        const kooraAlgResult = await Promise.race([
          searchAlgeriaMatchByOpponent(_opponent, _opponentEn),
          new Promise(r => setTimeout(() => r(null), 6000)),
        ])

        if (kooraAlgResult && !isUnavailable(kooraAlgResult) && kooraAlgResult.matches?.length) {
          console.log(`[SportsAgent:KooraAlgeria] ✅ Found ${kooraAlgResult.total} match(es) on Kooora team page`)
          const contextLines = [
            `━━━ 🇩🇿 مباريات المنتخب الجزائري — كووورة ━━━`,
            `[![Kooora](https://www.google.com/s2/favicons?sz=32&domain=kooora.com)](${kooraAlgResult.pageUrl || 'https://www.kooora.com/%D9%83%D8%B1%D8%A9-%D8%A7%D9%84%D9%82%D8%AF%D9%85/%D9%81%D8%B1%D9%8A%D9%82/%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D9%8A%D8%A4%D8%B1/%D9%85%D8%A8%D8%A7%D8%B1%D9%8A%D8%A7%D8%AA/cbx8lz7loz866tsoawwrpxyl9'})`,
            ``,
          ]

          for (const m of kooraAlgResult.matches.slice(0, 5)) {
            const fl1 = getTeamFlag(m.homeTeam || '')
            const fl2 = getTeamFlag(m.awayTeam || '')
            const statusBadge = m.statusType === 'finished' ? '✅' : m.statusType === 'live' ? '🔴' : '📅'
            const scoreStr = m.homeScore !== null && m.awayScore !== null
              ? `**${m.homeScore} – ${m.awayScore}**`
              : (m.startTime ? `⏰ ${m.startTime}` : 'vs')
            contextLines.push(`${statusBadge} ${fl1} **${m.homeTeam}** ${scoreStr} **${m.awayTeam}** ${fl2}`)
            if (m.date) contextLines.push(`   📅 ${m.date}${m.competition ? ` — 🏆 ${m.competition}` : ''}`)
            if (m.link) contextLines.push(`   🔗 [تفاصيل المباراة](${m.link})`)
            contextLines.push('')
          }

          const kooraCtx = contextLines.join('\n')
          const _rK = {
            found: true, type: 'MATCH_SEARCH', team1, team2, temporal,
            matches: kooraAlgResult.matches,
            context: kooraCtx,
            userResponse: kooraCtx,
            sources: ['Kooora-Algeria'],
            fetchedAt,
          }
          _cacheSet(_ck, _rK)
          return _rK
        }
      } catch (_kErr) {
        console.warn('[SportsAgent:KooraAlgeria] team page search failed:', _kErr.message)
      }
    }

    // ══ المرحلة 0.5: فحص WC2026 مبكر — قبل أي API خارجي ══════════════════
    // السبب: APIs الخارجية غير محددة (timeout/نجاح عشوائي) تسبّب إجابات متناقضة.
    // إذا كلا الفريقَين في WC2026 ولا توجد مباراة محلية مجدولة بينهما → نجيب
    // فوراً من قاعدة بياناتنا الداخلية الموثوقة دون انتظار APIs خارجية.
    if (!localResult.found) {
      const _wc1 = findWC2026TeamGroup(team1)
      const _wc2 = findWC2026TeamGroup(team2)

      if (_wc1 && _wc2 && _wc1 !== _wc2) {
        console.log(`[SportsAgent:WC2026-EARLY] ⚽ مجموعتان مختلفتان: ${team1}(${_wc1}) vs ${team2}(${_wc2}) — إجابة فورية`)
        const knockoutCtx = buildWC2026KnockoutContext(team1, team2, _wc1, _wc2)
        const _rEK = {
          found: true,
          type: 'WORLD_CUP_2026_KNOCKOUT',
          team1, team2, temporal,
          context: knockoutCtx,
          userResponse: knockoutCtx,
          sources: ['DZ-Sports-Knowledge'],
          wc2026: { group1: _wc1, group2: _wc2, canMeetInKnockout: true },
          fetchedAt,
        }
        _cacheSet(_ck, _rEK)
        return _rEK
      }

      if (_wc1 && _wc2 && _wc1 === _wc2) {
        console.log(`[SportsAgent:WC2026-EARLY] ⚽ نفس المجموعة: ${team1}(${_wc1}) vs ${team2}(${_wc2}) — إجابة فورية`)
        const sameGroupCtx = buildWC2026SameGroupContext(team1, team2, _wc1)
        const algeriaCtx = buildWorldCup2026AlgeriaContext()
        const combinedCtx = `${sameGroupCtx}\n\n---\n\n${algeriaCtx}`
        const _rES = {
          found: true,
          type: 'WORLD_CUP_2026_SAME_GROUP',
          team1, team2, temporal,
          context: combinedCtx,
          userResponse: combinedCtx,
          sources: ['DZ-Sports-Knowledge'],
          wc2026: { group: _wc1, sameGroup: true },
          fetchedAt,
        }
        _cacheSet(_ck, _rES)
        return _rES
      }
    }

    // ══ المرحلة 1-2: البحث الخارجي ════════════════════════════════════════
    const [matches, newsItems] = await Promise.allSettled([
      searchMatchAcrossDates(team1, team2, { temporal }),
      fetchSportsNewsRSS(team1, team2),
    ])

    const foundMatches = matches.status === 'fulfilled' ? matches.value : []
    const newsResults  = newsItems.status === 'fulfilled' ? newsItems.value : []

    if (!foundMatches.length) {
      // ══ فحص أ: هل تجاوزنا قاعدة البيانات المحلية لمباراة WC2026 مضى وقتها؟ ══
      // → إذا فشلت المصادر الحية أيضاً، نعرض البيانات المجدولة مع تنبيه
      if (localResult?.found) {
        const _localMatches = localResult.matches.length > 0 ? localResult.matches : localResult.wcFixtures
        if (_localMatches.length > 0) {
          const _firstLocal = _localMatches[0]
          const _matchDateStr = _firstLocal.date
            ? new Date(_firstLocal.date).toLocaleDateString('ar-DZ', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
            : ''
          const _liveCheckLines = [
            `━━━ ⚽ كأس العالم 2026 — ${_firstLocal.homeTeam} ضد ${_firstLocal.awayTeam} ━━━`,
            ``,
            `> 🔄 **الوكيل الرياضي يبحث عن النتيجة الحية...**`,
            `> ⚠️ لم تُتح النتيجة النهائية بعد من **365score** أو **FotMob** أو **TheSportsDB**`,
            ``,
            `**📋 المعلومات المجدولة (تحقق لاحقاً):**`,
            _matchDateStr ? `📅 **التاريخ:** ${_matchDateStr}` : '',
            _firstLocal.venue ? `🏟️ **الملعب:** ${_firstLocal.venue} — ${_firstLocal.city || ''}` : '',
            `🏆 **البطولة:** ${_firstLocal.competition || 'كأس العالم 2026 — المجموعة H'}`,
            ``,
            `**🔍 تحقق مباشرة من:**`,
            `• [365score](https://www.365scores.com/ar/football/world-cup-2026) — النتائج الحية`,
            `• [FotMob](https://www.fotmob.com/leagues/77/matches/world-cup) — مباريات كأس العالم`,
            `• [FIFA.com](https://www.fifa.com/worldcup) — الموقع الرسمي`,
          ].filter(Boolean).join('\n')
          console.log(`[SportsAgent:LOCAL_FALLBACK] ⚠️ Live sources failed for past WC2026 match — showing scheduled data`)
          const _rLive = {
            found: true,
            type: 'WC2026_LIVE_PENDING',
            team1, team2, temporal,
            context: _liveCheckLines,
            userResponse: _liveCheckLines,
            sources: ['DZ-Sports-Knowledge (fallback)'],
            livePending: true,
            fetchedAt,
          }
          _cacheSet(_ck, _rLive)
          return _rLive
        }
      }

      // ══ فحص ب: هل كلا الفريقَين في كأس العالم 2026 لكن مجموعتان مختلفتان؟ ══
      const wc1 = findWC2026TeamGroup(team1)
      const wc2 = findWC2026TeamGroup(team2)

      if (wc1 && wc2 && wc1 !== wc2) {
        console.log(`[SportsAgent] ⚽ WC2026 different groups: ${team1}(${wc1}) vs ${team2}(${wc2}) → knockout possibility`)
        const knockoutCtx = buildWC2026KnockoutContext(team1, team2, wc1, wc2)
        const _rKo = {
          found: true,
          type: 'WORLD_CUP_2026_KNOCKOUT',
          team1, team2, temporal,
          context: knockoutCtx,
          userResponse: knockoutCtx,
          sources: ['DZ-Sports-Knowledge'],
          wc2026: { group1: wc1, group2: wc2, canMeetInKnockout: true },
          fetchedAt,
        }
        _cacheSet(_ck, _rKo)
        return _rKo
      }

      if (wc1 && wc2 && wc1 === wc2) {
        console.log(`[SportsAgent] ⚽ WC2026 same group: ${team1}(${wc1}) vs ${team2}(${wc2}) → group stage match`)
        const sameGroupCtx = buildWC2026SameGroupContext(team1, team2, wc1)
        const algeriaCtx = buildWorldCup2026AlgeriaContext()
        const combinedCtx = `${sameGroupCtx}\n\n---\n\n${algeriaCtx}`
        const _rSg = {
          found: true,
          type: 'WORLD_CUP_2026_SAME_GROUP',
          team1, team2, temporal,
          context: combinedCtx,
          userResponse: combinedCtx,
          sources: ['DZ-Sports-Knowledge'],
          wc2026: { group: wc1, sameGroup: true },
          fetchedAt,
        }
        _cacheSet(_ck, _rSg)
        return _rSg
      }

      // ══ لا توجد بيانات ولا سياق كأس العالم ══════════════════════════════════
      const noDataCtx = buildNoMatchContext(team1, team2, newsResults)
      const cleanUserResponse = buildCleanNoDataResponse(team1, team2)
      const _rNo = {
        found: false,
        type: 'MATCH_SEARCH',
        team1, team2, temporal,
        context: noDataCtx,
        userResponse: cleanUserResponse,
        sources: ['365score', 'FotMob', 'SofaScore'],
        fetchedAt,
      }
      _cacheSet(_ck, _rNo)
      return _rNo
    }

    // جلب تفاصيل أول مباراة مُعثور عليها
    let details = null
    const firstMatch = foundMatches[0]
    if (firstMatch.matchId && firstMatch.source === 'FotMob') {
      details = await fetchFotmobMatchDetails(firstMatch.matchId).catch(() => null)
    } else if (firstMatch.matchId && firstMatch.source === 'SofaScore') {
      details = await fetchSofaMatchDetails(firstMatch.matchId).catch(() => null)
    }

    const contextLines = []
    contextLines.push(`━━━ 🏟️ Sports Intelligence Agent ━━━`)
    contextLines.push(`📡 الأولوية: **FotMob** → **SofaScore** → **Kooora** → **SearXNG**`)
    contextLines.push(``)

    for (const m of foundMatches.slice(0, 3)) {
      const det = m === firstMatch ? details : null
      contextLines.push(buildMatchDetailedBlock(m, det))
      contextLines.push('')
    }

    if (newsResults.length > 0) {
      contextLines.push(`### 📰 أحدث الأخبار ذات الصلة`)
      for (const n of newsResults.slice(0, 4)) {
        contextLines.push(`• **${n.title}** — [${n.source}](${n.link})${n.date ? ` | ${n.date}` : ''}`)
      }
    }

    const sources = [...new Set(foundMatches.map(m => m.source))]

    const extCtx = contextLines.join('\n')
    const _rExt = {
      found: true,
      type: 'MATCH_SEARCH',
      team1, team2, temporal,
      matches: foundMatches,
      details,
      context: extCtx,
      userResponse: extCtx,
      sources,
      fetchedAt,
    }
    _cacheSet(_ck, _rExt)
    return _rExt
  }

  // ── ② أخبار انتقالات ──────────────────────────────────────────────────────
  if (classification.type === 'TRANSFER_NEWS') {
    const playerMatch = query.match(
      /(?:انتقل|صفقة|تعاقد|ضم|اشترى|بيع|رحل|غادر|وقّع)\s*(?:مع|إلى|من)?\s*([\u0600-\u06FF\s]{3,25})/i
    )
    const playerName = playerMatch?.[1]?.trim() || ''

    if (playerName) {
      const [identity, transfers] = await Promise.allSettled([
        getPlayerIdentity(playerName),
        getTransfers(playerName),
      ])
      const pid = identity.status === 'fulfilled' && !isUnavailable(identity.value) ? identity.value : null
      const trn = transfers.status === 'fulfilled' && !isUnavailable(transfers.value) ? transfers.value : null
      const newsResults = await fetchSportsNewsRSS(playerName, '').catch(() => [])

      const lines = [`━━━ ⚽ معلومات انتقال: **${playerName}** ━━━\n`]
      if (pid) {
        const flag = getTeamFlag(pid.nationality || '')
        lines.push(`👤 **${pid.name}** ${flag}`)
        if (pid.club) lines.push(`🏟️ النادي الحالي: ${pid.club}`)
        if (pid.position) lines.push(`🎽 المركز: ${pid.position}`)
        if (trn?.marketValue) lines.push(`💰 القيمة السوقية: ${trn.marketValue}`)
        if (trn?.profileUrl) lines.push(`🔗 [Transfermarkt](${trn.profileUrl})`)
      }
      if (trn?.transfers?.length) {
        lines.push(`\n### 📋 سجل الانتقالات`)
        for (const t of trn.transfers.slice(0, 5)) {
          lines.push(`• ${t.date || '?'}: من ${t.from || '?'} إلى **${t.to || '?'}** (${t.type || 'انتقال'})`)
        }
      }
      if (newsResults.length > 0) {
        lines.push(`\n### 📰 أحدث الأخبار`)
        for (const n of newsResults.slice(0, 3)) {
          lines.push(`• **${n.title}** — [${n.source}](${n.link})`)
        }
      }
      if (!pid && !trn && !newsResults.length) {
        lines.push(`⚠️ لم يُعثر على بيانات لـ "${playerName}". حاول كتابة الاسم كاملاً.`)
      }
      return {
        found: !!(pid || trn || newsResults.length),
        type: 'TRANSFER_NEWS',
        playerName,
        context: lines.join('\n'),
        sources: ['Transfermarkt', '365score', 'Koora'],
        fetchedAt,
      }
    }
  }

  // ── ③ معلومات لاعب ──────────────────────────────────────────────────────
  if (classification.type === 'PLAYER_INFO') {
    const playerMatch = query.match(
      /(?:لاعب|player|إصابة|فريق)\s+([\u0600-\u06FF\s]{3,30})/i
    ) || query.match(/([\u0600-\u06FF]{3,}\s+[\u0600-\u06FF]{3,})/)

    const playerName = playerMatch?.[1]?.trim() || ''
    if (playerName) {
      const [identity, news] = await Promise.allSettled([
        getPlayerIdentity(playerName),
        fetchSportsNewsRSS(playerName, ''),
      ])
      const pid = identity.status === 'fulfilled' && !isUnavailable(identity.value) ? identity.value : null
      const newsResults = news.status === 'fulfilled' ? news.value : []

      const lines = [`━━━ ⚽ معلومات اللاعب: **${playerName}** ━━━\n`]
      if (pid) {
        const flag = getTeamFlag(pid.nationality || '')
        lines.push(`👤 **${pid.name}** ${flag}`)
        if (pid.nationality) lines.push(`🌍 الجنسية: ${pid.nationality}`)
        if (pid.club) lines.push(`🏟️ النادي الحالي: ${pid.club}`)
        if (pid.position) lines.push(`🎽 المركز: ${pid.position}`)
        if (pid.dob) lines.push(`📅 تاريخ الميلاد: ${pid.dob}`)
        if (pid.summary) lines.push(`\n📖 ${pid.summary.slice(0, 400)}...`)
        if (pid.wikiUrl) lines.push(`🔗 [ويكيبيديا](${pid.wikiUrl})`)
      }
      if (newsResults.length > 0) {
        lines.push(`\n### 📰 أحدث الأخبار`)
        for (const n of newsResults.slice(0, 4)) {
          lines.push(`• **${n.title}** — [${n.source}](${n.link})`)
        }
      }
      if (!pid && !newsResults.length) {
        lines.push(`⚠️ لم يُعثر على بيانات كافية لـ "${playerName}" من المصادر الحية.`)
      }
      return {
        found: !!(pid || newsResults.length),
        type: 'PLAYER_INFO',
        playerName,
        context: lines.join('\n'),
        sources: ['365score', 'Koora', 'Wikidata', 'Wikipedia AR'],
        fetchedAt,
      }
    }
  }

  // ── ④ أخبار رياضية عامة ───────────────────────────────────────────────
  const newsResults = await fetchSportsNewsRSS('', '').catch(() => [])
  const lines = [`━━━ 📰 آخر الأخبار الرياضية ━━━\n`]
  if (newsResults.length > 0) {
    for (const n of newsResults.slice(0, 6)) {
      lines.push(`• **${n.title}** — [${n.source}](${n.link})${n.date ? ` | ${n.date}` : ''}`)
    }
  } else {
    lines.push(`⚠️ تعذّر جلب الأخبار الرياضية من المصادر الخارجية حالياً.`)
  }
  return {
    found: newsResults.length > 0,
    type: 'SPORTS_NEWS',
    context: lines.join('\n'),
    sources: ['CAF', 'FIFA', 'الهداف'],
    fetchedAt,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 10 — رسالة "لا يوجد بيانات" مع أخبار بديلة
// ══════════════════════════════════════════════════════════════════════════════

function buildNoMatchContext(team1 = '', team2 = '', newsItems = []) {
  const flag1 = getTeamFlag(team1)
  const flag2 = getTeamFlag(team2)
  const lines = [
    `━━━ ⚽ بحث عن مباراة: ${flag1} **${team1}** ضد ${flag2} **${team2}** ━━━\n`,
    `> ⚠️ لم يُعثر على هذه المباراة في قواعد بيانات **365score** أو **FotMob** أو **SofaScore**`,
    `> في النطاق الزمني: الـ 60 يوماً الماضية + الـ 90 يوماً القادمة.\n`,
  ]

  if (newsItems.length > 0) {
    lines.push(`### 📰 أخبار ذات صلة بـ "${team1}" و"${team2}"`)
    for (const n of newsItems.slice(0, 4)) {
      lines.push(`• **${n.title}** — [${n.source}](${n.link})`)
    }
    lines.push('')
  }

  lines.push(`### 🔍 روابط مرجعية للتحقق اليدوي`)
  const t1En = TEAM_AR_TO_EN[team1] || team1
  const t2En = TEAM_AR_TO_EN[team2] || team2
  lines.push(`• [365score — البحث عن المباراة](https://www.365scores.com/ar/football/search?q=${encodeURIComponent(team1)})`)
  lines.push(`• [FotMob — ${team1}](https://www.fotmob.com/search?term=${encodeURIComponent(t1En)})`)
  lines.push(`• [Koora](https://www.kooora.com/?search=${encodeURIComponent(team1)})`)
  lines.push(`• [CAF Online](https://www.cafonline.com/)`)
  lines.push('')
  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════════════
// § 11 — تحديد ما إذا كان الاستعلام رياضياً
// ══════════════════════════════════════════════════════════════════════════════

const SPORTS_KEYWORDS = new Set([
  'مباراة','مباريات','ماتش','ماتشات','نتيجة','نتائج','رزنامة','برنامج',
  'هدف','أهداف','لاعب','مدرب','فريق','نادي','دوري','بطولة','كأس',
  'تصفيات','انتقال','صفقة','تشكيلة','ملعب','مباشر','live','score',
  'fixture','match','player','transfer','football','soccer','رياضة',
  'ضد','vs','كووورة','كرة','koora','fotmob','sofascore',
  'الخضر','الفنك','منتخب','أمم أفريقيا','كان','مونديال','يورو',
  'تشامبيونز','ليغ','لاليغا','بريميرليغ','بوندسليغا','سيريا',
  // كأس العالم 2026
  'كأس','العالم','world','cup','fifa','wc2026','wc26','مونديال',
  'جدول','مجموعات','مجموعة','ترتيب','نقاط','هداف','تشكيلة','ملاعب',
])

// ══════════════════════════════════════════════════════════════════════════════
// § 🌐 runWC2026TodayAgent — وكيل مباريات كأس العالم 2026 اليوم
// ══════════════════════════════════════════════════════════════════════════════

/**
 * يجلب مباريات كأس العالم 2026 لليوم الحالي أو تاريخ محدد
 * الأولوية: FotMob (حي) → 365score (حي) → قاعدة البيانات المحلية
 * @param {string} [dateStr] - تاريخ بصيغة YYYY-MM-DD (افتراضي: اليوم)
 * @returns {Promise<{found: boolean, userResponse: string, sources: string[]}>}
 */
export async function runWC2026TodayAgent(dateStr = '') {
  const date = dateStr || new Date().toISOString().split('T')[0]
  const dateLabel = (() => {
    try {
      return new Date(date + 'T12:00:00Z').toLocaleDateString('ar-DZ', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Algiers',
      })
    } catch { return date }
  })()

  const WC_LEAGUE_PATTERNS = [
    /world\s*cup/i, /كأس\s*العالم/i, /fifa\s*world/i, /مونديال/i,
  ]
  const WC_LEAGUE_IDS = new Set([77, 599, 9946, 231])

  function isWCLeague(leagueName = '', leagueId = 0) {
    if (WC_LEAGUE_IDS.has(Number(leagueId))) return true
    return WC_LEAGUE_PATTERNS.some(p => p.test(leagueName))
  }

  const WC_FLAGS = {
    'الجزائر':'🇩🇿','الأرجنتين':'🇦🇷','النمسا':'🇦🇹','الأردن':'🇯🇴',
    'المكسيك':'🇲🇽','جنوب أفريقيا':'🇿🇦','كوريا الجنوبية':'🇰🇷','جمهورية التشيك':'🇨🇿',
    'كندا':'🇨🇦','البوسنة والهرسك':'🇧🇦','قطر':'🇶🇦','سويسرا':'🇨🇭',
    'البرازيل':'🇧🇷','المغرب':'🇲🇦','هايتي':'🇭🇹','اسكتلندا':'🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'الولايات المتحدة':'🇺🇸','أمريكا':'🇺🇸','باراغواي':'🇵🇾','أستراليا':'🇦🇺','تركيا':'🇹🇷',
    'ألمانيا':'🇩🇪','كوراساو':'🇨🇼','ساحل العاج':'🇨🇮','الإكوادور':'🇪🇨',
    'هولندا':'🇳🇱','اليابان':'🇯🇵','السويد':'🇸🇪','تونس':'🇹🇳',
    'بلجيكا':'🇧🇪','مصر':'🇪🇬','إيران':'🇮🇷','نيوزيلندا':'🇳🇿',
    'إسبانيا':'🇪🇸','الرأس الأخضر':'🇨🇻','السعودية':'🇸🇦','أوروغواي':'🇺🇾',
    'فرنسا':'🇫🇷','السنغال':'🇸🇳','العراق':'🇮🇶','النرويج':'🇳🇴',
    'البرتغال':'🇵🇹','الكونغو الديمقراطية':'🇨🇩','أوزبكستان':'🇺🇿','كولومبيا':'🇨🇴',
    'إنجلترا':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','كرواتيا':'🇭🇷','غانا':'🇬🇭','بنما':'🇵🇦',
    // EN names from FotMob
    'Algeria':'🇩🇿','Argentina':'🇦🇷','Austria':'🇦🇹','Jordan':'🇯🇴',
    'Mexico':'🇲🇽','South Africa':'🇿🇦','South Korea':'🇰🇷','Czech Republic':'🇨🇿',
    'Canada':'🇨🇦','Bosnia and Herzegovina':'🇧🇦','Qatar':'🇶🇦','Switzerland':'🇨🇭',
    'Brazil':'🇧🇷','Morocco':'🇲🇦','Haiti':'🇭🇹','Scotland':'🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'USA':'🇺🇸','United States':'🇺🇸','Paraguay':'🇵🇾','Australia':'🇦🇺','Turkey':'🇹🇷',
    'Germany':'🇩🇪','Curacao':'🇨🇼','Ivory Coast':'🇨🇮','Ecuador':'🇪🇨',
    'Netherlands':'🇳🇱','Japan':'🇯🇵','Sweden':'🇸🇪','Tunisia':'🇹🇳',
    'Belgium':'🇧🇪','Egypt':'🇪🇬','Iran':'🇮🇷','New Zealand':'🇳🇿',
    'Spain':'🇪🇸','Cape Verde':'🇨🇻','Saudi Arabia':'🇸🇦','Uruguay':'🇺🇾',
    'France':'🇫🇷','Senegal':'🇸🇳','Iraq':'🇮🇶','Norway':'🇳🇴',
    'Portugal':'🇵🇹','DR Congo':'🇨🇩','Uzbekistan':'🇺🇿','Colombia':'🇨🇴',
    'England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Croatia':'🇭🇷','Ghana':'🇬🇭','Panama':'🇵🇦',
  }

  function getFlag(name = '') {
    if (WC_FLAGS[name]) return WC_FLAGS[name]
    for (const [k, v] of Object.entries(WC_FLAGS)) {
      if (name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(name.toLowerCase())) return v
    }
    return '🏴'
  }

  // تحويل UTC → توقيت الجزائر (UTC+1) مع دعم الصيغة العربية ص/م
  function dzHourText(t = '') {
    if (!t) return ''
    const m = t.match(/^(\d{1,2}):(\d{2})\s*([صم])?/)
    if (!m) return t
    let h = parseInt(m[1], 10), mn = parseInt(m[2], 10)
    if (m[3] === 'م' && h < 12) h += 12
    else if (m[3] === 'ص' && h === 12) h = 0
    return `${String((h + 1) % 24).padStart(2,'0')}:${String(mn).padStart(2,'0')}`
  }

  // ── أيقونات المصادر الـ4 الرسمية ──────────────────────────────────────────
  const SRC = {
    fotmob:   `[![FotMob](https://www.google.com/s2/favicons?sz=32&domain=fotmob.com)](${FOTMOB_WC2026_URL})`,
    jdwel:    `[![jdwel](https://www.google.com/s2/favicons?sz=32&domain=jdwel.com)](${JDWEL_WC2026_URL})`,
    kooora:   `[![Kooora](https://www.google.com/s2/favicons?sz=32&domain=kooora.com)](${KOORA_WC2026_URL})`,
    bein:     `[![beIN Sports](https://www.google.com/s2/favicons?sz=32&domain=beinsports.com)](${BEIN_WC2026_URL})`,
    fifa:     `[![FIFA](https://www.google.com/s2/favicons?sz=32&domain=fifa.com)](https://www.fifa.com/worldcup)`,
    score365: `[![365score](https://www.google.com/s2/favicons?sz=32&domain=365scores.com)](https://www.365scores.com/ar/football/league/fifa-world-cup-5930)`,
    local:    `🏆`,
  }
  const ALL_SRC_BADGES = `${SRC.jdwel} ${SRC.fotmob} ${SRC.kooora} ${SRC.bein} ${SRC.fifa}`

  function buildMatchLine(m) {
    const f1 = getFlag(m.homeTeam)
    const f2 = getFlag(m.awayTeam)
    const isResultPending = m.statusType === 'result-pending' || m._timePassed
    // ⛔ ANTI-HALLUCINATION: لا نتيجة إلا من مصدر رسمي (finished أو live فقط)
    const hasScore = (m.statusType === 'finished' || m.statusType === 'live')
      && m.homeScore !== null && m.homeScore !== undefined && m.awayScore !== null && m.awayScore !== undefined
    const statusBadge = m.statusType === 'finished' ? '✅'
      : m.statusType === 'live' ? '🔴'
      : isResultPending ? '⏳'
      : '📅'
    // ⛔ result-pending أو upcoming → لا نتيجة أبداً — نعرض الموعد أو ⏳
    // score يُعرض كـ code block بدل bold لتفادي اللون الأخضر في CSS
    const scoreStr = hasScore
      ? `\`${m.awayScore} – ${m.homeScore}\``
      : isResultPending
      ? `⏳`
      : (m.startTime ? `⏰ ${dzHourText(m.startTime)}` : 'vs')
    const grp = m.group ? ` *(${m.group})*` : ''
    // صف جدول Markdown: | الحالة | الفريق المضيف | النتيجة | الفريق الضيف |
    return `| ${statusBadge} | ${f1} ${m.homeTeam} | ${scoreStr}${grp} | ${m.awayTeam} ${f2} |`
  }

  // ── تطبيع أسماء الفرق للمقارنة (يُوحّد المسميات المختلفة للبلد نفسه) ──────────
  const TEAM_KEY_ALIASES = {
    'أمريكا': 'الولايات المتحدة', 'usa': 'الولايات المتحدة', 'united states': 'الولايات المتحدة',
    'america': 'الولايات المتحدة', 'كوريا': 'كوريا الجنوبية', 'south korea': 'كوريا الجنوبية',
    'جمهورية التشيك': 'تشيك', 'czech republic': 'تشيك', 'czechia': 'تشيك',
    'بوسنة': 'البوسنة', 'بوسنة والهرسك': 'البوسنة', 'bosnia and herzegovina': 'البوسنة',
    'ivory coast': 'ساحل العاج', 'كوت ديفوار': 'ساحل العاج',
    'england': 'إنجلترا', 'scotland': 'اسكتلندا',
    'الولايات المتحدة الأمريكية': 'الولايات المتحدة',
  }

  // ── دالة مفتاح التطابق بين الفريقين (للدمج وإزالة التكرار) ──────────────────
  function matchKey(h = '', a = '') {
    const norm = s => {
      const lower = s.trim().toLowerCase()
      // ① البحث في الـ aliases قبل الحذف (الأسماء المختلفة لنفس البلد)
      const aliased = TEAM_KEY_ALIASES[lower] || lower
      // ② حذف المسافات والأحرف غير الأبجدية بعد التطبيع
      return aliased
        .replace(/\bfc\b|\bsc\b|\bac\b|\bcf\b/gi, '')
        .replace(/[^a-z\u0600-\u06FF]/g, '')
        .trim()
    }
    const n1 = norm(h), n2 = norm(a)
    return [n1, n2].sort().join('__')
  }

  // ── جلب المصادر الأربعة بالتوازي (timeout 9 ثانية) ─────────────────────────
  // jdwel + FotMob (scraper) → بيانات فعلية
  // Kooora + beIN → روابط مرجعية فقط (محجوبة/JS-rendered)
  const TIMEOUT_MS = 9000
  const T = ms => new Promise(r => setTimeout(() => r(null), ms))

  const [jdwelRes, fotmobScraperRes] = await Promise.all([
    Promise.race([fetchJdwelWC2026(date).catch(() => null),        T(TIMEOUT_MS)]),
    Promise.race([fetchFotmobWC2026Scraper(date).catch(() => null), T(TIMEOUT_MS)]),
  ])

  // تجميع كل المباريات من المصدرين الفعّالين
  const allRaw = [
    ...(jdwelRes?.matches || []),
    ...(fotmobScraperRes?.matches || []),
  ]

  const activeSources = [
    jdwelRes?.matches?.length        > 0 ? 'jdwel'  : null,
    fotmobScraperRes?.matches?.length > 0 ? 'FotMob' : null,
  ].filter(Boolean)

  // ── دمج وإزالة التكرار: أولوية مباشر > انتهى > قادم ────────────────────────
  const dedupMap = new Map()
  const statusPriority = { live: 0, finished: 1, upcoming: 2, 'result-pending': 3 }

  for (const m of allRaw) {
    if (!m.homeTeam || !m.awayTeam) continue
    const key = matchKey(m.homeTeam, m.awayTeam)
    const existing = dedupMap.get(key)
    if (!existing) {
      dedupMap.set(key, { ...m, _sources: [m.source] })
    } else {
      // دمج: نأخذ البيانات ذات الأولوية الأعلى
      const existPrio = statusPriority[existing.statusType] ?? 9
      const newPrio   = statusPriority[m.statusType] ?? 9
      if (newPrio < existPrio) {
        dedupMap.set(key, { ...m, _sources: [...existing._sources, m.source] })
      } else {
        // نحتفظ بالحالي لكن نضيف المصدر
        existing._sources = [...new Set([...existing._sources, m.source])]
        // إذا كان للمصدر الجديد نتيجة والحالي لا يملك → نأخذ النتيجة
        if (m.homeScore !== null && existing.homeScore === null) {
          existing.homeScore = m.homeScore
          existing.awayScore = m.awayScore
        }
        // إذا كان للمصدر الجديد وقت البداية والحالي لا يملك
        if (m.startTime && !existing.startTime) {
          existing.startTime = m.startTime
        }
      }
    }
  }

  // ⛔ ANTI-HALLUCINATION: طبّق sanitizeMatchesByTime على كل المباريات المدمجة
  // أي مباراة "upcoming" تجاوز وقتها 2 ساعة → result-pending (لا نتيجة وهمية)
  const mergedMatches = sanitizeMatchesByTime([...dedupMap.values()])

  if (mergedMatches.length > 0) {
    const live           = mergedMatches.filter(m => m.statusType === 'live')
    const finished       = mergedMatches.filter(m => m.statusType === 'finished')
    const resultPending  = mergedMatches.filter(m => m.statusType === 'result-pending' || m._timePassed)
    const upcoming       = mergedMatches.filter(m => m.statusType === 'upcoming' && !m._timePassed)

    const srcBadges = activeSources.map(s => ({
      'FotMob': SRC.fotmob, 'jdwel': SRC.jdwel,
      'Kooora': SRC.kooora, 'beIN':  SRC.bein,
    }[s] || '')).filter(Boolean).join(' ')

    const lines = [
      `## 🌐 مباريات كأس العالم FIFA 2026 — ${dateLabel}`,
      ``,
      `> ${srcBadges || ALL_SRC_BADGES}`,
      ``,
    ]

    const TABLE_HEADER = [`| | المضيف | النتيجة | الضيف |`, `|:---:|:---|:---:|---:|`]

    if (live.length > 0) {
      lines.push(`### 🔴 مباريات جارية الآن (${live.length})`)
      lines.push('')
      TABLE_HEADER.forEach(h => lines.push(h))
      for (const m of live) lines.push(buildMatchLine(m))
      lines.push('')
    }
    if (upcoming.length > 0) {
      lines.push(`### 📅 مواعيد اليوم (${upcoming.length})`)
      lines.push('')
      TABLE_HEADER.forEach(h => lines.push(h))
      for (const m of upcoming) lines.push(buildMatchLine(m))
      lines.push('')
    }
    if (finished.length > 0) {
      lines.push(`### ✅ نتائج انتهت (${finished.length})`)
      lines.push(`> ✅ **بيانات مباشرة من ${activeSources.join(' + ')}**`)
      lines.push('')
      TABLE_HEADER.forEach(h => lines.push(h))
      for (const m of finished) lines.push(buildMatchLine(m))
      lines.push('')
    }
    if (resultPending.length > 0) {
      lines.push(`### ⏳ مباريات انتهت — النتيجة غير متوفرة من المصادر الحية (${resultPending.length})`)
      lines.push(`> ⚠️ **هذه المباريات انتهت لكن المصادر الحية لم تُرجع نتيجة موثوقة.**`)
      lines.push(`> 🛡️ **الوكيل لا يعرض أي نتيجة غير موثوقة — راجع المصادر مباشرةً:** ${SRC.fotmob} ${SRC.jdwel} ${SRC.fifa}`)
      lines.push('')
      TABLE_HEADER.forEach(h => lines.push(h))
      for (const m of resultPending) lines.push(buildMatchLine(m))
      lines.push('')
    }

    lines.push(`---`)
    lines.push(ALL_SRC_BADGES)
    console.log(`[WC2026TodayAgent] ✅ merged ${mergedMatches.length} matches (sources: ${activeSources.join(', ') || 'none'}) on ${date}`)
    return {
      found: true,
      userResponse: lines.join('\n'),
      sources: activeSources,
      matchCount: mergedMatches.length,
      matches: mergedMatches,
      date,
      wc2026: true,
    }
  }

  // ── Phase 2: قاعدة البيانات المحلية الكاملة (كل المجموعات الـ12) ─────────────
  const localFixtures = buildWC2026TodayFixtures(date)
  if (localFixtures.length > 0) {
    const _nowMs = Date.now()
    const lines = [
      `## 🌐 مباريات كأس العالم FIFA 2026 — ${dateLabel}`,
      ``,
      ALL_SRC_BADGES,
      ``,
    ]
    // تجميع حسب المجموعة مع كشف المباريات التي انتهى وقتها
    const byGroup = {}
    let hasPendingResults = false
    for (const rawFix of localFixtures) {
      let fix = { ...rawFix }
      // كشف المباريات التي مضى وقتها (upcoming لكن التاريخ+الوقت تجاوز المدة)
      if (fix.statusType === 'upcoming' && fix.date && fix.startTime) {
        try {
          const [hh, mm] = (fix.startTime || '00:00').split(':').map(Number)
          // التوقيت مخزّن بـ UTC في WC2026_FULL_FIXTURES → مقارنة مباشرة بـ UTC
          const matchStartUtc = new Date(`${fix.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`).getTime()
          if (matchStartUtc + 2 * 60 * 60 * 1000 < _nowMs) {
            fix = { ...fix, statusType: 'result-pending' }
            hasPendingResults = true
          }
        } catch (_) {}
      }
      const g = fix.group || '?'
      if (!byGroup[g]) byGroup[g] = []
      byGroup[g].push(fix)
    }
    for (const [grp, fixes] of Object.entries(byGroup).sort()) {
      if (Object.keys(byGroup).length > 1) lines.push(`**المجموعة ${grp}**`)
      for (const fix of fixes) {
        lines.push(buildWC2026RichMatchCard(fix))
        lines.push('')
      }
    }
    if (hasPendingResults) {
      lines.push(`> ⚠️ **تنبيه: قاعدة البيانات المحلية لا تحتوي على النتيجة الفعلية لهذه المباريات**`)
      lines.push(`> لم يتمكن الوكيل من الاتصال بالمصادر الحية (FotMob/jdwel). **لا نعرض أي نتيجة دون مصدر موثوق.**`)
      lines.push(`> 🔍 **للنتيجة الحقيقية:** ${SRC.fotmob} ${SRC.jdwel} ${SRC.fifa}`)
      lines.push(``)
    }
    lines.push(`---`)
    lines.push(`${SRC.score365} ${SRC.fotmob} ${SRC.kooora} ${SRC.jdwel} ${SRC.fifa}`)
    console.log(`[WC2026TodayAgent] 📋 Local fallback: ${localFixtures.length} fixtures on ${date} (pending=${hasPendingResults})`)
    return { found: true, userResponse: lines.join('\n'), sources: ['DZ-Sports-Knowledge'], matchCount: localFixtures.length, matches: localFixtures, date }
  }

  // ── Phase 3: لا توجد مباريات هذا اليوم ─────────────────────────────────────
  const algFixtures = (WC2026_FULL_FIXTURES || WORLD_CUP_2026.algeriaGroup.fixtures)
    .filter(f => f.statusType === 'upcoming' && (f.homeTeam?.includes('الجزائر') || f.awayTeam?.includes('الجزائر')))
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  const nextAlgMatch = algFixtures[0]
  const noMatchLines = [
    `## 🌐 كأس العالم FIFA 2026 — ${dateLabel}`,
    ``,
    `> ℹ️ لم تجد مصادرنا مباريات كأس العالم مجدولة لهذا اليوم. تابع على:`,
    `> ${SRC.score365} ${SRC.fotmob} ${SRC.kooora} ${SRC.jdwel} ${SRC.fifa}`,
    ``,
  ]
  if (nextAlgMatch) {
    noMatchLines.push(`**⏳ أقرب مباراة للجزائر:**`)
    noMatchLines.push(buildWC2026RichMatchCard(nextAlgMatch))
    noMatchLines.push('')
  }

  return { found: false, userResponse: noMatchLines.join('\n'), sources: [], date }
}

// ─────────────────────────────────────────────────────────────────────────────
// § WC2026 Standings Agent — ترتيب مجموعات كأس العالم 2026 (حي ← محلي)
// ─────────────────────────────────────────────────────────────────────────────
export async function runWC2026StandingsAgent(query = '') {
  const { extractWC2026GroupFromQuery, buildWC2026StandingsTable } = await import('./dz-sports-knowledge.js')

  const groupLetter = extractWC2026GroupFromQuery(query) || 'J'

  // محاولة جلب بيانات حية من SofaScore — نجرّب عدة season IDs لـ WC 2026
  const SOFA_CANDIDATES = [
    { tid: 16, sid: 56476 },
    { tid: 16, sid: 56477 },
    { tid: 16, sid: 57000 },
    { tid: 16, sid: 58000 },
  ]

  let liveRows = null
  let liveSource = null

  for (const { tid, sid } of SOFA_CANDIDATES) {
    try {
      const res = await Promise.race([
        fetch(`https://api.sofascore.com/api/v1/unique-tournament/${tid}/season/${sid}/standings/total`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Referer': 'https://www.sofascore.com/',
          },
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 7000)),
      ])
      if (!res.ok) continue
      const json = await res.json()
      const standings = json?.standings
      if (!Array.isArray(standings) || !standings.length) continue

      // ابحث عن المجموعة المطلوبة
      const grpStanding = standings.find(s => {
        const name = (s.name || s.type || '').toUpperCase()
        return name.includes(`GROUP ${groupLetter}`) || name === groupLetter || name.includes(groupLetter)
      }) || standings[0]

      if (grpStanding?.rows?.length) {
        liveRows = grpStanding.rows.map(r => ({
          team: r.team?.name || '',
          played: r.matches || 0,
          win: r.wins || 0,
          draw: r.draws || 0,
          loss: r.losses || 0,
          gf: r.scoresFor || 0,
          ga: r.scoresAgainst || 0,
          pts: r.points || 0,
        }))
        liveSource = `SofaScore (tid=${tid}, sid=${sid})`
        break
      }
    } catch (_) {
      // جرّب التالي
    }
  }

  // إذا فشلت SofaScore، حاول FotMob
  if (!liveRows) {
    const WC_LEAGUE_IDS = [77, 599, 9946, 231, 17]
    for (const lid of WC_LEAGUE_IDS) {
      try {
        const res = await Promise.race([
          fetch(`https://www.fotmob.com/api/leagues?id=${lid}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36' },
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
        ])
        if (!res.ok) continue
        const json = await res.json()
        const tables = json?.table
        if (!Array.isArray(tables) || !tables.length) continue
        // ابحث عن المجموعة
        const grp = tables.find(t => {
          const n = (t.cname || t.name || '').toUpperCase()
          return n.includes(groupLetter) || n.includes(`GROUP ${groupLetter}`)
        }) || tables[0]
        const tableRows = grp?.table?.all || grp?.rows
        if (!tableRows?.length) continue
        liveRows = tableRows.map(r => ({
          team: r.name || r.shortName || '',
          played: r.played || 0,
          win: r.wins || 0,
          draw: r.draws || 0,
          loss: r.losses || 0,
          gf: r.scoresFor || r.goalsScoredStr || 0,
          ga: r.scoresAgainst || 0,
          pts: r.pts || r.points || 0,
        }))
        liveSource = `FotMob (leagueId=${lid})`
        break
      } catch (_) {
        // جرّب التالي
      }
    }
  }

  if (liveSource) {
    console.log(`[WC2026:Standings] ✅ Live data from ${liveSource} — Group ${groupLetter}`)
  } else {
    console.log(`[WC2026:Standings] 📋 No live data — using local initial data — Group ${groupLetter}`)
  }

  const table = buildWC2026StandingsTable(groupLetter, liveRows)

  return {
    groupLetter,
    liveSource,
    userResponse: table || `> ⚠️ لا توجد بيانات للمجموعة ${groupLetter} في الوقت الحالي.`,
    found: true,
  }
}

export function isSportsAgentQuery(query = '') {
  const tokens = query.toLowerCase().split(/[\s,،.!؟?]+/)
  if (tokens.some(t => SPORTS_KEYWORDS.has(t))) return true

  // نمط "X ضد Y" أو "X vs Y" أو "X × Y" أو "X x Y"
  if (/[\u0600-\u06FF\w]{2,}\s+(?:ضد|vs\.?|×|x)\s+[\u0600-\u06FF\w]{2,}/i.test(query)) return true

  // كأس العالم 2026 بأي صيغة
  if (/(?:كأس\s+العالم|مونديال|world\s+cup|wc\s*2026|فيفا\s*2026)/i.test(query)) return true

  // مباريات اليوم / الليلة
  if (/(?:مباريات?\s+(?:اليوم|الليلة|الآن|الآن?|هذا\s+المساء)|اليوم\s+مباريات?)/i.test(query)) return true

  // أسئلة مكان اللاعب الحالي
  if (/(?:أين\s+يلعب|ما\s+ناد[ي]?|ما\s+فريق|في\s+أي\s+(?:فريق|نادي)|إلى\s+أين\s+انتقل)/i.test(query)) return true

  // أسئلة الفوز بالبطولات
  if (/(?:متى\s+فاز|متى\s+فازت|كم\s+مرة\s+فاز|من\s+فاز\s+بكأس|آخر\s+مرة\s+فاز)/i.test(query)) return true

  // أسماء لاعبين مشهورين مباشرةً
  if (/(?:رونالدو|ميسي|إمبابي|امبابي|مبابي|هالاند|صلاح|بنزيمة|محرز|سليماني|نيمار|مودريتش|بيلينغهام|فينيسيوس|كين|فودن)/i.test(query)) return true

  // أسماء أندية مشهورة
  if (/(?:ريال\s+مدريد|برشلونة|مانشستر|ليفربول|باريس\s+سان\s+جيرمان|PSG|بايرن|يوفنتوس|أتلتيكو|انتر\s+ميلان|آرسنال|تشيلسي)/i.test(query)) return true

  // اسمان وطنيان بجوار بعض
  const teams = Object.keys(TEAM_AR_TO_EN)
  let count = 0
  for (const t of teams) {
    if (query.includes(t)) { count++; if (count >= 2) return true }
  }

  return false
}

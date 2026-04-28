// DZ Agent — Intent Detection Engine.
// Pure function, no side effects. Returns one of:
//   'builder' | 'github' | 'news' | 'structured' | 'general'
// Plus secondary signals (live, breaking, urgent, sports, code, ar/en/fr).

const BUILDER_KW = [
  'ابني', 'إبني', 'انشئ', 'أنشئ', 'صمم', 'ابدع', 'ولّد', 'انشاء', 'انشئ لي',
  'موقع', 'تطبيق', 'صفحة', 'لاندينج', 'بورتفوليو', 'متجر', 'مدونة', 'لوحة تحكم',
  'build', 'create', 'generate', 'scaffold', 'page', 'website', 'app', 'application',
  'landing', 'portfolio', 'dashboard', 'storefront', 'blog', 'next.js', 'nextjs',
  'react app', 'vite app', 'tailwind page', 'component library',
]

const GITHUB_KW = [
  'github', 'جيت هاب', 'مستودع', 'مستودعات', 'ريبو', 'ريبوزيتوري', 'open source',
  'مفتوح المصدر', 'كود', 'سورس كود',
  'repo', 'repository', 'pull request', 'commit', 'branch', 'fork', 'star',
  'trending repos', 'awesome list', 'github trending', 'top github', 'best repo',
]

const NEWS_KW = [
  'أخبار', 'خبر', 'عاجل', 'تقرير', 'حدث', 'أحداث', 'بيان', 'مستجدات', 'آخر',
  'جديد', 'اليوم', 'الآن', 'هذه الأيام', 'اليومية', 'صحيفة', 'نشرة',
  'news', 'breaking', 'latest', 'today', 'recent', 'headline', 'press release',
  'actualité', 'nouvelles', 'aujourd', 'communiqué',
]

const STRUCTURED_KW = [
  'قارن', 'مقارنة', 'ترتيب', 'جدول', 'قائمة', 'سعر', 'أسعار', 'إحصائيات',
  'احصاء', 'بيانات', 'top', 'أفضل', 'افضل', 'أحسن', 'احسن', 'أكبر', 'أعلى',
  'compare', 'vs', 'versus', 'table', 'ranking', 'list', 'price', 'prices',
  'stats', 'statistics', 'top 5', 'top 10', 'best ', 'cheapest', 'pricing',
]

const URGENT_KW = [
  'عاجل', 'مستعجل', 'الآن', 'الساعة', 'مباشر', 'مباشرة', 'فوراً', 'عاجلاً',
  'breaking', 'urgent', 'just in', 'live now', 'right now', 'immediately',
]

const SPORTS_KW = [
  'كرة', 'مباراة', 'مباريات', 'هدف', 'دوري', 'بطولة', 'كأس', 'فريق', 'لاعب',
  'football', 'soccer', 'match', 'goal', 'league', 'cup', 'team', 'player',
]

const CODE_KW = [
  'كود', 'برمج', 'دالة', 'خطأ', 'باغ', 'تصحيح', 'سكربت', 'سيرفر',
  'code', 'function', 'bug', 'fix', 'debug', 'script', 'server', 'api',
  'typescript', 'javascript', 'python', 'java', 'rust', 'go ', 'php',
]

function hasAny(text, list) {
  return list.some(k => text.includes(k))
}

export function detectQueryLanguage(text) {
  const t = (text || '').trim()
  if (/[\u0600-\u06FF]/.test(t)) return 'ar'
  if (/[éèàçâêîôûœ]/i.test(t) || /\b(le|la|les|un|une|des|est|pour|dans)\b/i.test(t)) return 'fr'
  return 'en'
}

export function detectIntent(rawQuery) {
  const query = String(rawQuery || '').toLowerCase()
  const lang = detectQueryLanguage(rawQuery)

  const isBuilder    = hasAny(query, BUILDER_KW)
  const isGithub     = hasAny(query, GITHUB_KW) || /github\.com|gh\.io/.test(query)
  const isNews       = hasAny(query, NEWS_KW)
  const isStructured = hasAny(query, STRUCTURED_KW)
  const isUrgent     = hasAny(query, URGENT_KW)
  const isSports     = hasAny(query, SPORTS_KW)
  const isCode       = hasAny(query, CODE_KW)

  // Priority order — builder & github before news (they're more specific)
  let primary = 'general'
  if (isBuilder)        primary = 'builder'
  else if (isGithub)    primary = 'github'
  else if (isStructured && (isNews || query.length > 25)) primary = 'structured'
  else if (isNews)      primary = 'news'
  else if (isStructured)primary = 'structured'

  // Quick "live mode" heuristic: temporal + breaking signals
  const liveMode = isUrgent || /(today|الآن|اليوم|now|just|aujourd)/i.test(query)

  return {
    primary,
    lang,
    flags: { isBuilder, isGithub, isNews, isStructured, isUrgent, isSports, isCode },
    liveMode,
    breakingNews: isUrgent && isNews,
  }
}

// Lightweight query expansion: AR ↔ EN seed words for multi-source fetch.
export function expandQuery(query, lang) {
  const q = (query || '').trim()
  if (!q) return [q]
  const out = new Set([q])
  // Common bilingual swaps for higher recall.
  const swaps = [
    ['أخبار', 'news'], ['الجزائر', 'algeria'], ['كرة القدم', 'football'],
    ['اقتصاد', 'economy'], ['تقنية', 'technology'], ['ذكاء اصطناعي', 'artificial intelligence'],
    ['طقس', 'weather'], ['عاجل', 'breaking'],
  ]
  for (const [ar, en] of swaps) {
    if (q.includes(ar)) out.add(q.replaceAll(ar, en))
    if (q.toLowerCase().includes(en)) out.add(q.replace(new RegExp(en, 'gi'), ar))
  }
  // Prepend "Algeria" context for short global terms when language is AR
  if (lang === 'ar' && q.split(/\s+/).length <= 3 && !q.includes('الجزائر')) {
    out.add(`الجزائر ${q}`)
  }
  return Array.from(out).slice(0, 4)
}

// Optional natural-query enhancement for builder intent — guides downstream model.
export function enhanceBuilderQuery(query) {
  const q = String(query || '').toLowerCase()
  const wantsResponsive = /موقع|تطبيق|page|app|website/.test(q)
  const wantsModern     = /جميل|جذاب|premium|modern|sleek|elegant/.test(q)
  const tags = []
  if (wantsResponsive) tags.push('responsive')
  if (wantsModern)     tags.push('modern UI', 'rounded-2xl', 'shadow-soft')
  tags.push('React', 'Tailwind CSS', 'TypeScript', 'accessible (WCAG AA)')
  return `${query} → preferred stack: ${tags.join(', ')}`
}

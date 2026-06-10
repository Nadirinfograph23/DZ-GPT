/**
 * dz-query-corrector.js — محرك تصحيح النية والكتابة العربية
 * ══════════════════════════════════════════════════════════════════════════════
 * يصحح الأخطاء الإملائية في الاستعلامات، يفهم النية، ويُعيد الصياغة الصحيحة
 * سواء كانت أخطاء في أسماء الفرق، الكلمات الرياضية، أو النص العام
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ══════════════════════════════════════════════════════════════════════════════
// § 1 — تطبيع النص العربي للمقارنة
// ══════════════════════════════════════════════════════════════════════════════

export function normalizeAr(text = '') {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')   // حذف التشكيل + الألف فوقية
    .replace(/[أإآ]/g, 'ا')                   // توحيد الألف بأشكالها
    .replace(/ؤ/g, 'و')                       // واو مع همزة
    .replace(/ئ/g, 'ي')                       // ياء مع همزة
    .replace(/ى/g, 'ي')                       // ألف مقصورة
    .replace(/ة/g, 'ه')                       // تاء مربوطة
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// ══════════════════════════════════════════════════════════════════════════════
// § 2 — مسافة Levenshtein (فارق التحرير)
// ══════════════════════════════════════════════════════════════════════════════

function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  if (Math.abs(a.length - b.length) > 5) return 99
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 0; i < a.length; i++) {
    const curr = [i + 1]
    for (let j = 0; j < b.length; j++) {
      curr[j + 1] = a[i] === b[j]
        ? prev[j]
        : 1 + Math.min(prev[j], prev[j + 1], curr[j])
    }
    prev = curr
  }
  return prev[b.length]
}

// عتبة التصحيح حسب طول الكلمة (محافظة — لتجنب التطابقات الخاطئة)
function editThreshold(len) {
  if (len <= 4) return 0   // كلمات قصيرة: مطابقة تامة فقط
  if (len <= 6) return 1   // 5-6 أحرف: خطأ واحد
  if (len <= 9) return 2   // 7-9 أحرف: خطأين (زيادة الحد الأدنى)
  return 2                 // كلمات طويلة: 2 فقط لتجنب التطابق الزائف
}

// كلمات يجب تجاهلها عند البحث عن أسماء الفرق
const STOPWORDS = new Set([
  'ضد','vs','contre','في','من','إلى','الى','على','مع','بعد','قبل',
  'مباراة','مباريات','نتيجة','نتائج','أهداف','هداف','هدف',
  'كأس','كاس','بطولة','دوري','موعد','متى','لأول','كيف','ماذا',
  'اليوم','أمس','غداً','غدا','الأن','الآن','مباشر',
  'مباشرة','نتيجه','نتيجت','تشكيلة','تشكيله','ملعب','مدرب',
]);

// ══════════════════════════════════════════════════════════════════════════════
// § 3 — قاموس المصطلحات الرياضية الشائعة الأخطاء
// ══════════════════════════════════════════════════════════════════════════════

const KEYWORD_CORRECTIONS = {
  // مباراة
  'مبارة':      'مباراة',
  'مباره':      'مباراة',
  'مبارا':      'مباراة',
  'مبارات':     'مباريات',
  'مباريت':     'مباريات',
  'مبارايات':   'مباريات',
  // نتيجة
  'نتيجه':      'نتيجة',
  'نتجة':       'نتيجة',
  'نتيجت':      'نتيجة',
  'نتج':        'نتيجة',
  // ضد
  'ظد':         'ضد',
  'ضض':         'ضد',
  'ضدد':        'ضد',
  'قضد':        'ضد',
  'دض':         'ضد',
  // كرة القدم
  'كرة القدام': 'كرة القدم',
  'كرة الكدم':  'كرة القدم',
  'كرت القدم':  'كرة القدم',
  'كرة كدم':    'كرة القدم',
  // كأس العالم
  'كاس العالم': 'كأس العالم',
  'كاس عالم':   'كأس العالم',
  'كأس عالم':   'كأس العالم',
  'كاسالعالم':  'كأس العالم',
  // كأس أمم أفريقيا
  'كاس افريقيا':     'كأس أمم أفريقيا',
  'كاس امم افريقيا': 'كأس أمم أفريقيا',
  // الجزائر
  'الجزاير':  'الجزائر',
  'الجزائير': 'الجزائر',
  'الجزاءر':  'الجزائر',
  'جزاير':    'الجزائر',
  'جزائر':    'الجزائر',
  // هداف / تهديف
  'هداق':     'هداف',
  'هدف':      'هداف',
  // تشكيلة
  'تشكيله':   'تشكيلة',
  'تشكيلت':   'تشكيلة',
  // ملعب
  'ملعق':     'ملعب',
  'ملعاب':    'ملعب',
  // مدرب
  'مدرق':     'مدرب',
  'مدرابة':   'مدرب',
  // انتقال / صفقة
  'انتقال':   'انتقال',
  'صفقه':     'صفقة',
  // ترتيب / جدول
  'ترتيق':    'ترتيب',
  // متى
  'مته':      'متى',
  'متا':      'متى',
  // موعد
  'مواعيد':   'موعد',
  'موعيد':    'موعد',
  // أهداف
  'اهداف':    'أهداف',
  'اهدف':     'أهداف',
  // الدوري
  'الدوري':   'الدوري',
  'الدوري':   'الدوري',
}

// ══════════════════════════════════════════════════════════════════════════════
// § 4 — قاموس أسماء الفرق الوطنية بمرادفاتها وأخطائها الشائعة
// ══════════════════════════════════════════════════════════════════════════════

const TEAM_DICT = [
  // ─── أفريقيا ───────────────────────────────────────────────────────────────
  { c: 'الجزائر',         v: ['الجزاير','الجزائير','الجزاءر','جزائر','جزاير','جزاءر','dz','algeria','aljazair'] },
  { c: 'المغرب',          v: ['مغرب','المغرب','مغريب','المغريب','maroc','morocco'] },
  { c: 'تونس',            v: ['تونز','تنس','تونيس','tunis','tunisia'] },
  { c: 'مصر',             v: ['مصار','مسر','misr','egypt'] },
  { c: 'السنغال',         v: ['سنغال','السنقال','سنقال','senegal'] },
  { c: 'نيجيريا',         v: ['نيجيريه','نجيريا','نيقيريا','نيجريا','nigeria'] },
  { c: 'الكاميرون',       v: ['كاميرون','كامرون','كامرون','cameroon'] },
  { c: 'غانا',            v: ['قانا','غانة','ghana'] },
  { c: 'ساحل العاج',      v: ['كوت ديفوار','ساحل عاج','ivory coast','cote divoire'] },
  { c: 'مالي',            v: ['مالیا','mali'] },
  { c: 'بوركينا فاسو',    v: ['بركينا','بوركينا','بركينا فاسو','burkina','burkina faso'] },
  { c: 'أنغولا',          v: ['انغولا','انقولا','angola'] },
  { c: 'توغو',            v: ['توقو','توجو','togo'] },
  { c: 'إثيوبيا',         v: ['اثيوبيا','اتيوبيا','ethiopia'] },
  { c: 'الكونغو',         v: ['كونغو','كنغو','congo'] },
  { c: 'زامبيا',          v: ['زامبية','zambia'] },
  { c: 'موزمبيق',         v: ['موزامبيك','mozambique'] },
  // ─── أوروبا ────────────────────────────────────────────────────────────────
  { c: 'فرنسا',           v: ['فرنصا','فرانسا','فرنسة','france','fra'] },
  { c: 'إسبانيا',         v: ['اسبانيا','سبانيا','اسپانيا','اسبانية','spain','espana','esp'] },
  { c: 'ألمانيا',         v: ['المانيا','الماينا','المانية','germany','deutschland','ger'] },
  { c: 'إيطاليا',         v: ['ايطاليا','ايطالية','ايطليا','italy','italia','ita'] },
  { c: 'إنجلترا',         v: ['انجلترا','انقلترا','انجليز','انجلتر','england','uk','eng'] },
  { c: 'البرتغال',        v: ['برتغال','البرتقال','بورتقال','portugal','por'] },
  { c: 'هولندا',          v: ['هولاندا','هولاند','هوللاندا','netherlands','holland','ned'] },
  { c: 'بلجيكا',          v: ['بلجيكة','بلقيكا','بلجيك','belgium','bel'] },
  { c: 'كرواتيا',         v: ['كرواشيا','كروايشا','كروسيا','croatia','cro'] },
  { c: 'السويد',          v: ['سويد','سويدن','sweden','swe'] },
  { c: 'الدنمارك',        v: ['دنمارك','دانمارك','denmark','den'] },
  { c: 'سويسرا',          v: ['سويسره','سويسرة','switzerland','sui'] },
  { c: 'النرويج',         v: ['نرويج','نوريج','norway','nor'] },
  { c: 'بولندا',          v: ['بولنده','بولنديا','poland','pol'] },
  { c: 'تركيا',           v: ['تركيه','تركية','turkey','turkiye','tur'] },
  { c: 'اليونان',         v: ['يونان','يونانيا','greece','gre'] },
  { c: 'روسيا',           v: ['روسية','روسيا','russia','rus'] },
  { c: 'أوكرانيا',        v: ['اوكرانيا','اكرانيا','ukraine','ukr'] },
  { c: 'النمسا',          v: ['نمسا','austria','aut'] },
  { c: 'المجر',           v: ['مجر','هنغاريا','hungary','hun'] },
  { c: 'جمهورية التشيك',  v: ['تشيكيا','تشيكي','czech','cze'] },
  { c: 'اسكتلندا',        v: ['اسكتلنده','اسكوتلاند','scotland','sco'] },
  // ─── أمريكا اللاتينية ──────────────────────────────────────────────────────
  { c: 'البرازيل',        v: ['برازيل','برازيلا','برزيل','brazil','brasil','bra'] },
  { c: 'الأرجنتين',       v: ['ارجنتين','الارجنتين','الارقنتين','ارجنتينا','argentina','arg'] },
  { c: 'أوروغواي',        v: ['اوروغواي','اورغواي','الاورغواي','الأورغواي','الأوروغواي','اوروجواي','اورجواي','اورقواي','اوروقواي','ايروغواي','اروغواي','ورغواي','uruguay','uruguai','uru'] },
  { c: 'بوليفيا',         v: ['بوليقيا','بليفيا','بوليفية','bolivia','bol'] },
  { c: 'كولومبيا',        v: ['كولومبيه','كولمبيا','كولمبية','colombia','col'] },
  { c: 'بيرو',            v: ['بيرة','پيرو','peru','per'] },
  { c: 'تشيلي',           v: ['شيلي','تشيلية','chile','chi'] },
  { c: 'الإكوادور',       v: ['اكوادور','اكوادر','ecuador','ecu'] },
  { c: 'باراغواي',        v: ['باراقواي','باراغواية','paraguay','par'] },
  { c: 'فنزويلا',         v: ['فنزويله','فنيزويلا','venezuela','ven'] },
  { c: 'المكسيك',         v: ['مكسيك','مكسيكو','mexico','mex'] },
  { c: 'كندا',            v: ['كنادا','كانادا','canada','can'] },
  { c: 'الولايات المتحدة', v: ['امريكا','اميركا','أمريكا','اميريكا','usa','us','united states','etats unis'] },
  // ─── آسيا ──────────────────────────────────────────────────────────────────
  { c: 'اليابان',         v: ['يابان','جاپان','japan','jpn'] },
  { c: 'كوريا الجنوبية',  v: ['كوريا','كوريا الجنوبيه','south korea','korea','kor'] },
  { c: 'الصين',           v: ['صين','china','chn'] },
  { c: 'إيران',           v: ['ايران','iran','irn'] },
  { c: 'السعودية',        v: ['سعودية','سعوديه','المملكة العربية','saudi','ksa','ksa'] },
  { c: 'الإمارات',        v: ['امارات','الامارات','uae'] },
  { c: 'الكويت',          v: ['كويت','kuwait','kwt'] },
  { c: 'قطر',             v: ['قطار','qatar','qat'] },
  { c: 'العراق',          v: ['عراق','iraq','irq'] },
  { c: 'الأردن',          v: ['اردن','jordan','jor'] },
  { c: 'أستراليا',        v: ['استراليا','اوستراليا','australia','aus'] },
  // ─── إضافات شمال أفريقيا ───────────────────────────────────────────────────
  { c: 'ليبيا',           v: ['ليبية','libia','libya'] },
  { c: 'موريتانيا',       v: ['موريتانيه','mauritania'] },
  { c: 'السودان',         v: ['سودان','sudan'] },
]

// ══════════════════════════════════════════════════════════════════════════════
// § 5 — البحث الضبابي (Fuzzy) عن اسم الفريق في كلمة أو عبارة
// ══════════════════════════════════════════════════════════════════════════════

function fuzzyFindTeam(phrase) {
  if (!phrase || phrase.length < 3) return null

  // تجاهل الكلمات المحجوبة (stopwords)
  const words = phrase.trim().split(/\s+/)
  if (words.some(w => STOPWORDS.has(w))) return null

  const norm = normalizeAr(phrase)
  if (norm.length < 3) return null

  // ── مرور أول: بحث عن مطابقة صوتية/تامة في كل الفرق ──────────────────
  // إذا تطابق الصوت مع الاسم الرسمي → فحص إذا كانت الكتابة مختلفة (همزة، ألف)
  for (const team of TEAM_DICT) {
    const normCanon = normalizeAr(team.c)
    if (norm === normCanon) {
      // نفس الصوت — هل الكتابة مختلفة عن الشكل الرسمي؟
      if (phrase !== team.c) return { corrected: team.c }  // تصحيح همزة/ألف
      return null  // صحيح تماماً
    }
    for (const v of team.v) {
      if (norm === normalizeAr(v)) {
        return { corrected: team.c }   // بديل معروف → أعد الاسم الرسمي
      }
    }
  }

  // ── مرور ثانٍ: بحث ضبابي — نختار الأقرب فقط ──────────────────────────
  let bestMatch = null
  let bestDist  = 99

  for (const team of TEAM_DICT) {
    const normCanon = normalizeAr(team.c)
    const maxLen    = Math.max(norm.length, normCanon.length)
    const threshold = editThreshold(maxLen)

    // مقارنة مع الاسم الرسمي
    const d = levenshtein(norm, normCanon)
    if (d > 0 && d <= threshold && d < bestDist) {
      bestDist  = d
      bestMatch = { corrected: team.c, distance: d }
    }

    // مقارنة مع كل البدائل
    for (const v of team.v) {
      if (v.length < 3) continue
      const normV  = normalizeAr(v)
      const maxLV  = Math.max(norm.length, normV.length)
      const thrV   = editThreshold(maxLV)
      const dv     = levenshtein(norm, normV)
      if (dv > 0 && dv <= thrV && dv < bestDist) {
        bestDist  = dv
        bestMatch = { corrected: team.c, distance: dv }
      }
    }
  }

  return bestMatch
}

// ══════════════════════════════════════════════════════════════════════════════
// § 6 — تصحيح الكلمات المفتاحية الرياضية في النص
// ══════════════════════════════════════════════════════════════════════════════

function fixKeywords(text) {
  let changed = false
  const corrections = []

  // فحص كلمة-كلمة أولاً
  let result = text.replace(/[\u0600-\u06FF]+/g, (word) => {
    const fix = KEYWORD_CORRECTIONS[word]
    if (fix && fix !== word) {
      corrections.push({ type: 'keyword', from: word, to: fix })
      changed = true
      return fix
    }
    return word
  })

  // فحص عبارات متعددة الكلمات
  for (const [wrong, right] of Object.entries(KEYWORD_CORRECTIONS)) {
    if (wrong.includes(' ') && result.includes(wrong)) {
      result = result.split(wrong).join(right)
      corrections.push({ type: 'keyword', from: wrong, to: right })
      changed = true
    }
  }

  return { text: result, corrections, changed }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 7 — تصحيح أسماء الفرق في النص كاملاً (الكلمات + العبارات)
// ══════════════════════════════════════════════════════════════════════════════

function fixTeamNames(text) {
  const tokens = text.split(/\s+/)
  const corrections = []
  let changed = false
  let i = 0
  const outTokens = []

  while (i < tokens.length) {
    const tok0 = tokens[i]
    const tok1 = tokens[i + 1]
    const tok2 = tokens[i + 2]

    // ① جرب ثلاث كلمات معاً — فقط إذا لا تحتوي stopwords
    if (tok1 && tok2 && !STOPWORDS.has(tok0) && !STOPWORDS.has(tok1) && !STOPWORDS.has(tok2)) {
      const phrase = `${tok0} ${tok1} ${tok2}`
      const fix = fuzzyFindTeam(phrase)
      if (fix) {
        outTokens.push(...fix.corrected.split(' '))
        corrections.push({ type: 'team', from: phrase, to: fix.corrected })
        changed = true
        i += 3
        continue
      }
    }

    // ② جرب كلمتين معاً — فقط إذا لا تحتوي stopwords
    if (tok1 && !STOPWORDS.has(tok0) && !STOPWORDS.has(tok1)) {
      const phrase = `${tok0} ${tok1}`
      const fix = fuzzyFindTeam(phrase)
      if (fix) {
        outTokens.push(...fix.corrected.split(' '))
        corrections.push({ type: 'team', from: phrase, to: fix.corrected })
        changed = true
        i += 2
        continue
      }
    }

    // ③ كلمة واحدة — تجاهل stopwords
    if (!STOPWORDS.has(tok0)) {
      const fix = fuzzyFindTeam(tok0)
      if (fix) {
        outTokens.push(fix.corrected)
        corrections.push({ type: 'team', from: tok0, to: fix.corrected })
        changed = true
        i++
        continue
      }
    }

    outTokens.push(tok0)
    i++
  }

  return { text: outTokens.join(' '), corrections, changed }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 8 — تصحيح المسافات المفقودة ("الجزائرضد" → "الجزائر ضد")
// ══════════════════════════════════════════════════════════════════════════════

function fixMissingSpaces(text) {
  // "ضد" مبصقة مع كلمة
  return text
    .replace(/([\u0600-\u06FF]{2,})(ضد)([\u0600-\u06FF]{2,})/g, '$1 $2 $3')
    .replace(/([\u0600-\u06FF]{2,})(vs)([\u0600-\u06FF]{2,})/gi, '$1 $2 $3')
}

// ══════════════════════════════════════════════════════════════════════════════
// § 9 — الدالة الرئيسية: correctQuery()
// ══════════════════════════════════════════════════════════════════════════════

/**
 * correctQuery(rawQuery)
 * @param {string} rawQuery — نص المستخدم الخام
 * @returns {{ corrected, original, corrections, wasChanged }}
 */
export function correctQuery(rawQuery = '') {
  if (!rawQuery || rawQuery.length < 2) {
    return { corrected: rawQuery, original: rawQuery, corrections: [], wasChanged: false }
  }

  let text = rawQuery
  const allCorrections = []

  // ① إصلاح المسافات المفقودة
  const spaced = fixMissingSpaces(text)
  if (spaced !== text) {
    text = spaced
    allCorrections.push({ type: 'spacing', from: rawQuery, to: spaced })
  }

  // ② تصحيح الكلمات المفتاحية
  const kwResult = fixKeywords(text)
  if (kwResult.changed) {
    text = kwResult.text
    allCorrections.push(...kwResult.corrections)
  }

  // ③ تصحيح أسماء الفرق
  const teamResult = fixTeamNames(text)
  if (teamResult.changed) {
    text = teamResult.text
    allCorrections.push(...teamResult.corrections)
  }

  // ④ تنظيف المسافات الزائدة
  text = text.replace(/\s{2,}/g, ' ').trim()

  const wasChanged = text !== rawQuery && allCorrections.length > 0

  return {
    corrected: wasChanged ? text : rawQuery,
    original:  rawQuery,
    corrections: allCorrections,
    wasChanged,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 10 — بناء ملاحظة "فهمت قصدك"
// ══════════════════════════════════════════════════════════════════════════════

/**
 * buildCorrectionNote(result)
 * يُنتج نصاً يُظهر للمستخدم أن الوكيل فهم نيته ويُبيّن الكلمة الصحيحة
 */
export function buildCorrectionNote(result) {
  if (!result || !result.wasChanged) return ''

  // نُبيّن التصحيح بشكل طبيعي ومدمج
  const uniqueTeams = result.corrections
    .filter(c => c.type === 'team')
    .map(c => `"${c.from}" → **${c.to}**`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join('، ')

  const uniqueKw = result.corrections
    .filter(c => c.type === 'keyword')
    .map(c => `"${c.from}" → **${c.to}**`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join('، ')

  const parts = [uniqueTeams, uniqueKw].filter(Boolean).join('، ')
  if (!parts) return `> 🔍 فهمت قصدك: **"${result.corrected}"**\n\n`

  return `> 🔍 **صحّحت:** ${parts}\n\n`
}

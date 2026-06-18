// ═══════════════════════════════════════════════════════════════════════
// DZ Health AI Agent v1.0 — وكيل الصحة الجزائري
// ═══════════════════════════════════════════════════════════════════════
// يفهم الأعراض بالعربية والدارجة الجزائرية والفرنسية
// يصنّف الحالة (LOW/MEDIUM/HIGH) ويقدم تحليلاً طبياً مبدئياً
// قاعدة صارمة: لا يبحث عن أطباء — هذا شأن Doctor Search فقط
// ═══════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────
// SECTION 1: Symptom Keywords — كلمات الأعراض والأمراض
// ──────────────────────────────────────────────────────────────────────

const SYMPTOM_KEYWORDS = [
  // أعراض عامة — عربية فصحى
  'صداع', 'ألم', 'وجع', 'حمى', 'حرارة', 'سخونة', 'دوخة', 'دوار', 'تعب',
  'إرهاق', 'غثيان', 'قيء', 'إسهال', 'إمساك', 'حرقة', 'برد', 'كحة', 'سعال',
  'زكام', 'رشح', 'انف سائل', 'التهاب', 'تورم', 'طفح', 'حكة', 'جرب',
  'صعوبة في التنفس', 'ضيق في التنفس', 'ضربات قلب', 'خفقان', 'نزيف',
  'دم', 'بول', 'براز', 'عيون حمراء', 'جفاف', 'عطش', 'فقدان الشهية',
  'فقدان الوزن', 'زيادة الوزن', 'أرق', 'نوم كثير', 'تشنج', 'خدر',
  'وخز', 'ضعف عضلي', 'مفصل', 'ركبة', 'ظهر', 'رقبة', 'كتف', 'بطن',
  'صدر', 'حلق', 'أذن', 'جلد', 'عظم', 'كلية', 'كبد', 'معدة', 'قولون',
  // دارجة جزائرية
  'راسي يضرب', 'يدوخني', 'تعبان', 'مريض', 'حمة', 'سخنة', 'وجعني',
  'يوجعني', 'جسمي يوجعني', 'ما نقدرش نتنفس', 'ما نقدرش نقوم',
  'نقيء', 'دوار', 'بصاق', 'بلغم', 'صوتي ماشي', 'يدمعلي عيني',
  'كحة شديدة', 'ظهري يوجعني', 'ركبتي', 'بطني يوجعني', 'حارقة',
  'زوج عيني حمر', 'ما نقدرش ننعس', 'دمي', 'بولي', 'رأسي', 'جنبي',
  // فرنسية
  'mal de tête', 'fièvre', 'douleur', 'fatigue', 'nausée', 'vomissement',
  'toux', 'rhume', 'grippe', 'inflammation', 'gonflement', 'allergie',
  'diarrhée', 'constipation', 'vertige', 'essoufflement', 'saignement',
  'brûlure', 'mal au ventre', 'mal au dos', 'tension', 'diabète',
  // مصطلحات طبية
  'ضغط', 'سكري', 'كوليسترول', 'ربو', 'أنيميا', 'فقر دم', 'صرع',
  'شلل', 'سرطان', 'قرحة', 'حصوة', 'حصى', 'ورم', 'خراج', 'ناسور',
  'هرمونات', 'درقية', 'غدة', 'بنكرياس', 'رئة', 'قلب',
]

const DRUG_KEYWORDS = [
  'دواء', 'دوا', 'حبة', 'حبوب', 'شراب', 'مضاد حيوي', 'مضادات حيوية',
  'مسكن', 'مسكنات', 'مضاد للالتهاب', 'أقراص', 'حقنة', 'جرعة',
  'باراسيتامول', 'إيبوبروفين', 'أموكسيسيلين', 'متى آخذ', 'كيف آخذ',
  'médicament', 'antibiotique', 'paracétamol', 'doliprane', 'ibuprofen',
  'posologie', 'dose', 'traitement', 'ordonnance',
  'دوا للصداع', 'دوا للحمى', 'دوا للكحة', 'دوا لـ', 'علاج لـ',
]

const MEDICAL_INFO_KW = [
  'مرض', 'أمراض', 'سبب', 'أسباب', 'علاج', 'علاج منزلي',
  'كيف أعرف', 'كيف نعرفو', 'ماذا يعني', 'ما هو مرض',
  'هل هذا خطير', 'واش هذا خطير', 'مرض في الجزائر',
  'وقاية', 'تطعيم', 'لقاح', 'فيتامين', 'تغذية طبية',
  'حمية', 'رجيم طبي', 'إسعاف أولي', 'طوارئ', 'نزلة برد',
  'independant du medecin', 'maladie', 'symptôme', 'traitement naturel',
]

// ──────────────────────────────────────────────────────────────────────
// SECTION 2: Doctor Search Guard — الكلمات التي تنتمي لـ Doctor Finder
// ──────────────────────────────────────────────────────────────────────
// أي رسالة تحتوي هذه الكلمات = Doctor Finder، ليس DZ Health Agent
const DOCTOR_SEARCH_GUARD = [
  'طبيب قريب', 'طبيب في', 'دكتور في', 'عيادة في', 'مستوصف في',
  'حجز موعد', 'موعد طبيب', 'موعد عند', 'أبحث عن طبيب', 'بحث عن طبيب',
  'نحوس على طبيب', 'نقلب على طبيب', 'وين طبيب', 'فين طبيب',
  'طبيب عام', 'طبيب أسنان', 'طبيب قلب', 'طبيب عيون', 'طبيب جلدية',
  'طبيب نساء', 'طبيب أطفال', 'دكتور أسنان', 'دكتور عيون',
  'médecin à', 'dentiste à', 'cardiologue à', 'clinique à', 'rendez-vous',
]

// ──────────────────────────────────────────────────────────────────────
// SECTION 3: Emergency Keywords — طوارئ فورية (تُعيد رداً مختلفاً)
// ──────────────────────────────────────────────────────────────────────
const EMERGENCY_KW = [
  'نوبة قلبية', 'ألم حاد في الصدر', 'ضربة شمس', 'جرعة زائدة',
  'تسمم', 'حادث', 'إغماء', 'فقدان الوعي', 'شلل مفاجئ',
  'نزيف شديد', 'احتراق', 'حرق', 'اختناق', 'صعوبة شديدة في التنفس',
  'heart attack', 'stroke', 'overdose', 'fainted', 'unconscious', 'choking',
  'infarctus', 'avc', 'inconscient', 'convulsion',
]

// ──────────────────────────────────────────────────────────────────────
// SECTION 4: Arabic Symptom Normalization Dictionary
// ──────────────────────────────────────────────────────────────────────
const SYMPTOM_NORMALIZE = {
  // دارجة → فصحى طبية
  'راسي يضرب': 'صداع',
  'يدوخني': 'دوار وإغماء',
  'تعبان': 'إرهاق وتعب',
  'حمة': 'حمى وارتفاع الحرارة',
  'سخنة': 'حمى',
  'كحة': 'سعال',
  'بلغم': 'إفرازات بلغمية',
  'بطني يوجعني': 'آلام البطن',
  'ظهري يوجعني': 'آلام الظهر',
  'حارقة': 'حرقة المعدة',
  // فرنسية → عربية
  'mal de tête': 'صداع',
  'fièvre': 'حمى',
  'toux': 'سعال',
  'vertige': 'دوار',
  'nausée': 'غثيان',
  'douleur': 'ألم',
}

// ──────────────────────────────────────────────────────────────────────
// SECTION 5: DZ Health Knowledge Base — أمراض شائعة في الجزائر
// ──────────────────────────────────────────────────────────────────────
const DZ_HEALTH_KB = [
  {
    name: 'مرض السكري',
    prevalence: 'شائع جداً — 12.7% من السكان',
    symptoms: ['عطش', 'بول متكرر', 'تعب', 'تأخر التئام الجروح'],
    advice: 'فحص دوري لمستوى السكر في الدم — متوفر في المراكز الصحية المجانية',
    drugs: ['ميتفورمين (بوصفة)', 'أنسولين (بوصفة)'],
    triage: 'MEDIUM',
  },
  {
    name: 'ارتفاع ضغط الدم',
    prevalence: 'شائع — 35% بعد 40 سنة',
    symptoms: ['صداع', 'دوار', 'احمرار الوجه', 'خفقان'],
    advice: 'قياس الضغط منتظم — تقليل الملح — تجنب الإجهاد',
    drugs: ['لوسارتان (بوصفة)', 'أملوديبين (بوصفة)'],
    triage: 'MEDIUM',
  },
  {
    name: 'التهاب الجهاز التنفسي',
    prevalence: 'شائع جداً — خاصة الشتاء',
    symptoms: ['كحة', 'حمى', 'سعال', 'ضيق في التنفس'],
    advice: 'راحة + شرب سوائل دافئة + إبخار',
    drugs: ['باراسيتامول لخفض الحرارة', 'مضاد للالتهاب (بوصفة إذا شديد)'],
    triage: 'LOW',
  },
  {
    name: 'حصوة الكلى',
    prevalence: 'شائع — مناخ حار + قلة شرب الماء',
    symptoms: ['ألم حاد جانبي', 'بول دموي', 'غثيان', 'ألم عند التبول'],
    advice: 'شرب 3L ماء يومياً — تقليل الملح والبروتين',
    drugs: ['مسكنات (بوصفة في الحالات الحادة)'],
    triage: 'HIGH',
  },
  {
    name: 'حرقة المعدة / الارتجاع',
    prevalence: 'شائع جداً',
    symptoms: ['حرقة في الصدر', 'مذاق حامض', 'ألم بعد الأكل'],
    advice: 'تجنب القهوة والتوابل — لا تنام مباشرة بعد الأكل',
    drugs: ['أوميبرازول (متوفر بدون وصفة)', 'مضادات الحموضة'],
    triage: 'LOW',
  },
  {
    name: 'فقر الدم (الأنيميا)',
    prevalence: 'شائع خاصة عند النساء',
    symptoms: ['تعب مزمن', 'شحوب', 'دوار', 'ضيق في التنفس عند المجهود'],
    advice: 'فحص دم كامل — زيادة الحديد في الغذاء (لحم، عدس، سبانخ)',
    drugs: ['حديد فيروس (بوصفة عادةً)'],
    triage: 'MEDIUM',
  },
]

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────
function hasAny(text, list) {
  const t = text.toLowerCase()
  return list.some(k => t.includes(k.toLowerCase()))
}

function extractSymptoms(text) {
  const found = []
  const t = text.toLowerCase()
  for (const kw of SYMPTOM_KEYWORDS) {
    if (t.includes(kw.toLowerCase())) {
      const normalized = SYMPTOM_NORMALIZE[kw] || kw
      if (!found.includes(normalized)) found.push(normalized)
    }
  }
  return found.slice(0, 8)
}

function detectUrgencyKeywords(text) {
  const t = text.toLowerCase()
  // كلمات طوارئ فورية
  if (hasAny(t, EMERGENCY_KW)) return 'HIGH'
  // كلمات تشير لخطورة عالية
  if (/نزيف شديد|فقدان الوعي|شلل|تحجر|اختناق|تشنج شديد|تسمم/.test(t)) return 'HIGH'
  // أعراض متعددة مع ذكر الصدر أو القلب
  if (/ألم.*صدر|صدر.*يوجعني|قلبي|ضربات.*قلب|خفقان.*شديد/.test(t)) return 'HIGH'
  return null
}

// ──────────────────────────────────────────────────────────────────────
// MAIN EXPORT 1: detectHealthIntent
// ──────────────────────────────────────────────────────────────────────
/**
 * يكتشف هل الرسالة طبية، وهل يجب توجيهها لـ DZ Health Agent
 *
 * @returns {{ isHealthQuery, isDoctorSearch, isEmergency, symptoms, hasDrugQuestion }}
 */
export function detectHealthIntent(message) {
  if (!message || typeof message !== 'string') {
    return { isHealthQuery: false, isDoctorSearch: false, isEmergency: false, symptoms: [], hasDrugQuestion: false }
  }

  const text = message.trim()

  // Guard: Doctor Search queries → NOT health agent
  if (hasAny(text, DOCTOR_SEARCH_GUARD)) {
    return { isHealthQuery: false, isDoctorSearch: true, isEmergency: false, symptoms: [], hasDrugQuestion: false }
  }

  const symptoms       = extractSymptoms(text)
  const hasDrugQuestion = hasAny(text, DRUG_KEYWORDS)
  const hasMedicalInfo  = hasAny(text, MEDICAL_INFO_KW)
  const isEmergency     = hasAny(text, EMERGENCY_KW) || detectUrgencyKeywords(text) === 'HIGH'

  const isHealthQuery = symptoms.length > 0 || hasDrugQuestion || hasMedicalInfo || isEmergency

  return {
    isHealthQuery,
    isDoctorSearch: false,
    isEmergency,
    symptoms,
    hasDrugQuestion,
  }
}

// ──────────────────────────────────────────────────────────────────────
// MAIN EXPORT 2: buildHealthSystemPrompt
// ──────────────────────────────────────────────────────────────────────
export function buildHealthSystemPrompt(symptoms = [], hasDrugQuestion = false, isEmergency = false) {
  const symptomContext = symptoms.length > 0
    ? `\nالأعراض المُستخرجة: ${symptoms.join('، ')}`
    : ''

  const emergencyNote = isEmergency
    ? '\n⚠️ EMERGENCY DETECTED — Give HIGH urgency level immediately and recommend calling emergency services.'
    : ''

  return `أنت DZ Health AI، مساعد طبي متخصص مدمج في DZ Agent.

مهمتك:
- فهم الأعراض الطبية بالعربية والدارجة الجزائرية والفرنسية
- تقديم تفسير طبي مبدئي (ليس تشخيصاً نهائياً)
- تصنيف الخطورة: LOW (خفيف) | MEDIUM (متوسط) | HIGH (خطر)
- اقتراح أدوية عامة وإرشادات أولية
- الإجابة دائماً بالعربية ما لم يطلب المستخدم غير ذلك
${symptomContext}${emergencyNote}

قواعد إلزامية:
1. لن تدّعي أنك طبيب حقيقي.
2. لن تقدم تشخيصاً نهائياً قاطعاً.
3. أضف دائماً: "هذا ليس تشخيصاً طبياً — استشر طبيباً عند الحاجة"
4. لا تبحث عن الأطباء مباشرة — يمكنك فقط اقتراح ميزة البحث عن طبيب.
5. للأدوية الخطرة أو المضادات الحيوية: أذكرها كمعلومة فقط مع التأكيد أنها تتطلب وصفة.
${hasDrugQuestion ? '6. المستخدم يسأل عن دواء — قدم معلومات الجرعة العامة والاحتياطات فقط.' : ''}

شكل الإجابة المطلوب بالضبط (JSON داخل markdown):
\`\`\`json
{
  "interpretation": "شرح مبسط للأعراض",
  "possible_causes": ["سبب 1", "سبب 2", "سبب 3"],
  "triage_level": "LOW | MEDIUM | HIGH",
  "triage_reason": "سبب التصنيف",
  "advice": ["نصيحة 1", "نصيحة 2", "نصيحة 3"],
  "medications_info": "معلومات دوائية عامة إن وُجدت (بدون وصفة)",
  "suggest_doctor": true | false,
  "emergency_note": "ملاحظة طوارئ إن وُجدت أو null",
  "disclaimer": "هذا ليس تشخيصاً طبياً — استشر طبيباً مختصاً"
}
\`\`\`
لا تضف أي نص قبل أو بعد الـ JSON.`
}

// ──────────────────────────────────────────────────────────────────────
// MAIN EXPORT 3: parseHealthResponse
// ──────────────────────────────────────────────────────────────────────
export function parseHealthResponse(rawContent, originalQuery, symptoms) {
  try {
    // استخراج JSON من المحتوى
    const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/)
    const jsonStr = jsonMatch ? jsonMatch[1] : rawContent.trim()
    const data = JSON.parse(jsonStr)

    return {
      ok: true,
      interpretation:  data.interpretation    || 'تحليل الأعراض',
      possible_causes: Array.isArray(data.possible_causes) ? data.possible_causes : [],
      triage_level:    ['LOW', 'MEDIUM', 'HIGH'].includes(data.triage_level) ? data.triage_level : 'MEDIUM',
      triage_reason:   data.triage_reason      || '',
      advice:          Array.isArray(data.advice) ? data.advice : [],
      medications_info: data.medications_info  || null,
      suggest_doctor:  !!data.suggest_doctor,
      emergency_note:  data.emergency_note     || null,
      disclaimer:      data.disclaimer         || 'هذا ليس تشخيصاً طبياً — استشر طبيباً مختصاً',
      symptoms_found:  symptoms,
      original_query:  originalQuery?.slice(0, 120) || '',
    }
  } catch {
    // fallback إذا فشل الـ JSON parsing
    return {
      ok: true,
      interpretation:  rawContent.slice(0, 400),
      possible_causes: [],
      triage_level:    'MEDIUM',
      triage_reason:   'تعذّر التحليل الدقيق',
      advice:          ['استشر طبيباً للتشخيص الدقيق'],
      medications_info: null,
      suggest_doctor:  true,
      emergency_note:  null,
      disclaimer:      'هذا ليس تشخيصاً طبياً — استشر طبيباً مختصاً',
      symptoms_found:  symptoms,
      original_query:  originalQuery?.slice(0, 120) || '',
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// MAIN EXPORT 4: getRelatedDZKnowledge
// ──────────────────────────────────────────────────────────────────────
export function getRelatedDZKnowledge(symptoms) {
  if (!symptoms || symptoms.length === 0) return null
  const symp = symptoms.join(' ').toLowerCase()
  for (const entry of DZ_HEALTH_KB) {
    const match = entry.symptoms.some(s => symp.includes(s.toLowerCase()))
    if (match) return entry
  }
  return null
}

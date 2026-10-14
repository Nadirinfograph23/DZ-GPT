import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getToolRedirectIntent, TOOL_REDIRECT_TOOL_IDS } from '../src/lib/tool-redirect-intents.js'

const positiveCases = [
  [
    "open the Visual AI image tool",
    "image"
  ],
  [
    "افتح أداة الصور",
    "image"
  ],
  [
    "أنشئ لي سيرة ذاتية احترافية",
    "cv"
  ],
  [
    "إنشاء سيرة ذاتية",
    "cv"
  ],
  [
    "انشاء سيرة ذاتية",
    "cv"
  ],
  [
    "Create a resume for a software engineer",
    "cv"
  ],
  [
    "أنشئ خطة مشروع لمتجري",
    "planner"
  ],
  [
    "plan a project timeline",
    "planner"
  ],
  [
    "rédige un contrat de travail",
    "docs"
  ],
  [
    "ابحث لي عن وظيفة في الجزائر",
    "jobs"
  ],
  [
    "أريد وظيفة في الجزائر",
    "jobs"
  ],
  [
    "افتح أداة الصحة",
    "health"
  ],
  [
    "open the OCR tool",
    "ocr"
  ],
  [
    "create a business plan for a café",
    "bizplan"
  ],
  [
    "أنشئ لي فاتورة",
    "invoice"
  ],
  [
    "احسب ضريبة الدخل على راتبي",
    "tax"
  ],
  [
    "calculate my zakat",
    "zakat"
  ],
  [
    "Generate hashtags for a bakery",
    "hashtag"
  ],
  [
    "create an Excel spreadsheet for expenses",
    "excel"
  ],
  [
    "احسب معاش التقاعد",
    "pension"
  ],
  [
    "صمّم بطاقة عمل للمحل",
    "bizcard"
  ],
  [
    "حلل بيانات CSV",
    "dataanalysis"
  ],
  [
    "convert this text to speech",
    "tts"
  ],
  [
    "read this aloud",
    "tts"
  ],
  [
    "take a screenshot of my website",
    "screenshot"
  ],
  [
    "upload and share my pdf file",
    "fileupload"
  ],
  [
    "convert this DOCX file to PDF",
    "convert"
  ],
  [
    "find flights from Algiers to Paris",
    "flights"
  ],
  [
    "أنشئ QR code لرابط موقعي",
    "qrcode"
  ],
  [
    "إنشاء كود QR",
    "qrcode"
  ],
  [
    "إنشأ كود QR خاص بي",
    "qrcode"
  ],
  [
    "كود qr في جيبه",
    "qrcode"
  ],
  [
    "انشاء كود QR",
    "qrcode"
  ],
  [
    "QR لرقم هاتفي",
    "qrcode"
  ],
  [
    "Can you generate a QR code for this url?",
    "qrcode"
  ],
  [
    "open the QR code tool",
    "qrcode"
  ],
  [
    "ديرلي QR code لرقم هاتفي",
    "qrcode"
  ],
  [
    "faire un code QR pour mon site",
    "qrcode"
  ],
  ["Créez un CV professionnel pour moi", "cv"],
  ["Je voudrais créer mon CV", "cv"],
  ["Crée une facture pour mon magasin", "invoice"],
  ["Cherche un emploi à Alger", "jobs"],
  ["Ouvre l'outil de santé", "health"],
  ["Planifie un projet pour mon café", "planner"],
  ["Calcule ma pension de retraite", "pension"],
  ["Génère un code QR pour mon site", "qrcode"],
  ["Convertis ce fichier PDF en Word", "convert"],
  ["Partage ce fichier PDF", "fileupload"],
  ["Créer une carte de visite", "bizcard"],
  ["Fais une capture d'écran de mon site", "screenshot"],
  ["Ouvre le lecteur OCR", "ocr"],
  ["Créer une feuille de calcul pour mon budget", "excel"],
  ["Analyse mes données CSV", "dataanalysis"],
  ["Lire ce texte à voix haute", "tts"],
  ["Cherche les vols Air Algérie pour Paris", "flights"],
  ["ديرلي سيرة ذاتية", "cv"],
  ["نحب ندير QR لرقم هاتفي", "qrcode"],
  ["صايبلي فاتورة للمحل", "invoice"],
  ["وجدلي خطة مشروع للمقهى", "planner"],
]

const requiredCvCases = [
  ["أنشئ سيرة ذاتية", "افتح أداة إنشاء السيرة الذاتية", "يمكنك استخدام"],
  ["إنشأ سيرة ذاتية", "افتح أداة إنشاء السيرة الذاتية", "يمكنك استخدام"],
  ["أريد إنشاء سيرة ذاتية", "افتح أداة إنشاء السيرة الذاتية", "يمكنك استخدام"],
  ["ساعدني في إنشاء CV", "افتح أداة إنشاء السيرة الذاتية", "يمكنك استخدام"],
  ["أريد عمل سيرة ذاتية احترافية", "افتح أداة إنشاء السيرة الذاتية", "يمكنك استخدام"],
  ["أنشئ لي سيرة ذاتية", "افتح أداة إنشاء السيرة الذاتية", "يمكنك استخدام"],
  ["ديرلي CV", "حلّ أداة السيرة الذاتية", "تقدر تستعمل"],
  ["حبيت ندير سيرة ذاتية", "حلّ أداة السيرة الذاتية", "تقدر تستعمل"],
  ["عاونّي نصايب CV", "حلّ أداة السيرة الذاتية", "تقدر تستعمل"],
  ["كيفاش ندير CV؟", "حلّ أداة السيرة الذاتية", "تقدر تستعمل"],
  ["Crée-moi un CV", "Ouvrir l’outil de création de CV", "Vous pouvez utiliser"],
  ["Je veux créer un CV", "Ouvrir l’outil de création de CV", "Vous pouvez utiliser"],
  ["Créer un curriculum vitae", "Ouvrir l’outil de création de CV", "Vous pouvez utiliser"],
  ["Create a CV", "Open CV creator", "You can use"],
  ["Create a resume", "Open CV creator", "You can use"],
  ["Help me create my résumé", "Open CV creator", "You can use"],
]

for (const [text, buttonLabel, messagePrefix] of requiredCvCases) {
  const result = getToolRedirectIntent(text)
  assert.equal(result?.id, "cv", `Expected CV routing for: ${text}`)
  assert.equal(result?.toolUrl, "/tools?tool=cv", `Unexpected CV destination for: ${text}`)
  assert.equal(result?.buttonLabel, buttonLabel, `Wrong localized CV button for: ${text}`)
  assert.ok(result?.message.startsWith(messagePrefix), `Wrong localized CV response for: ${text}`)
}


const requiredFlightScheduleCases = [
  ["مواعيد رحلات الخطوط الجوية الجزائرية", "افتح أداة البحث عن الرحلات", "يمكنك استخدام"],
  ["ما هي مواعيد رحلات الخطوط الجوية الجزائرية؟", "افتح أداة البحث عن الرحلات", "يمكنك استخدام"],
  ["وقتاش كاين رحلات الخطوط الجوية الجزائرية؟", "حلّ أداة البحث على الرحلات", "تقدر تستعمل"],
  ["Horaires des vols Air Algérie", "Ouvrir l’outil de recherche de vols", "Vous pouvez utiliser"],
  ["Air Algérie flight schedule", "Open flight search tool", "You can use"],
]
for (const [text, buttonLabel, messagePrefix] of requiredFlightScheduleCases) {
  const result = getToolRedirectIntent(text)
  assert.equal(result?.id, "flights")
  assert.equal(result?.toolUrl, "/tools?tool=flights")
  assert.equal(result?.buttonLabel, buttonLabel)
  assert.ok(result?.message.startsWith(messagePrefix))
}
for (const text of ["اشرح جدول رحلات الخطوط الجوية الجزائرية", "ما معنى جدول رحلات الخطوط الجوية الجزائرية؟", "Explain the Air Algérie flight schedule", "What is Air Algérie?"]) {
  assert.equal(getToolRedirectIntent(text), null)
}
// Every live tools-page entry has a representative request in Arabic,
// French, English, and Algerian Darija / Franco-Darija.
const multilingualCases = [
  ['image', ['افتح أداة الصور الذكية', 'Ouvre l’outil d’images IA', 'open the AI image tool', 'nheb l’outil d’images IA']],
  ['cv', ['أنشئ لي سيرة ذاتية احترافية', 'Crée mon CV professionnel', 'Create a professional resume', 'كيفاش ندير CV؟']],
  ['planner', ['أنشئ خطة مشروع لمتجري', 'Planifie un projet pour mon café', 'Create a project plan', 'wajedli khouta projet']],
  ['docs', ['اكتب عقد عمل', 'Rédige un contrat de travail', 'Draft a business contract', 'sawbli 3aqd 5edma']],
  ['jobs', ['ابحث عن وظيفة في الجزائر', 'Cherche un emploi à Alger', 'Find a job in Algiers', 'nheb nkhdem, cherche job']],
  ['health', ['ابحث عن طبيب أسنان في عنابة', 'Cherche un médecin à Annaba', 'Find a doctor in Annaba', 'nheb médecin f Annaba']],
  ['ocr', ['استخرج النص من الصورة باستعمال OCR', 'Extraire le texte de cette image avec OCR', 'Extract text from this photo using OCR', 'nheb extract text avec OCR']],
  ['bizplan', ['أنشئ خطة عمل لمقهى', 'Crée un business plan pour un café', 'Create a business plan for a café', 'sawbli business plan ta3 café']],
  ['invoice', ['أنشئ لي فاتورة', 'Crée une facture pour mon magasin', 'Create an invoice for my shop', 'nheb ndir facture l magasin']],
  ['tax', ['احسب ضريبة الدخل على راتبي', 'Calcule mes impôts sur le revenu', 'Calculate my income tax', '7seb impots ta3 salaire']],
  ['zakat', ['احسب زكاة مالي', 'Calcule ma zakat', 'Calculate my zakat', '7seb zakat ta3i']],
  ['hashtag', ['أنشئ هاشتاغات لمطعمي', 'Génère des hashtags pour mon restaurant', 'Generate hashtags for my cafe', 'sawb hashtags ta3 café']],
  ['excel', ['أنشئ جدول Excel للمصاريف', 'Crée un tableau Excel pour mes dépenses', 'Create an Excel spreadsheet for expenses', 'nheb ndir tableau Excel']],
  ['pension', ['احسب معاش التقاعد', 'Calcule ma pension de retraite', 'Calculate my pension', '7seb retraite ta3i']],
  ['qrcode', ['أنشئ رمز QR لرابط موقعي', 'Génère un code QR pour mon site', 'Generate a QR code for my website', 'nheb ndir QR l site ta3i']],
  ['bizcard', ['صمم بطاقة عمل للمحل', 'Crée une carte de visite', 'Design a business card', 'sawb carte visite ta3 magasin']],
  ['dataanalysis', ['حلل ملف CSV', 'Analyse mes données CSV', 'Analyze my CSV data', 'nheb n-analyse data CSV']],
  ['tts', ['حوّل النص إلى صوت', 'Convertis ce texte en parole', 'Convert this text to speech', 'nheb converti texte l audio']],
  ['screenshot', ['التقط لقطة شاشة لموقعي', 'Fais une capture d’écran de mon site', 'Take a screenshot of my website', 'dir capture d’écran ta3 site']],
  ['fileupload', ['ارفع وشارك ملف PDF', 'Partage ce fichier PDF', 'Upload and share my PDF file', 'nheb upload file PDF']],
  ['convert', ['حوّل هذا الملف إلى PDF', 'Convertis ce fichier Word en PDF', 'Convert this DOCX file to PDF', 'nheb convert file PDF']],
  ['flights', ['ابحث عن رحلات من الجزائر إلى باريس', 'Cherche des vols d’Alger à Paris', 'Find flights from Algiers to Paris', 'nheb n-searchi vols l Paris']],
]

const toolsPage = readFileSync(new URL('../src/pages/DZTools.tsx', import.meta.url), 'utf8')
const pageIdsMatch = toolsPage.match(/const VALID_TOOL_IDS: ToolId\[\] = \[([^\]]+)\]/)
assert.ok(pageIdsMatch, 'Expected the tools page to expose its deep-link allowlist')
const pageToolIds = [...pageIdsMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1])
assert.deepEqual([...TOOL_REDIRECT_TOOL_IDS].sort(), [...pageToolIds].sort(), 'Intent registry must cover exactly the deep-linkable tools')
assert.equal(TOOL_REDIRECT_TOOL_IDS.length, 22, 'Expected all 22 tools currently rendered on the tools page')

const languageExpectations = [
  { prefix: 'افتح', message: 'يمكنك استخدام' },
  { prefix: 'Ouvrir', message: 'Vous pouvez utiliser' },
  { prefix: 'Open', message: 'You can use' },
  { prefix: 'حلّ', message: 'تقدر تستعمل' },
]
let multilingualCount = 0
for (const [expectedId, requests] of multilingualCases) {
  assert.equal(requests.length, 4, `Expected four language samples for ${expectedId}`)
  requests.forEach((text, index) => {
    const result = getToolRedirectIntent(text)
    assert.equal(result?.id, expectedId, `Expected ${expectedId} for: ${text}`)
    assert.equal(result?.toolUrl, `/tools?tool=${expectedId}`, `Unexpected destination for: ${text}`)
    assert.ok(result?.buttonLabel, `Missing localized button label for: ${text}`)
    assert.ok(result?.message, `Missing localized response for: ${text}`)
    if (expectedId === 'qrcode' && (index === 0 || index === 3)) {
      assert.equal(result.buttonLabel, 'فتح الأداة ←', 'Preserve the existing Arabic QR button label')
      if (index === 0) assert.ok(result.message.includes('QR Code'), 'Preserve the existing Arabic QR response')
      else assert.ok(result.message.startsWith(languageExpectations[index].message), `Wrong response language for: ${text}`)
    } else {
      assert.ok(result.buttonLabel.startsWith(languageExpectations[index].prefix), `Wrong button language for: ${text}`)
      assert.ok(result.message.startsWith(languageExpectations[index].message), `Wrong response language for: ${text}`)
    }
    multilingualCount += 1
  })
}

const negativeCases = [
  "What is QR code?",
  "ما هو رمز QR؟",
  "ما معنى إنشأ كود QR؟",
  "اشرح كود QR في جيبه",
  "تعريف كود QR في جيبه",
  "كيف أنشئ QR code؟",
  "What is a business plan?",
  "ما معنى الفاتورة؟",
  "Can you explain how taxes work?",
  "I want to know about CVs",
  "Please write an email for me",
  "Create an image of a CV page",
  "Create an image of a cat",
  "ما النص في هذه الصورة؟",
  "what tools are available for invoices?",
  "ارسم بطاقة عمل للمحل",
  "ما هي أداة رفع الملفات؟",
  "how do I use the tax calculator?",
  "Qu'est-ce qu'un CV ?",
  "ما هي السيرة الذاتية؟",
  "كيف أكتب سيرة ذاتية ناجحة؟",
  "Comment créer un QR code ?",
  "Je veux des renseignements sur les impôts",
  "How do I use the tax calculator?",
  "what tools are available?"
]

for (const [text, expectedId] of positiveCases) {
  const result = getToolRedirectIntent(text)
  assert.equal(result?.id, expectedId, `Expected ${expectedId} for: ${text}`)
  assert.equal(result?.toolUrl, `/tools?tool=${expectedId}`, `Unexpected route for: ${text}`)
}

for (const text of negativeCases) {
  assert.equal(getToolRedirectIntent(text), null, `Should not redirect: ${text}`)
}

assert.equal(getToolRedirectIntent('create a CV for me', { hasImageAttachment: true }), null)
assert.equal(getToolRedirectIntent('open the Visual AI image tool')?.toolUrl, '/tools?tool=image')
assert.deepEqual(getToolRedirectIntent('أنشئ QR code لرابط موقعي')?.quickSuggestions, ['اعمل QR لرابط موقعي', 'QR لرقم هاتفي', 'QR لواتساب'])
assert.equal(getToolRedirectIntent('كيفاش ندير CV؟')?.toolUrl, '/tools?tool=cv')
assert.equal(getToolRedirectIntent('How do I make an invoice?')?.toolUrl, '/tools?tool=invoice')
assert.equal(getToolRedirectIntent('extract text from this photo using OCR')?.toolUrl, '/tools?tool=ocr')
assert.equal(getToolRedirectIntent('open the image generator tool')?.toolUrl, '/tools?tool=image')
assert.equal(getToolRedirectIntent('Comment convertir un PDF ?')?.toolUrl, '/tools?tool=convert')

console.log(`Tool redirect intent tests passed (${positiveCases.length} legacy positives, ${multilingualCount} multilingual routes across ${TOOL_REDIRECT_TOOL_IDS.length} tools, ${negativeCases.length} negative, plus safeguards).`)

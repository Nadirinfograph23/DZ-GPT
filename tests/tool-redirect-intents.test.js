import assert from 'node:assert/strict'
import { getToolRedirectIntent } from '../src/lib/tool-redirect-intents.js'

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
  ]
]

const negativeCases = [
  "What is QR code?",
  "ما هو رمز QR؟",
  "كيف أنشئ QR code؟",
  "What is a business plan?",
  "How do I make an invoice?",
  "ما معنى الفاتورة؟",
  "Can you explain how taxes work?",
  "I want to know about CVs",
  "Please write an email for me",
  "Create an image of a CV page",
  "Create an image of a cat",
  "ما النص في هذه الصورة؟",
  "extract text from this photo using OCR",
  "open the image generator tool",
  "create a QR code image for my business",
  "what tools are available for invoices?",
  "ارسم بطاقة عمل للمحل",
  "ما هي أداة رفع الملفات؟",
  "how do I use the tax calculator?"
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

console.log(`Tool redirect intent tests passed (${positiveCases.length} positive, ${negativeCases.length} negative, plus image and QR safeguards).`)

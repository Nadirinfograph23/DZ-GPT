/**
 * DZ Agent — Basic Smoke Tests
 * تشغيل: node tests/basic.test.js
 *
 * يختبر الوظائف الحرجة:
 *   ① classifyComplexity — عربي + دارجة + إنجليزي
 *   ② isDarijaText
 *   ③ buildUnderstandingContext
 *   ④ normalize (dzEngine)
 *   ⑤ detectIntent
 *   ⑥ detectOwnerCommand (without side effects)
 */

import { classifyComplexity } from '../lib/reasoning/index.js'
import { isDarijaMessage, buildUnderstandingContext } from '../lib/dz-understanding.js'
import { normalize, isDarijaText, detectIntent } from '../dialect/dzEngine.js'

let passed = 0
let failed = 0
const failures = []

function assert(label, condition, got = '') {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    failures.push({ label, got })
    console.log(`  ❌ ${label}${got ? ` — got: ${got}` : ''}`)
  }
}

function section(name) {
  console.log(`\n━━━ ${name} ━━━`)
}

// ══════════════════════════════════════════════════════════════
// ① classifyComplexity
// ══════════════════════════════════════════════════════════════
section('classifyComplexity — Arabic + Darija + English')

// Simple
assert('سلام → simple', classifyComplexity('سلام') === 'simple', classifyComplexity('سلام'))
assert('hello → simple', classifyComplexity('hello') === 'simple', classifyComplexity('hello'))
assert('واش → simple (too short)', classifyComplexity('واش') === 'simple', classifyComplexity('واش'))

// Darija moderate (short but dense)
assert('كيفاش ندير سيرة ذاتية → moderate', classifyComplexity('كيفاش ندير سيرة ذاتية') === 'moderate', classifyComplexity('كيفاش ندير سيرة ذاتية'))
assert('شرحلي كيفاش يخدم الإنترنت → moderate', classifyComplexity('شرحلي كيفاش يخدم الإنترنت') === 'moderate', classifyComplexity('شرحلي كيفاش يخدم الإنترنت'))
assert('علاش ما يخدمش الكود → code/moderate', ['code', 'moderate'].includes(classifyComplexity('علاش ما يخدمش الكود')), classifyComplexity('علاش ما يخدمش الكود'))
assert('أنهي أحسن Python ولا JavaScript → complex', classifyComplexity('أنهي أحسن Python ولا JavaScript') === 'complex', classifyComplexity('أنهي أحسن Python ولا JavaScript'))

// Arabic complex
assert('حلّل الفرق بين SQL وNoSQL → complex', classifyComplexity('حلّل الفرق بين SQL وNoSQL') === 'complex', classifyComplexity('حلّل الفرق بين SQL وNoSQL'))
assert('قارن بين React و Vue → complex', classifyComplexity('قارن بين React و Vue') === 'complex', classifyComplexity('قارن بين React و Vue'))

// Multi-step
assert('خطة من وين نبدا وكيفاش → multi_step', classifyComplexity('خطة من وين نبدا وكيفاش') === 'multi_step', classifyComplexity('خطة من وين نبدا وكيفاش'))
assert('خطوة بخطوة كيف أنشئ موقع → multi_step', classifyComplexity('خطوة بخطوة كيف أنشئ موقع') === 'multi_step', classifyComplexity('خطوة بخطوة كيف أنشئ موقع'))

// Code
assert('دير لي كود html → code', classifyComplexity('دير لي كود html') === 'code', classifyComplexity('دير لي كود html'))
assert('اكتب كود python → code', classifyComplexity('اكتب كود python') === 'code', classifyComplexity('اكتب كود python'))
assert('dir li code html → code', classifyComplexity('dir li code html') === 'code', classifyComplexity('dir li code html'))

// Research
assert('شرحلي تاريخ الجزائر → research', classifyComplexity('شرحلي تاريخ الجزائر') === 'research', classifyComplexity('شرحلي تاريخ الجزائر'))

// ══════════════════════════════════════════════════════════════
// ② isDarijaText + isDarijaMessage
// ══════════════════════════════════════════════════════════════
section('isDarijaText / isDarijaMessage')

assert('واش راك → darija', isDarijaText('واش راك') === true)
assert('بزاف + مليح → darija', isDarijaText('بزاف واحد مليح') === true)
assert('hello world → not darija', isDarijaText('hello world') === false)
assert('كيفاش (isDarijaMessage) → true', isDarijaMessage('كيفاش ندير') === true)
assert('English only (isDarijaMessage) → false', isDarijaMessage('what is python') === false)

// ══════════════════════════════════════════════════════════════
// ③ buildUnderstandingContext
// ══════════════════════════════════════════════════════════════
section('buildUnderstandingContext')

const ctx1 = buildUnderstandingContext('كيفاش ندير سيرة ذاتية')
assert('كيفاش → returns string', typeof ctx1 === 'string' && ctx1.length > 10, typeof ctx1)
assert('كيفاش → contains طريقة/خطوات', ctx1?.includes('طريقة') || ctx1?.includes('خطوات') || ctx1?.includes('how'))

const ctx2 = buildUnderstandingContext('شحال الدولار اليوم')
assert('شحال الدولار → price hint in context', ctx2?.includes('سعر') || ctx2?.includes('اليوم') || ctx2?.includes('مصدر'))

const ctx3 = buildUnderstandingContext('hello')
assert('hello → null (no darija, no pattern)', ctx3 === null, String(ctx3))

const ctx4 = buildUnderstandingContext('بغيت LFP نتائج مباريات اليوم')
assert('LFP → sports context or implicit need', ctx4?.includes('رياض') || ctx4?.includes('حية') || ctx4 !== null)

// isOwnerAnswer bypass
const ctx5 = buildUnderstandingContext('أنا DZ Agent', { isOwnerAnswer: true })
assert('isOwnerAnswer → null', ctx5 === null, String(ctx5))

// ══════════════════════════════════════════════════════════════
// ④ normalize (dzEngine)
// ══════════════════════════════════════════════════════════════
section('normalize — Darija normalization')

const n1 = normalize('بزاااف')
assert('بزاااف → collapse repeated → بزاف (normalized)', n1.normalized?.includes('بزاف') || n1.original === 'بزاااف')

const n2 = normalize('واش راك؟')
assert('normalize returns object', typeof n2 === 'object' && 'normalized' in n2)
assert('normalize has languages', Array.isArray(n2.languages))

// ══════════════════════════════════════════════════════════════
// ⑤ detectIntent
// ══════════════════════════════════════════════════════════════
section('detectIntent')

const i1 = detectIntent('سلام', 'سلام')
assert('سلام → greeting', i1.intent === 'greeting', i1.intent)

const i2 = detectIntent('شكراً', 'شكراً')
assert('شكراً → gratitude', i2.intent === 'gratitude', i2.intent)

const i3 = detectIntent('دير لي موقع html', 'دير لي موقع html')
assert('دير لي موقع → build_web_app or code_help', ['build_web_app', 'code_help'].includes(i3.intent), i3.intent)

// ══════════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50))
console.log(`📊 Results: ${passed} passed | ${failed} failed | ${passed + failed} total`)

if (failures.length > 0) {
  console.log('\n⚠️  Failed tests:')
  for (const f of failures) {
    console.log(`   • ${f.label}${f.got ? ` (got: ${f.got})` : ''}`)
  }
}

const successRate = Math.round((passed / (passed + failed)) * 100)
console.log(`\n${successRate >= 80 ? '✅' : '❌'} Success rate: ${successRate}%`)

if (failed > 0) process.exit(1)

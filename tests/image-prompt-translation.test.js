import assert from 'node:assert/strict'
import { createImagePromptTranslator, sourceLanguageForImage } from '../lib/image-prompt-translator.js'

const tests = []
function test(name, run) { tests.push([name, run]) }
const arabic = 'ارسم قطة بيضاء جالسة قرب نافذة مفتوحة، وخلفها جبال خضراء عند الغروب، إضاءة ناعمة وألوان دافئة'
const englishCat = 'A white cat sits beside an open window, with green mountains behind it at sunset, soft lighting and warm colors.'

test('English prompts pass through without translation or added details', async () => {
  let calls = 0
  const translate = createImagePromptTranslator({ callGroqWithFallback: async () => { calls++; return { content: 'unexpected' } }, safeGenerateAI: async () => { calls++; return { content: 'unexpected' } } })
  const prompt = 'A black car on an empty street at sunset, photographed from above.'
  assert.equal(await translate(prompt), prompt)
  assert.equal(calls, 0)
})

test('an exact Arabic map entry avoids unnecessary model calls', async () => {
  let calls = 0
  const translate = createImagePromptTranslator({ staticMap: [['سيارة سوداء تتجول في العاصمة الجزائرية', 'a black car driving through the streets of Algiers, Algeria']], callGroqWithFallback: async () => { calls++; return { content: null } }, safeGenerateAI: async () => { calls++; return { content: null } } })
  assert.equal(await translate('سيارة سوداء تتجول في العاصمة الجزائرية'), 'a black car driving through the streets of Algiers, Algeria')
  assert.equal(calls, 0)
})

test('generic Arabic prompts use the current Groq model and preserve details', async () => {
  let usedModel = ''
  const translate = createImagePromptTranslator({ callGroqWithFallback: async ({ model }) => { usedModel = model; return { content: englishCat } }, safeGenerateAI: async () => { throw new Error('unexpected secondary call') }, fetchImpl: async () => { throw new Error('unexpected MyMemory call') } })
  assert.equal(await translate(arabic), englishCat)
  assert.equal(usedModel, 'llama-3.3-70b-versatile')
})

test('the existing multilingual AI chain rescues a mixed Groq translation', async () => {
  let fallbackHint = ''
  const translate = createImagePromptTranslator({ callGroqWithFallback: async () => ({ content: englishCat + ' مع نافذة مفتوحة' }), safeGenerateAI: async ({ taskHint }) => { fallbackHint = taskHint; return { content: englishCat } }, fetchImpl: async () => { throw new Error('unexpected MyMemory call') } })
  assert.equal(await translate(arabic), englishCat)
  assert.equal(fallbackHint, 'multilingual')
})

test('Algerian Franco-Darija, French, and Japanese are detected and translated', async () => {
  const cases = [['rani nheb voiture rouge fi Alger', 'A red car on a street in Algiers.'], ['Un chat noir dort sur le canapé près de la fenêtre.', 'A black cat sleeps on the sofa beside the window.'], ['海辺の夕焼けで赤い車を描いてください', 'Draw a red car by the sea at sunset.'], ['Dibuja un gato negro sobre una mesa junto a una ventana.', 'Draw a black cat on a table beside a window.'], ['Нарисуй белую кошку у открытого окна на закате.', 'Draw a white cat by an open window at sunset.']]
  for (const [prompt, expected] of cases) {
    assert.ok(sourceLanguageForImage(prompt), 'source language should be detected: ' + prompt)
    const translate = createImagePromptTranslator({ callGroqWithFallback: async () => ({ content: expected }), safeGenerateAI: async () => ({ content: expected }), fetchImpl: async () => { throw new Error('unexpected MyMemory call') } })
    assert.equal(await translate(prompt), expected)
  }
})

test('MyMemory receives the correct language pair after both model paths fail', async () => {
  let requestedUrl = ''
  const translate = createImagePromptTranslator({ callGroqWithFallback: async () => ({ content: null }), safeGenerateAI: async () => ({ content: null }), fetchImpl: async (url) => { requestedUrl = url; return { ok: true, json: async () => ({ responseData: { translatedText: 'A black cat sleeps beside the window.' } }) } } })
  assert.equal(await translate('Un chat noir dort près de la fenêtre.'), 'A black cat sleeps beside the window.')
  assert.ok(requestedUrl.includes('langpair=fr%7Cen'))
})

test('untranslated prompts stay untranslated so the route fails closed', async () => {
  const translate = createImagePromptTranslator({ callGroqWithFallback: async () => ({ content: 'رسم قطة بيضاء قرب نافذة' }), safeGenerateAI: async () => ({ content: 'ما زال الوصف بالعربية' }), fetchImpl: async () => ({ ok: true, json: async () => ({ responseData: { translatedText: 'ما زال الوصف بالعربية' } }) }) })
  const result = await translate(arabic)
  assert.equal(result, arabic)
  assert.equal(sourceLanguageForImage(result), 'ar')
})

test('an English translation may retain a French loanword', async () => {
  assert.equal(sourceLanguageForImage('A café scene in Paris with a clear blue sky.'), null)
})

for (const [name, run] of tests) {
  try { await run(); console.log('PASS ' + name) }
  catch (error) { console.error('FAIL ' + name + ': ' + error.message); process.exitCode = 1 }
}
if (!process.exitCode) console.log('Passed ' + tests.length + ' image-prompt translation tests.')

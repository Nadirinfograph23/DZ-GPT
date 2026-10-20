import assert from 'node:assert/strict'
import { detectLoadingCategory, getLoadingPhases, IMAGE_REQUEST_RE } from '../src/lib/image-loading-phase.js'

const imagePrompts = [
  'أنشئ صورة لمواقيت الصلاة في الجزائر مع خلفية هادئة',
  'Draw an image showing prayer times in Algiers',
  'ارسم مسجداً عند الغروب واكتب مواقيت الصلاة على لوحة',
]
for (const prompt of imagePrompts) {
  assert.equal(IMAGE_REQUEST_RE.test(prompt), true)
  assert.equal(detectLoadingCategory(prompt), 'image')
  assert.ok(getLoadingPhases(prompt).every(phase => !/مواقيت الصلاة|المنطقة الجغرافية|الموقع الجغرافي/.test(phase)))
}
assert.equal(detectLoadingCategory('ما هي مواقيت الصلاة في الجزائر؟'), 'prayer')
assert.equal(detectLoadingCategory('ما حالة الطقس في الجزائر اليوم؟'), 'weather')
console.log('Passed image loading priority and existing prayer/weather category tests.')

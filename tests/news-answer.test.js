import assert from 'node:assert/strict'
import { buildNewsAnswer, isAdvertisementHeadline } from '../lib/news-answer.js'

const answer = buildNewsAnswer([
  { title: 'تنبيه: [تفاصيل](https://story.example/item) &amp; &#8221; في الجزائر', link: 'https://www.echoroukonline.com/story', source: 'الشروق أونلاين', pubDate: '2026-10-22T07:18:58Z' },
  { title: 'خبر **مهم** من النهار', link: 'https://www.ennaharonline.com/story', source: 'النهار' },
  { title: 'تنبيه: [تفاصيل](https://story.example/item) &amp; &#8221; في الجزائر', link: 'https://duplicate.example/item', source: 'Google News' },
], 10)
assert.equal(answer.newsItems.length, 2, 'duplicate headlines are removed')
assert.equal(answer.newsItems[0].title, 'تنبيه: تفاصيل & ” في الجزائر')
assert.equal(answer.newsItems[0].url, 'https://www.echoroukonline.com')
assert.equal(answer.newsItems[0].source, 'الشروق أونلاين')
assert.match(answer.content, /^## 📰 آخر الأخبار الجزائرية/)
assert.doesNotMatch(answer.content, /https?:\/\//, 'article URLs never appear in the answer text')
assert.doesNotMatch(answer.content, /\[[^\]]+\]\(https?:/, 'headlines are not Markdown links')
assert.doesNotMatch(answer.content, /الشروق/, 'publisher names stay in source metadata')
assert.match(answer.content, /\\\*\\\*مهم\\\*\\\*/, 'formatting markup in a headline is escaped')
assert.equal(buildNewsAnswer([], 8).newsItems.length, 0)
assert.equal(buildNewsAnswer([{ title: 'عنوان', link: 'javascript:alert(1)', source: '' }]).newsItems[0].url, '')
assert.equal(buildNewsAnswer(Array.from({ length: 12 }, (_, i) => ({ title: 'خبر ' + i })), 30).newsItems.length, 10)
const filteredPromos = buildNewsAnswer([
  { title: 'إعلان ممول: تخفيضات على الأجهزة', source: 'النهار' },
  { title: 'Sponsored: special offer', source: 'News' },
  { title: 'إعلان رسمي عن موعد فتح التسجيل', source: 'وكالة الأنباء الجزائرية' },
  ], 8)
assert.equal(filteredPromos.newsItems.length, 1, 'explicitly promotional headlines are filtered while neutral official announcements remain')
assert.equal(filteredPromos.newsItems[0].title, 'إعلان رسمي عن موعد فتح التسجيل')
assert.equal(isAdvertisementHeadline('محتوى إعلاني', 'مصدر'), true)
assert.equal(isAdvertisementHeadline('ممول: عرض خاص', 'مصدر'), true)
assert.equal(isAdvertisementHeadline('خبر عن تنظيم الإشهار التجاري', 'مصدر'), true)
assert.equal(isAdvertisementHeadline('إعلان رسمي عن موعد التسجيل', 'مصدر'), false)
console.log('news-answer regression tests passed')

import assert from 'node:assert/strict'
import { createBuildAnnouncement } from '../src/lib/build-announcement.js'

const imageUpdate = createBuildAnnouncement({ commit: '0123456789abcdef0123456789abcdef01234567', message: 'fix(image-generation): focus on the user prompt', deployedAt: '2026-10-20T10:00:00.000Z' })
assert.equal(imageUpdate.title, 'توليد الصور')
assert.equal(imageUpdate.link, null)
assert.equal(imageUpdate.linkText, null)
assert.equal(imageUpdate.timestamp, Date.parse('2026-10-20T10:00:00.000Z'))
assert.match(imageUpdate.text, /DZ Agent وDZ Media/)
assert.doesNotMatch(imageUpdate.title + ' ' + imageUpdate.text, /github/i)
const otherUpdate = createBuildAnnouncement({ commit: 'abcdef0123456789', message: 'fix(GitHub): connection handling' })
assert.notEqual(otherUpdate.id, imageUpdate.id)
assert.equal(otherUpdate.title, 'تحديث جديد في DZ Agent')
assert.doesNotMatch(otherUpdate.title + ' ' + otherUpdate.text, /github/i)
assert.equal(otherUpdate.link, null)
console.log('Passed release-announcement mapping, privacy, and per-build identity tests.')

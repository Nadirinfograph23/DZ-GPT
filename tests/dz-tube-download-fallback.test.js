import assert from 'node:assert/strict'
import { shouldAttemptCobaltFallback } from '../src/lib/dz-tube-download-fallback.js'

for (const status of [0, 500, 502, 503, 504, 599]) {
  assert.equal(shouldAttemptCobaltFallback(status), true, `status ${status} should use the fallback`)
}

for (const status of [200, 400, 401, 403, 404, 429]) {
  assert.equal(shouldAttemptCobaltFallback(status), false, `status ${status} should not use the fallback`)
}

console.log('DZ Tube download fallback tests passed (12 assertions)')

import assert from 'node:assert/strict'
import { createServerVersionKey, hasClientCommitMismatch, normalizeCommitSha, shouldShowUpdate } from '../src/lib/version-check-state.js'

const older = '1111111111111111111111111111111111111111'
const current = '2222222222222222222222222222222222222222'
const deploy = '2026-10-11T09:00:00.000Z'

assert.equal(normalizeCommitSha(current.toUpperCase()), current)
assert.equal(normalizeCommitSha('22222222'), '')
assert.equal(hasClientCommitMismatch(older, current), true)
assert.equal(hasClientCommitMismatch(current.toUpperCase(), current), false)
assert.equal(hasClientCommitMismatch('unknown', current), false)

// First visit with matching bundle is quiet.
assert.equal(shouldShowUpdate({ deployTs: deploy, clientCommit: current, serverCommit: current }), false)
// Lost/empty storage cannot hide an old open bundle.
assert.equal(shouldShowUpdate({ deployTs: deploy, clientCommit: older, serverCommit: current }), true)
// SHA comparison catches stale bundles even when the stored deploy timestamp matches.
assert.equal(shouldShowUpdate({ storedDeployTs: deploy, deployTs: deploy, clientCommit: older, serverCommit: current }), true)
// Explicitly dismissing this exact server version suppresses repeat prompts.
assert.equal(shouldShowUpdate({ deployTs: deploy, clientCommit: older, serverCommit: current, dismissedVersionKey: createServerVersionKey(deploy, current) }), false)
// A new deploy is still announced when client and server share the same commit.
assert.equal(shouldShowUpdate({ storedDeployTs: '2026-10-10T09:00:00.000Z', deployTs: deploy, clientCommit: current, serverCommit: current }), true)
// A new deployment fingerprint is not hidden by dismissing a previous one.
assert.equal(shouldShowUpdate({ storedDeployTs: '2026-10-10T09:00:00.000Z', deployTs: deploy, clientCommit: older, serverCommit: current, dismissedVersionKey: createServerVersionKey('2026-10-10T09:00:00.000Z', current) }), true)
// Without server SHA, preserve timestamp behavior without inventing a mismatch.
assert.equal(shouldShowUpdate({ deployTs: deploy, clientCommit: older, serverCommit: '', dismissedVersionKey: null }), false)

console.log('Version checker state tests passed (12 assertions)')

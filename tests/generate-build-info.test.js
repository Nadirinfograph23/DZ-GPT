import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createBuildMetadata, writeBuildMetadata } from '../scripts/generate-build-info.js'

const commit = '0123456789abcdef0123456789abcdef01234567'
const fixedTime = () => new Date('2026-10-06T10:00:00.000Z')
const git = (args) => {
  if (args[0] === 'rev-parse') return commit
  if (args[0] === 'branch') return 'git-branch'
  if (args[0] === 'log') return 'feat:   shared version metadata'
  return ''
}

const cloudflare = createBuildMetadata({
  env: { WORKERS_CI: '1', WORKERS_CI_COMMIT_SHA: commit, WORKERS_CI_BRANCH: 'cloudflare-branch' },
  git,
  now: fixedTime,
})
assert.deepEqual(cloudflare, {
  commit,
  commitShort: '01234567',
  branch: 'cloudflare-branch',
  message: 'feat: shared version metadata',
  deployedAt: '2026-10-06T10:00:00.000Z',
  deployedBy: 'Cloudflare Workers Builds',
})

const github = createBuildMetadata({
  env: { GITHUB_ACTIONS: 'true', GITHUB_SHA: commit, GITHUB_REF_NAME: 'github-branch' },
  git,
  now: fixedTime,
})
assert.equal(github.commit, commit)
assert.equal(github.branch, 'github-branch')
assert.equal(github.deployedBy, 'GitHub Actions + Cloudflare Workers')

const fromGit = createBuildMetadata({ env: {}, git, now: fixedTime })
assert.equal(fromGit.commit, commit)
assert.equal(fromGit.branch, 'git-branch')
assert.throws(() => createBuildMetadata({ env: {}, git: () => '', now: fixedTime }), /40-character deployment commit SHA/)

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dz-build-metadata-'))
try {
  const written = writeBuildMetadata({
    rootDir: tempRoot,
    env: { WORKERS_CI: '1', WORKERS_CI_COMMIT_SHA: commit, WORKERS_CI_BRANCH: 'cloudflare-branch' },
    git,
    now: fixedTime,
  })
  for (const relativePath of ['public/version.json', 'data/build-info.json']) {
    assert.deepEqual(JSON.parse(readFileSync(path.join(tempRoot, relativePath), 'utf8')), written)
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('Build metadata generation tests passed')

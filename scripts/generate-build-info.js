#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

export function createBuildMetadata({ env = process.env, git = readGit, now = () => new Date() } = {}) {
  const commit = String(
    env.GITHUB_SHA ||
    env.WORKERS_CI_COMMIT_SHA ||
    env.CF_PAGES_COMMIT_SHA ||
    git(['rev-parse', 'HEAD']) ||
    ''
  ).trim()

  if (!/^[a-f0-9]{40}$/i.test(commit)) {
    throw new Error('Could not determine a valid 40-character deployment commit SHA')
  }

  const branch = String(
    env.GITHUB_REF_NAME ||
    env.WORKERS_CI_BRANCH ||
    env.CF_PAGES_BRANCH ||
    git(['branch', '--show-current']) ||
    'unknown'
  ).trim() || 'unknown'
  const message = String(git(['log', '-1', '--pretty=%B']) || '')
    .split('')
    .map(character => character.charCodeAt(0) <= 32 ? ' ' : character)
    .join('')
    .split(' ')
    .filter(Boolean)
    .join(' ')
  const deployedBy = env.WORKERS_CI === '1'
    ? 'Cloudflare Workers Builds'
    : env.GITHUB_ACTIONS === 'true'
      ? 'GitHub Actions + Cloudflare Workers'
      : 'npm run build'

  return {
    commit,
    commitShort: commit.slice(0, 8),
    branch,
    message,
    deployedAt: now().toISOString(),
    deployedBy,
  }
}

export function writeBuildMetadata({ env = process.env, git = readGit, now = () => new Date(), rootDir = root } = {}) {
  const metadata = createBuildMetadata({ env, git, now })
  const contents = JSON.stringify(metadata, null, 2) + String.fromCharCode(10)

  for (const relativePath of ['public/version.json', 'data/build-info.json']) {
    const filePath = path.join(rootDir, relativePath)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, contents, 'utf8')
  }

  return metadata
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const metadata = writeBuildMetadata()
  console.log('[generate-build-info] wrote ' + metadata.commitShort + ' (' + metadata.branch + ')')
}

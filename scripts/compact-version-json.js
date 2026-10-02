#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.resolve(process.argv[2] || path.join(root, 'public/version.json'))

if (!existsSync(target)) {
  console.log('[compact-version-json] No generated version.json found; skipping.')
  process.exit(0)
}

const version = JSON.parse(readFileSync(target, 'utf8'))
if (!version || Array.isArray(version) || typeof version !== 'object' ||
    typeof version.commit !== 'string' || !version.commit) {
  throw new Error(`[compact-version-json] Invalid deployment version metadata in ${target}`)
}

writeFileSync(target, `${JSON.stringify(version)}\n`, 'utf8')
console.log(`[compact-version-json] Normalized ${path.relative(root, target)}`)
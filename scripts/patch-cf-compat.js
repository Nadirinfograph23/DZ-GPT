#!/usr/bin/env node
/**
 * CF Workers compatibility patches — applied automatically via postinstall.
 *
 * Why: workerd (CF Workers runtime) lacks FinalizationRegistry, MessagePort,
 * and MessageChannel. Several npm packages use these at module-level without
 * typeof guards, causing "X is not defined" at bundle time.
 *
 * Strategy: replace COMPLETE multi-line expressions (old → new) so the output
 * is always syntactically valid. Each patch is idempotent via a unique marker.
 *
 * Packages patched:
 *   1. iconv-lite (3 copies)      — try-catch around Node.js stream APIs
 *   2. undici/web/webidl           — typeof guard for MessagePort
 *   3. undici/web/fetch/body       — typeof guard for FinalizationRegistry
 *   4. undici/web/fetch/request    — typeof guard for FinalizationRegistry
 *   5. undici/core/connect         — typeof guard for FinalizationRegistry
 *   6. @whatwg-node/server cjs+esm — already guarded; kept for safety
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

let patched = 0
let skipped = 0

/**
 * Replace oldStr with newStr in the file at relPath.
 * marker: a unique string present in newStr but NOT in oldStr — used to
 * detect an already-patched file so the patch is idempotent.
 */
function patchFile (relPath, oldStr, newStr, marker) {
  const fp = path.join(root, relPath)
  if (!existsSync(fp)) {
    console.log(`[patch-cf] skip (missing): ${relPath}`)
    skipped++
    return
  }
  const src = readFileSync(fp, 'utf8')
  if (src.includes(marker)) {
    console.log(`[patch-cf] already patched: ${relPath}`)
    return
  }
  if (!src.includes(oldStr)) {
    console.log(`[patch-cf] pattern not found (different version?): ${relPath}`)
    skipped++
    return
  }
  const out = src.replace(oldStr, newStr)
  writeFileSync(fp, out, 'utf8')
  // Syntax-check the result so a bad patch fails loudly.
  try {
    execSync(`node --check "${fp}"`, { stdio: 'pipe' })
  } catch (e) {
    // Roll back and abort so we never leave a broken file.
    writeFileSync(fp, src, 'utf8')
    throw new Error(`[patch-cf] syntax error after patching ${relPath}:\n${e.stderr?.toString() || e.message}`)
  }
  console.log(`[patch-cf] ✅ patched: ${relPath}`)
  patched++
}

// ─── 1a. iconv-lite nested copies (body-parser / raw-body) ───────────────────
const ICONV_OLD = `if (nodeVer) {

    // Load streaming support in Node v0.10+
    var nodeVerArr = nodeVer.split(".").map(Number);
    if (nodeVerArr[0] > 0 || nodeVerArr[1] >= 10) {
        require("./streams")(iconv);
    }

    // Load Node primitive extensions.
    require("./extend-node")(iconv);
}`

const ICONV_NEW = `if (nodeVer) {
    try {
        // Load streaming support in Node v0.10+
        var nodeVerArr = nodeVer.split(".").map(Number);
        if (nodeVerArr[0] > 0 || nodeVerArr[1] >= 10) {
            var _streams = require("./streams");
            if (typeof _streams === 'function') _streams(iconv);
        }
        // Load Node primitive extensions.
        var _extendNode = require("./extend-node");
        if (typeof _extendNode === 'function') _extendNode(iconv);
    } catch(e) {
        // CF Workers: streams/extend-node unavailable — encode/decode still work
    }
}`

for (const rel of [
  'node_modules/body-parser/node_modules/iconv-lite/lib/index.js',
  'node_modules/raw-body/node_modules/iconv-lite/lib/index.js',
]) {
  patchFile(rel, ICONV_OLD, ICONV_NEW, 'CF Workers: streams/extend-node unavailable')
}

// ─── 1c. Skip Node-only stream extensions inside Cloudflare Workers ───────────
// Wrangler may replace browser-disabled `./streams` modules with an empty
// CommonJS wrapper. Calling that wrapper is unsafe on some Worker runtimes,
// even though iconv-lite's encode/decode functionality itself is sufficient
// for Express request parsing.
const ICONV_CF_NEW = ICONV_NEW.replace(
  'if (nodeVer) {',
  `// CF runtime: Node stream extensions skipped
if (nodeVer && !(typeof process !== 'undefined' && process.env && process.env.CF_PAGES)) {`,
)

for (const rel of [
  'node_modules/body-parser/node_modules/iconv-lite/lib/index.js',
  'node_modules/raw-body/node_modules/iconv-lite/lib/index.js',
]) {
  patchFile(rel, ICONV_NEW, ICONV_CF_NEW, 'CF runtime: Node stream extensions skipped')
}

// ─── 1b. iconv-lite root copy ─────────────────────────────────────────────────
patchFile(
  'node_modules/iconv-lite/lib/index.js',
  'if (stream_module && stream_module.Transform) {\n    iconv.enableStreamingAPI(stream_module);\n\n} else {',
  `if (stream_module && stream_module.Transform) {\n    try { iconv.enableStreamingAPI(stream_module); } catch(e) {\n        // CF Workers: stream.Transform broken — streaming disabled, encode/decode still work\n        iconv.encodeStream = iconv.decodeStream = function() {\n            throw new Error("iconv-lite Streaming API is not enabled in this environment.");\n        };\n    }\n\n} else {`,
  'CF Workers: stream.Transform broken'
)

// ─── 2. undici/web/webidl — MessagePort ──────────────────────────────────────
patchFile(
  'node_modules/undici/lib/web/webidl/index.js',
  'webidl.is.MessagePort = webidl.util.MakeTypeAssertion(MessagePort)',
  "webidl.is.MessagePort = webidl.util.MakeTypeAssertion(typeof MessagePort !== 'undefined' ? MessagePort : class MessagePort {})",
  "typeof MessagePort !== 'undefined'"
)

// ─── 3. undici/web/fetch/body — FinalizationRegistry ─────────────────────────
// Original (undici 7.27.2):
//   const streamRegistry = new FinalizationRegistry((weakRef) => {
//     const stream = weakRef.deref()
//     if (stream && !stream.locked && !isDisturbed(stream) && !isErrored(stream)) {
//       stream.cancel('Response object has been garbage collected').catch(noop)
//     }
//   })
patchFile(
  'node_modules/undici/lib/web/fetch/body.js',
  `const streamRegistry = new FinalizationRegistry((weakRef) => {
  const stream = weakRef.deref()
  if (stream && !stream.locked && !isDisturbed(stream) && !isErrored(stream)) {
    stream.cancel('Response object has been garbage collected').catch(noop)
  }
})`,
  `const streamRegistry = typeof FinalizationRegistry !== 'undefined'
  ? new FinalizationRegistry((weakRef) => {
      const stream = weakRef.deref()
      if (stream && !stream.locked && !isDisturbed(stream) && !isErrored(stream)) {
        stream.cancel('Response object has been garbage collected').catch(noop)
      }
    })
  : null`,
  "typeof FinalizationRegistry !== 'undefined'"
)

// ─── 4. undici/web/fetch/request — FinalizationRegistry ──────────────────────
// Original (undici 7.27.2):
//   const requestFinalizer = new FinalizationRegistry(({ signal, abort }) => {
//     signal.removeEventListener('abort', abort)
//   })
patchFile(
  'node_modules/undici/lib/web/fetch/request.js',
  `const requestFinalizer = new FinalizationRegistry(({ signal, abort }) => {
  signal.removeEventListener('abort', abort)
})`,
  `const requestFinalizer = typeof FinalizationRegistry !== 'undefined'
  ? new FinalizationRegistry(({ signal, abort }) => {
      signal.removeEventListener('abort', abort)
    })
  : null`,
  "typeof FinalizationRegistry !== 'undefined'"
)

// ─── 5. undici/core/connect — FinalizationRegistry ───────────────────────────
// Original (undici 7.27.2):
//     this._sessionRegistry = new FinalizationRegistry((key) => {
//       if (this._sessionCache.size < this._maxCachedSessions) {
//         return
//       }
//
//       const ref = this._sessionCache.get(key)
//       if (ref !== undefined && ref.deref() === undefined) {
//         this._sessionCache.delete(key)
//       }
//     })
patchFile(
  'node_modules/undici/lib/core/connect.js',
  `    this._sessionRegistry = new FinalizationRegistry((key) => {
      if (this._sessionCache.size < this._maxCachedSessions) {
        return
      }

      const ref = this._sessionCache.get(key)
      if (ref !== undefined && ref.deref() === undefined) {
        this._sessionCache.delete(key)
      }
    })`,
  `    this._sessionRegistry = typeof FinalizationRegistry !== 'undefined'
      ? new FinalizationRegistry((key) => {
          if (this._sessionCache.size < this._maxCachedSessions) {
            return
          }

          const ref = this._sessionCache.get(key)
          if (ref !== undefined && ref.deref() === undefined) {
            this._sessionCache.delete(key)
          }
        })
      : null`,
  "typeof FinalizationRegistry !== 'undefined'"
)

// ─── 6. @whatwg-node/server cjs + esm ────────────────────────────────────────
for (const rel of [
  'node_modules/@whatwg-node/server/cjs/abortSignalAny.js',
  'node_modules/@whatwg-node/server/esm/abortSignalAny.js',
]) {
  patchFile(
    rel,
    'const anySignalRegistry = isNode ? new FinalizationRegistry(',
    "const anySignalRegistry = isNode && typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry(",
    "typeof FinalizationRegistry !== 'undefined'"
  )
}

console.log(`[patch-cf] done — ${patched} file(s) patched, ${skipped} skipped`)

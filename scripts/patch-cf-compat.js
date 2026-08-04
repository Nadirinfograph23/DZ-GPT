#!/usr/bin/env node
/**
 * CF Workers compatibility patches — applied automatically via postinstall.
 *
 * Why these patches are needed:
 *   Cloudflare Workers (workerd) doesn't implement some Web APIs that Node.js
 *   has (FinalizationRegistry, MessagePort, MessageChannel). Several npm
 *   packages use these at module-level without typeof guards, causing
 *   "X is not defined" errors at bundle time.
 *
 * Packages patched:
 *   1. iconv-lite (3 copies)        — try-catch around Node.js stream APIs
 *   2. undici/web/webidl            — typeof guard for MessagePort
 *   3. undici/web/fetch/body        — typeof guard for FinalizationRegistry
 *   4. undici/web/fetch/request     — typeof guard for FinalizationRegistry
 *   5. undici/core/connect          — typeof guard for FinalizationRegistry
 *   6. @whatwg-node/server cjs+esm  — already guarded; re-apply if reverted
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

let patched = 0
let skipped = 0

function patchFile(relPath, oldStr, newStr, marker) {
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
  writeFileSync(fp, src.replace(oldStr, newStr), 'utf8')
  console.log(`[patch-cf] ✅ patched: ${relPath}`)
  patched++
}

// ─── 1. iconv-lite (body-parser copy) ───────────────────────────────────────
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

// ─── 2. iconv-lite root (newer API) ─────────────────────────────────────────
patchFile(
  'node_modules/iconv-lite/lib/index.js',
  'if (stream_module && stream_module.Transform) {\n    iconv.enableStreamingAPI(stream_module);\n\n} else {',
  `if (stream_module && stream_module.Transform) {\n    try { iconv.enableStreamingAPI(stream_module); } catch(e) {\n        // CF Workers: stream.Transform broken — streaming disabled, encode/decode still work\n        iconv.encodeStream = iconv.decodeStream = function() {\n            throw new Error("iconv-lite Streaming API is not enabled in this environment.");\n        };\n    }\n\n} else {`,
  'CF Workers: stream.Transform broken'
)

// ─── 3. undici webidl — MessagePort ─────────────────────────────────────────
patchFile(
  'node_modules/undici/lib/web/webidl/index.js',
  'webidl.is.MessagePort = webidl.util.MakeTypeAssertion(MessagePort)',
  "webidl.is.MessagePort = webidl.util.MakeTypeAssertion(typeof MessagePort !== 'undefined' ? MessagePort : class MessagePort {})",
  "typeof MessagePort !== 'undefined'"
)

// ─── 4. undici fetch/body — FinalizationRegistry ────────────────────────────
patchFile(
  'node_modules/undici/lib/web/fetch/body.js',
  'const streamRegistry = new FinalizationRegistry(',
  "const streamRegistry = typeof FinalizationRegistry !== 'undefined'\n  ? new FinalizationRegistry(",
  "typeof FinalizationRegistry !== 'undefined'"
)

// ─── 5. undici fetch/request — FinalizationRegistry ─────────────────────────
patchFile(
  'node_modules/undici/lib/web/fetch/request.js',
  'const requestFinalizer = new FinalizationRegistry(',
  "const requestFinalizer = typeof FinalizationRegistry !== 'undefined'\n  ? new FinalizationRegistry(",
  "typeof FinalizationRegistry !== 'undefined'"
)

// ─── 6. undici core/connect — FinalizationRegistry ──────────────────────────
patchFile(
  'node_modules/undici/lib/core/connect.js',
  'this._sessionRegistry = new FinalizationRegistry(',
  "this._sessionRegistry = typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry(",
  "typeof FinalizationRegistry !== 'undefined'"
)

// ─── 7. @whatwg-node/server — already guarded; re-apply if reverted ─────────
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

#!/usr/bin/env node
/**
 * CF Workers compatibility patch for iconv-lite
 * Applied automatically via postinstall.
 *
 * Problem: unenv in CF Workers returns {} instead of a function for
 *   iconv-lite/lib/streams.js and extend-node.js. This causes:
 *     require_streams()(iconv)  → TypeError: require_streams() is not a function
 *
 * Fix: wrap the stream/extend-node loading in try-catch so encode/decode
 *   still works even when streaming is unavailable.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const OLD_BLOCK = `if (nodeVer) {

    // Load streaming support in Node v0.10+
    var nodeVerArr = nodeVer.split(".").map(Number);
    if (nodeVerArr[0] > 0 || nodeVerArr[1] >= 10) {
        require("./streams")(iconv);
    }

    // Load Node primitive extensions.
    require("./extend-node")(iconv);
}`

const NEW_BLOCK = `if (nodeVer) {
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

const targets = [
  'node_modules/body-parser/node_modules/iconv-lite/lib/index.js',
  'node_modules/raw-body/node_modules/iconv-lite/lib/index.js',
]

let patched = 0
for (const rel of targets) {
  const fp = path.join(root, rel)
  if (!existsSync(fp)) { console.log(`[patch-iconv] skip (missing): ${rel}`); continue }
  const src = readFileSync(fp, 'utf8')
  if (src.includes('CF Workers: streams/extend-node unavailable')) {
    console.log(`[patch-iconv] already patched: ${rel}`)
    continue
  }
  if (!src.includes(OLD_BLOCK)) {
    console.log(`[patch-iconv] pattern not found (different version?): ${rel}`)
    continue
  }
  writeFileSync(fp, src.replace(OLD_BLOCK, NEW_BLOCK), 'utf8')
  console.log(`[patch-iconv] ✅ patched: ${rel}`)
  patched++
}

// Root iconv-lite (newer API — wrap enableStreamingAPI)
const rootPath = path.join(root, 'node_modules/iconv-lite/lib/index.js')
if (existsSync(rootPath)) {
  const src = readFileSync(rootPath, 'utf8')
  if (!src.includes('CF Workers: stream.Transform broken')) {
    const fixed = src.replace(
      'if (stream_module && stream_module.Transform) {\n    iconv.enableStreamingAPI(stream_module);\n\n} else {',
      `if (stream_module && stream_module.Transform) {\n    try { iconv.enableStreamingAPI(stream_module); } catch(e) {\n        // CF Workers: stream.Transform broken — streaming disabled, encode/decode still work\n        iconv.encodeStream = iconv.decodeStream = function() {\n            throw new Error("iconv-lite Streaming API is not enabled in this environment.");\n        };\n    }\n\n} else {`
    )
    if (fixed !== src) {
      writeFileSync(rootPath, fixed, 'utf8')
      console.log('[patch-iconv] ✅ patched: node_modules/iconv-lite/lib/index.js')
      patched++
    } else {
      console.log('[patch-iconv] pattern not found (different version?): node_modules/iconv-lite/lib/index.js')
    }
  } else {
    console.log('[patch-iconv] already patched: node_modules/iconv-lite/lib/index.js')
  }
}

console.log(`[patch-iconv] done — ${patched} file(s) patched`)

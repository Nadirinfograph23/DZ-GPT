/**
 * clone-engine/downloader.js — V2
 * Inspired by: https://github.com/AhmadIbrahiim/Website-Downloader
 *
 * Node.js equivalent of: wget -mkEpnp --convert-links --adjust-extension --page-requisites
 *
 * Capabilities:
 *  - Parallel asset fetching: CSS, JS, fonts, images
 *  - CSS inlining → fully offline self-contained single HTML file
 *  - Small JS inlining (<50KB)
 *  - Images → base64 data URI (<150KB) or absolute URL (larger)
 *  - Font face URL rewriting
 *  - ZIP packaging via JSZip (multi-file, mirrored structure)
 *  - Real CSS injection into AI clone for higher fidelity (Stage 4b)
 *  - Progress callbacks (compatible with SSE streaming)
 */

import JSZip from 'jszip'

const FETCH_TIMEOUT  = 8000
const MAX_CSS_BYTES  = 200_000
const MAX_JS_BYTES   = 80_000
const MAX_IMG_BYTES  = 150_000
const MAX_PARALLEL   = 10

// INDEX-ONLY mode limits (used by clone pipeline for speed)
const INDEX_MAX_CSS  = 3
const INDEX_MAX_IMG  = 4
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── helpers ──────────────────────────────────────────────────────────────────

function toAbsolute(raw, base) {
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('javascript:') || raw.startsWith('#')) return null
  if (/^https?:\/\//i.test(raw)) return raw
  try { return new URL(raw.trim(), base).href } catch { return null }
}

function urlToFilePath(url, baseHost) {
  try {
    const u = new URL(url)
    const host = u.hostname
    let path = u.pathname
    if (path.endsWith('/')) path += 'index.html'
    const ext = path.split('.').pop().toLowerCase()
    if (!ext || ext.length > 5) path += '.html'
    return (host === baseHost ? '' : host + '/') + path.replace(/^\//, '')
  } catch { return 'assets/unknown' }
}

async function safeFetch(url, maxBytes = MAX_CSS_BYTES) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': '*/*', 'Referer': url },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: 'follow',
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const buf = await r.arrayBuffer()
    if (buf.byteLength > maxBytes) return { buf: null, text: null, tooLarge: true, contentType: r.headers.get('content-type') || '' }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
    return { buf, text, tooLarge: false, contentType: r.headers.get('content-type') || '' }
  } catch (e) {
    return { buf: null, text: null, error: e.message, contentType: '' }
  }
}

async function runInBatches(tasks, limit = MAX_PARALLEL) {
  const results = []
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = tasks.slice(i, i + limit)
    const batchResults = await Promise.all(batch.map(t => t()))
    results.push(...batchResults)
  }
  return results
}

// ── Asset URL extraction ──────────────────────────────────────────────────────

export function extractAssetUrls(html, baseUrl) {
  const css = [], js = [], images = [], fonts = []
  const seen = new Set()

  function add(list, raw) {
    const abs = toAbsolute(raw, baseUrl)
    if (abs && !seen.has(abs)) { seen.add(abs); list.push(abs) }
  }

  // CSS <link rel="stylesheet">
  for (const m of html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]+href=["']([^"']+)["']/gi)) add(css, m[1])
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']?stylesheet["']?/gi)) add(css, m[1])

  // JS <script src>
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    const abs = toAbsolute(m[1], baseUrl)
    if (abs && !seen.has(abs)) { seen.add(abs); js.push(abs) }
  }

  // Images
  for (const m of html.matchAll(/(?:src|data-src|data-lazy)=["']([^"']+\.(?:png|jpg|jpeg|gif|webp|svg|ico))["']/gi)) add(images, m[1])
  for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^)'"]+)['"]?\s*\)/gi)) add(images, m[1])

  // Fonts
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']*fonts\.googleapis\.com[^"']*)["']/gi)) add(fonts, m[1])

  return { css, js, images, fonts }
}

// ── Fetch all assets in parallel batches ──────────────────────────────────────
// Options:
//   indexOnly: true  → CSS-only mode (skip JS entirely, limit CSS to INDEX_MAX_CSS, images to INDEX_MAX_IMG)
//   maxCss:    N     → override max CSS files
//   maxImages: N     → override max images

export async function fetchAllAssets(urls, onProgress, options = {}) {
  const report = { css: {}, js: {}, images: {}, failed: [] }
  const { css: cssUrls, js: jsUrls, images: imgUrls } = urls
  const indexOnly = options.indexOnly !== false  // default: true (index-only is now the default)
  const maxCss    = options.maxCss    ?? INDEX_MAX_CSS
  const maxImages = options.maxImages ?? INDEX_MAX_IMG

  const cssToFetch = cssUrls.slice(0, maxCss)
  const imgToFetch = imgUrls.slice(0, maxImages)

  onProgress?.({
    stage: 'assets',
    message: `📦 جلب ${cssToFetch.length} CSS${indexOnly ? '' : ` + ${jsUrls.length} JS`} + ${imgToFetch.length} صورة (INDEX-ONLY سريع)...`,
    pct: 45,
  })

  // Fetch CSS files (limited)
  await runInBatches(cssToFetch.map(url => async () => {
    const { text, tooLarge, error } = await safeFetch(url, MAX_CSS_BYTES)
    if (error || tooLarge) { report.failed.push({ url, reason: error || 'too large' }); return }
    report.css[url] = text
  }))

  // Skip JS in index-only mode (not needed for visual clone, huge speedup)
  if (!indexOnly) {
    await runInBatches(jsUrls.map(url => async () => {
      const { text, tooLarge, error } = await safeFetch(url, MAX_JS_BYTES)
      if (error || tooLarge) { report.failed.push({ url, reason: error || 'too large' }); return }
      report.js[url] = text
    }))
  }

  // Fetch images (limited, convert small ones to base64)
  await runInBatches(imgToFetch.map(url => async () => {
    const { buf, tooLarge, error, contentType } = await safeFetch(url, MAX_IMG_BYTES)
    if (error || tooLarge || !buf) return
    const mime = contentType.split(';')[0].trim() || guessMime(url)
    const b64 = Buffer.from(buf).toString('base64')
    report.images[url] = `data:${mime};base64,${b64}`
  }))

  const totalOk = Object.keys(report.css).length + Object.keys(report.js).length + Object.keys(report.images).length
  console.log(`[Downloader/INDEX] Fetched: ${Object.keys(report.css).length}/${maxCss} CSS, ${Object.keys(report.js).length} JS (skipped=${indexOnly}), ${Object.keys(report.images).length}/${maxImages} images | failed: ${report.failed.length}`)
  onProgress?.({ stage: 'assets', message: `✅ جُلبت ${totalOk} أصول بنجاح (${report.failed.length} فشلت)`, pct: 65 })

  return report
}

function guessMime(url) {
  const ext = url.split('.').pop().split('?')[0].toLowerCase()
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon' }[ext] || 'image/png'
}

// ── Build self-contained HTML (single file, fully offline) ────────────────────

export function buildSelfContainedHtml(html, assets, baseUrl, fontLinks = []) {
  let result = html

  // 1. Replace <link rel="stylesheet"> with inlined <style>
  let cssBundle = ''
  result = result.replace(/<link[^>]+rel=["']?stylesheet["']?[^>]+href=["']([^"']+)["'][^>]*>/gi, (full, href) => {
    const abs = toAbsolute(href, baseUrl)
    const cssText = abs && assets.css[abs]
    if (!cssText) return full
    // Rewrite url() inside the fetched CSS to absolute
    const rewritten = rewriteCssUrls(cssText, abs)
    cssBundle += `\n/* ── ${new URL(abs).pathname} ── */\n${rewritten}\n`
    return ''
  })
  result = result.replace(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']?stylesheet["']?[^>]*>/gi, (full, href) => {
    const abs = toAbsolute(href, baseUrl)
    const cssText = abs && assets.css[abs]
    if (!cssText) return full
    const rewritten = rewriteCssUrls(cssText, abs)
    cssBundle += `\n/* ── ${new URL(abs).pathname} ── */\n${rewritten}\n`
    return ''
  })

  if (cssBundle) {
    result = result.replace('</head>', `<style id="dz-real-css">\n${cssBundle}\n</style>\n</head>`)
  }

  // 2. Replace <script src> with inlined <script>
  result = result.replace(/<script([^>]*)src=["']([^"']+)["']([^>]*)><\/script>/gi, (full, pre, src, post) => {
    const abs = toAbsolute(src, baseUrl)
    const jsText = abs && assets.js[abs]
    if (!jsText) return full
    return `<script${pre}${post}>\n${jsText}\n</script>`
  })

  // 3. Replace image src with base64 data URIs
  result = result.replace(/(\s(?:src|data-src)=["'])([^"']+\.(?:png|jpg|jpeg|gif|webp|svg|ico))["']/gi, (full, pre, src) => {
    const abs = toAbsolute(src, baseUrl)
    const dataUri = abs && assets.images[abs]
    if (!dataUri) return full
    return `${pre}${dataUri}"`
  })

  // 4. Replace CSS background-image URLs with base64
  result = result.replace(/url\(\s*(['"]?)([^)'"]+\.(?:png|jpg|jpeg|gif|webp|svg|ico)[^)'"]*)\1\s*\)/gi, (full, q, src) => {
    const abs = toAbsolute(src, baseUrl)
    const dataUri = abs && assets.images[abs]
    if (!dataUri) return full
    return `url(${q}${dataUri}${q})`
  })

  // 5. Add meta charset + viewport if missing
  if (!/charset/i.test(result)) {
    result = result.replace('<head>', '<head>\n<meta charset="UTF-8">')
  }
  if (!/viewport/i.test(result)) {
    result = result.replace('</head>', '<meta name="viewport" content="width=device-width,initial-scale=1">\n</head>')
  }

  // 6. Add DZ Agent watermark comment
  result = result.replace('</body>', `<!-- Downloaded by DZ Agent V2 Clone Engine 🇩🇿 | ${new Date().toISOString()} | Source: ${baseUrl} -->\n</body>`)

  return result
}

function rewriteCssUrls(css, cssFileUrl) {
  return css.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (full, q, val) => {
    if (val.startsWith('data:') || val.startsWith('http')) return full
    const abs = toAbsolute(val, cssFileUrl)
    if (!abs) return full
    return `url(${q}${abs}${q})`
  })
}

// ── Inject real CSS into AI-generated HTML (Stage 4b) ────────────────────────
// Augments AI clone with actual stylesheet content for higher fidelity.

export function injectRealCssIntoClone(cloneHtml, realCssMap) {
  if (!realCssMap || Object.keys(realCssMap).length === 0) return cloneHtml
  const sheets = Object.values(realCssMap).join('\n')
  if (!sheets.trim()) return cloneHtml

  // Extract only structural/layout CSS (skip colors — AI chose better colors)
  const structural = extractStructuralCss(sheets)
  if (!structural) return cloneHtml

  return cloneHtml.replace('</head>',
    `<style id="dz-real-layout">\n/* Real site layout CSS — injected by DZ Clone Engine V2 */\n${structural}\n</style>\n</head>`
  )
}

function extractStructuralCss(css) {
  // Keep: layout, flex, grid, typography, spacing, transitions, animations
  // Skip: raw color declarations (AI's palette is better)
  const lines = css.split('\n')
  const keep = []
  let inBlock = false, braceDepth = 0, blockBuf = [], selectorBuf = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!inBlock) {
      if (trimmed.includes('{')) { inBlock = true; braceDepth = 1; blockBuf = [line]; selectorBuf = trimmed }
      continue
    }
    blockBuf.push(line)
    for (const c of trimmed) { if (c === '{') braceDepth++; else if (c === '}') braceDepth-- }
    if (braceDepth <= 0) {
      inBlock = false
      const block = blockBuf.join('\n')
      // Keep blocks that have layout/animation/typography properties
      if (/display\s*:|flex|grid|position\s*:|transform|transition|animation|@keyframes|font-size|line-height|margin|padding|width|height|max-width|z-index|overflow/i.test(block)) {
        keep.push(block)
      }
      blockBuf = []; selectorBuf = ''
    }
  }
  return keep.slice(0, 200).join('\n')
}

// ── Build ZIP archive (multi-file, mirrored structure) ────────────────────────
// Equivalent to Website-Downloader's archiver/index.js using JSZip

export async function buildZipArchive(siteUrl, html, assets) {
  const zip = new JSZip()
  let baseHost
  try { baseHost = new URL(siteUrl).hostname } catch { baseHost = 'site' }
  const siteFolder = zip.folder(baseHost)

  // index.html (self-contained version)
  siteFolder.file('index.html', html)

  // CSS files in /css/
  const cssFolder = siteFolder.folder('css')
  let cssIndex = 0
  for (const [url, text] of Object.entries(assets.css)) {
    const name = url.split('/').pop().split('?')[0] || `style_${++cssIndex}.css`
    cssFolder.file(name, rewriteCssUrls(text, url))
  }

  // JS files in /js/
  const jsFolder = siteFolder.folder('js')
  let jsIndex = 0
  for (const [url, text] of Object.entries(assets.js)) {
    const name = url.split('/').pop().split('?')[0] || `script_${++jsIndex}.js`
    jsFolder.file(name, text)
  }

  // Images in /images/ (as base64-decoded buffers)
  const imgFolder = siteFolder.folder('images')
  let imgIndex = 0
  for (const [url, dataUri] of Object.entries(assets.images)) {
    const name = url.split('/').pop().split('?')[0] || `image_${++imgIndex}.png`
    const b64 = dataUri.replace(/^data:[^;]+;base64,/, '')
    imgFolder.file(name, b64, { base64: true })
  }

  // README
  siteFolder.file('README.md', `# ${baseHost}\n\nDownloaded by DZ Agent Clone Engine V2 🇩🇿\n\nSource: ${siteUrl}\nDate: ${new Date().toISOString()}\n\nFiles:\n- index.html (self-contained, fully offline)\n- css/ (${Object.keys(assets.css).length} stylesheets)\n- js/ (${Object.keys(assets.js).length} scripts)\n- images/ (${Object.keys(assets.images).length} images)\n`)

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return buffer
}

// ── Main orchestration — full download pipeline ───────────────────────────────

/**
 * downloadWebsite(url, html, onProgress, options)
 *
 * @param {string}   url         - Target website URL
 * @param {string}   html        - Already-fetched raw HTML (from fetcher.js)
 * @param {Function} onProgress  - Progress callback ({ stage, message, pct })
 * @param {object}   options
 *   - indexOnly: boolean (default true)  → skip JS, limit CSS/images for speed
 *   - buildZip:  boolean (default false) → build ZIP archive (slow, only on explicit download)
 * @returns {{ selfContainedHtml, zipBuffer, assets, stats }}
 */
export async function downloadWebsite(url, html, onProgress, options = {}) {
  const progress  = onProgress || (() => {})
  const indexOnly = options.indexOnly !== false   // default: true
  const buildZip  = options.buildZip  === true    // default: false (skip ZIP in clone pipeline)

  // 1. Extract asset URLs from raw HTML (index page only)
  progress({
    stage: 'extract-assets',
    message: `🔍 استخراج أصول الصفحة الرئيسية (CSS · صور${indexOnly ? ' · تخطي JS' : ' · JS · خطوط'})...`,
    pct: 38,
  })
  const assetUrls = extractAssetUrls(html, url)

  const totalAssets = assetUrls.css.length + (indexOnly ? 0 : assetUrls.js.length) + assetUrls.images.length
  progress({
    stage: 'extract-assets',
    message: `📋 اكتُشف: ${assetUrls.css.length} CSS · ${indexOnly ? '(JS مُتخطّى)' : `${assetUrls.js.length} JS`} · ${assetUrls.images.length} صورة`,
    pct: 42,
    assetCount: totalAssets,
  })

  // 2. Fetch assets — index-only mode: CSS limited to 5, images to 8, JS skipped
  const assets = await fetchAllAssets(assetUrls, progress, {
    indexOnly,
    maxCss:    options.maxCss    ?? INDEX_MAX_CSS,
    maxImages: options.maxImages ?? INDEX_MAX_IMG,
  })

  // 3. Build self-contained HTML (inline CSS + images only)
  progress({ stage: 'inline', message: '🔗 دمج CSS الحقيقي داخل HTML...', pct: 72 })
  const selfContainedHtml = buildSelfContainedHtml(html, assets, url, assetUrls.fonts)

  // 4. Build ZIP archive — only when explicitly requested (download endpoint)
  let zipBuffer = null
  if (buildZip) {
    progress({ stage: 'zip', message: '🗜️ إنشاء ملف ZIP...', pct: 85 })
    try {
      zipBuffer = await buildZipArchive(url, selfContainedHtml, assets)
      progress({ stage: 'zip', message: `✅ ZIP جاهز (${(zipBuffer.length / 1024).toFixed(0)} KB)`, pct: 95 })
    } catch (zipErr) {
      console.warn('[Downloader] ZIP build failed (non-fatal):', zipErr.message)
    }
  }

  const stats = {
    cssCount:    Object.keys(assets.css).length,
    jsCount:     Object.keys(assets.js).length,
    imageCount:  Object.keys(assets.images).length,
    failedCount: assets.failed.length,
    totalFetched: Object.keys(assets.css).length + Object.keys(assets.js).length + Object.keys(assets.images).length,
    selfContainedSize: selfContainedHtml.length,
    zipSize: zipBuffer?.length || 0,
    indexOnly,
  }

  console.log(`[Downloader/INDEX] ✅ css:${stats.cssCount} js:${stats.jsCount}(skip=${indexOnly}) img:${stats.imageCount} failed:${stats.failedCount} htmlSize:${(stats.selfContainedSize/1024).toFixed(0)}KB zip:${buildZip ? `${(stats.zipSize/1024).toFixed(0)}KB` : 'skipped'}`)

  return { selfContainedHtml, zipBuffer, assets, assetUrls, stats }
}

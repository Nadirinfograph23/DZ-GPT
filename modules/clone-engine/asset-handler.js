/**
 * clone-engine/asset-handler.js  — V2
 * Handles image/asset URL rewriting and smart placeholder generation.
 * Makes all relative URLs absolute so images/fonts/SVGs render in the clone.
 */

/**
 * Convert all relative asset URLs in an HTML string to absolute URLs.
 * Handles: src, href, srcset, background-image: url(...), @import url(...)
 */
export function rewriteAssetsToAbsolute(html, baseUrl) {
  if (!html || !baseUrl) return html
  let base
  try { base = new URL(baseUrl) } catch { return html }

  // Helper: resolve a single URL string against base
  function resolve(raw) {
    const v = raw.trim().replace(/^['"]|['"]$/g, '')
    if (!v || v.startsWith('data:') || v.startsWith('blob:') || v.startsWith('javascript:')) return raw
    if (/^https?:\/\//i.test(v)) return v
    try {
      return new URL(v, base).href
    } catch { return v }
  }

  // Rewrite src / href / srcset / poster attributes
  html = html.replace(/(\s(?:src|href|poster|data-src|data-lazy-src)=["'])([^"']+)(["'])/gi, (_, pre, val, post) => {
    return pre + resolve(val) + post
  })

  // Rewrite srcset="url1 1x, url2 2x"
  html = html.replace(/(\ssrcset=["'])([^"']+)(["'])/gi, (_, pre, val, post) => {
    const rewritten = val.split(',').map(part => {
      const [url, descriptor] = part.trim().split(/\s+/)
      return descriptor ? `${resolve(url)} ${descriptor}` : resolve(url)
    }).join(', ')
    return pre + rewritten + post
  })

  // Rewrite CSS background-image: url(...)
  html = html.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (full, quote, val) => {
    if (val.startsWith('data:') || val.startsWith('#')) return full
    return `url(${quote}${resolve(val)}${quote})`
  })

  return html
}

/**
 * Extract all image URLs from HTML (img src + CSS background-image).
 * Returns array of { src, alt, width, height, isBackground }
 */
export function extractAllImages(html, baseUrl) {
  const images = []
  const seen = new Set()

  let base
  try { base = new URL(baseUrl) } catch { base = null }

  function toAbsolute(url) {
    if (!url || url.startsWith('data:')) return url
    if (/^https?:\/\//i.test(url)) return url
    if (base) { try { return new URL(url, base).href } catch {} }
    return url
  }

  // img tags
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0]
    const srcMatch = tag.match(/\ssrc=["']([^"']+)["']/i) || tag.match(/\sdata-src=["']([^"']+)["']/i)
    const altMatch = tag.match(/\salt=["']([^"']{0,100})["']/i)
    const wMatch   = tag.match(/\swidth=["']?(\d+)["']?/i)
    const hMatch   = tag.match(/\sheight=["']?(\d+)["']?/i)
    if (srcMatch) {
      const src = toAbsolute(srcMatch[1])
      if (src && !seen.has(src)) {
        seen.add(src)
        images.push({
          src,
          alt: altMatch ? altMatch[1] : '',
          width: wMatch ? parseInt(wMatch[1]) : null,
          height: hMatch ? parseInt(hMatch[1]) : null,
          isBackground: false,
        })
      }
    }
  }

  // CSS background-image
  for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^)'"]+)['"]?\s*\)/gi)) {
    const src = toAbsolute(m[1])
    if (src && !src.startsWith('data:') && !seen.has(src)) {
      seen.add(src)
      images.push({ src, alt: 'background', width: null, height: null, isBackground: true })
    }
  }

  return images.slice(0, 40)
}

/**
 * Generate an SVG placeholder with correct dimensions, color, and label.
 * Used when an image cannot be fetched.
 */
export function generateSvgPlaceholder(width = 400, height = 300, alt = 'Image', bgColor = '#1e293b') {
  const w = Math.min(width || 400, 1200)
  const h = Math.min(height || 300, 900)
  const label = alt.slice(0, 30).replace(/[<>&"]/g, '')
  const textColor = isLight(bgColor) ? '#334155' : '#94a3b8'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bgColor}" rx="8"/>
  <rect width="${w}" height="${h}" fill="url(#g)" rx="8"/>
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:rgba(255,255,255,0.05)"/>
      <stop offset="100%" style="stop-color:rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>
  <text x="50%" y="45%" text-anchor="middle" fill="${textColor}" font-family="system-ui,sans-serif" font-size="${Math.max(12, Math.min(18, w / 20))}">🖼</text>
  <text x="50%" y="62%" text-anchor="middle" fill="${textColor}" font-family="system-ui,sans-serif" font-size="${Math.max(10, Math.min(14, w / 25))}">${label}</text>
</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function isLight(hex) {
  try {
    const c = hex.replace('#', '')
    const r = parseInt(c.slice(0, 2), 16)
    const g = parseInt(c.slice(2, 4), 16)
    const b = parseInt(c.slice(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) > 186
  } catch { return false }
}

/**
 * Build an HTML img tag snippet for each extracted image (for AI prompt context).
 * Shows the AI exactly which images to embed and their dimensions.
 */
export function buildImagePromptBlock(images, limit = 20) {
  if (!images || images.length === 0) return ''
  const items = images.slice(0, limit)
  const lines = items.map((img, i) => {
    const dim = img.width && img.height ? ` (${img.width}×${img.height})` : ''
    const type = img.isBackground ? '[BG]' : '[IMG]'
    return `${i + 1}. ${type} src="${img.src}"${dim} alt="${img.alt || ''}"`
  })
  return `\nIMAGES & ASSETS (use these EXACT absolute URLs in your output — do NOT make up image paths):\n${lines.join('\n')}`
}

/**
 * Extract inline SVG elements from HTML for re-use in clone.
 */
export function extractInlineSVGs(html, limit = 10) {
  const svgs = []
  for (const m of html.matchAll(/<svg[\s\S]*?<\/svg>/gi)) {
    const s = m[0]
    if (s.length > 50 && s.length < 8000) svgs.push(s)
    if (svgs.length >= limit) break
  }
  return svgs
}

/**
 * Extract button HTML patterns for accurate reproduction.
 */
export function extractButtonPatterns(html, limit = 8) {
  const buttons = []
  // Real <button> or <a class="btn..."> tags
  for (const m of html.matchAll(/<(?:button|a)[^>]*(?:btn|button|cta)[^>]*>[\s\S]*?<\/(?:button|a)>/gi)) {
    const b = m[0].replace(/\s+/g, ' ').trim()
    if (b.length > 5 && b.length < 400) buttons.push(b)
    if (buttons.length >= limit) break
  }
  return buttons
}

/**
 * Extract shadow tokens from CSS for accurate reproduction.
 */
export function extractShadowTokens(css) {
  const shadows = new Set()
  for (const m of css.matchAll(/box-shadow\s*:\s*([^;}{]+)/gi)) {
    const s = m[1].trim()
    if (s.length > 5 && s.length < 200 && !s.startsWith('var(')) shadows.add(s)
  }
  return [...shadows].slice(0, 6)
}

/**
 * Extract key spacing patterns (padding/margin on major containers).
 */
export function extractSpacingTokens(css) {
  const spacings = []
  const sectionPad = css.match(/section[^{]*\{[^}]*padding\s*:\s*([^;}{]+)/i)
  const containerPad = css.match(/\.container[^{]*\{[^}]*padding\s*:\s*([^;}{]+)/i)
  const heroPad = css.match(/\.hero[^{]*\{[^}]*padding\s*:\s*([^;}{]+)/i)
  if (sectionPad) spacings.push(`section padding: ${sectionPad[1].trim()}`)
  if (containerPad) spacings.push(`container padding: ${containerPad[1].trim()}`)
  if (heroPad) spacings.push(`hero padding: ${heroPad[1].trim()}`)
  return spacings
}

/**
 * Design Intelligence — Website Analyzer
 * Fetches a URL, extracts CSS design tokens: colors, fonts, spacing, shadows, border-radius, etc.
 */

const TIMEOUT_MS = 12000

async function fetchHtml(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZ-Design-Bot/1.0)' },
    })
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function extractColors(text) {
  const hexRe = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g
  const rgbRe = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/g
  const hslRe = /hsla?\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*[\d.]+)?\s*\)/g

  const seen = new Set()
  const colors = []

  for (const m of [...(text.matchAll(hexRe) || [])]) {
    const c = m[0].toLowerCase()
    if (!seen.has(c)) { seen.add(c); colors.push(c) }
  }
  for (const m of [...(text.matchAll(rgbRe) || [])]) {
    const c = m[0].replace(/\s+/g, '')
    if (!seen.has(c)) { seen.add(c); colors.push(c) }
  }
  for (const m of [...(text.matchAll(hslRe) || [])]) {
    const c = m[0].replace(/\s+/g, '')
    if (!seen.has(c)) { seen.add(c); colors.push(c) }
  }
  return colors.slice(0, 40)
}

function extractFonts(text) {
  const re = /font-family\s*:\s*([^;}{]+)/gi
  const seen = new Set()
  const fonts = []
  for (const m of [...(text.matchAll(re) || [])]) {
    const raw = m[1].trim().replace(/['"]/g, '').split(',')[0].trim()
    if (raw && !seen.has(raw)) { seen.add(raw); fonts.push(raw) }
  }
  // Also detect Google Fonts links
  const gfRe = /fonts\.googleapis\.com\/css[^"' )]+/gi
  for (const m of [...(text.matchAll(gfRe) || [])]) {
    const decoded = decodeURIComponent(m[0])
    const fam = decoded.match(/family=([^&:]+)/)?.[1]
    if (fam && !seen.has(fam)) { seen.add(fam); fonts.push(fam.replace(/\+/g, ' ')) }
  }
  return fonts.slice(0, 10)
}

function extractSpacing(text) {
  const re = /(padding|margin|gap)\s*:\s*([\d.]+(?:px|rem|em))/gi
  const values = new Set()
  for (const m of [...(text.matchAll(re) || [])]) {
    values.add(m[2])
  }
  return [...values].slice(0, 15)
}

function extractBorderRadius(text) {
  const re = /border-radius\s*:\s*([\d.]+(?:px|rem|em|%))/gi
  const values = new Set()
  for (const m of [...(text.matchAll(re) || [])]) values.add(m[1])
  return [...values].slice(0, 8)
}

function extractShadows(text) {
  const re = /box-shadow\s*:\s*([^;}{]+)/gi
  const values = []
  for (const m of [...(text.matchAll(re) || [])]) {
    const v = m[1].trim()
    if (v !== 'none' && v !== 'inherit') values.push(v)
  }
  return [...new Set(values)].slice(0, 6)
}

function extractCssVariables(text) {
  const re = /--([\w-]+)\s*:\s*([^;}{]+)/g
  const vars = {}
  for (const m of [...(text.matchAll(re) || [])]) {
    vars[`--${m[1]}`] = m[2].trim()
  }
  return vars
}

function extractSections(html) {
  const sections = []
  const tags = ['nav', 'header', 'main', 'section', 'footer', 'aside']
  for (const tag of tags) {
    const re = new RegExp(`<${tag}[^>]*>`, 'gi')
    if (re.test(html)) sections.push(tag)
  }
  // Detect hero, CTA, cards, etc. by class name hints
  const classHints = { hero: /class="[^"]*hero/i, cta: /class="[^"]*cta/i, card: /class="[^"]*card/i, grid: /class="[^"]*grid/i, dashboard: /class="[^"]*dashboard/i }
  for (const [name, re] of Object.entries(classHints)) {
    if (re.test(html)) sections.push(name)
  }
  return [...new Set(sections)]
}

function detectUIStyle(colors, fonts, borderRadius) {
  const hasRounded = borderRadius.some(r => parseInt(r) >= 12)
  const hasSans = fonts.some(f => /sans|inter|manrope|poppins|nunito/i.test(f))
  const hasDark = colors.some(c => c === '#000' || c === '#111' || c === '#0a0a0a' || c === '#111111')
  if (hasDark && hasSans) return 'dark-modern'
  if (hasRounded && hasSans) return 'rounded-friendly'
  if (hasSans) return 'clean-minimal'
  return 'classic'
}

export async function analyzeWebsite(url) {
  const html = await fetchHtml(url)

  // Extract inline styles + <style> tags combined
  const styleBlocks = []
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi
  for (const m of [...(html.matchAll(styleRe) || [])]) styleBlocks.push(m[1])
  const cssText = styleBlocks.join('\n') + '\n' + html

  const colors = extractColors(cssText)
  const fonts = extractFonts(cssText)
  const spacing = extractSpacing(cssText)
  const borderRadius = extractBorderRadius(cssText)
  const shadows = extractShadows(cssText)
  const cssVariables = extractCssVariables(cssText)
  const sections = extractSections(html)
  const uiStyle = detectUIStyle(colors, fonts, borderRadius)

  // Extract page title
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || url

  return {
    url,
    title,
    colors,
    fonts,
    spacing,
    borderRadius,
    shadows,
    cssVariables,
    sections,
    uiStyle,
    analyzedAt: Date.now(),
  }
}

/**
 * clone-engine/extractor.js  — V3
 * Deep DOM extraction using cheerio + regex.
 * V3 adds: copyright/year extraction, full footer content, all links,
 *          list items, background images, og:image, extended CSS (12k),
 *          form structure, all text nodes, iframe sources.
 */

import * as cheerio from 'cheerio'
import {
  extractAllImages,
  extractInlineSVGs,
  extractButtonPatterns,
  extractNavbarHtml,
  extractShadowTokens,
  extractSpacingTokens,
} from './asset-handler.js'

// ── Tech stack signatures ────────────────────────────────────────────────────
const TECH_SIGNATURES = {
  react:        [/__REACT_DEVTOOLS|reactroot|data-reactroot|_react|react-dom/i, /"react"/],
  nextjs:       [/__NEXT_DATA__|next\/dist|_next\/static|next-head-count/i],
  vue:          [/data-v-[a-f0-9]+|__vue__|v-app|vue-app|vue\/dist/i],
  nuxt:         [/__nuxt|nuxt\.js|_nuxt\/|nuxtjs/i],
  svelte:       [/svelte-|__svelte|sveltejs/i],
  angular:      [/ng-version|ng-app|angular\.min\.js|zone\.js/i],
  tailwind:     [/tailwindcss|tw-|bg-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d|text-\w+-\d{3}|flex-col|grid-cols/i],
  bootstrap:    [/bootstrap(?:\.min)?\.css|bootstrap(?:\.bundle)?\.js|class="(?:col-|row |container|navbar|btn btn-|card |modal |d-flex)/i],
  bulma:        [/bulma\.css|class="(?:column |columns |tile |hero |navbar-|button is-|section )/i],
  shadcn:       [/shadcn|radix-ui|@radix|cmdk|lucide-react/i],
  framermotion: [/framer-motion|FramerMotion|motion\.div|variants=\{|initial=\{|animate=\{|whileHover/i],
  gsap:         [/gsap|TweenMax|TweenLite|ScrollTrigger|gsap\.to\(/i],
  chakra:       [/chakra-ui|@chakra|ChakraProvider/i],
  material:     [/material-ui|@mui\/|MuiButton|MuiTypography/i],
  antdesign:    [/antd|ant-design|ant-btn|ant-col|ant-row/i],
  wordpress:    [/wp-content|wp-includes|wordpress|woocommerce/i],
  shopify:      [/shopify|cdn\.shopify\.com|Shopify\.theme/i],
  webflow:      [/webflow\.com|wf-|data-wf-|w-webflow/i],
  jquery:       [/jquery(?:\.min)?\.js|jQuery\.|window\.\$/i],
  alpine:       [/alpinejs|x-data=|x-bind:|x-on:|x-show=|x-if=/i],
  htmx:         [/htmx\.org|hx-get=|hx-post=|hx-trigger=/i],
  aos:          [/aos\.js|data-aos=|AOS\.init/i],
  swiper:       [/swiper(?:\.min)?\.js|swiper-wrapper|swiper-slide/i],
  gsapScrollTrigger: [/ScrollTrigger|scrollTrigger/],
  lottie:       [/lottie|bodymovin/i],
}

export function detectTechStack(html) {
  const detected = []
  for (const [tech, patterns] of Object.entries(TECH_SIGNATURES)) {
    for (const pat of patterns) {
      if (pat.test(html)) { detected.push(tech); break }
    }
  }
  return [...new Set(detected)]
}

// ── Color extractor ──────────────────────────────────────────────────────────
function extractColors(css, html) {
  const colorSet = new Set()
  const source = css + html.slice(0, 40000)
  const patterns = [
    /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
    /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g,
    /hsla?\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(?:,\s*[\d.]+\s*)?\)/g,
    /oklch\([^)]+\)/g,
  ]
  for (const pat of patterns) {
    for (const m of source.matchAll(pat)) {
      const c = m[0].toLowerCase()
      if (c !== '#fff' && c !== '#000' && c !== '#ffffff' && c !== '#000000') {
        colorSet.add(c)
      }
    }
  }
  return [...colorSet].slice(0, 40)
}

// ── CSS custom properties extractor ─────────────────────────────────────────
function extractCssVars(css) {
  const vars = {}
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;}{]+)/g)) {
    const key = `--${m[1]}`
    const val = m[2].trim()
    if (val.length < 100) vars[key] = val
  }
  return vars
}

// ── Font extractor ───────────────────────────────────────────────────────────
function extractFonts(html, css) {
  const fonts = []
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css[^"']*family=([^"'&]+)/gi)) {
    const fam = m[1].replace(/\+/g, ' ').split('|').map(s => s.split(':')[0].trim())
    fonts.push(...fam)
  }
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const primary = m[1].split(',')[0].replace(/["']/g, '').trim()
    if (primary && !primary.startsWith('var(') && primary.length < 60) fonts.push(primary)
  }
  if (/use\.typekit\.net|use\.typekit\.com/i.test(html)) fonts.push('Adobe Fonts / Typekit')
  return [...new Set(fonts)].slice(0, 6)
}

// ── Animation detection ──────────────────────────────────────────────────────
function detectAnimations(html, css) {
  const anims = []
  if (/@keyframes\s+\w+/i.test(css)) anims.push('CSS @keyframes')
  if (/transition\s*:/i.test(css)) anims.push('CSS transitions')
  if (/animation\s*:/i.test(css)) anims.push('CSS animation property')
  if (/IntersectionObserver|scroll.*animation|data-aos|aos\.js|wow\.js/i.test(html)) anims.push('scroll-reveal (AOS/WOW)')
  if (/gsap|TweenMax|ScrollTrigger/i.test(html)) anims.push('GSAP')
  if (/framer.motion|motion\.div|variants.*animate/i.test(html)) anims.push('Framer Motion')
  if (/parallax/i.test(html + css)) anims.push('parallax')
  if (/swiper|slick|owl.*carousel|splide/i.test(html)) anims.push('slider/carousel')
  if (/lottie|bodymovin/i.test(html)) anims.push('Lottie animations')
  if (/three\.js|threejs|webgl/i.test(html)) anims.push('Three.js / WebGL')
  if (/hover.*transform|transform.*hover|scale\(|translateY\(/i.test(css)) anims.push('hover transforms')
  if (/backdrop-filter|blur\(/i.test(css)) anims.push('blur/backdrop effects')
  return anims
}

// ── Icon library detection ───────────────────────────────────────────────────
function detectIcons(html) {
  if (/font-awesome|fa-[a-z]|class="fa[srlb]?\s/i.test(html)) return 'font-awesome'
  if (/heroicons|class="(?:outline|solid)-/i.test(html)) return 'heroicons'
  if (/lucide|lucide-react/i.test(html)) return 'lucide'
  if (/material.*icon|mdi-/i.test(html)) return 'material-icons'
  if (/phosphor|ph-/i.test(html)) return 'phosphor'
  if (/bootstrap.*icon|bi-/i.test(html)) return 'bootstrap-icons'
  if (/remix.*icon|ri-/i.test(html)) return 'remixicon'
  if (/tabler.*icon/i.test(html)) return 'tabler-icons'
  if (/feathericons|feather\./i.test(html)) return 'feather'
  return 'font-awesome'
}

// ── Layout type detection ────────────────────────────────────────────────────
function detectLayoutType(html) {
  const lc = html.toLowerCase()
  if (/e-?commerce|shop|store|product|cart|checkout|panier|boutique/i.test(lc)) return 'ecommerce'
  if (/portfolio|showcase|case.study|work|project/i.test(lc)) return 'portfolio'
  if (/dashboard|admin|analytics|panel|metric|kpi/i.test(lc)) return 'dashboard'
  if (/blog|article|post|news|magazine|journal/i.test(lc)) return 'blog'
  if (/restaurant|menu|food|cafe|café|bistro|brasserie/i.test(lc)) return 'restaurant'
  if (/hotel|resort|accommodation|booking|réservation/i.test(lc)) return 'hotel'
  if (/agency|studio|creative|branding/i.test(lc)) return 'agency'
  if (/saas|pricing|subscription|software/i.test(lc)) return 'saas'
  if (/ngo|nonprofit|association|donation/i.test(lc)) return 'nonprofit'
  if (/education|course|learn|school|university/i.test(lc)) return 'education'
  return 'landing'
}

// ── Color scheme detection ───────────────────────────────────────────────────
function detectColorScheme(css, html) {
  const darkScore =
    (css.match(/background(?:-color)?\s*:\s*#(?:0[0-9a-f]|1[0-9a-f]|2[0-9a-f])[0-9a-f]{4}/gi) || []).length +
    (css.match(/prefers-color-scheme.*dark|dark-theme|dark-mode/gi) || []).length +
    (html.match(/class="[^"]*dark[^"]*"/gi) || []).length * 2
  return darkScore >= 3 ? 'dark' : 'light'
}

// ── Section structure via cheerio ────────────────────────────────────────────
function extractSections($) {
  const sections = []
  const body = $('body')
  const checks = [
    { sel: 'nav, header, [class*=nav], [class*=header], [role=navigation]', name: 'navbar' },
    { sel: '[class*=hero], [class*=banner], [class*=jumbotron], [id*=hero]', name: 'hero' },
    { sel: '[class*=feature], [class*=service], [class*=benefit], [class*=about]', name: 'features' },
    { sel: '[class*=card], [class*=tile], [class*=grid-item]', name: 'cards' },
    { sel: '[class*=pricing], [class*=plan], [class*=subscription], [class*=tarif]', name: 'pricing' },
    { sel: '[class*=testimonial], [class*=review], [class*=rating], [class*=client]', name: 'testimonials' },
    { sel: '[class*=team], [class*=staff], [class*=member]', name: 'team' },
    { sel: '[class*=stat], [class*=counter], [class*=metric], [class*=number]', name: 'stats' },
    { sel: '[class*=faq], [class*=accordion], [class*=question]', name: 'faq' },
    { sel: '[class*=contact], [class*=form], form', name: 'contact-form' },
    { sel: '[class*=gallery], [class*=portfolio], [class*=work]', name: 'gallery' },
    { sel: '[class*=blog], [class*=article], [class*=news], [class*=post]', name: 'blog-section' },
    { sel: '[class*=cta], [class*=call-to-action]', name: 'cta' },
    { sel: 'footer, [class*=footer]', name: 'footer' },
  ]
  for (const { sel, name } of checks) {
    if (body.find(sel).length > 0 && !sections.includes(name)) sections.push(name)
  }
  return sections
}

// ── Grid/Flex layout analysis ─────────────────────────────────────────────────
function analyzeLayout(css) {
  const usesGrid = /display\s*:\s*grid|grid-template|grid-cols/i.test(css)
  const usesFlex = /display\s*:\s*flex|flex-(?:row|col|wrap)|justify-content|align-items/i.test(css)
  const breakpoints = [...css.matchAll(/@media[^{]*\((?:max|min)-width:\s*(\d+)px\)/gi)]
    .map(m => parseInt(m[1])).filter(Boolean)
  const uniqueBP = [...new Set(breakpoints)].sort((a, b) => a - b)
  return { usesGrid, usesFlex, breakpoints: uniqueBP.slice(0, 6) }
}

// ── Primary / BG color extraction ────────────────────────────────────────────
function extractPrimaryBgColors(css) {
  const primMatch = css.match(/--primary[^:]*:\s*([^;}\n]{1,40})/i)
    || css.match(/--accent[^:]*:\s*([^;}\n]{1,40})/i)
    || css.match(/--color-primary[^:]*:\s*([^;}\n]{1,40})/i)
  const bgMatch = css.match(/body[^{]*\{[^}]*background(?:-color)?\s*:\s*([^;}\n]{1,40})/i)
    || css.match(/--bg(?:-color)?[^:]*:\s*([^;}\n]{1,40})/i)
    || css.match(/--background[^:]*:\s*([^;}\n]{1,40})/i)
  return {
    primaryColor: primMatch ? primMatch[1].trim() : null,
    bgColor: bgMatch ? bgMatch[1].trim() : null,
  }
}

// ── Structural DOM skeleton (simplified for AI context) ───────────────────────
function extractStructuralSkeleton($) {
  const lines = []
  function walk(el, depth) {
    if (depth > 5) return
    const tag = el.tagName?.toLowerCase()
    if (!tag || ['script', 'style', 'noscript', 'meta', 'link', 'br', 'hr'].includes(tag)) return
    const cls = $(el).attr('class')?.split(' ').filter(c => c.length > 1).slice(0, 4).join('.') || ''
    const id = $(el).attr('id') ? `#${$(el).attr('id')}` : ''
    const text = $(el).clone().children().remove().end().text().replace(/\s+/g, ' ').trim().slice(0, 60)
    const label = `${'  '.repeat(depth)}<${tag}${cls ? ' .' + cls : ''}${id}>${text ? ` "${text}"` : ''}`
    lines.push(label)
    $(el).children().each((_, child) => walk(child, depth + 1))
  }
  $('body > *').each((_, el) => walk(el, 0))
  return lines.slice(0, 120).join('\n')
}

// ── Extract nav structure ─────────────────────────────────────────────────────
function extractNavStructure($) {
  const brand = $('nav .brand, nav .logo, header .brand, header .logo, nav a:first-child').first().text().trim().slice(0, 40)
  const links = []
  $('nav a, header nav a').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > 0 && t.length < 40) links.push(t)
  })
  return { brand, links: [...new Set(links)].slice(0, 12) }
}

// ── Extract hero content ──────────────────────────────────────────────────────
function extractHeroContent($) {
  const heroEl = $('[class*=hero], [class*=banner], [id*=hero], main > section:first-child, body > section:first-child').first()
  if (!heroEl.length) return null
  const h1 = heroEl.find('h1').first().text().replace(/\s+/g, ' ').trim().slice(0, 120)
  const sub = heroEl.find('p, h2').first().text().replace(/\s+/g, ' ').trim().slice(0, 200)
  const ctas = []
  heroEl.find('a, button').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > 0 && t.length < 50) ctas.push(t)
  })
  return { h1, subtext: sub, ctas: [...new Set(ctas)].slice(0, 4) }
}

// ── V3: Extract full footer content including copyright ───────────────────────
function extractFooterContent($) {
  const footer = $('footer, [class*=footer], [id*=footer]').first()
  if (!footer.length) return null

  const text = footer.text().replace(/\s+/g, ' ').trim().slice(0, 600)

  // Extract copyright line specifically
  const copyrightMatch = text.match(/(?:©|copyright|\(c\))\s*[\d]{4}[^\n\r.]{0,120}/i)
    || text.match(/[\d]{4}[^\n\r.]{0,80}(?:all rights|tous droits|tous les droits|reserved|réservés)/i)
  const copyright = copyrightMatch ? copyrightMatch[0].trim() : ''

  // Extract all years found in footer
  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map(m => m[0])

  // Extract footer links
  const links = []
  footer.find('a').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > 0 && t.length < 60) links.push(t)
  })

  // Extract footer columns text
  const columns = []
  footer.find('[class*=col], [class*=column], [class*=widget], [class*=block], ul').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > 5 && t.length < 300) columns.push(t.slice(0, 200))
  })

  return {
    text,
    copyright,
    years: [...new Set(years)],
    links: [...new Set(links)].slice(0, 20),
    columns: columns.slice(0, 6),
  }
}

// ── V3: Extract key text content — LITE (headings, paragraphs, li only — no span/div loop) ──
function extractAllTextContent($) {
  const blocks = []

  // Headings
  $('h1, h2, h3, h4').each((_, el) => {
    const tag = el.tagName?.toLowerCase()
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > 0 && t.length < 200) blocks.push(`[${tag.toUpperCase()}] ${t}`)
  })

  // Paragraphs (first 20 only)
  let pCount = 0
  $('p').each((_, el) => {
    if (pCount >= 20) return false
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > 15 && t.length < 400) { blocks.push(`[P] ${t}`); pCount++ }
  })

  // List items (first 30 only — features/pricing/etc.)
  let liCount = 0
  $('li').each((_, el) => {
    if (liCount >= 30) return false
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > 3 && t.length < 120) { blocks.push(`[LI] ${t}`); liCount++ }
  })

  return blocks.slice(0, 80).join('\n')
}

// ── V3: Extract all links with href and text ──────────────────────────────────
function extractAllLinks($, baseUrl) {
  const links = []
  let domain = ''
  try { domain = new URL(baseUrl).hostname } catch {}

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const text = $(el).text().replace(/\s+/g, ' ').trim()
    if (text.length < 3 || text.length > 80) return
    // Resolve relative URLs
    let fullHref = href
    try {
      if (href.startsWith('/') && domain) fullHref = `https://${domain}${href}`
      else if (!href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) fullHref = href
    } catch {}
    links.push({ text, href: fullHref })
  })
  return links.slice(0, 50)
}

// ── V3: Extract inline background images from style attributes ────────────────
function extractBgImages(rawHtml, baseUrl) {
  const imgs = []
  let domain = ''
  try { domain = new URL(baseUrl).origin } catch {}

  for (const m of rawHtml.matchAll(/background(?:-image)?\s*:\s*url\(['"]?([^'")]+)['"]?\)/gi)) {
    let src = m[1].trim()
    if (src.startsWith('data:')) continue
    if (src.startsWith('/') && domain) src = domain + src
    if (src.startsWith('http')) imgs.push(src)
  }
  return [...new Set(imgs)].slice(0, 10)
}

// ── V3: Extract all significant numbers (prices, stats, years) ───────────────
function extractKeyNumbers($) {
  const numbers = []
  const text = $('body').text()

  // Years
  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map(m => m[0])
  // Prices
  const prices = [...text.matchAll(/[\$€£¥]\s*[\d,]+(?:\.\d{2})?|\d+\s*(?:DZD|DA|€|\$)/g)].map(m => m[0].trim())
  // Stats/counters
  const stats = [...text.matchAll(/\b\d{1,3}(?:,\d{3})*(?:\+|k|M)?\b/g)].map(m => m[0]).slice(0, 20)

  return {
    years: [...new Set(years)],
    prices: [...new Set(prices)].slice(0, 10),
    stats: [...new Set(stats)].slice(0, 20),
  }
}

// ── V3: Extract form structure ────────────────────────────────────────────────
function extractForms($) {
  const forms = []
  $('form').each((_, el) => {
    const inputs = []
    $(el).find('input, textarea, select, button[type=submit]').each((_, inp) => {
      const type = $(inp).attr('type') || inp.tagName?.toLowerCase()
      const placeholder = $(inp).attr('placeholder') || ''
      const label = $(inp).closest('label').text().trim() || $(inp).attr('name') || ''
      inputs.push({ type, placeholder: placeholder.slice(0, 60), label: label.slice(0, 40) })
    })
    const action = $(el).attr('action') || ''
    forms.push({ action, inputs: inputs.slice(0, 10) })
  })
  return forms.slice(0, 3)
}

// ── V3: Extract CSS @keyframes for exact reproduction ────────────────────────
function extractKeyframes(css) {
  const frames = []
  for (const m of css.matchAll(/@keyframes\s+[\w-]+\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g)) {
    frames.push(m[0].slice(0, 400))
  }
  return frames.slice(0, 8)
}

// ── Main export ───────────────────────────────────────────────────────────────
export function deepExtract(rawHtml, url) {
  let domain = url
  try { domain = new URL(url).hostname } catch {}

  const $ = cheerio.load(rawHtml, { decodeEntities: false })
  $('script[src], noscript').remove()

  // Extract all style content
  const styleBlocks = []
  $('style').each((_, el) => styleBlocks.push($(el).html() || ''))
  const inlineStyles = []
  $('[style]').each((_, el) => inlineStyles.push($(el).attr('style') || ''))
  const allCss = styleBlocks.join('\n') + '\n' + inlineStyles.join('\n')

  const title = $('title').first().text().trim()
  const metaDesc = $('meta[name=description]').attr('content')?.trim() || ''
  const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || ''
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || ''
  const ogDesc  = $('meta[property="og:description"]').attr('content')?.trim() || ''

  const headings = []
  $('h1, h2, h3, h4').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > 2 && t.length < 200) headings.push(t)
  })

  const paragraphs = []
  $('p').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > 20 && t.length < 800) paragraphs.push(t)
  })

  // Extract buttons/CTAs
  const ctaTexts = []
  $('a.btn, a.button, button, .cta, [class*=btn]').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > 0 && t.length < 60) ctaTexts.push(t)
  })

  // Nav links
  const navLinks = []
  $('nav a, header a, .navbar a').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > 0 && t.length < 40) navLinks.push(t)
  })

  // Linked stylesheets
  const linkedStyles = []
  $('link[rel=stylesheet]').each((_, el) => { linkedStyles.push($(el).attr('href') || '') })

  // Tailwind class snapshot
  const allClasses = []
  $('[class]').each((_, el) => allClasses.push($(el).attr('class') || ''))
  const classSnapshot = allClasses.join(' ').slice(0, 5000)

  const techStack = detectTechStack(rawHtml + classSnapshot)
  const colors = extractColors(allCss, rawHtml)
  const cssVars = extractCssVars(allCss)
  const fonts = extractFonts(rawHtml, allCss)
  const { primaryColor, bgColor } = extractPrimaryBgColors(allCss)
  const colorScheme = detectColorScheme(allCss, rawHtml)
  const animations = detectAnimations(rawHtml, allCss)
  const iconLibrary = detectIcons(rawHtml)
  const layoutType = detectLayoutType(rawHtml)
  const sections = extractSections($)
  const { usesGrid, usesFlex, breakpoints } = analyzeLayout(allCss)

  // V2 additions
  const images = extractAllImages(rawHtml, url)
  const svgs = extractInlineSVGs(rawHtml, 6)
  const buttonPatterns = extractButtonPatterns(rawHtml, 8)
  const navbarHtml = extractNavbarHtml(rawHtml, 2000)
  const shadowTokens = extractShadowTokens(allCss)
  const spacingTokens = extractSpacingTokens(allCss)
  const structuralSkeleton = extractStructuralSkeleton($)
  const navStructure = extractNavStructure($)
  const heroContent = extractHeroContent($)

  // V3 additions ───────────────────────────────────────────────────────────────
  const footerContent = extractFooterContent($)
  const allTextContent = extractAllTextContent($)
  const allLinks = extractAllLinks($, url)
  const bgImages = extractBgImages(rawHtml, url)
  const keyNumbers = extractKeyNumbers($)
  const forms = extractForms($)
  const keyframes = extractKeyframes(allCss)

  // CSS sample — trimmed to 5k for lighter processing
  const rawStyleSample = allCss.slice(0, 5000)
  const textContent = paragraphs.slice(0, 20).join('\n')

  // Raw HTML body snapshot — LITE: disabled to save memory
  const rawBodySnapshot = ''

  return {
    domain,
    url,
    title,
    metaDesc,
    ogImage,
    ogTitle,
    ogDesc,
    headings: headings.slice(0, 20),
    paragraphs: paragraphs.slice(0, 24),
    ctaTexts: [...new Set(ctaTexts)].slice(0, 12),
    navLinks: [...new Set(navLinks)].slice(0, 14),
    techStack,
    colors,
    cssVars,
    fonts,
    primaryColor,
    bgColor,
    colorScheme,
    animations,
    iconLibrary,
    layoutType,
    sections,
    usesGrid,
    usesFlex,
    breakpoints,
    rawStyleSample,
    textContent,
    classSnapshot,
    linkedStyles,
    // V2
    images,
    svgs,
    buttonPatterns,
    navbarHtml,
    shadowTokens,
    spacingTokens,
    structuralSkeleton,
    navStructure,
    heroContent,
    // V3
    footerContent,
    allTextContent,
    allLinks,
    bgImages,
    keyNumbers,
    forms,
    keyframes,
    rawBodySnapshot,
  }
}

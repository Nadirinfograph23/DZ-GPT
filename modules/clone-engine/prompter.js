/**
 * clone-engine/prompter.js  — V3
 * Builds framework-aware, ultra-detailed AI prompts for pixel-perfect cloning.
 * V3 adds: copyright/year preservation, full footer & body snapshot context,
 *          keyframes reproduction, form structure, ALL text verbatim rules,
 *          self-healing, SEO injection, 100% fidelity mandate.
 */

import { buildImagePromptBlock } from './asset-handler.js'

const BASE_SYSTEM = `You are DZ Agent V3 — the world's most advanced autonomous website cloning AI.
Your mission: produce 100% pixel-perfect standalone HTML clones — indistinguishable from the original at first glance.

CLONING PIPELINE (V3 — 7 stages):
1. ANALYZE   → full DOM, sections hierarchy, CSS tokens, fonts, colors, animations, forms
2. EXTRACT   → screenshots, component-level analysis, mobile/tablet views, bg images
3. RECOVER   → images, icons, SVGs, fonts (with placeholder fallback system)
4. REBUILD   → exact layout hierarchy, navbar, section order, visual spacing
5. ENGINEER  → desktop (1920px) + tablet (1024px) + mobile (320px) responsive versions
6. OPTIMIZE  → lazy loading, SEO metadata, accessibility
7. SELF-HEAL → auto-detect broken layout → repair spacing/responsiveness/CSS conflicts

════════════════════════════════════════════
ABSOLUTE OUTPUT RULE:
Output ONLY raw HTML — NO markdown fences, NO explanations, NO code comments outside HTML.
Response = ONE complete file: <!DOCTYPE html>…</html>
All CSS in <style>, all JS in <script>. ZERO external files except CDN links.
════════════════════════════════════════════

PIXEL-PERFECT MANDATE:
- 95–100% visual similarity at first glance
- Reproduce EVERY section in the CORRECT order — do NOT invent new sections
- Use EXACT extracted colors — not approximations
- Use EXACT extracted fonts loaded from Google Fonts CDN
- Reproduce ALL detected animations and hover effects
- Fully responsive at 320px, 768px, 1024px, 1280px, 1920px
- Preserve layout proportions EXACTLY (hero height, card sizes, spacing)
- Preserve button styles EXACTLY (shape, color, gradient, border-radius)
- Preserve navbar structure EXACTLY (brand, links, CTA)
- Preserve footer structure EXACTLY
- Use REAL extracted content — NEVER Lorem ipsum

════════════════════════════════════════════
⚠️ CRITICAL: DATES, YEARS, NUMBERS — VERBATIM COPY RULE:
- NEVER change any date, year, phone number, price, or statistic
- If footer says "© 2024 CompanyName" → output EXACTLY "© 2024 CompanyName"
- If the site shows "2019–2024" → output EXACTLY "2019–2024"
- If a stat card says "10,000+ clients" → output EXACTLY "10,000+ clients"
- DO NOT substitute current year (2025/2026) for any number found in the original
- ALL years, prices, counts, statistics MUST be copied verbatim from the extracted content
════════════════════════════════════════════

IMAGE MANDATE (V3 — Fallback System):
- NEVER use external image URLs in <img src=""> tags — they break cross-origin
- For EVERY image position: use a themed placeholder div preserving EXACT dimensions:
  <div class="img-ph" style="background:linear-gradient(135deg,BG1,BG2);display:flex;align-items:center;justify-content:center;border-radius:RADIUS;width:WIDTH;height:HEIGHT;min-height:MIN;color:FG;font-size:14px;font-weight:600;flex-direction:column;gap:6px;overflow:hidden"><span style="font-size:2rem;opacity:.7">🖼️</span><span style="opacity:.8">صورة N</span></div>
- Adapt BG1/BG2/FG to the site's color scheme (dark sites → dark gradients, light → light)
- Preserve EXACT original dimensions (aspect-ratio, min-height, width)
- For hero backgrounds → CSS gradient ONLY, never background-image:url()
- For OG image, logo, product shots → numbered placeholders (صورة 1, صورة 2...)
- NEVER break layout when images are missing — placeholders MUST maintain grid alignment`

const TAILWIND_RULES = `
TAILWIND INSTRUCTIONS:
- Load Tailwind via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Use Tailwind utility classes as primary styling
- Extend config for custom colors: tailwind.config = { theme: { extend: { colors: {...} } } }
- Use @layer and @apply in <style> for complex custom components
- Combine Tailwind with custom CSS vars for brand colors`

const BOOTSTRAP_RULES = `
BOOTSTRAP INSTRUCTIONS:
- Load Bootstrap 5.3 CSS + JS via CDN
- Use Bootstrap grid (row/col) for layout
- Use Bootstrap component classes (card, navbar, modal, etc.)
- Augment with custom CSS for brand-specific styling`

const ANIMATION_RULES = `
ANIMATION INSTRUCTIONS (reproduce all detected animations):
- CSS transitions (0.2–0.4s ease) on ALL interactive elements
- Scroll-reveal: IntersectionObserver with fadeInUp/slideIn for sections
- Reproduce hover effects EXACTLY (color shifts, scale, shadow elevation)
- Smooth scrolling: html { scroll-behavior: smooth; }
- Animate stat counters with requestAnimationFrame
- Navbar shrinks on scroll (add .scrolled class via JS)
- Parallax effect on hero if detected
- Carousel/slider if detected (use CSS or minimal JS)
@keyframes fadeInUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
@keyframes slideInLeft { from{opacity:0;transform:translateX(-40px)} to{opacity:1;transform:translateX(0)} }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
@keyframes gradientShift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }`

const RESPONSIVE_RULES = `
RESPONSIVE RULES (mobile-first):
- Hamburger menu for mobile nav (toggles .open class)
- Fluid typography: clamp() for headings
- Grid collapses correctly on mobile (1 col)
- Images/placeholders: max-width:100%, height:auto
- Cards stack vertically on mobile
- Hero height adjusts for mobile
- @media (max-width: 1024px) for tablet
- @media (max-width: 768px) for mobile
- @media (max-width: 480px) for small mobile`

const ICON_RULES = {
  'font-awesome':   `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"/>`,
  'lucide':         `<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>`,
  'material-icons': `<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">`,
  'bootstrap-icons':`<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">`,
  'remixicon':      `<link href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css" rel="stylesheet">`,
  'feather':        `<script src="https://unpkg.com/feather-icons"></script>`,
  'phosphor':       `<script src="https://unpkg.com/@phosphor-icons/web"></script>`,
  'heroicons':      `<!-- Use SVG icons inline for Heroicons -->`,
  'tabler-icons':   `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">`,
}

function buildDesignContext(tokens) {
  const vars = tokens.cssVars && Object.keys(tokens.cssVars).length > 0
    ? `\nCSS CUSTOM PROPERTIES (reproduce exactly):\n${Object.entries(tokens.cssVars).slice(0, 40).map(([k, v]) => `  ${k}: ${v};`).join('\n')}`
    : ''

  const techBadges = tokens.techStack?.length > 0
    ? `\nTECH STACK: ${tokens.techStack.join(', ')}`
    : ''

  const navLinksStr = tokens.navLinks?.length > 0
    ? `\nNAVIGATION LINKS: ${tokens.navLinks.join(' | ')}`
    : ''

  const navStructStr = tokens.navStructure
    ? `\nNAV BRAND: "${tokens.navStructure.brand}" | LINKS: ${tokens.navStructure.links.join(' | ')}`
    : ''

  const heroStr = tokens.heroContent
    ? `\nHERO H1: "${tokens.heroContent.h1}"\nHERO SUBTEXT: "${tokens.heroContent.subtext}"\nHERO CTAs: ${tokens.heroContent.ctas.join(' | ')}`
    : ''

  const ctaStr = tokens.ctaTexts?.length > 0
    ? `\nCTA BUTTON TEXTS: ${tokens.ctaTexts.join(' | ')}`
    : ''

  const animStr = tokens.animations?.length > 0
    ? `\nANIMATIONS DETECTED: ${tokens.animations.join(', ')}`
    : ''

  const layoutStr = [
    tokens.usesGrid ? 'CSS Grid' : '',
    tokens.usesFlex ? 'Flexbox' : '',
  ].filter(Boolean).join(' + ') || 'standard block layout'

  const bpStr = tokens.breakpoints?.length > 0
    ? `Breakpoints: ${tokens.breakpoints.join('px, ')}px`
    : 'Standard: 768px, 1024px, 1280px'

  const shadowStr = tokens.shadowTokens?.length > 0
    ? `\nSHADOW TOKENS (use these exact values):\n${tokens.shadowTokens.map(s => `  box-shadow: ${s}`).join('\n')}`
    : ''

  const spacingStr = tokens.spacingTokens?.length > 0
    ? `\nSPACING TOKENS:\n${tokens.spacingTokens.map(s => `  ${s}`).join('\n')}`
    : ''

  // V2: Image block
  const imageBlock = buildImagePromptBlock(tokens.images || [], 25)

  // V2: Button patterns
  const buttonStr = tokens.buttonPatterns?.length > 0
    ? `\nBUTTON HTML PATTERNS (reproduce these exact styles):\n${tokens.buttonPatterns.slice(0, 4).join('\n---\n')}`
    : ''

  // V2: Structural skeleton
  const skeletonStr = tokens.structuralSkeleton
    ? `\nDOM STRUCTURE SKELETON (reproduce this hierarchy):\n${tokens.structuralSkeleton.slice(0, 3000)}`
    : ''

  // V3: Footer content with copyright
  const footerStr = tokens.footerContent
    ? (() => {
        const f = tokens.footerContent
        const parts = [`\nFOOTER CONTENT (reproduce VERBATIM):`]
        if (f.copyright) parts.push(`  COPYRIGHT LINE (copy EXACTLY): "${f.copyright}"`)
        if (f.years?.length) parts.push(`  YEARS IN FOOTER (use EXACTLY as-is): ${f.years.join(', ')}`)
        if (f.links?.length) parts.push(`  FOOTER LINKS: ${f.links.slice(0, 16).join(' | ')}`)
        if (f.text) parts.push(`  FOOTER TEXT SAMPLE: "${f.text.slice(0, 300)}"`)
        return parts.join('\n')
      })()
    : ''

  // V3: Key numbers (years, prices, stats)
  const numbersStr = tokens.keyNumbers
    ? (() => {
        const n = tokens.keyNumbers
        const parts = [`\n⚠️ KEY NUMBERS — COPY VERBATIM (do NOT change ANY of these):`]
        if (n.years?.length) parts.push(`  YEARS: ${n.years.join(', ')}`)
        if (n.prices?.length) parts.push(`  PRICES: ${n.prices.join(', ')}`)
        if (n.stats?.length) parts.push(`  STATS/COUNTERS: ${n.stats.join(', ')}`)
        return parts.join('\n')
      })()
    : ''

  // V3: Forms
  const formStr = tokens.forms?.length > 0
    ? `\nFORM STRUCTURE:\n${tokens.forms.map((f, i) => {
        const inputs = f.inputs.map(inp => `    - ${inp.type} placeholder="${inp.placeholder}" label="${inp.label}"`).join('\n')
        return `Form ${i + 1}:\n${inputs}`
      }).join('\n')}`
    : ''

  // V3: CSS keyframes
  const keyframesStr = tokens.keyframes?.length > 0
    ? `\nDETECTED CSS KEYFRAMES (reproduce these exactly):\n${tokens.keyframes.join('\n\n').slice(0, 2000)}`
    : ''

  // V3: All text content
  const allTextStr = tokens.allTextContent
    ? `\nALL PAGE TEXT (copy VERBATIM — never substitute):\n${tokens.allTextContent.slice(0, 6000)}`
    : ''

  // V3: Raw body snapshot for structure reference
  const bodySnapshotStr = tokens.rawBodySnapshot
    ? `\nRAW HTML BODY SNAPSHOT (reference for exact structure — first 8000 chars):\n${tokens.rawBodySnapshot.slice(0, 8000)}`
    : ''

  // OG image info
  const ogStr = tokens.ogImage ? `\nOG IMAGE URL: ${tokens.ogImage} (use as placeholder reference only — do NOT embed)` : ''

  return `
════════════════════════════════════════════
EXTRACTED INTELLIGENCE FROM: ${tokens.url}
════════════════════════════════════════════

SITE INFO:
- Title: ${tokens.title || 'Unknown'}
- Domain: ${tokens.domain}
- Description: ${tokens.metaDesc || tokens.ogDesc || 'N/A'}
- Layout Type: ${tokens.layoutType}
- Color Scheme: ${tokens.colorScheme}
- Primary Layout: ${layoutStr}
- ${bpStr}
${techBadges}
${ogStr}

DETECTED SECTIONS (reproduce in this EXACT order — no additions, no omissions):
${tokens.sections?.length > 0
  ? tokens.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')
  : '1. navbar\n2. hero\n3. features\n4. footer'}

COLOR PALETTE (use EXACTLY these values — every hex must appear in output):
${tokens.colors.slice(0, 32).join(', ') || '#0f172a, #3b82f6, #ffffff, #f1f5f9'}
${tokens.primaryColor ? `\nPRIMARY COLOR: ${tokens.primaryColor}` : ''}
${tokens.bgColor ? `BACKGROUND COLOR: ${tokens.bgColor}` : ''}
${tokens.colorScheme === 'dark' ? 'THEME: Dark mode — use dark backgrounds, light text' : 'THEME: Light mode — use light backgrounds, dark text'}
${vars}
${shadowStr}
${spacingStr}

TYPOGRAPHY:
${tokens.fonts?.length > 0
  ? `Font families: ${tokens.fonts.join(', ')}\nLoad ALL via Google Fonts CDN`
  : 'Use a professional system font stack'}
${tokens.fonts?.[0] ? `Primary font: ${tokens.fonts[0]}` : ''}

ICON LIBRARY: ${tokens.iconLibrary || 'font-awesome'}
CDN: ${ICON_RULES[tokens.iconLibrary || 'font-awesome'] || ICON_RULES['font-awesome']}
${animStr}
${keyframesStr}
${navStructStr || navLinksStr}
${heroStr}
${ctaStr}
${numbersStr}
${footerStr}
${formStr}
${imageBlock}
${buttonStr}
${allTextStr}

RAW CSS PATTERNS (study and replicate exactly — use EXACT values):
${tokens.rawStyleSample?.slice(0, 8000) || ''}

TAILWIND CLASSES DETECTED:
${tokens.classSnapshot?.slice(0, 1500) || ''}
${skeletonStr}
${bodySnapshotStr}
════════════════════════════════════════════`
}

function buildFrameworkInstructions(techStack) {
  const instructions = []
  if (techStack.includes('tailwind')) instructions.push(TAILWIND_RULES)
  else if (techStack.includes('bootstrap')) instructions.push(BOOTSTRAP_RULES)
  else instructions.push(`\nSTYLING: Use pure CSS with custom properties. All CSS inside <style>. Be verbose — produce complete, detailed styles.`)
  instructions.push(ANIMATION_RULES)
  instructions.push(RESPONSIVE_RULES)
  return instructions.join('\n')
}

export function buildCloneSystemPrompt(tokens) {
  return BASE_SYSTEM
    + buildFrameworkInstructions(tokens.techStack || [])
    + '\n\nSITE-SPECIFIC INTELLIGENCE:'
    + buildDesignContext(tokens)
    + '\n\nSTART OUTPUT NOW — RAW HTML ONLY (<!DOCTYPE html>…</html>):'
}

export function buildCloneUserPrompt(url, section, tokens) {
  const yearsNote = tokens.keyNumbers?.years?.length
    ? `⚠️ CRITICAL — these years appear in the original and MUST appear verbatim in output: ${tokens.keyNumbers.years.join(', ')}`
    : ''

  const copyrightNote = tokens.footerContent?.copyright
    ? `⚠️ FOOTER COPYRIGHT — copy this EXACTLY: "${tokens.footerContent.copyright}"`
    : ''

  const imgFallback = `IMAGES: NEVER use external URLs. Use themed placeholder divs (صورة 1, صورة 2...) with gradients matching site theme (${tokens.colorScheme} → ${tokens.bgColor || 'extracted bg color'}). Preserve dimensions.`

  if (section && section !== 'full') {
    return `Clone ONLY the "${section}" section of ${url}.
Tech stack: ${tokens.techStack?.join(', ') || 'unknown'}.
Color scheme: ${tokens.colorScheme}. Primary: ${tokens.primaryColor || 'extracted'}.
${imgFallback}
${yearsNote}
Output: complete standalone HTML file with just this section — fully styled, animated, responsive.`
  }

  return `DZ Agent V3 — Produce a 100% pixel-perfect clone of ${url}.

MANDATORY REQUIREMENTS:
1. Exact color palette (EVERY hex/rgb from intelligence block must appear in CSS)
2. Load ALL detected fonts from Google Fonts CDN with correct weights
3. Reproduce ALL detected animations: ${tokens.animations?.join(', ') || 'transitions, hover effects'}
4. Fully responsive at 320px, 768px, 1024px, 1280px, 1920px
5. ALL nav links EXACTLY: ${tokens.navLinks?.slice(0, 10).join(' | ') || 'extracted above'}
6. Real content ONLY — copy ALL text verbatim from extracted content (no Lorem ipsum)
7. Color theme: ${tokens.colorScheme === 'dark' ? 'DARK — dark bg, light text' : 'LIGHT — light bg, dark text'}
8. ${imgFallback}
9. Reproduce button styles EXACTLY (shape, gradient, border-radius, hover state)
10. Preserve shadow tokens: ${tokens.shadowTokens?.slice(0, 3).join(', ') || 'standard shadows'}
11. Sections in EXACT order: ${tokens.sections?.join(' → ') || 'navbar → hero → features → footer'}
12. SEO: copy exact <title>, meta description, og:title from extracted data
13. ${yearsNote}
14. ${copyrightNote}
15. Reproduce ALL detected CSS keyframes with identical timing/easing
16. Forms: reproduce exact input structure and placeholders
17. Self-heal: if a section has no extracted data → reconstruct contextually from site type "${tokens.layoutType}"

QUALITY TARGET: 95–100% visual accuracy — indistinguishable from original.
Output: ONE complete <!DOCTYPE html>…</html> file. Minimum 400 lines.`
}

export function buildRepairPrompt(originalUrl, firstAttemptHtml, tokens, issue) {
  const yearsNote = tokens.keyNumbers?.years?.length
    ? `⚠️ YEARS MUST BE VERBATIM: ${tokens.keyNumbers.years.join(', ')} — do NOT use current year`
    : ''

  return `DZ Agent V3 SELF-HEALING — The first clone attempt of ${originalUrl} has issues: ${issue}

AUTO-REPAIR INSTRUCTIONS:
- Detect ALL broken sections → repair spacing → repair responsiveness → repair missing assets
- Color scheme MUST be ${tokens.colorScheme} (bg: ${tokens.bgColor || 'dark'}, primary: ${tokens.primaryColor || tokens.colors?.[0] || 'extracted'})
- ALL sections in order: ${tokens.sections?.join(' → ')}
- Tech: ${tokens.techStack?.join(', ')}
- Images: NEVER external URLs → use themed placeholder divs (صورة 1, صورة 2...) with site palette
- Fix ALL responsive issues (320px, 768px, 1024px, 1280px)
- Fix CSS conflicts, collapsed containers, overlapping elements
- Ensure navbar/hero/CTAs/footer are intact
- ${yearsNote}
- Copyright: "${tokens.footerContent?.copyright || ''}" — must appear verbatim

Previous attempt (reference — do NOT copy its bugs):
${firstAttemptHtml.slice(0, 3000)}...

Output: ONE fully corrected complete HTML file. Raw HTML ONLY. Minimum 400 lines.`
}

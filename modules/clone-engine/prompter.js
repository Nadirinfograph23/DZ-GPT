/**
 * clone-engine/prompter.js  — V3
 * Builds framework-aware, ultra-detailed AI prompts for pixel-perfect cloning.
 * V3 adds: copyright/year preservation, full footer & body snapshot context,
 *          keyframes reproduction, form structure, ALL text verbatim rules,
 *          self-healing, SEO injection, 100% fidelity mandate.
 */

import { buildImagePromptBlock, buildButtonNavBlock } from './asset-handler.js'

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

IMAGE MANDATE (V4 — Real + Fallback):
- For images marked [REAL-IMG] in the intelligence block: USE THE EXACT <img> TAG PROVIDED — do NOT replace with placeholders
- Each [REAL-IMG] already includes an onerror fallback — copy it exactly as given
- For [BG-IMG]: use as CSS background-image: url("...") on the relevant section/div
- For [PLACEHOLDER]: use a themed gradient div preserving dimensions
- MINIMUM 4 real images must appear in the output — use the [REAL-IMG] tags provided
- Wrap each image in a container: style="overflow:hidden;border-radius:Xpx;" to preserve layout
- NEVER break layout when images load — use aspect-ratio or min-height on containers`

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

const CSS_QUALITY_RULES = `
CSS EXCELLENCE MANDATE — produce CSS as good as (or better than) the original:

▸ CUSTOM PROPERTIES (always define :root vars):
  :root { --primary: [extracted]; --bg: [extracted]; --text: [extracted]; --accent: [extracted]; --surface: [extracted]; --radius: 10px; --shadow: 0 4px 24px rgba(0,0,0,0.12); }

▸ TYPOGRAPHY HIERARCHY (fluid + precise):
  - h1: font-size: clamp(2.2rem, 5vw, 4.5rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.1;
  - h2: font-size: clamp(1.7rem, 3.5vw, 3rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.2;
  - h3: font-size: clamp(1.2rem, 2vw, 1.6rem); font-weight: 600; line-height: 1.3;
  - p:  font-size: 1rem; line-height: 1.7; color: var(--text-muted, rgba(text,0.75));
  - .caption / small: font-size: 0.8rem; letter-spacing: 0.04em;

▸ NAVIGATION (pixel-perfect):
  nav { position: sticky; top: 0; z-index: 100; backdrop-filter: blur(12px); transition: box-shadow 0.3s; }
  nav.scrolled { box-shadow: var(--shadow); }
  nav a { transition: color 0.2s, opacity 0.2s; }
  nav a:hover { color: var(--primary); opacity: 0.85; }
  .hamburger { display: none; flex-direction: column; gap: 4px; cursor: pointer; }
  .hamburger span { width: 22px; height: 2px; background: currentColor; transition: transform 0.3s; border-radius: 2px; }

▸ FORM FIELDS (polished):
  input, select, textarea, [type="email"], [type="text"], [type="tel"], [type="password"] {
    width: 100%; padding: 11px 15px; font-size: 14px; font-family: inherit;
    border: 1.5px solid rgba(0,0,0,0.15); border-radius: 8px;
    background: rgba(255,255,255,0.06); color: inherit;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    appearance: none;
  }
  input:focus, select:focus, textarea:focus {
    outline: none; border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(var(--primary-rgb,59,130,246), 0.18);
  }
  label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 5px; }
  ::placeholder { opacity: 0.45; }

▸ BUTTONS (exact replica + micro-interaction):
  .btn, button[type="submit"], [class*="btn"], [class*="cta"] {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 12px 24px; font-weight: 700; letter-spacing: 0.01em;
    border-radius: var(--radius); cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
    text-decoration: none;
  }
  .btn:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
  .btn:active { transform: scale(0.98); }

▸ CARDS (elevation on hover):
  .card, [class*="card"], [class*="feature-item"] {
    transition: transform 0.25s ease, box-shadow 0.25s ease;
    border-radius: var(--radius);
  }
  .card:hover { transform: translateY(-5px); box-shadow: 0 16px 40px rgba(0,0,0,0.15); }

▸ SECTIONS:
  section { padding: clamp(48px, 8vw, 96px) clamp(16px, 4vw, 48px); }
  .container { max-width: 1200px; margin: 0 auto; width: 100%; }

▸ SCROLLBAR (styled):
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--primary); border-radius: 99px; }`

const RESPONSIVE_RULES = `
RESPONSIVE RULES (mobile-first):
- Hamburger menu for mobile nav (toggles .open class + JS toggle)
- Fluid typography using clamp() — NEVER fixed px for headings
- Grid collapses correctly on mobile (grid-template-columns: 1fr)
- Images: max-width:100%, height:auto, object-fit:cover
- Cards stack vertically on mobile (flex-direction:column)
- Hero height adjusts: min-height: clamp(60vh, 80vh, 100vh)
- Sections: padding shrinks on mobile via clamp()
- @media (max-width: 1024px) { .hamburger { display:flex } nav ul { display:none } nav ul.open { display:flex; flex-direction:column } }
- @media (max-width: 768px) for mobile layout
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

  // V2+: Button & Nav block (real HTML for exact reproduction)
  const buttonNavStr = buildButtonNavBlock(tokens.buttonPatterns, tokens.navbarHtml)

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
${buttonNavStr}
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
  instructions.push(CSS_QUALITY_RULES)
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

/**
 * INDEX-ONLY slim prompt — drastically smaller than full prompt.
 * Removes rawBodySnapshot, structuralSkeleton, allTextContent (trimmed to 1200),
 * rawStyleSample (trimmed to 1500), classSnapshot (trimmed to 800).
 * Target: < 10000 chars total to fit model context window reliably.
 */
export function buildIndexOnlySystemPrompt(tokens) {
  const techBadges   = tokens.techStack?.length > 0 ? `\nTECH: ${tokens.techStack.join(', ')}` : ''
  const navStr       = tokens.navStructure
    ? `\nNAV: "${tokens.navStructure.brand}" | ${tokens.navStructure.links.slice(0, 8).join(' | ')}`
    : tokens.navLinks?.length ? `\nNAV LINKS: ${tokens.navLinks.slice(0, 8).join(' | ')}` : ''
  const heroStr      = tokens.heroContent
    ? `\nHERO H1: "${tokens.heroContent.h1}"\nHERO SUB: "${tokens.heroContent.subtext?.slice(0, 120)}"\nHERO CTAs: ${tokens.heroContent.ctas.slice(0, 3).join(' | ')}`
    : ''
  const footerStr    = tokens.footerContent?.copyright
    ? `\nFOOTER COPYRIGHT (VERBATIM): "${tokens.footerContent.copyright}"\nFOOTER LINKS: ${tokens.footerContent.links?.slice(0, 8).join(' | ') || ''}`
    : ''
  const yearsStr     = tokens.keyNumbers?.years?.length
    ? `\n⚠️ YEARS (copy verbatim): ${tokens.keyNumbers.years.join(', ')}`
    : ''
  const statsStr     = tokens.keyNumbers?.stats?.length
    ? `\nSTATS (verbatim): ${tokens.keyNumbers.stats.slice(0, 6).join(', ')}`
    : ''
  const animStr      = tokens.animations?.length > 0 ? `\nANIMATIONS: ${tokens.animations.slice(0, 6).join(', ')}` : ''
  const formStr      = tokens.forms?.length > 0
    ? `\nFORMS: ${tokens.forms.map(f => f.inputs.map(i => `${i.type}[${i.placeholder || i.label}]`).join(',')).join(' | ')}`
    : ''
  const cssVarsStr   = tokens.cssVars && Object.keys(tokens.cssVars).length > 0
    ? `\nCSS VARS:\n${Object.entries(tokens.cssVars).slice(0, 20).map(([k, v]) => `${k}:${v}`).join('; ')}`
    : ''
  const allTextSlim  = tokens.allTextContent ? `\nKEY TEXT (verbatim):\n${tokens.allTextContent.slice(0, 1200)}` : ''
  const cssSlim      = tokens.rawStyleSample  ? `\nCSS SAMPLE:\n${tokens.rawStyleSample.slice(0, 1500)}`       : ''
  const classesTrim  = tokens.classSnapshot   ? `\nCLASSES: ${tokens.classSnapshot.slice(0, 600)}`             : ''
  const iconCdn      = ICON_RULES[tokens.iconLibrary || 'font-awesome'] || ICON_RULES['font-awesome']
  const layoutInfo   = [tokens.usesGrid ? 'Grid' : '', tokens.usesFlex ? 'Flex' : ''].filter(Boolean).join('+') || 'block'
  const keyframesSlim = tokens.keyframes?.length > 0 ? `\nKEYFRAMES:\n${tokens.keyframes.join('\n').slice(0, 800)}` : ''
  const buttonNavSlim = buildButtonNavBlock(tokens.buttonPatterns, tokens.navbarHtml)

  // Slim image block for INDEX mode — still show real URLs for top 4
  const imageSlim = buildImagePromptBlock((tokens.images || []).slice(0, 8), 8)

  const context = `
════════════════════════════
INDEX-ONLY CLONE: ${tokens.url}
════════════════════════════
Title: ${tokens.title || tokens.domain}
Layout: ${tokens.layoutType} | ${layoutInfo} | ${tokens.colorScheme} theme
${techBadges}

SECTIONS (exact order, no additions):
${tokens.sections?.map((s, i) => `${i + 1}. ${s}`).join('\n') || '1. navbar\n2. hero\n3. features\n4. footer'}

COLORS (use ALL of these):
${tokens.colors.slice(0, 20).join(', ')}
${tokens.primaryColor ? `Primary: ${tokens.primaryColor}` : ''}
${tokens.bgColor ? `Background: ${tokens.bgColor}` : ''}
${cssVarsStr}

FONTS: ${tokens.fonts?.slice(0, 3).join(', ') || 'system-ui'}
ICONS: ${iconCdn}
${animStr}
${keyframesSlim}
${navStr}
${heroStr}
${yearsStr}
${statsStr}
${footerStr}
${formStr}
${imageSlim}
${buttonNavSlim}
${allTextSlim}
${cssSlim}
${classesTrim}
════════════════════════════`

  return BASE_SYSTEM
    + buildFrameworkInstructions(tokens.techStack || [])
    + '\n\nINDEX PAGE INTELLIGENCE (slim for speed):'
    + context
    + '\n\nOUTPUT NOW — RAW HTML ONLY (<!DOCTYPE html>…</html>):'
}

export function buildCloneUserPrompt(url, section, tokens) {
  const yearsNote = tokens.keyNumbers?.years?.length
    ? `⚠️ CRITICAL — these years appear in the original and MUST appear verbatim in output: ${tokens.keyNumbers.years.join(', ')}`
    : ''

  const copyrightNote = tokens.footerContent?.copyright
    ? `⚠️ FOOTER COPYRIGHT — copy this EXACTLY: "${tokens.footerContent.copyright}"`
    : ''

  const imgFallback = `IMAGES: Use real <img> tags (with absolute URLs) for the first 4 images as provided in the IMAGES block. Each real img includes an onerror fallback — copy it exactly. For remaining images use themed gradient placeholders matching ${tokens.colorScheme} theme.`

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

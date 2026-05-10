/**
 * clone-engine/prompter.js  — V2
 * Builds framework-aware, ultra-detailed AI prompts for pixel-perfect cloning.
 * V2 adds: image URLs, SVG patterns, button HTML, shadow/spacing tokens,
 * structural skeleton, hero content, and nav structure.
 */

import { buildImagePromptBlock } from './asset-handler.js'

const BASE_SYSTEM = `You are an ELITE FRONTEND RECONSTRUCTION ENGINEER — the world's best at reverse-engineering websites and producing pixel-perfect standalone HTML clones.

════════════════════════════════════════════
ABSOLUTE OUTPUT RULE:
Output ONLY raw HTML — NO markdown fences, NO explanations, NO code comments outside HTML.
Response = ONE complete file: <!DOCTYPE html>…</html>
All CSS in <style>, all JS in <script>. ZERO external files except CDN links.
════════════════════════════════════════════

PIXEL-PERFECT MANDATE:
- 95%+ visual similarity at first glance
- Reproduce EVERY section in the correct order
- Use EXACT extracted colors — not approximations
- Use EXACT extracted fonts loaded from Google Fonts CDN
- Reproduce ALL detected animations and hover effects
- Fully responsive at 320px, 768px, 1024px, 1280px, 1920px
- Preserve layout proportions exactly (hero height, card sizes, spacing)
- Preserve button styles exactly (shape, color, gradient, border-radius)
- Preserve navbar structure (brand, links, CTA) exactly
- Preserve footer structure exactly
- Use real content from the extracted text — NEVER Lorem ipsum

IMAGE MANDATE:
- NEVER use external image URLs — they will break. Instead use COLORED PLACEHOLDER DIVS for every image slot.
- For each image slot, use a styled div with gradient background matching the site theme:
  <div class="img-placeholder" style="background:linear-gradient(135deg,VAR_BG,VAR_BG_LIGHT);display:flex;align-items:center;justify-content:center;border-radius:8px;min-height:200px;color:VAR_FG;font-size:14px;font-weight:600;flex-direction:column;gap:6px;aspect-ratio:16/9"><span style="font-size:2.5rem">🖼️</span><span>صورة N</span></div>
- Replace VAR_BG with one of the site's extracted dark colors, VAR_FG with a light contrasting color
- Use the exact number of placeholders matching the image count (صورة 1, صورة 2, etc.)
- For hero backgrounds: use CSS background gradient instead of background-image: url()
- NEVER generate <img> tags with src pointing to external URLs`

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
- Images: max-width:100%, height:auto
- Cards stack vertically on mobile
- Hero height adjusts for mobile
- @media (max-width: 768px) for tablet
- @media (max-width: 480px) for mobile`

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
    ? `\nCSS CUSTOM PROPERTIES (reproduce exactly):\n${Object.entries(tokens.cssVars).slice(0, 30).map(([k, v]) => `  ${k}: ${v};`).join('\n')}`
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
    ? `\nDOM STRUCTURE SKELETON (reproduce this hierarchy):\n${tokens.structuralSkeleton.slice(0, 2000)}`
    : ''

  return `
════════════════════════════════════════════
EXTRACTED INTELLIGENCE FROM: ${tokens.url}
════════════════════════════════════════════

SITE INFO:
- Title: ${tokens.title || 'Unknown'}
- Domain: ${tokens.domain}
- Description: ${tokens.metaDesc || 'N/A'}
- Layout Type: ${tokens.layoutType}
- Color Scheme: ${tokens.colorScheme}
- Primary Layout: ${layoutStr}
- ${bpStr}
${techBadges}

DETECTED SECTIONS (reproduce in this EXACT order):
${tokens.sections?.length > 0
  ? tokens.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')
  : '1. navbar\n2. hero\n3. features\n4. footer'}

COLOR PALETTE (use EXACTLY these values):
${tokens.colors.slice(0, 20).join(', ') || '#0f172a, #3b82f6, #ffffff, #f1f5f9'}
${tokens.primaryColor ? `\nPRIMARY COLOR: ${tokens.primaryColor}` : ''}
${tokens.bgColor ? `BACKGROUND: ${tokens.bgColor}` : ''}
${tokens.colorScheme === 'dark' ? 'THEME: Dark mode — dark background, light text' : 'THEME: Light mode — light background, dark text'}
${vars}
${shadowStr}
${spacingStr}

TYPOGRAPHY:
${tokens.fonts?.length > 0
  ? `Font families: ${tokens.fonts.join(', ')}\nLoad via Google Fonts CDN`
  : 'Use a professional system font stack'}
${tokens.fonts?.[0] ? `Primary font: ${tokens.fonts[0]}` : ''}

ICON LIBRARY: ${tokens.iconLibrary || 'font-awesome'}
CDN: ${ICON_RULES[tokens.iconLibrary || 'font-awesome'] || ICON_RULES['font-awesome']}
${animStr}
${navStructStr || navLinksStr}
${heroStr}
${ctaStr}
${imageBlock}
${buttonStr}

CONTENT (use this real text — no Lorem ipsum):
${tokens.headings?.slice(0, 10).map((h, i) => `H${i === 0 ? 1 : i < 3 ? 2 : 3}: ${h}`).join('\n') || ''}

${tokens.paragraphs?.slice(0, 6).join('\n\n') || ''}

RAW CSS PATTERNS (study and replicate exactly):
${tokens.rawStyleSample?.slice(0, 3500) || ''}

TAILWIND CLASSES DETECTED:
${tokens.classSnapshot?.slice(0, 1200) || ''}
${skeletonStr}
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
  if (section && section !== 'full') {
    return `Clone ONLY the "${section}" section of ${url}.
Tech stack: ${tokens.techStack?.join(', ') || 'unknown'}.
Color scheme: ${tokens.colorScheme}. Primary: ${tokens.primaryColor || 'extracted'}.
Images: use the EXACT URLs from the intelligence block above.
Output: complete standalone HTML file with just this section — fully styled, animated, responsive.`
  }
  return `Produce a near pixel-perfect clone of ${url}.

MANDATORY REQUIREMENTS:
1. Exact color palette (listed in intelligence block — use EVERY color accurately)
2. Load detected fonts from Google Fonts CDN
3. Reproduce ALL detected animations (${tokens.animations?.join(', ') || 'transitions, hover effects'})
4. Fully responsive at 320px, 768px, 1024px, 1280px
5. ALL nav links and CTAs from original: ${tokens.navLinks?.slice(0, 8).join(', ') || 'extracted above'}
6. Real content only — use extracted headings/paragraphs (no Lorem ipsum)
7. Color theme: ${tokens.colorScheme === 'dark' ? 'DARK — dark bg, light text' : 'LIGHT — light bg, dark text'}
8. Use EXACT image URLs from intelligence block — add onerror fallback to each img
9. Reproduce button styles exactly (shape, gradient, border-radius, hover state)
10. Preserve shadow values exactly as specified in shadow tokens
11. Sections in order: ${tokens.sections?.join(' → ') || 'navbar → hero → features → footer'}

Output: ONE complete <!DOCTYPE html>…</html> file.`
}

export function buildRepairPrompt(originalUrl, firstAttemptHtml, tokens, issue) {
  return `The first clone attempt of ${originalUrl} has issues: ${issue}

Fix ALL problems and regenerate the COMPLETE improved HTML:
- Color scheme MUST be ${tokens.colorScheme} (bg: ${tokens.bgColor || 'dark'}, primary: ${tokens.primaryColor || tokens.colors?.[0] || 'extracted'})
- ALL sections present in order: ${tokens.sections?.join(' → ')}
- Tech: ${tokens.techStack?.join(', ')}
- Images: use these EXACT URLs — ${(tokens.images || []).slice(0, 5).map(i => i.src).join(', ')}
- Add onerror fallback to every <img> tag
- Fix all responsive layout issues

Previous attempt (reference only — do NOT copy bugs):
${firstAttemptHtml.slice(0, 2500)}...

Output: ONE corrected complete HTML file. Raw HTML ONLY.`
}

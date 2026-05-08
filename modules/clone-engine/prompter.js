/**
 * clone-engine/prompter.js
 * Builds framework-aware, ultra-detailed AI prompts for pixel-perfect cloning.
 */

const BASE_SYSTEM = `You are an ELITE FRONTEND RECONSTRUCTION ENGINEER — the world's best at reverse-engineering websites and producing pixel-perfect standalone HTML clones.

════════════════════════════════════════════
ABSOLUTE OUTPUT RULE:
Output ONLY raw HTML — NO markdown fences, NO explanations, NO code comments.
Response = ONE complete file: <!DOCTYPE html>…</html>
════════════════════════════════════════════

QUALITY MANDATE:
- 95%+ visual similarity to the original at first glance
- Professional, production-ready code
- Every section from the original reproduced
- Correct color palette — use EXACT extracted values
- Correct typography — load detected fonts from CDN
- Smooth animations matching the original style
- Fully responsive at 320px, 768px, 1024px, 1280px, 1920px`

const TAILWIND_RULES = `
TAILWIND INSTRUCTIONS:
- Load Tailwind via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Use Tailwind utility classes as the primary styling approach
- Extend config for custom colors: tailwind.config = { theme: { extend: { colors: {...} } } }
- Use @layer and @apply in <style> for complex custom components`

const BOOTSTRAP_RULES = `
BOOTSTRAP INSTRUCTIONS:
- Load Bootstrap 5.3 CSS + JS via CDN
- Use Bootstrap grid system (row/col) for layout
- Use Bootstrap component classes (card, navbar, modal, etc.)
- Augment with custom CSS for brand-specific styling`

const ANIMATION_RULES = `
ANIMATION INSTRUCTIONS:
- Use CSS transitions (0.2–0.4s ease) on interactive elements
- Add scroll-reveal: elements fade/slide in using IntersectionObserver
- Reproduce hover effects exactly (color shifts, scale, shadow)
- Add smooth scrolling: html { scroll-behavior: smooth; }
- Animate counters for stats sections with requestAnimationFrame`

const RESPONSIVE_RULES = `
RESPONSIVE RULES:
- Mobile-first approach unless site is clearly desktop-first
- Hamburger menu for mobile nav (pure CSS or minimal JS)
- Fluid typography: clamp() or vw units for headings
- Grid collapses correctly on small screens
- Images are responsive: max-width: 100%`

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
    ? `\nTECH STACK DETECTED: ${tokens.techStack.join(', ')}`
    : ''

  const navLinksStr = tokens.navLinks?.length > 0
    ? `\nNAVIGATION LINKS: ${tokens.navLinks.join(' | ')}`
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

DETECTED SECTIONS (reproduce in this exact order):
${tokens.sections?.length > 0
  ? tokens.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')
  : '1. navbar\n2. hero\n3. features\n4. footer'}

COLOR PALETTE (use EXACTLY these values):
${tokens.colors.slice(0, 20).join(', ') || '#0f172a, #3b82f6, #ffffff, #f1f5f9'}
${tokens.primaryColor ? `\nPRIMARY COLOR: ${tokens.primaryColor}` : ''}
${tokens.bgColor ? `BACKGROUND: ${tokens.bgColor}` : ''}
${tokens.colorScheme === 'dark' ? 'THEME: Dark mode — dark background, light text' : 'THEME: Light mode — light background, dark text'}
${vars}

TYPOGRAPHY:
${tokens.fonts?.length > 0
  ? `Font families: ${tokens.fonts.join(', ')}\nLoad via Google Fonts CDN`
  : 'Use a professional system font stack or detect from CSS'}
${tokens.fonts?.[0] ? `Primary font: ${tokens.fonts[0]}` : ''}

ICON LIBRARY: ${tokens.iconLibrary || 'font-awesome'}
Use this CDN tag: ${ICON_RULES[tokens.iconLibrary || 'font-awesome'] || ICON_RULES['font-awesome']}
${animStr}
${navLinksStr}
${ctaStr}

CONTENT (reproduce accurately):
${tokens.headings?.slice(0, 10).map((h, i) => `H${i === 0 ? 1 : i < 3 ? 2 : 3}: ${h}`).join('\n') || ''}

${tokens.paragraphs?.slice(0, 8).join('\n\n') || ''}

RAW CSS PATTERNS (study and replicate):
${tokens.rawStyleSample?.slice(0, 4000) || ''}

TAILWIND CLASSES DETECTED:
${tokens.classSnapshot?.slice(0, 1500) || ''}
════════════════════════════════════════════`
}

function buildFrameworkInstructions(techStack) {
  const instructions = []
  if (techStack.includes('tailwind')) instructions.push(TAILWIND_RULES)
  else if (techStack.includes('bootstrap')) instructions.push(BOOTSTRAP_RULES)
  else instructions.push(`\nSTYLING: Use pure CSS with custom properties (CSS vars). All CSS inside <style> block. Be verbose — produce complete, detailed styles.`)
  instructions.push(ANIMATION_RULES)
  instructions.push(RESPONSIVE_RULES)
  return instructions.join('\n')
}

export function buildCloneSystemPrompt(tokens) {
  return BASE_SYSTEM
    + buildFrameworkInstructions(tokens.techStack || [])
    + '\n\nSITE-SPECIFIC CONTEXT:'
    + buildDesignContext(tokens)
    + '\n\nSTART OUTPUT NOW — RAW HTML ONLY:'
}

export function buildCloneUserPrompt(url, section, tokens) {
  if (section && section !== 'full') {
    return `Clone ONLY the "${section}" section of ${url}.
Tech stack: ${tokens.techStack?.join(', ') || 'unknown'}.
Color scheme: ${tokens.colorScheme}.
Primary color: ${tokens.primaryColor || 'extracted from palette'}.
Output: complete standalone HTML file with just this one section, fully styled, animated, and responsive.`
  }
  return `Produce a near pixel-perfect clone of ${url}.
Tech: ${tokens.techStack?.join(', ') || 'HTML/CSS/JS'}.
Sections to reproduce (in order): ${tokens.sections?.join(' → ') || 'navbar, hero, features, footer'}.
Requirements:
1. Exact color palette (listed above)
2. Correct fonts loaded from CDN
3. All detected animations reproduced
4. Fully responsive
5. All nav links and CTAs from original
6. Realistic content (no Lorem ipsum — use extracted text)
7. Dark/light theme correct: ${tokens.colorScheme}
Output: ONE complete <!DOCTYPE html>…</html> file.`
}

export function buildRepairPrompt(originalUrl, firstAttemptHtml, tokens, issue) {
  return `The first clone attempt of ${originalUrl} has issues: ${issue}

Fix the following problems and regenerate the COMPLETE improved HTML:
- Ensure color scheme is ${tokens.colorScheme} (${tokens.bgColor ? 'bg: ' + tokens.bgColor : ''})
- Primary color must be: ${tokens.primaryColor || tokens.colors?.[0] || 'extracted'}
- All sections present: ${tokens.sections?.join(', ')}
- Tech: ${tokens.techStack?.join(', ')}

Previous attempt (for reference only — DO NOT copy bugs):
${firstAttemptHtml.slice(0, 3000)}...

Output: ONE corrected complete HTML file. Raw HTML only.`
}

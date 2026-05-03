/**
 * web_generator_module — Generator Utilities
 * Extracts CSS and JS from combined HTML output so the frontend
 * can display separate code tabs (HTML | CSS | JS).
 * This module is ADDITIVE — it does not replace any existing logic.
 */

/**
 * Extract all <style> block contents from an HTML string.
 * Returns empty string if none found.
 */
export function extractCssFromHtml(html) {
  if (!html) return ''
  const blocks = []
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    blocks.push(m[1].trim())
  }
  return blocks.join('\n\n').trim()
}

/**
 * Extract all <script> block contents (excluding src= scripts) from an HTML string.
 * Returns empty string if none found.
 */
export function extractJsFromHtml(html) {
  if (!html) return ''
  const blocks = []
  const re = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const content = m[1].trim()
    if (content.length > 10) blocks.push(content)
  }
  return blocks.join('\n\n').trim()
}

/**
 * Extract the <body> inner content (without style/script tags) for a "clean HTML" tab.
 */
export function extractBodyHtml(html) {
  if (!html) return html
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  return bodyMatch ? bodyMatch[1].trim() : html
}

/**
 * Build a stripped HTML shell (replaces inline style/script with external refs).
 * Used when the user wants separate files in the ZIP.
 */
export function buildHtmlShell(html) {
  if (!html) return html
  let result = html
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '<link rel="stylesheet" href="style.css">')
  result = result.replace(/<script(?![^>]*\bsrc\b)[^>]*>[\s\S]*?<\/script>/gi, '<script src="script.js"></script>')
  return result
}

/**
 * Lightweight template blocks — pre-built HTML sections for quick insertion.
 * These are sent to the AI as part of a refined prompt, not injected raw.
 */
export const TEMPLATE_BLOCKS = {
  navbar: {
    label: 'Navbar',
    labelAr: 'شريط التنقل',
    prompt: 'a modern responsive navbar with logo, navigation links, and a CTA button',
  },
  hero: {
    label: 'Hero Section',
    labelAr: 'قسم البطل',
    prompt: 'a stunning hero section with headline, subheadline, CTA buttons, and animated visual',
  },
  features: {
    label: 'Features',
    labelAr: 'الميزات',
    prompt: 'a features/services grid section with 6 cards, icons, and hover effects',
  },
  pricing: {
    label: 'Pricing',
    labelAr: 'الأسعار',
    prompt: 'a 3-tier pricing table section with highlighted recommended plan',
  },
  testimonials: {
    label: 'Testimonials',
    labelAr: 'الشهادات',
    prompt: 'a testimonials/reviews section with avatar cards and star ratings',
  },
  footer: {
    label: 'Footer',
    labelAr: 'التذييل',
    prompt: 'a comprehensive footer with logo, links columns, social icons, and newsletter form',
  },
  contact: {
    label: 'Contact Form',
    labelAr: 'نموذج التواصل',
    prompt: 'a contact form section with name, email, message fields and validation',
  },
  stats: {
    label: 'Stats',
    labelAr: 'الإحصائيات',
    prompt: 'an animated stats/metrics section with counter animations and icons',
  },
}

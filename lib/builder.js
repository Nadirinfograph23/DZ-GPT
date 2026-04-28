// DZ Agent — Web Builder Engine.
// Generates clean React + Tailwind starter blueprints from a natural-language
// brief. Pulls inspiration from GitHub trending templates when available.

import { searchRepos } from './github.js'
import { builderCache, makeKey } from './cache.js'
import { enhanceBuilderQuery } from './intent.js'

const TEMPLATE_QUERIES = {
  landing:    'react tailwind landing page template',
  portfolio:  'react portfolio template tailwind',
  dashboard:  'react admin dashboard tailwind',
  blog:       'next blog tailwind starter',
  store:      'next ecommerce tailwind storefront',
  saas:       'next saas tailwind starter',
}

function detectKind(brief) {
  const q = String(brief || '').toLowerCase()
  if (/dashboard|لوحة|إدارة/.test(q))         return 'dashboard'
  if (/portfolio|بورتفوليو|سيرة/.test(q))      return 'portfolio'
  if (/blog|مدونة/.test(q))                    return 'blog'
  if (/shop|store|متجر|تسوق/.test(q))          return 'store'
  if (/saas|subscription|اشتراك/.test(q))      return 'saas'
  return 'landing'
}

function brand(brief) {
  const m = brief.match(/(?:اسمه|name(?:d)?|called)\s+["']?([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF\s-]{1,30})/i)
  if (m) return m[1].trim()
  // First "title-cased" word fallback
  const words = brief.split(/\s+/).filter(w => /^[A-Z][a-z]+/.test(w))
  return words[0] || 'My Project'
}

function buildPlan(brief, kind, name, references) {
  const sectionMap = {
    landing:   ['Hero', 'Features', 'Social Proof', 'Pricing', 'FAQ', 'CTA Footer'],
    portfolio: ['Hero', 'About', 'Selected Work', 'Skills', 'Testimonials', 'Contact'],
    dashboard: ['Topbar', 'Sidebar', 'Stats Cards', 'Chart Panel', 'Recent Activity', 'Settings'],
    blog:      ['Hero', 'Featured Post', 'Category Grid', 'Latest Posts', 'Newsletter', 'Footer'],
    store:     ['Hero Banner', 'Category Strip', 'Product Grid', 'Promo Banner', 'Newsletter', 'Footer'],
    saas:      ['Hero', 'Logo Wall', 'Feature Grid', 'Demo', 'Pricing', 'FAQ', 'CTA Footer'],
  }
  const stack = ['React 18', 'TypeScript', 'Vite', 'Tailwind CSS', 'lucide-react icons']
  return {
    kind,
    name,
    stack,
    sections: sectionMap[kind],
    architecture: [
      'src/App.tsx              ← shell',
      'src/components/<Name>/*  ← one folder per section',
      'src/styles/tokens.css    ← design tokens (colors, radii, shadows)',
      'src/lib/                 ← helpers, hooks',
      'public/                  ← static assets',
    ],
    references: (references || []).slice(0, 5).map(r => ({
      repo: r.fullName, stars: r.stars, url: r.url, description: r.description,
    })),
    notes: enhanceBuilderQuery(brief),
  }
}

// Tiny but production-ready React starter scaffold (string templates).
function buildScaffold(plan) {
  const safeName = plan.name.replace(/[^a-zA-Z0-9]/g, '') || 'App'
  const heroFile = `import React from 'react'
export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900">
          ${plan.name}
        </h1>
        <p className="mt-6 text-lg leading-8 text-slate-600">
          ${plan.notes.split('→')[0].trim()}
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <a href="#features" className="rounded-2xl bg-slate-900 px-6 py-3 text-white shadow-soft hover:bg-slate-800">
            ابدأ الآن
          </a>
          <a href="#learn" className="text-slate-700 hover:text-slate-900">تعرف أكثر →</a>
        </div>
      </div>
    </section>
  )
}
`
  const appFile = `import React from 'react'
${plan.sections.map((s, i) => `import ${s.replace(/\s+/g, '')} from './components/${safeName}/${s.replace(/\s+/g, '')}'`).join('\n')}

export default function App() {
  return (
    <main className="min-h-screen bg-white text-slate-900 antialiased">
      ${plan.sections.map(s => `<${s.replace(/\s+/g, '')} />`).join('\n      ')}
    </main>
  )
}
`
  const tokens = `/* Design tokens — adjust to taste */
:root {
  --radius: 1rem;
  --shadow-soft: 0 8px 24px rgba(15, 23, 42, .08);
  --color-brand: #0f172a;
  --color-accent: #06b6d4;
}
.shadow-soft { box-shadow: var(--shadow-soft); }
.rounded-2xl { border-radius: var(--radius); }
`
  return {
    [`src/App.tsx`]: appFile,
    [`src/components/${safeName}/Hero.tsx`]: heroFile,
    [`src/styles/tokens.css`]: tokens,
  }
}

export async function buildSite(brief) {
  const kind = detectKind(brief)
  const name = brand(brief)
  const key = makeKey('builder', `${kind}|${name}|${brief}`)
  const cached = builderCache.get(key)
  if (cached) return { ...cached, cached: true }

  let references = []
  try {
    const tplQuery = TEMPLATE_QUERIES[kind] || TEMPLATE_QUERIES.landing
    const repos = await searchRepos(tplQuery, { perPage: 5, sort: 'stars' })
    references = repos.items || []
  } catch (err) {
    references = []
  }

  const plan = buildPlan(brief, kind, name, references)
  const files = buildScaffold(plan)
  const payload = {
    brief,
    plan,
    files,
    fetchedAt: new Date().toISOString(),
    nextSteps: [
      'Create a fresh Vite + React + TS project',
      'Drop the generated files under src/',
      'Run `npm i lucide-react` for icons',
      'Tailwind: ensure tokens.css is imported in main.tsx',
      'Iterate on components/<Name>/* one section at a time',
    ],
  }
  builderCache.set(key, payload)
  return payload
}

// DZ Agent — Structured Response Formatter.
// Renders engine outputs into clean Markdown with inline citations,
// tables, cards, and code blocks. Style distilled from Claude Code,
// Perplexity Comet, and GPT-5 Thinking response formatting rules.

import { buildCitations, attachInlineCitations, exportCitations, stripBibliography } from './citations.js'

function escapeCell(s) {
  return String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .slice(0, 200)
}

function fmtDate(d) {
  if (!d) return '—'
  const t = Date.parse(d)
  if (!t || Number.isNaN(t)) return '—'
  const date = new Date(t)
  return date.toISOString().slice(0, 10)
}

function host(u) {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
}

// Render news cards as Markdown (Algeria-first ordering preserved by router).
export function renderNewsCards(cards = [], { lang = 'ar' } = {}) {
  if (!cards.length) return ''
  const heading = lang === 'ar' ? '## 📰 آخر الأخبار' : '## 📰 Latest News'
  const lines = [heading, '']
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const date = fmtDate(c.pubDate)
    const tierFlag = c.tier === 1 ? '🇩🇿' : c.tier === 2 ? '🌐' : '🌍'
    const src = c.source || host(c.url)
    lines.push(`**${i + 1}. ${tierFlag} ${c.title}**`)
    if (c.excerpt) lines.push(`   ${c.excerpt}`)
    lines.push(`   _${src} • ${date}_ — [${lang === 'ar' ? 'الرابط' : 'open'}](${c.url})`)
    lines.push('')
  }
  return lines.join('\n')
}

// Render a generic table (used by structured + github engines).
export function renderTable(rows = [], columns = null, { title = '' } = {}) {
  if (!rows.length) return ''
  const cols = columns || Array.from(new Set(rows.flatMap(r => Object.keys(r))))
  const head = `| ${cols.join(' | ')} |`
  const sep  = `| ${cols.map(() => '---').join(' | ')} |`
  const body = rows.map(r => `| ${cols.map(c => escapeCell(r[c])).join(' | ')} |`).join('\n')
  return `${title ? `## ${title}\n\n` : ''}${head}\n${sep}\n${body}`
}

export function renderGithubTable(items = [], { lang = 'ar' } = {}) {
  if (!items.length) return ''
  const title = lang === 'ar' ? '🐙 أفضل المستودعات' : '🐙 Top Repositories'
  const rows = items.map(i => ({
    Repo: `[${i.fullName || i.repo}](${i.url})`,
    '⭐': i.stars ?? '—',
    Lang: i.language || i.lang || '—',
    Updated: fmtDate(i.pushedAt || i.pushed),
    About: (i.description || '').slice(0, 100),
  }))
  return renderTable(rows, ['Repo', '⭐', 'Lang', 'Updated', 'About'], { title })
}

export function renderBuilderPlan(plan = {}, { lang = 'ar' } = {}) {
  if (!plan?.kind) return ''
  const heading = lang === 'ar' ? `## 🛠️ خطة بناء "${plan.name}"` : `## 🛠️ Build Plan — "${plan.name}"`
  const stack = plan.stack?.length ? `**Stack:** ${plan.stack.join(' • ')}` : ''
  const sections = plan.sections?.length
    ? `**${lang === 'ar' ? 'الأقسام' : 'Sections'}:**\n${plan.sections.map(s => `- ${s}`).join('\n')}`
    : ''
  const refs = plan.references?.length
    ? `**${lang === 'ar' ? 'مراجع GitHub' : 'GitHub references'}:**\n${plan.references.map(r => `- [${r.repo}](${r.url}) ⭐${r.stars} — ${r.description || ''}`).join('\n')}`
    : ''
  const arch = plan.architecture?.length
    ? `**${lang === 'ar' ? 'البنية' : 'Architecture'}:**\n\`\`\`\n${plan.architecture.join('\n')}\n\`\`\``
    : ''
  return [heading, stack, sections, arch, refs].filter(Boolean).join('\n\n')
}

export function renderCodeFiles(files = {}) {
  if (!files || !Object.keys(files).length) return ''
  const blocks = []
  for (const [path, content] of Object.entries(files)) {
    const ext = path.split('.').pop() || ''
    const lang = { ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', css: 'css', html: 'html', json: 'json' }[ext] || ext
    blocks.push(`#### \`${path}\`\n\`\`\`${lang}\n${content}\n\`\`\``)
  }
  return blocks.join('\n\n')
}

export function renderCitationsBlock(registry, { lang = 'ar' } = {}) {
  if (!registry?.length) return ''
  // Compact reference key (not a Perplexity-style "References" section — it's a
  // legend the UI can hide. Inline [n] markers remain the primary citation.)
  return ''  // intentionally empty: inline-only per Perplexity rules
}

// Master renderer: takes a smart-router payload and returns clean Markdown.
export function renderAnswer(payload = {}, { lang = 'ar' } = {}) {
  if (!payload || payload.ok === false) {
    return payload?.failsafe || (lang === 'ar'
      ? '⚠️ لم أجد بيانات كافية. حاول إعادة صياغة السؤال.'
      : '⚠️ Not enough data found. Please rephrase your query.')
  }

  const parts = []
  switch (payload.kind) {
    case 'news':
    case 'general': {
      parts.push(renderNewsCards(payload.cards || [], { lang }))
      break
    }
    case 'github': {
      parts.push(renderGithubTable(payload.table || [], { lang }))
      if (payload.insight) {
        const ins = payload.insight
        parts.push(
          `### 🔍 ${ins.repo}\n` +
          `**Stack:** ${(ins.stack || []).join(' • ')}\n\n` +
          `**README excerpt:**\n\n> ${(ins.readmeExcerpt || '').slice(0, 600).replace(/\n/g, '\n> ')}`,
        )
      }
      break
    }
    case 'builder': {
      parts.push(renderBuilderPlan(payload.plan, { lang }))
      if (payload.files) parts.push(renderCodeFiles(payload.files))
      if (payload.nextSteps?.length) {
        parts.push(`### ${lang === 'ar' ? 'الخطوات التالية' : 'Next steps'}\n${payload.nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`)
      }
      break
    }
    case 'structured': {
      if (payload.table?.length) parts.push(renderTable(
        payload.table.map(r => ({ Title: `[${r.title}](${r.url})`, Source: r.source, Date: fmtDate(r.date) })),
        ['Title', 'Source', 'Date'],
        { title: lang === 'ar' ? '📊 جدول النتائج' : '📊 Results table' },
      ))
      if (payload.repos?.length) parts.push(renderGithubTable(payload.repos, { lang }))
      break
    }
    default:
      if (payload.answer) parts.push(payload.answer)
  }

  let body = parts.filter(Boolean).join('\n\n')

  // Citations
  const sourceItems = []
  for (const arr of [payload.cards, payload.table, payload.code]) {
    if (Array.isArray(arr)) sourceItems.push(...arr)
  }
  const registry = buildCitations(sourceItems)
  if (registry.length) body = attachInlineCitations(body, registry)
  body = stripBibliography(body)

  return body
}

// Bundle the rendered Markdown with the citation registry for the API response.
export function buildResponseBundle(payload, { lang = 'ar' } = {}) {
  const sourceItems = []
  for (const arr of [payload?.cards, payload?.table, payload?.code]) {
    if (Array.isArray(arr)) sourceItems.push(...arr)
  }
  const registry = buildCitations(sourceItems)
  return {
    markdown: renderAnswer(payload, { lang }),
    citations: exportCitations(registry),
  }
}

// V3 Orchestrator — runs the full multi-agent flow against a Task/Bus.
// Selects relevant agents based on user query, runs them with explicit
// dependencies, then asks QA to validate.

import { NewsAgent }      from './agents/news-agent.js'
import { ResearchAgent }  from './agents/research-agent.js'
import { DevAgent }       from './agents/dev-agent.js'
import { ExecutionAgent } from './agents/execution-agent.js'
import { QAAgent }        from './agents/qa-agent.js'

export const AGENTS = {
  news: NewsAgent,
  research: ResearchAgent,
  dev: DevAgent,
  execution: ExecutionAgent,
  qa: QAAgent,
}

export function decideAgents(query) {
  const s = String(query || '').toLowerCase()
  const set = new Set()
  if (/news|أخبار|عاجل|actualit|info/.test(s))                          set.add('news')
  if (/research|search|cherche|بحث|trouve|find|sources/.test(s))       set.add('research')
  if (/build|create|generate|make|app|website|saas|dashboard|blog|cms|اصنع|بناء|انشئ|crée|construis|développe/.test(s)) {
    set.add('dev'); set.add('execution')
  }
  if (set.size === 0) set.add('research') // default
  set.add('qa')
  return Array.from(set)
}

export async function runAutonomous({ task, aiGenerate }) {
  const { bus, query, lang } = task
  bus.emit('task.start', { query, lang })

  const wanted = decideAgents(query)
  bus.emit('agent.thought', { agent: 'planner', text: `Selected agents: ${wanted.join(', ')}` })

  const ctx = { lang, query }

  try {
    if (wanted.includes('news')) {
      ctx.news = await NewsAgent.run({ query, lang, bus })
    }
    if (wanted.includes('research')) {
      ctx.research = await ResearchAgent.run({ query, lang, bus })
    }
    if (wanted.includes('dev')) {
      ctx.app = await DevAgent.run({ query, bus, ctx: { lang } })
    }
    if (wanted.includes('execution') && ctx.app) {
      ctx.deploy = await ExecutionAgent.run({ bus, ctx: { app: ctx.app } })
    }

    // Synthesis step (uses real AI to write a final summary in user's language)
    ctx.summary = await synthesize({ aiGenerate, query, lang, ctx, bus })

    // QA pass
    ctx.qa = await QAAgent.run({ bus, ctx })

    const result = {
      query, lang, agentsUsed: wanted,
      news:     ctx.news     ? { count: ctx.news.items.length, items: ctx.news.items } : null,
      research: ctx.research ? { count: ctx.research.sources.length, sources: ctx.research.sources } : null,
      app:      ctx.app      ? { template: ctx.app.template, title: ctx.app.title, fileCount: Object.keys(ctx.app.files).length, totalBytes: ctx.app.totalBytes } : null,
      deploy:   ctx.deploy   || null,
      summary:  ctx.summary  || null,
      qa:       ctx.qa,
    }
    bus.emit('task.done', { result })
    return result
  } catch (err) {
    bus.emit('task.error', { error: err.message || String(err) })
    throw err
  }
}

async function synthesize({ aiGenerate, query, lang, ctx, bus }) {
  bus.emit('agent.start', { agent: 'synthesis' })
  if (typeof aiGenerate !== 'function') {
    bus.emit('agent.error', { agent: 'synthesis', error: 'aiGenerate not provided' })
    return fallbackSummary(query, ctx, lang)
  }

  const sysParts = [
    `You are DZ Agent V3 — synthesizing the work of multiple specialized agents into one clear answer.`,
    lang === 'ar' ? 'أجب باللغة العربية الفصحى.'
      : lang === 'fr' ? 'Réponds en français.'
      : 'Respond in clear English.',
    `Be concrete and concise (≤ 200 words). Reference what each agent produced, then state the next concrete step for the user.`,
  ]
  const facts = []
  if (ctx.news?.items?.length)        facts.push(`NEWS AGENT (${ctx.news.items.length} items):\n` + ctx.news.items.slice(0, 5).map(it => `- ${it.title} — ${it.source}`).join('\n'))
  if (ctx.research?.sources?.length)  facts.push(`RESEARCH AGENT (${ctx.research.sources.length} sources):\n` + ctx.research.sources.slice(0, 5).map(s => `- ${s.title} (${s.url})`).join('\n'))
  if (ctx.app)                        facts.push(`DEV AGENT: generated ${ctx.app.template} (${Object.keys(ctx.app.files).length} files, ${ctx.app.totalBytes} bytes).`)
  if (ctx.deploy)                     facts.push(`EXECUTION AGENT: artifact ${ctx.deploy.artifactId}, downloadable at ${ctx.deploy.downloadPath}.`)

  const messages = [
    { role: 'system', content: sysParts.join('\n\n') + '\n\nAGENT FINDINGS:\n' + (facts.join('\n\n') || '(no findings)') },
    { role: 'user', content: query },
  ]

  try {
    const r = await aiGenerate({ messages, query, max_tokens: 800 })
    const content = r?.content?.trim()
    if (content && content.length > 30) {
      bus.emit('agent.result', { agent: 'synthesis', model: r.model, len: content.length })
      return content
    }
    bus.emit('agent.error', { agent: 'synthesis', error: 'empty AI output, using fallback' })
  } catch (err) {
    bus.emit('agent.error', { agent: 'synthesis', error: err.message })
  }
  return fallbackSummary(query, ctx, lang)
}

function fallbackSummary(query, ctx, lang) {
  const lines = []
  if (lang === 'ar') {
    lines.push(`✅ تم تنفيذ مهمتك: "${query}"`)
    if (ctx.news) lines.push(`- 📰 وكيل الأخبار: ${ctx.news.items.length} مقال.`)
    if (ctx.research) lines.push(`- 🔎 وكيل البحث: ${ctx.research.sources.length} مصدر.`)
    if (ctx.app) lines.push(`- 💻 وكيل التطوير: تم توليد ${ctx.app.template} (${Object.keys(ctx.app.files).length} ملفات).`)
    if (ctx.deploy) lines.push(`- 🚀 وكيل التنفيذ: حمّل النسخة من ${ctx.deploy.downloadPath}`)
  } else if (lang === 'fr') {
    lines.push(`✅ Tâche exécutée : « ${query} »`)
    if (ctx.news) lines.push(`- 📰 Agent News : ${ctx.news.items.length} articles.`)
    if (ctx.research) lines.push(`- 🔎 Agent Research : ${ctx.research.sources.length} sources.`)
    if (ctx.app) lines.push(`- 💻 Agent Dev : ${ctx.app.template} généré (${Object.keys(ctx.app.files).length} fichiers).`)
    if (ctx.deploy) lines.push(`- 🚀 Agent Execution : téléchargez depuis ${ctx.deploy.downloadPath}`)
  } else {
    lines.push(`✅ Task executed: "${query}"`)
    if (ctx.news) lines.push(`- 📰 News agent: ${ctx.news.items.length} articles.`)
    if (ctx.research) lines.push(`- 🔎 Research agent: ${ctx.research.sources.length} sources.`)
    if (ctx.app) lines.push(`- 💻 Dev agent: generated ${ctx.app.template} (${Object.keys(ctx.app.files).length} files).`)
    if (ctx.deploy) lines.push(`- 🚀 Execution agent: download at ${ctx.deploy.downloadPath}`)
  }
  return lines.join('\n')
}

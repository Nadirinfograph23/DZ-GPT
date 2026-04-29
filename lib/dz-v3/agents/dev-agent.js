// V3 Dev Agent — generates working web apps from a brief.
// Uses templates + AI to fill in app-specific files.

import { generateApp, listTemplates } from '../webapp-generator.js'

export const DevAgent = {
  name: 'dev',
  description: 'Generates full-stack web apps from templates (news-site, saas-starter, blog-cms)',

  async run({ query, bus, ctx = {} }) {
    bus.emit('agent.start', { agent: 'dev' })
    const lower = String(query || '').toLowerCase()
    let template = ctx.template
    if (!template) {
      if (/news|أخبار|actualit/.test(lower)) template = 'news-site'
      else if (/blog|مدونة|cms/.test(lower)) template = 'blog-cms'
      else if (/saas|dashboard|admin|tableau/.test(lower)) template = 'saas-starter'
      else template = 'saas-starter'
    }
    bus.emit('agent.thought', { agent: 'dev', text: `Selected template: ${template}` })

    const app = generateApp(template, {
      brief: query,
      title: ctx.title || extractTitle(query),
      lang: ctx.lang || 'en',
    })
    bus.emit('agent.tool', { agent: 'dev', tool: 'webapp-generator', files: Object.keys(app.files).length })
    bus.emit('agent.result', { agent: 'dev', template, fileCount: Object.keys(app.files).length, totalBytes: app.totalBytes })
    return app
  },

  templates: () => listTemplates(),
}

function extractTitle(query) {
  const m = String(query || '').match(/(?:called|named|nommé|اسمه|called)\s+["']?([^"'\n]+)["']?/i)
  if (m) return m[1].trim()
  return 'My App'
}

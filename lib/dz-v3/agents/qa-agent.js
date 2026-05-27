// V3 QA Agent — validates the multi-agent task result before final delivery.
// Runs cheap structural checks (no AI). Catches the biggest classes of bugs:
// empty outputs, missing fields, broken links, suspiciously short responses.

export const QAAgent = {
  name: 'qa',
  description: 'Validates outputs for empty/incomplete/malformed responses',

  async run({ bus, ctx = {} }) {
    bus.emit('agent.start', { agent: 'qa' })
    const issues = []
    const { news, research, app, deploy, summary } = ctx

    if (news !== undefined) {
      if (!Array.isArray(news?.items) || news.items.length === 0) issues.push('news: empty result set')
      else {
        const bad = news.items.filter(it => !it.title || it.title.length < 5)
        if (bad.length) issues.push(`news: ${bad.length}/${news.items.length} items missing title`)
      }
    }
    if (research !== undefined) {
      if (!Array.isArray(research?.sources) || research.sources.length === 0) issues.push('research: no sources found')
    }
    if (app !== undefined) {
      if (!app?.files || Object.keys(app.files).length < 3) issues.push('dev: app has fewer than 3 files')
      if (!app?.files?.['package.json']) issues.push('dev: missing package.json')
      if (!app?.files?.['README.md']) issues.push('dev: missing README.md')
    }
    if (deploy !== undefined) {
      if (!deploy?.downloadPath) issues.push('execution: no downloadPath produced')
    }
    if (summary !== undefined) {
      const s = String(summary || '').trim()
      if (s.length < 20) {
        issues.push('summary: too short or empty')
      } else {
        // Content quality: minimum word count
        const wordCount = s.split(/\s+/).filter(Boolean).length
        if (wordCount < 8) issues.push(`summary: too few words (${wordCount} < 8)`)
        // Content quality: detect hallucination pattern — "(no findings)" passed through
        if (s.includes('(no findings)')) issues.push('summary: contains unresolved "(no findings)" placeholder')
        // Content quality: detect repetitive output (same phrase >4 times)
        const phrases = s.match(/.{10,40}/g) || []
        const phraseCounts = {}
        for (const p of phrases) { phraseCounts[p] = (phraseCounts[p] || 0) + 1 }
        const maxRepeat = Math.max(...Object.values(phraseCounts))
        if (maxRepeat > 4) issues.push(`summary: highly repetitive content detected (phrase repeated ${maxRepeat}x)`)
      }
    }

    const ok = issues.length === 0
    bus.emit('agent.result', { agent: 'qa', ok, issues })
    return { ok, issues }
  },
}

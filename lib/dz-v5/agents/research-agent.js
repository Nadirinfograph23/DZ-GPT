/**
 * DZ Agent V5 — Research Agent
 * Specialized agent for web research, information gathering, and synthesis.
 * Inspired by Manus's research loop.
 */

export class ResearchAgent {
  async execute({ step, context, tools, ai, emit }) {
    const { description, tools: stepTools = [], expected_output } = step
    const goal = context.goal

    emit({ type: 'agent_thinking', agent: 'research', message: 'Planning research...' })

    // Step 1: Generate search queries
    const queryResult = await ai({
      messages: [
        {
          role: 'system',
          content: `You are a research planning AI. Generate 2-3 specific search queries to answer the research question.
Return ONLY a JSON array of strings: ["query 1", "query 2", "query 3"]`,
        },
        {
          role: 'user',
          content: `Research task: ${description}\nGoal: ${goal}`,
        },
      ],
      query: description,
      max_tokens: 300,
    })

    let queries = [description]
    try {
      const m = queryResult?.content?.match(/\[[\s\S]*\]/)
      if (m) queries = JSON.parse(m[0]).slice(0, 3)
    } catch {}

    // Step 2: Execute searches
    const searchResults = []
    const hasSearch = stepTools.includes('web_search') && tools.get('web_search')
    const hasBrowser = stepTools.includes('browser') && tools.get('browser')

    if (hasSearch) {
      for (const query of queries.slice(0, 2)) {
        emit({ type: 'tool_call', tool: 'web_search', step: step.id, query })
        const result = await tools.call('web_search', { query }, context)
        if (result?.output?.length > 0) {
          searchResults.push({ query, results: result.output })
          emit({ type: 'tool_result', tool: 'web_search', ok: true, preview: `${result.output.length} results for: ${query}` })
        } else {
          emit({ type: 'tool_result', tool: 'web_search', ok: false, preview: result.error || 'No results' })
        }
      }
    }

    // Step 3: Browse top URLs for deeper content
    if (hasBrowser && searchResults.length > 0) {
      const topUrls = searchResults
        .flatMap(sr => sr.results || [])
        .slice(0, 2)
        .map(r => r.url)
        .filter(Boolean)

      for (const url of topUrls) {
        emit({ type: 'tool_call', tool: 'browser', step: step.id, url })
        const browseResult = await tools.call('browser', { url, action: 'read' }, context)
        if (browseResult?.output && !browseResult.error) {
          searchResults.push({ url, content: browseResult.output.slice(0, 3000) })
          emit({ type: 'tool_result', tool: 'browser', ok: true, preview: `Read ${browseResult.fullLength || '?'} chars from ${new URL(url).hostname}` })
        }
      }
    }

    // If no tools, use AI knowledge
    if (searchResults.length === 0) {
      emit({ type: 'agent_thinking', agent: 'research', message: 'Using AI knowledge base...' })
      const aiResult = await ai({
        messages: [
          {
            role: 'system',
            content: `You are a knowledgeable research assistant. Answer comprehensively using your training knowledge. 
Note: you cannot access the internet in this mode. Provide the best answer from your knowledge.`,
          },
          { role: 'user', content: `Research: ${description}\n\nGoal: ${goal}` },
        ],
        query: description,
        max_tokens: 2000,
      })
      return { output: aiResult?.content || 'No information found', agent: 'research', source: 'ai_knowledge' }
    }

    // Step 4: Synthesize research into final answer
    emit({ type: 'agent_thinking', agent: 'research', message: 'Synthesizing research...' })

    const researchContext = searchResults.map(sr => {
      if (sr.results) {
        return `Search: "${sr.query}"\nResults:\n${sr.results.map(r => `- ${r.title}: ${r.snippet || ''}`).join('\n')}`
      }
      if (sr.content) {
        return `From ${sr.url}:\n${sr.content.slice(0, 1500)}`
      }
      return ''
    }).filter(Boolean).join('\n\n---\n\n')

    const synthesisResult = await ai({
      messages: [
        {
          role: 'system',
          content: `You are a research synthesizer. Combine the search results into a comprehensive, accurate answer.
- Use markdown formatting
- Include key facts and sources where possible
- Be thorough but concise
- Cite sources when available`,
        },
        {
          role: 'user',
          content: `Research question: ${description}
Goal: ${goal}
Expected output: ${expected_output || 'Comprehensive research report'}

Research gathered:
${researchContext}

Synthesize this into the final answer:`,
        },
      ],
      query: description,
      max_tokens: 2500,
    })

    return {
      output: synthesisResult?.content || 'Research completed',
      searchesPerformed: searchResults.filter(r => r.results).length,
      pagesRead: searchResults.filter(r => r.content).length,
      agent: 'research',
    }
  }
}

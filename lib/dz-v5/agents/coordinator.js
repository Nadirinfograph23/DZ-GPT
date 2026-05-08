/**
 * DZ Agent V5 — Agent Coordinator
 * Routes each execution step to the right specialized agent.
 * Acts as the brain that decides WHO does WHAT.
 */

import { CodingAgent } from './coding-agent.js'
import { ResearchAgent } from './research-agent.js'

// Lazy-load agents to avoid circular deps
const AGENT_MAP = {
  coordinator: null, // handled inline
  coding: CodingAgent,
  research: ResearchAgent,
  web: ResearchAgent,     // alias — research handles web tasks
  file: null,             // handled inline via file tools
  devops: CodingAgent,    // coding agent handles devops
  reviewer: CodingAgent,  // reviewer uses coding agent
  memory: null,           // handled inline
}

export class AgentCoordinator {
  constructor() {
    this._agents = {}
  }

  _getAgent(name) {
    if (!this._agents[name]) {
      const AgentClass = AGENT_MAP[name]
      if (!AgentClass) return null
      this._agents[name] = new AgentClass()
    }
    return this._agents[name]
  }

  async run({ agentName, step, context, tools, ai, emit }) {
    const agent = this._getAgent(agentName)

    emit({ type: 'agent_active', agent: agentName, step: step.id })

    // Coordinator handles simple orchestration inline
    if (agentName === 'coordinator' || !agent) {
      return this._runInline(step, context, tools, ai, emit)
    }

    return agent.execute({ step, context, tools, ai, emit })
  }

  async _runInline(step, context, tools, ai, emit) {
    // For each tool in the step, call it and collect results
    const toolResults = []

    for (const toolName of (step.tools || [])) {
      if (toolName === 'ai_think') continue // handled by AI synthesis below

      const tool = tools.get(toolName)
      if (!tool) {
        emit({ type: 'tool_skip', tool: toolName, reason: 'not found' })
        continue
      }

      emit({ type: 'tool_call', tool: toolName, step: step.id })
      const input = this._buildToolInput(toolName, step, context)
      const result = await tools.call(toolName, input, context)
      emit({ type: 'tool_result', tool: toolName, ok: !result.error, preview: JSON.stringify(result?.output || result?.error || '').slice(0, 150) })
      toolResults.push({ tool: toolName, result })
    }

    // Use AI to synthesize tool results + generate final step output
    const toolContext = toolResults.map(tr =>
      `${tr.tool}: ${JSON.stringify(tr.result?.output || tr.result?.error || 'no output').slice(0, 500)}`
    ).join('\n')

    const prevContext = (context.previousResults || [])
      .map(r => JSON.stringify(r?.output || r).slice(0, 200))
      .join('\n')

    emit({ type: 'agent_thinking', agent: 'coordinator', message: 'Synthesizing results...' })

    const result = await ai({
      messages: [
        {
          role: 'system',
          content: `You are DZ Agent — an autonomous AI assistant. Complete the given step precisely and concisely.
Return your response in this format: provide the actual output/answer, not meta-commentary about what you're doing.`,
        },
        {
          role: 'user',
          content: `Overall goal: ${context.goal}

Current step: ${step.description}
Expected output: ${step.expected_output || 'Complete the step'}

${prevContext ? `Previous steps context:\n${prevContext}\n` : ''}
${toolContext ? `Tool results:\n${toolContext}\n` : ''}

Complete this step and provide the output:`,
        },
      ],
      query: step.description,
      max_tokens: 2000,
    })

    return {
      output: result?.content || 'Step completed',
      agent: 'coordinator',
      toolsUsed: toolResults.map(t => t.tool),
    }
  }

  _buildToolInput(toolName, step, context) {
    const goal = step.description
    const prevOutput = context.previousResults?.[0]?.output

    if (toolName === 'web_search') return { query: goal }
    if (toolName === 'browser') return { url: this._extractUrl(goal) || this._extractUrl(prevOutput) || goal, action: 'read' }
    if (toolName === 'code_exec') return { code: this._extractCode(prevOutput) || `// No code to execute for: ${goal}`, language: 'javascript' }
    if (toolName === 'file_read') return { path: this._extractPath(goal) || 'workspace/', action: 'list' }
    if (toolName === 'file_write') return { path: `workspace/tasks/${Date.now()}.txt`, content: prevOutput || goal, action: 'write' }
    if (toolName === 'github') return { action: 'search_repos', query: goal }
    if (toolName === 'memory_search') return { query: goal }
    if (toolName === 'youtube_search') return { query: goal }
    return { query: goal }
  }

  _extractUrl(text) {
    if (!text) return null
    const m = String(text).match(/https?:\/\/[^\s'"<>)]+/)
    return m ? m[0] : null
  }

  _extractPath(text) {
    if (!text) return null
    const m = String(text).match(/workspace\/[\w/.-]+/)
    return m ? m[0] : null
  }

  _extractCode(text) {
    if (!text) return null
    const m = String(text).match(/```(?:js|javascript|python|py|bash|sh)?\n([\s\S]+?)```/)
    return m ? m[1] : null
  }
}

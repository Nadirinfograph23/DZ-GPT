/**
 * DZ Agent V5 — Coding Agent
 * Specialized agent for software engineering tasks.
 * Inspired by Devin's software engineering loop.
 */

export class CodingAgent {
  async execute({ step, context, tools, ai, emit }) {
    const { description, tools: stepTools = [], expected_output } = step
    const goal = context.goal

    emit({ type: 'agent_thinking', agent: 'coding', message: 'Analyzing coding task...' })

    // Step 1: Understand the coding task
    const analysisResult = await ai({
      messages: [
        {
          role: 'system',
          content: `You are a senior software engineer. Analyze the coding task and determine:
1. What language/framework to use
2. What the code should do
3. Any edge cases to handle
Return a brief analysis (2-3 sentences), then immediately provide the complete code solution.

Always format code in proper markdown code blocks with language specified.
Be complete and production-ready. Add comments for clarity.`,
        },
        {
          role: 'user',
          content: `Goal: ${goal}
Task: ${description}
Expected: ${expected_output || 'Working code solution'}

${context.previousResults?.length > 0 ? `Previous context:\n${context.previousResults.map(r => JSON.stringify(r?.output || r).slice(0, 300)).join('\n')}` : ''}

Provide the complete code solution:`,
        },
      ],
      query: description,
      max_tokens: 3000,
    })

    const codeResponse = analysisResult?.content || ''
    emit({ type: 'agent_output', agent: 'coding', preview: codeResponse.slice(0, 100) })

    // Step 2: Try to execute the code if exec tool is available
    const hasExec = stepTools.includes('code_exec') && tools.get('code_exec')
    if (hasExec) {
      const codeBlock = this._extractCode(codeResponse)
      if (codeBlock) {
        emit({ type: 'tool_call', tool: 'code_exec', step: step.id })
        const execResult = await tools.call('code_exec', {
          code: codeBlock.code,
          language: codeBlock.lang,
        }, context)
        emit({ type: 'tool_result', tool: 'code_exec', ok: !execResult.error, preview: String(execResult.output || execResult.error || '').slice(0, 100) })

        // Step 3: If execution failed, debug and fix
        if (execResult.error || String(execResult.output).includes('Error:')) {
          emit({ type: 'agent_thinking', agent: 'coding', message: 'Debugging...' })
          const fixResult = await ai({
            messages: [
              { role: 'system', content: 'You are a debugging expert. Fix the code error and return the corrected complete code.' },
              {
                role: 'user',
                content: `Original code:\n\`\`\`${codeBlock.lang}\n${codeBlock.code}\n\`\`\`\n\nError:\n${execResult.output || execResult.error}\n\nProvide the fixed code:`,
              },
            ],
            query: `fix: ${execResult.error || execResult.output}`,
            max_tokens: 2000,
          })

          const fixedCode = fixResult?.content || codeResponse
          return {
            output: fixedCode,
            executionOutput: execResult.output,
            fixed: true,
            agent: 'coding',
          }
        }

        return {
          output: codeResponse,
          executionOutput: execResult.output,
          executionSuccess: !execResult.error,
          agent: 'coding',
        }
      }
    }

    // Step 4: Save to workspace if file tool available
    const hasFileWrite = stepTools.includes('file_write') && tools.get('file_write')
    if (hasFileWrite) {
      const codeBlock = this._extractCode(codeResponse)
      if (codeBlock) {
        const ext = { javascript: '.js', python: '.py', typescript: '.ts', bash: '.sh' }[codeBlock.lang] || '.txt'
        const filename = `workspace/tasks/${step.id}-output${ext}`
        emit({ type: 'tool_call', tool: 'file_write', step: step.id })
        await tools.call('file_write', { path: filename, content: codeBlock.code, action: 'write' }, context)
        emit({ type: 'tool_result', tool: 'file_write', ok: true, preview: `Saved to ${filename}` })
        return { output: codeResponse, savedTo: filename, agent: 'coding' }
      }
    }

    return { output: codeResponse, agent: 'coding' }
  }

  _extractCode(text) {
    if (!text) return null
    const m = text.match(/```(javascript|js|typescript|ts|python|py|bash|sh|java|go|rust|cpp|c|html|css|json|yaml)?\n?([\s\S]+?)```/)
    if (!m) return null
    return { lang: m[1] || 'javascript', code: m[2].trim() }
  }
}

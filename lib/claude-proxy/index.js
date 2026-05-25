/**
 * DZ Agent — Anthropic-Compatible Proxy
 * Inspired by: github.com/Alishahryar1/free-claude-code
 *
 * Routes claude-* model requests to free providers:
 *   claude-opus-*   → NVIDIA NIM nemotron-super-120b  | fallback: OpenRouter
 *   claude-sonnet-* → Groq llama-3.3-70b-versatile
 *   claude-haiku-*  → Groq llama-3.1-8b-instant
 *
 * Exposes: POST /api/claude-proxy/v1/messages  (Anthropic Messages API compatible)
 *          GET  /api/claude-proxy/v1/models
 */

import { Router } from 'express'

const router = Router()

// ── Model routing table ────────────────────────────────────────────────────────
const MODEL_ROUTES = {
  // Opus → heaviest free model (NVIDIA NIM)
  opus:   { provider: 'nvidia', model: 'nvidia/llama-3.3-nemotron-super-49b-v1' },
  // Sonnet → best Groq model
  sonnet: { provider: 'groq',   model: 'llama-3.3-70b-versatile' },
  // Haiku → fast Groq model
  haiku:  { provider: 'groq',   model: 'llama-3.1-8b-instant' },
  // Default fallback
  default:{ provider: 'groq',   model: 'llama-3.3-70b-versatile' },
}

function resolveRoute(model = '') {
  const m = model.toLowerCase()
  if (m.includes('opus'))   return MODEL_ROUTES.opus
  if (m.includes('sonnet')) return MODEL_ROUTES.sonnet
  if (m.includes('haiku'))  return MODEL_ROUTES.haiku
  return MODEL_ROUTES.default
}

// ── Format conversion: Anthropic → OpenAI ────────────────────────────────────
function anthropicToOpenAIMessages(messages = []) {
  const result = []
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content })
      continue
    }
    if (!Array.isArray(msg.content)) continue

    // Collect text + tool_use + tool_result blocks
    const textParts = []
    const toolCalls = []
    const toolResults = []

    for (const block of msg.content) {
      if (block.type === 'text') {
        textParts.push(block.text || '')
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input || {}),
          },
        })
      } else if (block.type === 'tool_result') {
        const content = Array.isArray(block.content)
          ? block.content.map(c => c.text || '').join('\n')
          : (block.content || '')
        toolResults.push({ tool_use_id: block.tool_use_id, content })
      }
    }

    if (toolResults.length > 0) {
      // Each tool_result becomes a separate OpenAI tool message
      for (const tr of toolResults) {
        result.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content })
      }
    } else if (toolCalls.length > 0) {
      result.push({
        role: 'assistant',
        content: textParts.join('\n') || null,
        tool_calls: toolCalls,
      })
    } else {
      result.push({ role: msg.role, content: textParts.join('\n') })
    }
  }
  return result
}

// ── Format conversion: Anthropic tools → OpenAI functions ─────────────────────
function anthropicToOpenAITools(tools = []) {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.input_schema || { type: 'object', properties: {} },
    },
  }))
}

// ── SSE helpers ───────────────────────────────────────────────────────────────
function sseEvent(res, data) {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
    if (typeof res.flush === 'function') res.flush()
  } catch (_) {}
}

// ── Call Groq with native function calling ────────────────────────────────────
async function callGroqStreaming(messages, tools, model, res, systemPrompt) {
  const key = process.env.AI_API_KEY || process.env.GROQ_API_KEY || ''
  if (!key) throw new Error('No Groq API key configured (AI_API_KEY)')

  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  const body = {
    model,
    messages: allMessages,
    max_tokens: 4096,
    temperature: 0,
    stream: false,
    ...(tools.length > 0 && {
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: true,
    }),
  }

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })

  if (!r.ok) {
    const err = await r.text()
    throw new Error(`Groq error ${r.status}: ${err.slice(0, 200)}`)
  }

  return await r.json()
}

// ── Call NVIDIA NIM ───────────────────────────────────────────────────────────
async function callNvidiaStreaming(messages, tools, model, systemPrompt) {
  const key = process.env.NVIDIA_API_KEY || ''
  if (!key) {
    // Fallback to Groq sonnet-class model
    return callGroqStreaming(messages, tools, 'llama-3.3-70b-versatile', null, systemPrompt)
  }

  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  const body = {
    model,
    messages: allMessages,
    max_tokens: 4096,
    temperature: 0,
    stream: false,
    ...(tools.length > 0 && { tools, tool_choice: 'auto' }),
  }

  const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  })

  if (!r.ok) {
    // Fallback to Groq on NVIDIA failure
    console.warn('[claude-proxy] NVIDIA failed, falling back to Groq:', r.status)
    return callGroqStreaming(messages, tools, 'llama-3.3-70b-versatile', null, systemPrompt)
  }

  return await r.json()
}

// ── Convert OpenAI response → Anthropic SSE stream ────────────────────────────
function streamOpenAIAsAnthropic(openaiResp, res) {
  const msgId = `msg_${Date.now()}`
  const choice = openaiResp.choices?.[0]
  const message = choice?.message || {}
  const stopReason = choice?.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn'

  // message_start
  sseEvent(res, {
    type: 'message_start',
    message: { id: msgId, type: 'message', role: 'assistant', content: [], model: openaiResp.model, stop_reason: null },
  })

  let blockIdx = 0

  // Text block
  if (message.content) {
    sseEvent(res, { type: 'content_block_start', index: blockIdx, content_block: { type: 'text', text: '' } })
    sseEvent(res, { type: 'content_block_delta', index: blockIdx, delta: { type: 'text_delta', text: message.content } })
    sseEvent(res, { type: 'content_block_stop', index: blockIdx })
    blockIdx++
  }

  // Tool use blocks
  if (message.tool_calls?.length > 0) {
    for (const tc of message.tool_calls) {
      const toolBlock = {
        type: 'tool_use',
        id: tc.id || `toolu_${Date.now()}_${blockIdx}`,
        name: tc.function?.name || '',
        input: {},
      }
      try { toolBlock.input = JSON.parse(tc.function?.arguments || '{}') } catch (_) {}

      sseEvent(res, { type: 'content_block_start', index: blockIdx, content_block: toolBlock })
      sseEvent(res, {
        type: 'content_block_delta',
        index: blockIdx,
        delta: { type: 'input_json_delta', partial_json: tc.function?.arguments || '{}' },
      })
      sseEvent(res, { type: 'content_block_stop', index: blockIdx })
      blockIdx++
    }
  }

  // message_delta + message_stop
  sseEvent(res, { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null } })
  sseEvent(res, { type: 'message_stop' })
}

// ── GET /v1/models ─────────────────────────────────────────────────────────────
router.get('/v1/models', (_req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'claude-opus-4-5',            object: 'model', created: 1700000000, owned_by: 'dz-proxy' },
      { id: 'claude-sonnet-4-5',          object: 'model', created: 1700000000, owned_by: 'dz-proxy' },
      { id: 'claude-haiku-4-5',           object: 'model', created: 1700000000, owned_by: 'dz-proxy' },
      { id: 'claude-3-5-sonnet-20241022', object: 'model', created: 1700000000, owned_by: 'dz-proxy' },
      { id: 'claude-3-5-haiku-20241022',  object: 'model', created: 1700000000, owned_by: 'dz-proxy' },
      { id: 'claude-3-opus-20240229',     object: 'model', created: 1700000000, owned_by: 'dz-proxy' },
    ],
  })
})

// ── POST /v1/messages ─────────────────────────────────────────────────────────
router.post('/v1/messages', async (req, res) => {
  const { model = 'claude-sonnet-4-5', messages = [], system, tools = [], max_tokens, stream: wantStream = true } = req.body

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  try {
    const route = resolveRoute(model)
    const openAIMessages = anthropicToOpenAIMessages(messages)
    const openAITools = anthropicToOpenAITools(tools)
    const systemPrompt = typeof system === 'string' ? system : (system?.[0]?.text || null)

    console.log(`[claude-proxy] ${model} → ${route.provider}/${route.model} | tools:${openAITools.length}`)

    let openaiResp
    if (route.provider === 'nvidia') {
      openaiResp = await callNvidiaStreaming(openAIMessages, openAITools, route.model, systemPrompt)
    } else {
      openaiResp = await callGroqStreaming(openAIMessages, openAITools, route.model, null, systemPrompt)
    }

    streamOpenAIAsAnthropic(openaiResp, res)
    res.end()
  } catch (err) {
    console.error('[claude-proxy] Error:', err.message)
    sseEvent(res, { type: 'error', error: { type: 'api_error', message: err.message } })
    res.end()
  }
})

// ── Direct JSON call (non-streaming, for internal use) ────────────────────────
export async function callClaudeProxy({ model = 'claude-sonnet-4-5', messages = [], system, tools = [], max_tokens = 4096 }) {
  const route = resolveRoute(model)
  const openAIMessages = anthropicToOpenAIMessages(messages)
  const openAITools = anthropicToOpenAITools(tools)
  const systemPrompt = typeof system === 'string' ? system : (system?.[0]?.text || null)

  let openaiResp
  if (route.provider === 'nvidia') {
    openaiResp = await callNvidiaStreaming(openAIMessages, openAITools, route.model, systemPrompt)
  } else {
    openaiResp = await callGroqStreaming(openAIMessages, openAITools, route.model, null, systemPrompt)
  }

  const choice = openaiResp.choices?.[0]
  const message = choice?.message || {}
  const stopReason = choice?.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn'

  // Build Anthropic-format content blocks
  const content = []
  if (message.content) content.push({ type: 'text', text: message.content })
  if (message.tool_calls?.length > 0) {
    for (const tc of message.tool_calls) {
      let input = {}
      try { input = JSON.parse(tc.function?.arguments || '{}') } catch (_) {}
      content.push({
        type: 'tool_use',
        id: tc.id || `toolu_${Date.now()}`,
        name: tc.function?.name || '',
        input,
      })
    }
  }

  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    stop_reason: stopReason,
    model: `${route.provider}/${route.model}`,
    usage: openaiResp.usage || {},
  }
}

export default router

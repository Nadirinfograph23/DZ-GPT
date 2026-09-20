/**
 * Keyless AI fallbacks.
 *
 * These routes intentionally do not read or require an API key. They are
 * anonymous/free fallbacks, so they must stay last in the paid/keyed chain
 * and use short timeouts to avoid holding a chat request open.
 */

const POLLINATIONS_TIMEOUT_MS = 9000
const LLM7_TIMEOUT_MS = 9000
const AI_HORDE_TIMEOUT_MS = 15000
const KEYLESS_COOLDOWN_MS = 45000

const KEYLESS_ROUTES = Object.freeze([
  'llm7',
  'pollinations-chat',
  'pollinations-text',
  'ai-horde',
])

const routeState = new Map()
let routeCursor = 0

function getRouteState(routeId) {
  if (!routeState.has(routeId)) {
    routeState.set(routeId, { failures: 0, cooldownUntil: 0, lastUsed: 0 })
  }
  return routeState.get(routeId)
}

function markRouteSuccess(routeId) {
  const state = getRouteState(routeId)
  state.failures = 0
  state.cooldownUntil = 0
  state.lastUsed = Date.now()
}

function markRouteFailure(routeId) {
  const state = getRouteState(routeId)
  state.failures += 1
  state.lastUsed = Date.now()
  state.cooldownUntil = Date.now() + Math.min(KEYLESS_COOLDOWN_MS * state.failures, 5 * 60 * 1000)
}

function getRotatedRoutes() {
  const now = Date.now()
  const start = routeCursor++ % KEYLESS_ROUTES.length
  const rotated = KEYLESS_ROUTES.map((_, index) => KEYLESS_ROUTES[(start + index) % KEYLESS_ROUTES.length])
  const available = rotated.filter(routeId => getRouteState(routeId).cooldownUntil <= now)
  if (available.length) return available
  return [...rotated].sort((a, b) => getRouteState(a).cooldownUntil - getRouteState(b).cooldownUntil)
}

function validateContent(content) {
  return typeof content === 'string' && content.trim().length >= 5
}

function getPrompt(messages) {
  const lastUser = [...(messages || [])].reverse().find(message => message?.role === 'user')
  return String(lastUser?.content || '').trim()
}

function getResponseContent(data) {
  if (typeof data === 'string') return data
  return data?.choices?.[0]?.message?.content
    || data?.content
    || ''
}

export async function callLLM7(messages, max_tokens) {
  const response = await fetch('https://api.llm7.io/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // LLM7's anonymous route selects an available free model behind
      // "default"; named models require an API key.
      model: 'default',
      messages,
      max_tokens: Math.min(Number(max_tokens) || 2048, 4096),
    }),
    signal: AbortSignal.timeout(LLM7_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`LLM7 HTTP ${response.status}`)
  }
  const data = await response.json()
  return {
    content: getResponseContent(data),
    model: `llm7:${data?.model || 'default'}`,
  }
}

export async function callPollinationsChat(messages, max_tokens) {
  const response = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // "openai" is the currently supported anonymous legacy model. The old
      // "openai-large" value now returns 404.
      model: 'openai',
      messages,
      max_tokens: Math.min(Number(max_tokens) || 2048, 4096),
      private: true,
    }),
    signal: AbortSignal.timeout(POLLINATIONS_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Pollinations chat HTTP ${response.status}`)
  }
  return getResponseContent(await response.json())
}

export async function callPollinationsText(messages) {
  const prompt = getPrompt(messages)
  if (!prompt) return ''

  // Keep the GET fallback small and explicit. It is useful when the
  // OpenAI-compatible anonymous route is busy or temporarily unavailable.
  const response = await fetch(
    `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&private=true`,
    { signal: AbortSignal.timeout(POLLINATIONS_TIMEOUT_MS) },
  )
  if (!response.ok) {
    throw new Error(`Pollinations text HTTP ${response.status}`)
  }
  return response.text()
}

export async function callAIHorde(messages, max_tokens) {
  const prompt = (messages || [])
    .map(message => `${message?.role === 'assistant' ? 'Assistant' : message?.role === 'system' ? 'System' : 'User'}: ${message?.content || ''}`)
    .join('\n')
    .trim()
  if (!prompt) return ''

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Client-Agent': 'DZ-Agent:1.0:anonymous',
    apikey: '0000000000',
  }
  const createResponse = await fetch('https://aihorde.net/api/v2/generate/text/async', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      models: ['koboldcpp/Hermes-3-Llama-3.1-8B'],
      params: { max_length: Math.min(Number(max_tokens) || 1024, 2048), temperature: 0.7 },
    }),
    signal: AbortSignal.timeout(AI_HORDE_TIMEOUT_MS),
  })
  if (!createResponse.ok) throw new Error(`AI Horde HTTP ${createResponse.status}`)
  const job = await createResponse.json()
  if (!job?.id) throw new Error('AI Horde returned no job id')

  const deadline = Date.now() + AI_HORDE_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1200))
    const statusResponse = await fetch(`https://aihorde.net/api/v2/generate/text/status/${encodeURIComponent(job.id)}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    })
    if (!statusResponse.ok) throw new Error(`AI Horde status HTTP ${statusResponse.status}`)
    const status = await statusResponse.json()
    const content = status?.generations?.[0]?.text || ''
    if (status?.done && content) {
      return { content, model: `ai-horde:${status?.generations?.[0]?.model || 'anonymous'}` }
    }
  }
  throw new Error('AI Horde timed out while waiting for a worker')
}

/**
 * Try the two keyless routes sequentially. Sequential calls are intentional:
 * anonymous Pollinations traffic is queue-limited per IP and parallel calls
 * make a 429 more likely.
 */
export async function callKeylessAI(messages, max_tokens = 2048) {
  const routes = {
    llm7: () => callLLM7(messages, max_tokens),
    'pollinations-chat': () => callPollinationsChat(messages, max_tokens),
    'pollinations-text': () => callPollinationsText(messages),
    'ai-horde': () => callAIHorde(messages, max_tokens),
  }

  for (const routeId of getRotatedRoutes()) {
    try {
      const result = await routes[routeId]()
      const content = (result?.content || result || '').trim()
      if (validateContent(content)) {
        markRouteSuccess(routeId)
        return {
          content,
          provider: routeId,
          model: result?.model || `anonymous:${routeId}`,
        }
      }
      markRouteFailure(routeId)
    } catch (error) {
      markRouteFailure(routeId)
      console.warn(`[keyless-ai] ${routeId} failed:`, error.message)
    }
  }

  return null
}

export async function callKeylessRoute(routeId, messages, max_tokens = 2048) {
  if (routeId === 'llm7') return callLLM7(messages, max_tokens)
  if (routeId === 'pollinations-chat') return callPollinationsChat(messages, max_tokens)
  if (routeId === 'pollinations-text') return callPollinationsText(messages)
  if (routeId === 'ai-horde') return callAIHorde(messages, max_tokens)
  throw new Error(`Unknown keyless route: ${routeId}`)
}

export const KEYLESS_PROVIDER_STATUS = [
  {
    name: 'llm7',
    label: 'LLM7 anonymous free route',
    available: true,
    requiresKey: false,
    costLevel: 'free',
  },
  {
    name: 'pollinations-chat',
    label: 'Pollinations anonymous chat',
    available: true,
    requiresKey: false,
    costLevel: 'free',
  },
  {
    name: 'pollinations-text',
    label: 'Pollinations anonymous text',
    available: true,
    requiresKey: false,
    costLevel: 'free',
  },
  {
    name: 'ai-horde',
    label: 'AI Horde anonymous community route',
    available: true,
    requiresKey: false,
    costLevel: 'free',
  },
]
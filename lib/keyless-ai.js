/**
 * Keyless AI fallbacks.
 *
 * These routes intentionally do not read or require an API key. They are
 * anonymous/free fallbacks, so they must stay last in the paid/keyed chain
 * and use short timeouts to avoid holding a chat request open.
 */

const POLLINATIONS_TIMEOUT_MS = 9000
const LLM7_TIMEOUT_MS = 9000

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

/**
 * Try the two keyless routes sequentially. Sequential calls are intentional:
 * anonymous Pollinations traffic is queue-limited per IP and parallel calls
 * make a 429 more likely.
 */
export async function callKeylessAI(messages, max_tokens = 2048) {
  const routes = [
    { id: 'llm7', call: () => callLLM7(messages, max_tokens) },
    { id: 'pollinations-chat', call: () => callPollinationsChat(messages, max_tokens) },
    { id: 'pollinations-text', call: () => callPollinationsText(messages) },
  ]

  for (const route of routes) {
    try {
      const result = await route.call()
      const content = (result?.content || result || '').trim()
      if (validateContent(content)) {
        return {
          content,
          provider: route.id,
          model: result?.model || `pollinations:${route.id}`,
        }
      }
    } catch (error) {
      console.warn(`[keyless-ai] ${route.id} failed:`, error.message)
    }
  }

  return null
}

export async function callKeylessRoute(routeId, messages, max_tokens = 2048) {
  if (routeId === 'llm7') return callLLM7(messages, max_tokens)
  if (routeId === 'pollinations-chat') return callPollinationsChat(messages, max_tokens)
  if (routeId === 'pollinations-text') return callPollinationsText(messages)
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
]
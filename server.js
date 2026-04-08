import express from 'express'
import { createServer as createViteServer } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'
const PORT = 5000

const app = express()
app.use(express.json())

// ===== API ROUTE =====
app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body

  const apiKey = process.env.AI_API_KEY
  const apiUrl = process.env.AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions'

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured.' })
  }

  const groqModelMap = {
    'chatgpt': 'llama-3.3-70b-versatile',
    'llama-70b': 'llama-3.3-70b-versatile',
    'llama-8b': 'llama-3.1-8b-instant',
    'gpt-oss-120b': 'openai/gpt-oss-120b',
    'gpt-oss-20b': 'openai/gpt-oss-20b',
    'llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen': 'qwen/qwen3-32b',
    'compound': 'groq/compound',
    'compound-mini': 'groq/compound-mini',
    'deepseek-pdf': 'llama-3.3-70b-versatile',
    'ocr-dz': 'llama-3.3-70b-versatile',
  }

  const actualModel = groqModelMap[model] || model

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: actualModel,
        messages,
        max_tokens: 4096,
        temperature: 0.7,
        stream: false,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'API provider returned an error',
      })
    }

    let content = data.choices?.[0]?.message?.content || 'No response generated.'

    if (content) {
      const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (cleaned) content = cleaned
    }

    return res.status(200).json({ content })
  } catch (error) {
    console.error('Chat API error:', error)
    return res.status(500).json({ error: 'Failed to generate response. Please try again.' })
  }
})

// ===== DZ AGENT API ROUTE =====
app.post('/api/dz-agent-chat', async (req, res) => {
  const { messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array required.' })
  }

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content?.trim().toLowerCase() || ''

  // Local knowledge base: developer identity questions in Arabic, English, French
  const developerQuestions = [
    'من هو مطورك', 'من صنعك', 'من برمجك', 'من أنشأك', 'من طورك',
    'who is your developer', 'who made you', 'who created you', 'who built you', 'who programmed you',
    'qui est votre développeur', 'qui vous a créé', 'qui t\'a créé', 'qui vous a fait',
  ]
  const isDeveloperQuestion = developerQuestions.some(q => lastUserMessage.includes(q))

  if (isDeveloperQuestion) {
    return res.status(200).json({
      content: 'نذير حوامرية | Nadir Infograph, خبير في مجال الذكاء الاصطناعي 🇩🇿',
    })
  }

  // Try DeepSeek API (free tier) first, then fall back to Groq, then mock
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  const ollamaUrl = process.env.OLLAMA_PROXY_URL
  const groqKey = process.env.AI_API_KEY

  const systemPrompt = `You are DZ Agent, a helpful multilingual AI assistant created by Nadir Houamria (Nadir Infograph). You can respond in Arabic, English, or French depending on what language the user writes in. Be helpful, clear, and concise. Use markdown formatting when appropriate.`

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  // Try DeepSeek
  if (deepseekKey) {
    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: apiMessages,
          max_tokens: 2048,
          temperature: 0.7,
          stream: false,
        }),
      })
      const data = await response.json()
      if (response.ok) {
        let content = data.choices?.[0]?.message?.content || 'No response generated.'
        const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        if (cleaned) content = cleaned
        return res.status(200).json({ content })
      }
    } catch (err) {
      console.error('DeepSeek API error:', err)
    }
  }

  // Try Ollama proxy
  if (ollamaUrl) {
    try {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3',
          messages: apiMessages,
          stream: false,
        }),
      })
      const data = await response.json()
      if (response.ok) {
        return res.status(200).json({ content: data.message?.content || 'No response.' })
      }
    } catch (err) {
      console.error('Ollama API error:', err)
    }
  }

  // Try Groq (shared key with main app)
  if (groqKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: apiMessages,
          max_tokens: 2048,
          temperature: 0.7,
          stream: false,
        }),
      })
      const data = await response.json()
      if (response.ok) {
        let content = data.choices?.[0]?.message?.content || 'No response generated.'
        const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        if (cleaned) content = cleaned
        return res.status(200).json({ content })
      }
    } catch (err) {
      console.error('Groq fallback error:', err)
    }
  }

  // Fallback mock response when no API key is configured
  return res.status(200).json({
    content: 'مرحباً! أنا DZ Agent. لم يتم تكوين مفتاح API بعد، لكنني هنا للمساعدة.\n\nHello! I\'m DZ Agent. No API key is configured yet, but I\'m here to help once set up.\n\nBonjour ! Je suis DZ Agent. Aucune clé API n\'est configurée pour l\'instant.',
  })
})

// ===== SERVE FRONTEND =====
if (isProd) {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`)
  })
} else {
  // Dev: embed Vite as middleware so both API and frontend run on port 5000
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  })
  app.use(vite.middlewares)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dev server running on http://0.0.0.0:${PORT}`)
  })
}

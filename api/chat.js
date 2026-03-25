export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, model } = req.body;

  // Get API configuration from environment
  const apiKey = process.env.AI_API_KEY;
  const apiUrl = process.env.AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions';

  if (!apiKey) {
    return res.status(500).json({
      error: 'API key not configured.',
    });
  }

  // Model mapping for Groq
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
    'deepseek-pdf': 'deepseek-r1-distill-llama-70b',
  };

  const actualModel = groqModelMap[model] || model;
  const isDeepSeekR1 = model === 'deepseek-pdf';

  // DeepSeek R1 models don't support system role well.
  // Convert system messages to user messages for better compatibility.
  let apiMessages = messages;
  if (isDeepSeekR1 && messages && messages.length > 0) {
    apiMessages = messages.map(msg => {
      if (msg.role === 'system') {
        return { role: 'user', content: msg.content };
      }
      return msg;
    });
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: actualModel,
        messages: apiMessages,
        max_tokens: 4096,
        temperature: isDeepSeekR1 ? 0.6 : 0.7,
        stream: false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'API provider returned an error',
      });
    }

    let content = data.choices?.[0]?.message?.content || 'No response generated.';

    // DeepSeek R1 models output <think>...</think> reasoning tags.
    // Strip them so the user only sees the final answer.
    if (isDeepSeekR1 && content) {
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!content) {
        content = 'No response generated.';
      }
    }

    return res.status(200).json({ content });
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({ error: 'Failed to generate response. Please try again.' });
  }
}

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
    'llama-70b': 'llama-3.3-70b-versatile',
    'llama-8b': 'llama-3.1-8b-instant',
    'gemma': 'gemma2-9b-it',
    'deepseek': 'deepseek-r1-distill-llama-70b',
    'mixtral': 'mixtral-8x7b-32768',
    'qwen': 'qwen-qwq-32b',
    'compound': 'compound-beta',
    'compound-mini': 'compound-beta-mini',
  };

  const actualModel = groqModelMap[model] || model;

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
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'API provider returned an error',
      });
    }

    const content = data.choices?.[0]?.message?.content || 'No response generated.';

    return res.status(200).json({ content });
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({ error: 'Failed to generate response. Please try again.' });
  }
}

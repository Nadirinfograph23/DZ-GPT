/**
 * Design Intelligence — AI Page Builder
 * Uses the existing safeGenerateAI pipeline to generate full React + Tailwind pages.
 */

export async function buildPage(safeGenerateAI, { prompt, analysis, pageType = 'landing' }) {
  const colorList = (analysis?.colors || []).slice(0, 6).join(', ') || '#6366f1, #8b5cf6, #fff'
  const fontList = (analysis?.fonts || []).slice(0, 3).join(', ') || 'Inter'
  const radius = (analysis?.borderRadius || [])[0] || '12px'
  const uiStyle = analysis?.uiStyle || 'modern'
  const sections = (analysis?.sections || []).join(', ') || 'hero, features, cta'

  const systemPrompt = `You are a senior UI/UX engineer and React developer.
Generate a complete, production-ready React component using inline styles (no external dependencies needed).

Design context:
- UI Style: ${uiStyle}
- Primary Colors: ${colorList}
- Fonts: ${fontList}
- Border Radius: ${radius}
- Page Sections: ${sections}
- Page Type: ${pageType}

Rules:
1. Output ONLY the React JSX component — no markdown, no explanation, no imports except React
2. Use inline styles — no Tailwind classes, no CSS imports
3. Make it fully responsive (use flexbox + clamp())
4. Include: hero section, features/benefits, CTA button, footer
5. Use the provided colors — don't invent new ones
6. Add realistic placeholder text (no lorem ipsum)
7. Export default at the bottom`

  const userPrompt = prompt || `Generate a complete ${pageType} page component with the design tokens provided.`

  const result = await safeGenerateAI({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    query: userPrompt,
    max_tokens: 3000,
  })

  return result?.content || '// Generation failed'
}

export async function improveDesign(safeGenerateAI, { currentCode, feedback }) {
  const systemPrompt = `You are a senior React/UI engineer.
Improve the following React component based on the feedback.
Return ONLY the improved component code — no markdown, no explanation.`

  const result = await safeGenerateAI({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Feedback: ${feedback}\n\nCurrent code:\n\`\`\`jsx\n${currentCode}\n\`\`\`` },
    ],
    query: feedback,
    max_tokens: 3000,
  })

  return result?.content || currentCode
}

export async function generateTailwindPage(safeGenerateAI, { prompt, analysis, pageType = 'landing' }) {
  const colorList = (analysis?.colors || []).slice(0, 6).join(', ') || '#6366f1'
  const fontList = (analysis?.fonts || []).slice(0, 2).join(', ') || 'Inter'

  const systemPrompt = `You are a Tailwind CSS expert.
Generate a complete HTML page with Tailwind CSS classes (via CDN).

Design tokens:
- Colors: ${colorList}
- Fonts: ${fontList}
- Style: ${analysis?.uiStyle || 'modern'}

Rules:
1. Output complete HTML (<!DOCTYPE html> ... </html>)
2. Include Tailwind CDN: <script src="https://cdn.tailwindcss.com"></script>
3. Extend Tailwind config inline for custom colors
4. Make it fully responsive
5. Include hero, features, CTA sections`

  const result = await safeGenerateAI({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt || `Generate a ${pageType} page` },
    ],
    query: prompt || `Generate a ${pageType} page`,
    max_tokens: 3000,
  })

  return result?.content || '<!DOCTYPE html><html><body><p>Generation failed</p></body></html>'
}

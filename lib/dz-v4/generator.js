// DZ Agent V4 PRO — orchestrator: prompt → plan → files → validate → persist.
// Reuses the host project's safeGenerateAI (DeepSeek → Ollama → Groq fallback chain)
// passed in from server.js. Falls back to a deterministic template when AI fails,
// so this module NEVER returns an empty result (matches V2/V3 contract).

import { plannerSystemPrompt, generatorSystemPrompt, modifierSystemPrompt } from './prompts.js'
import { parseFileBlocks, parseJsonObject } from './parser.js'
import { validateProject } from './validator.js'

const PLANNER_MAX_TOKENS = 700
const GENERATOR_MAX_TOKENS = 4500
const MODIFIER_MAX_TOKENS = 2200

export function detectLanguage(text) {
  if (!text) return 'en'
  const s = String(text).slice(0, 400)
  if (/[\u0600-\u06FF]/.test(s)) return 'ar'
  if (/\b(le|la|les|un|une|des|est|avec|pour|dans|projet|application)\b/i.test(s)) return 'fr'
  return 'en'
}

export async function planProject({ aiGenerate, prompt }) {
  const language = detectLanguage(prompt)
  const sys = plannerSystemPrompt(language)
  const messages = [
    { role: 'system', content: sys },
    { role: 'user',   content: `User request:\n${prompt}\n\nReturn the JSON plan now.` },
  ]
  const raw = await aiGenerate({ messages, query: prompt, max_tokens: PLANNER_MAX_TOKENS })
  const plan = parseJsonObject(typeof raw === 'string' ? raw : raw?.content)
  if (plan && Array.isArray(plan.files) && plan.files.length > 0) {
    plan.language = language
    return plan
  }
  // Fallback plan — minimal static project
  return fallbackPlan(prompt, language)
}

export async function generateFiles({ aiGenerate, prompt, plan }) {
  const language = plan.language || detectLanguage(prompt)
  const sys = generatorSystemPrompt(plan, language)
  const messages = [
    { role: 'system', content: sys },
    { role: 'user',   content: `User request:\n${prompt}\n\nProduce all files now in the strict FILE: format.` },
  ]
  const raw = await aiGenerate({ messages, query: prompt, max_tokens: GENERATOR_MAX_TOKENS })
  const text = typeof raw === 'string' ? raw : (raw?.content || '')
  let files = parseFileBlocks(text)

  // Retry once with stricter reminder if nothing parsed
  if (files.length === 0) {
    const retryMsg = [
      { role: 'system', content: sys },
      { role: 'user',   content: `Your previous answer was not parseable. Reply ONLY with FILE: blocks. No prose.\n\nUser request: ${prompt}` },
    ]
    const raw2 = await aiGenerate({ messages: retryMsg, query: prompt, max_tokens: GENERATOR_MAX_TOKENS })
    files = parseFileBlocks(typeof raw2 === 'string' ? raw2 : (raw2?.content || ''))
  }

  if (files.length === 0) {
    files = fallbackFiles(plan, prompt)
  }
  return files
}

export async function modifyFile({ aiGenerate, currentFile, instruction, language }) {
  const lang = language || detectLanguage(instruction)
  const sys = modifierSystemPrompt(currentFile, instruction, lang)
  const messages = [
    { role: 'system', content: sys },
    { role: 'user',   content: `Apply the instruction and return the updated file in the strict FILE: format.` },
  ]
  const raw = await aiGenerate({ messages, query: instruction, max_tokens: MODIFIER_MAX_TOKENS })
  const text = typeof raw === 'string' ? raw : (raw?.content || '')
  const files = parseFileBlocks(text)
  const updated = files.find(f => f.path === currentFile.path) || files[0]
  if (!updated || !updated.content) return null
  // Force the original path to avoid hallucinated rename
  return { path: currentFile.path, lang: updated.lang || currentFile.lang, content: updated.content }
}

export async function runFullGeneration({ aiGenerate, prompt }) {
  const t0 = Date.now()
  const plan = await planProject({ aiGenerate, prompt })
  const files = await generateFiles({ aiGenerate, prompt, plan })
  const validation = validateProject(plan, files)
  return {
    plan,
    files,
    validation,
    durationMs: Date.now() - t0,
  }
}

// ─── deterministic fallbacks (so V4 never returns nothing) ────────────────────

function fallbackPlan(prompt, language) {
  return {
    title: 'Static Web Project',
    stack: 'static',
    description: prompt.slice(0, 120),
    files: [
      { path: '/project/index.html',         lang: 'html', purpose: 'entry page' },
      { path: '/project/styles/main.css',    lang: 'css',  purpose: 'styles' },
      { path: '/project/scripts/app.js',     lang: 'js',   purpose: 'logic' },
      { path: '/project/README.md',          lang: 'md',   purpose: 'docs' },
    ],
    entry: '/project/index.html',
    run: 'open /project/index.html in a browser',
    language,
  }
}

function fallbackFiles(plan, prompt) {
  const title = plan.title || 'DZ V4 Project'
  return [
    {
      path: '/project/index.html',
      lang: 'html',
      content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="styles/main.css" />
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p data-prompt>${escapeHtml(prompt).slice(0, 240)}</p>
  </main>
  <script src="scripts/app.js"></script>
</body>
</html>
`,
    },
    {
      path: '/project/styles/main.css',
      lang: 'css',
      content: `:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #0b0b0d; color: #f3f4f6; }
main { max-width: 720px; margin: 6rem auto; padding: 0 1.5rem; }
h1 { margin: 0 0 .75rem; font-size: 2rem; }
p { color: #9ca3af; line-height: 1.5; }
`,
    },
    {
      path: '/project/scripts/app.js',
      lang: 'js',
      content: `console.log('${title} ready')
`,
    },
    {
      path: '/project/README.md',
      lang: 'md',
      content: `# ${title}

Generated by DZ Agent V4 PRO (fallback template).

## Run

1. Open \`index.html\` in any modern browser.
2. Edit files under \`styles/\`, \`scripts/\` to customize.
3. No build step required.
`,
    },
  ]
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
}

/**
 * DZ Agent — GitHub Pages Project Builder
 * Generates complete multi-file projects:
 *   - HTML/CSS/JS  (static, zero build step)
 *   - React static (Vite output simulation)
 *   - Vue static   (simulated dist)
 *
 * Every generator returns: Array<{ path: string, content: string }>
 */

import { generatePagesWorkflow } from './index.js'

// ── Detect project type from analysis ─────────────────────────────────────────
export function detectProjectType(analysis) {
  return analysis.projectType || 'html'
}

// ── Main entry — generate project files via AI ────────────────────────────────
export async function generateProjectFiles(analysis, aiGenerate) {
  const type = detectProjectType(analysis)

  // Build AI prompt based on type
  const systemPrompt = buildSystemPrompt(analysis, type)
  const userPrompt   = buildUserPrompt(analysis, type)

  let aiResponse = ''
  try {
    const result = await aiGenerate({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      query: analysis.originalMessage,
      max_tokens: 10000,
    })
    aiResponse = result.content || ''
  } catch (err) {
    throw new Error(`فشل توليد ملفات المشروع: ${err.message}`)
  }

  // Parse FILE blocks from AI output
  const files = parseFileBlocks(aiResponse)

  if (!files.length) {
    // Fallback: treat full response as index.html
    const html = extractHtml(aiResponse)
    if (html && html.length > 200) {
      files.push({ path: 'index.html', content: html })
    }
  }

  if (!files.length) {
    throw new Error('لم يتمكن النظام من توليد ملفات صالحة. حاول وصف الموقع بشكل أوضح.')
  }

  // Always add GitHub Pages workflow and README
  const hasWorkflow = files.some(f => f.path.includes('pages.yml'))
  if (!hasWorkflow) {
    files.push({
      path: '.github/workflows/pages.yml',
      content: generatePagesWorkflow(),
    })
  }

  const hasReadme = files.some(f => f.path.toLowerCase() === 'readme.md')
  if (!hasReadme) {
    const siteUrl = `https://USERNAME.github.io/${analysis.repoName}`
    files.push({
      path: 'README.md',
      content: generateReadme(analysis.repoName, analysis.description, siteUrl),
    })
  }

  return files
}

// ── AI System Prompt ──────────────────────────────────────────────────────────
function buildSystemPrompt(analysis, type) {
  const { features } = analysis
  const rtlNote   = features.rtl   ? '\n- الموقع باللغة العربية — اتجاه RTL — استخدم dir="rtl"' : ''
  const animNote  = features.animations ? '\n- أضف CSS animations/transitions سلسة' : ''
  const formNote  = features.contactForm ? '\n- أضف نموذج تواصل بتصميم احترافي' : ''
  const darkNote  = features.darkMode ? '\n- استخدم تصميم Dark Mode بألوان داكنة' : ''

  if (type === 'html') {
    return `أنت مهندس ويب محترف في DZ Agent. مهمتك توليد موقع ويب كامل متعدد الملفات لـ GitHub Pages.

قواعد صارمة:
- أنتج ملفات متعددة بالصيغة: \`FILE: path/to/file.ext\` ثم المحتوى ثم \`---END---\`
- index.html يجب أن يكون مكتملاً: <!DOCTYPE html> → </html>
- style.css: CSS احترافي، responsive، mobile-first${rtlNote}${animNote}${formNote}${darkNote}
- script.js: JavaScript تفاعلي إذا لزم
- لا Lorem ipsum — محتوى حقيقي ومتناسق مع نوع الموقع
- تصميم Dribbble/Awwwards level — ألوان متناسقة، fonts جيدة من Google Fonts
- SEO: <title>، <meta description>، Open Graph
- GitHub Pages compatible — لا server-side code

صيغة الملفات المطلوبة:
\`\`\`
FILE: index.html
[محتوى index.html الكامل]
---END---
FILE: style.css
[محتوى CSS الكامل]
---END---
FILE: script.js
[محتوى JS]
---END---
\`\`\``
  }

  // React static (pre-built simulation)
  return `أنت مهندس React محترف في DZ Agent. أنشئ موقع React static (كـ Vite output) لـ GitHub Pages.

قواعد:
- أنتج ملفات dist/ جاهزة (HTML + CSS + JS مُجمَّعة) بالصيغة FILE: path ---END---
- dist/index.html: كامل ومستقل، يستورد CSS و JS محلياً${rtlNote}${animNote}${darkNote}
- dist/assets/style.css: CSS احترافي
- dist/assets/main.js: JavaScript كامل
- لا lorem ipsum — محتوى حقيقي
- تصميم modern، responsive، animations
- مناسب 100% لـ GitHub Pages (static hosting)`
}

// ── AI User Prompt ────────────────────────────────────────────────────────────
function buildUserPrompt(analysis, type) {
  const { siteType, repoName, description, features, originalMessage } = analysis
  return `أنشئ موقع ${siteType} (${type}) باسم: ${repoName}
وصف المشروع: ${description || originalMessage}
النوع: ${siteType}
الميزات: ${Object.entries(features).filter(([, v]) => v).map(([k]) => k).join(', ') || 'أساسية'}

الطلب الأصلي: "${originalMessage}"

أنتج الملفات الآن بالصيغة المطلوبة (FILE: path ... ---END---).`
}

// ── Parse FILE blocks from AI output ─────────────────────────────────────────
function parseFileBlocks(text) {
  const files = []
  // Support formats: FILE: path, ```path, or marked blocks
  const pattern = /FILE:\s*([^\n\r]+)\r?\n([\s\S]*?)(?=FILE:\s*[^\n]|\n---END---|\n```\s*$|$)/g
  let match

  while ((match = pattern.exec(text)) !== null) {
    const rawPath = match[1].trim().replace(/^[`'"]+|[`'"]+$/g, '')
    const content = match[2].replace(/---END---\s*$/, '').trim()
    if (rawPath && content && isValidFilePath(rawPath)) {
      files.push({ path: sanitizePath(rawPath), content })
    }
  }

  // Alternative: code blocks with filename comments
  if (!files.length) {
    const codeBlockPattern = /```(?:html|css|js|javascript|typescript|json|yaml)?\s*\n(?:\/\/\s*([^\n]+)\n|<!--\s*([^\n]+)\s*-->\n)?([\s\S]*?)```/g
    let i = 0
    while ((match = codeBlockPattern.exec(text)) !== null) {
      const fname = match[1] || match[2]
      const content = match[3].trim()
      if (content.length > 50) {
        const ext = detectExtFromContent(content)
        files.push({ path: fname ? sanitizePath(fname) : `file${i++}.${ext}`, content })
      }
    }
  }

  return files
}

function isValidFilePath(p) {
  if (!p || typeof p !== 'string') return false
  if (p.includes('..') || p.startsWith('/') || p.length > 200) return false
  return /^[\w.\-/]+$/.test(p)
}

function sanitizePath(p) {
  return p.replace(/^\/+/, '').replace(/\.\.\//g, '').replace(/[^\w.\-/]/g, '-')
}

function detectExtFromContent(content) {
  if (content.trim().startsWith('<!DOCTYPE') || /<html/i.test(content)) return 'html'
  if (/^[\s]*\{/.test(content) || /import\s|export\s|const\s|let\s/.test(content)) return 'js'
  if (/^\s*[\w\-#.:]+\s*\{/.test(content) || /font-|color:|margin:|padding:/.test(content)) return 'css'
  return 'txt'
}

function extractHtml(text) {
  const match = text.match(/<!DOCTYPE[\s\S]*?<\/html>/i)
  return match ? match[0] : null
}

// ── README generator ──────────────────────────────────────────────────────────
function generateReadme(repoName, description, siteUrl) {
  return `# ${repoName}

> ${description || 'موقع ويب تم إنشاؤه بواسطة DZ Agent 🤖'}

## 🌐 الموقع المباشر

🔗 **${siteUrl}**

> ⏳ قد يستغرق الموقع 1-3 دقائق ليظهر أول مرة بعد النشر.

## 📁 هيكل المشروع

تم إنشاء هذا المشروع ونشره تلقائياً عبر **DZ Agent** — مساعد الذكاء الاصطناعي الجزائري.

### 🚀 كيفية التعديل

1. عدّل الملفات مباشرةً على GitHub
2. GitHub Actions سينشر التعديلات تلقائياً على Pages

---

*Built with ❤️ by [DZ-GPT](https://dzagent.app) — DZ Agent GitHub Pages Engine*
`
}

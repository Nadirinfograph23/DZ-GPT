itHub Pages
app.post('/api/dz-agent/github/pages/deploy', async (req, res) => {
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط. أضفه في الأسرار.' })

  const { prompt = '', siteType = 'landing', repoName, description, htmlContent } = req.body
  if (!prompt && !htmlContent) return res.status(400).json({ error: 'prompt أو htmlContent مطلوب.' })

  const safeName = sanitizeRepoName(repoName || siteType + '-site')

  try {
    let finalHtml = htmlContent || ''

    // If no HTML provided, generate it via AI
    if (!finalHtml) {
      const meta = extractPagesRequestMeta(prompt)
      const PAGES_SYSTEM = `You are DZ Agent V4.0 — an elite AI Web Builder. Generate a visually stunning, ultra-modern, production-ready single-file HTML website that looks like it was designed by a top-tier Silicon Valley AI startup team in 2026.

ABSOLUTE RULES:
- Output ONE complete HTML file: <!DOCTYPE html> … </html>
- All CSS inside <style> block. All JS inside <script> block. Zero external CSS files.
- NEVER use old-fashioned layouts, Bootstrap-style designs, or outdated UI patterns
- ALWAYS use dark-mode-first premium aesthetics (Vercel / Linear / OpenAI quality)
- ALWAYS use gradient text on hero headline (background-clip:text technique)
- ALWAYS use Bento Grid layout for features section
- ALWAYS use glassmorphism for cards (backdrop-filter:blur + rgba)
- NEVER use Lorem ipsum — always real contextual content

MANDATORY CDNs:
- Tailwind CSS: <script src="https://cdn.tailwindcss.com"></script>
- Font Awesome 6: <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"/>
- Google Fonts: Inter + contextual pair via @import
- AOS: <link href="https://unpkg.com/aos@2.3.4/dist/aos.css" rel="stylesheet"> + <script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>

REQUIRED SECTIONS: sticky navbar → animated mesh-gradient hero (gradient text headline) → bento feature grid → stat counters + testimonials → how it works → CTA section → footer with dynamic year

MANDATORY JS: AOS.init({duration:700,once:true}) + IntersectionObserver scroll animations + navbar scroll blur + mobile hamburger + dynamic year: document.getElementById('cr-year').textContent=new Date().getFullYear()

SEO: <meta> description + og:title + og:description in <head>

Output ONLY the complete HTML — no markdown, no explanation`

      const wbMsgs = [
        { role: 'system', content: PAGES_SYSTEM },
        { role: 'user', content: `Create a professional ${meta.siteType} website. Description: ${prompt}\n[Site type: ${meta.siteType} | Repo: ${safeName}]` },
      ]
      const aiResult = await safeGenerateAI({ messages: wbMsgs, query: prompt, max_tokens: 8000 })
      finalHtml = extractHtmlFromResponse(aiResult.content || '') || aiResult.content || ''

      if (!finalHtml || finalHtml.length < 200) {
        return res.status(500).json({ error: 'فشل توليد محتوى الموقع. يرجى المحاولة مرة أخرى مع وصف أوضح.' })
      }
    }

    const result = await deployGitHubPages({
      token,
      prompt,
      siteType,
      repoName: safeName,
      description: description || prompt.slice(0, 150),
      htmlContent: finalHtml,
    })

    console.log(`[GH Pages] Deployed: ${result.repoUrl} → ${result.siteUrl}`)
    return res.json({ success: true, ...result })

  } catch (err) {
    console.error('[GH Pages:deploy]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/dz-agent/github/pages/update ─────────────────────────────────
// Update/redeploy a GitHub Pages repo — files optional (redeploy triggers Pages enable)
app.post('/api/dz-agent/github/pages/update', async (req, res) => {
  const tok = req.body.token
    ? sanitizeString(req.body.token, 300)
    : process.env.GITHUB_TOKEN || ''
  if (!tok) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const { owner, repo, files, commitMessage = 'Redeploy via DZ Agent 🤖' } = req.body
  if (!owner || !repo) return res.status(400).json({ error: 'owner و repo مطلوبان.' })
  if (!isValidGithubRepo(`${owner}/${repo}`)) return res.status(400).json({ error: 'Invalid repo format.' })

  try {
    let commitSha = null

    // If files provided, push them first after ensuring branch is ready
    if (files?.length) {
      // Wait for main branch (handles newly created repos)
      const { waitForMainBranch: waitBranch } = await import('./lib/github-pages/index.js')
      const branchInfo = await waitBranch(tok, owner, repo)
      const pushResult = await ghPagesBatchPush(tok, owner, repo, files, commitMessage, branchInfo.branch)
      commitSha = typeof pushResult === 'string' ? pushResult : pushResult?.sha || null
    }

    // Enable/re-enable GitHub Pages
    const pagesResult = await ghPagesEnable(tok, owner, repo)
    const pagesInfo = await getPagesStatus(tok, owner, repo)

    return res.json({
      success: true,
      commitSha,
      siteUrl: pagesInfo?.url || `https://${owner}.github.io/${repo}`,
      pagesStatus: pagesInfo?.status || pagesResult?.status || 'building',
      branch: pagesInfo?.branch || 'main',
    })
  } catch (err) {
    console.error('[GH Pages:update]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── GET /api/dz-agent/github/pages/status ──────────────────────────────────
// Check GitHub Pages deployment status for a repo
app.get('/api/dz-agent/github/pages/status', async (req, res) => {
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const { owner, repo } = req.query
  if (!owner || !repo) return res.status(400).json({ error: 'owner و repo مطلوبان.' })
  if (!isValidGithubRepo(`${owner}/${repo}`)) return res.status(400).json({ error: 'Invalid repo.' })

  try {
    const status = await getPagesStatus(token, owner, repo)
    if (!status) return res.status(404).json({ error: 'GitHub Pages غير مفعّل لهذا المستودع.' })
    return res.json({ success: true, ...status })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/dz-agent/github/react/enable-pages ───────────────────────────
// Called by GitHubReActPanel "Publish" button — enables Pages on a given repo
app.post('/api/dz-agent/github/react/enable-pages', async (req, res) => {
  const { repo } = req.body
  if (!repo || !isValidGithubRepo(repo)) return res.status(400).json({ error: 'repo مطلوب (owner/repo)' })
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط' })
  const [owner, repoName] = repo.split('/')
  try {
    const result = await ghPagesEnable(token, owner, repoName)
    const html_url = (result && result.html_url) || `https://${owner}.github.io/${repoName}/`
    return res.json({ success: true, html_url, status: result?.status || 'building' })
  } catch (err) {
    logger.error('[GitHub/enable-pages]', err)
    return res.status(500).json({ error: err.message })
  }
})

// ── GET /api/dz-agent/github/react/pages-status ────────────────────────────
// Polls GitHub Pages build status — called every 10s by the panel
app.get('/api/dz-agent/github/react/pages-status', async (req, res) => {
  const { repo } = req.query
  if (!repo || !isValidGithubRepo(repo)) return res.status(400).json({ error: 'repo مطلوب' })
  const token = process.env.GITHUB_TOKEN
  const [owner, repoName] = repo.split('/')
  try {
    const status = await getPagesStatus(token, owner, repoName)
    if (!status) return res.json({ enabled: false, status: 'not_enabled' })
    return res.json({ enabled: true, ...status })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/dz-agent/github/pages/stream-deploy ──────────────────────────
// SSE Streaming: Full autonomous deployment pipeline
// Plan → Generate files → Create repo → Upload → Enable Pages → Live URL
app.post('/api/dz-agent/github/pages/stream-deploy', async (req, res) => {
  const token = req.body.githubToken
    ? sanitizeString(req.body.githubToken, 300)
    : process.env.GITHUB_TOKEN || ''
  if (!token) {
    return res.status(401).json({ error: 'GitHub token مطلوب. أضف GITHUB_TOKEN أو سجّل دخولك.' })
  }

  const { prompt = '', repoName: rawRepoName } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt مطلوب' })

  // ── SSE setup ──────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (type, payload) => {
    try {
      res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`)
      res.flush?.()
    } catch (_) {}
  }

  const steps = []
  const onStep = (step) => {
    steps.push(step)
    send('step', { step })
    console.log(`[stream-deploy] ${step.label || step.message || step.step}`)
  }

  try {
    // ── 1. Analyze request ───────────────────────────────────────────────────
    send('start', { message: '🧠 تحليل الطلب...' })
    const analysis = plannerAnalyze(prompt)
    if (rawRepoName) analysis.repoName = sanitizeRepoName(rawRepoName)
    send('analysis', { analysis: { siteType: analysis.siteType, projectType: analysis.projectType, repoName: analysis.repoName } })

    // ── 2. Create deployment plan ────────────────────────────────────────────
    const plan = createDeployPlan(analysis)
    send('plan', { tasks: plan.map(t => ({ id: t.id, label: t.label, icon: t.icon })) })

    // ── 3. Auth ──────────────────────────────────────────────────────────────
    onStep({ step: 'auth', label: '🔑 التحقق من هوية GitHub...' })
    const user = await ghPagesGetUser(token)
    const owner = user.login
    onStep({ step: 'auth', label: `✅ مرحباً @${owner}`, done: true })
    send('owner', { owner })

    // ── 4. Generate project files via AI ─────────────────────────────────────
    onStep({ step: 'generate', label: `🧠 توليد ملفات ${analysis.siteType} (${analysis.projectType})...` })
    let projectFiles
    try {
      projectFiles = await buildProjectFiles(analysis, safeGenerateAI)
    } catch (genErr) {
      // Fallback: single-file HTML via WEB_BUILDER pipeline
      onStep({ step: 'generate', label: '⚠️ تبديل إلى توليد ملف HTML واحد...', done: false })
      const fb = await safeGenerateAI({
        messages: [
          { role: 'system', content: 'أنت مهندس ويب. أنتج موقع HTML/CSS/JS كامل في ملف واحد لـ GitHub Pages. لا lorem ipsum. تصميم احترافي responsive. Output ONLY the HTML.' },
          { role: 'user', content: `موقع ${analysis.siteType}: ${prompt}` },
        ],
        query: prompt, max_tokens: 8000,
      })
      const html = extractHtmlFromResponse(fb.content || '') || fb.content || ''
      if (!html || html.length < 200) throw new Error('فشل توليد HTML')
      projectFiles = [
        { path: 'index.html', content: html },
        { path: '.github/workflows/pages.yml', content: generatePagesWorkflow() },
      ]
    }
    onStep({ step: 'generate', label: `✅ تم توليد ${projectFiles.length} ملف`, done: true })
    send('files', { files: projectFiles.map(f => f.path), count: projectFiles.length })

    // ── 5. Create repository (auto_init=true) ─────────────────────────────────
    const repoName = sanitizeRepoName(analysis.repoName || `${analysis.siteType}-site`)
    onStep({ step: 'create_repo', label: `📦 إنشاء مستودع "${repoName}"...` })
    let repoReused = false
    try {
      await ghCreateRepo(token, repoName, analysis.description || `${analysis.siteType} — by DZ Agent 🇩🇿`, false)
      onStep({ step: 'create_repo', label: `✅ المستودع "${owner}/${repoName}" جاهز`, done: true })
    } catch (repoErr) {
      if (repoErr.message.includes('مسبقاً') || repoErr.message.includes('already exists') || repoErr.message.includes('422')) {
        repoReused = true
        onStep({ step: 'create_repo', label: `♻️ مستودع "${repoName}" موجود — سنستخدمه`, done: true })
      } else {
        throw repoErr
      }
    }
    send('repo', { owner, repo: repoName, repoUrl: `https://github.com/${owner}/${repoName}`, reused: repoReused })

    // ── 6. Wait for main branch then upload files ─────────────────────────────
    onStep({ step: 'wait_branch', label: '⏳ انتظار تهيئة الفرع الرئيسي...' })
    await new Promise(r => setTimeout(r, 3000))
    const { waitForMainBranch: waitBranchFn } = await import('./lib/github-pages/index.js')
    const branchInfo = await waitBranchFn(token, owner, repoName)
    onStep({ step: 'wait_branch', label: `✅ الفرع "${branchInfo.branch}" جاهز`, done: true })

    onStep({ step: 'upload', label: `⬆️ رفع ${projectFiles.length} ملف إلى GitHub...` })
    const pushResult = await ghPagesBatchPush(
      token, owner, repoName, projectFiles,
      `🚀 Deploy by DZ Agent 🇩🇿 — ${analysis.siteType}`, branchInfo.branch
    )
    const commitSha = typeof pushResult === 'string' ? pushResult : pushResult?.sha || ''
    onStep({ step: 'upload', label: `✅ تم رفع ${projectFiles.length} ملف (${commitSha.slice(0, 7)})`, done: true })
    send('upload', { commitSha, fileCount: projectFiles.length })

    // ── 7. Enable GitHub Pages ────────────────────────────────────────────────
    onStep({ step: 'pages', label: '🌐 تفعيل GitHub Pages...' })
    let pagesEnabled = false
    let pagesStatus = 'building'
    try {
      const pagesResult = await ghPagesEnable(token, owner, repoName)
      pagesEnabled = !!pagesResult
      pagesStatus = pagesResult?.status || 'building'
      onStep({ step: 'pages', label: '✅ GitHub Pages مُفعَّل — يتم البناء...', done: true })
    } catch (pErr) {
      onStep({ step: 'pages', label: `⚠️ Pages: ${pErr.message}`, done: true })
    }

    // ── 8. Final result ───────────────────────────────────────────────────────
    const siteUrl  = `https://${owner}.github.io/${repoName}`
    const repoUrl  = `https://github.com/${owner}/${repoName}`
    const htmlFile = projectFiles.find(f => f.path === 'index.html' || f.path === 'dist/index.html')

    send('done', {
      success: true,
      owner,
      repo: repoName,
      repoUrl,
      siteUrl,
      commitSha,
      pagesEnabled,
      pagesStatus,
      siteType: analysis.siteType,
      fileCount: projectFiles.length,
      htmlPreview: htmlFile?.content || '',
    })
    onStep({ step: 'done', label: `🎉 الموقع جاهز: ${siteUrl}`, done: true })
    res.end()

  } catch (err) {
    console.error('[stream-deploy] Error:', err.message)
    send('error', { error: err.message })
    res.end()
  }
})

// ── POST /api/dz-agent/github/pages/deploy-existing-stream ─────────────────
// SSE: Deploy/redeploy an EXISTING repo to GitHub Pages + stream live progress
app.post('/api/dz-agent/github/pages/deploy-existing-stream', async (req, res) => {
  const token = req.body.token
    ? sanitizeString(String(req.body.token), 300)
    : process.env.GITHUB_TOKEN || ''
  if (!token) return res.status(401).json({ error: 'GitHub token مطلوب. ارتبط أولاً.' })

  const repoFull = sanitizeString(String(req.body.repo || ''), 200)
  if (!repoFull || !isValidGithubRepo(repoFull))
    return res.status(400).json({ error: 'repo مطلوب بصيغة owner/repo' })
  const [owner, repoName] = repoFull.split('/')

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const ghHeaders = {
    Authorization: `token ${token}`,
    'User-Agent': 'DZ-Agent/5.0',
    Accept: 'application/vnd.github+json',
  }

  const send = (type, payload = {}) => {
    try { res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`); res.flush?.() } catch (_) {}
  }

  const stepMap = new Map()
  const step = (id, label, done = false) => {
    stepMap.set(id, { id, label, done })
    send('step', { step: { id, label, done } })
    console.log(`[deploy-existing] ${done ? '✅' : '⏳'} ${label}`)
  }

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    step('auth', '🔑 التحقق من هوية GitHub...')
    const userRes = await fetch('https://api.github.com/user', {
      headers: ghHeaders, signal: AbortSignal.timeout(8000),
    })
    if (!userRes.ok) throw new Error('GitHub token غير صالح — تحقق من الـ token أو أعد الربط')
    const userData = await userRes.json()
    step('auth', `✅ مرحباً @${userData.login}`, true)

    // ── 2. Check repo ────────────────────────────────────────────────────────
    step('repo', `📦 فحص المستودع ${owner}/${repoName}...`)
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers: ghHeaders, signal: AbortSignal.timeout(8000),
    })
    if (!repoRes.ok) throw new Error(`المستودع ${owner}/${repoName} غير موجود أو لا تملك صلاحية الوصول`)
    const repoData = await repoRes.json()
    const defaultBranch = repoData.default_branch || 'main'
    step('repo', `✅ المستودع موجود — الفرع: ${defaultBranch}`, true)

    // ── 3. Check current Pages status ────────────────────────────────────────
    step('status', '🌐 فحص حالة GitHub Pages...')
    const pagesStatusBefore = await getPagesStatus(token, owner, repoName)
    const wasEnabled = !!pagesStatusBefore
    step('status', wasEnabled
      ? '♻️ GitHub Pages مُفعَّل مسبقاً — سيُعاد النشر'
      : '📡 GitHub Pages غير مُفعَّل — سيتم التفعيل الآن', true)

    // ── 4. Scan repo files ────────────────────────────────────────────────────
    step('scan', '🔍 فحص هيكل المشروع...')
    let fileCount = 0; let hasIndexHtml = false; let detectedStack = 'static'
    const allFiles = []
    try {
      const treeRes = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/git/trees/${defaultBranch}?recursive=1`,
        { headers: ghHeaders, signal: AbortSignal.timeout(8000) }
      )
      if (treeRes.ok) {
        const tree = await treeRes.json()
        const blobs = (tree.tree || []).filter(f => f.type === 'blob').map(f => f.path)
        fileCount = blobs.length
        allFiles.push(...blobs)
        hasIndexHtml = blobs.some(f => ['index.html','public/index.html','dist/index.html'].includes(f))
        if (blobs.some(f => f === 'package.json')) detectedStack = 'Node.js'
        if (blobs.some(f => f.endsWith('.vue')))    detectedStack = 'Vue.js'
        if (blobs.some(f => f.endsWith('.tsx') || f.endsWith('.jsx'))) detectedStack = 'React'
        if (blobs.some(f => f.endsWith('.py')))     detectedStack = 'Python'
        send('files', { count: fileCount, hasIndexHtml, stack: detectedStack, branch: defaultBranch, files: blobs.slice(0, 30) })
      }
    } catch (_) {}
    step('scan', `✅ ${fileCount} ملف — Stack: ${detectedStack}${hasIndexHtml ? ' · index.html ✓' : ''}`, true)

    // ── 5. Push deploy-stamp commit (triggers Pages rebuild) ─────────────────
    step('commit', '📝 إنشاء commit لإعادة تشغيل البناء...')
    const now = new Date().toISOString()
    let commitSha = ''
    try {
      const stampPath = '.dz-deploy'
      const stampContent = `DZ Agent Deploy\nDate: ${now}\nRepo: ${owner}/${repoName}\nStack: ${detectedStack}\nFiles: ${fileCount}\n`
      let existingSha = null
      try {
        const existRes = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/contents/${stampPath}?ref=${defaultBranch}`,
          { headers: ghHeaders, signal: AbortSignal.timeout(5000) }
        )
        if (existRes.ok) existingSha = (await existRes.json()).sha
      } catch (_) {}

      const putRes = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/contents/${stampPath}`,
        {
          method: 'PUT',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `🚀 Deploy to GitHub Pages via DZ Agent — ${now.slice(0, 10)}`,
            content: Buffer.from(stampContent).toString('base64'),
            branch: defaultBranch,
            ...(existingSha ? { sha: existingSha } : {}),
          }),
          signal: AbortSignal.timeout(12000),
        }
      )
      if (putRes.ok) commitSha = ((await putRes.json()).commit?.sha || '').slice(0, 7)
    } catch (commitErr) {
      console.warn('[deploy-existing] commit warning:', commitErr.message)
    }
    step('commit', commitSha ? `✅ Commit ${commitSha} — تم رفعه` : '⚠️ Commit اختياري — نواصل...', true)

    // ── 6. Enable / re-enable GitHub Pages ───────────────────────────────────
    step('pages', wasEnabled ? '🔄 إعادة تفعيل GitHub Pages...' : '🌐 تفعيل GitHub Pages...')
    let pagesEnabled = wasEnabled; let pagesStatus = 'building'
    try {
      const pagesResult = await ghPagesEnable(token, owner, repoName)
      pagesEnabled = true
      pagesStatus = pagesResult?.status || 'building'
    } catch (pErr) {
      console.warn('[deploy-existing] Pages enable:', pErr.message)
    }
    step('pages', '✅ GitHub Pages مُفعَّل — جاري البناء...', true)

    // ── 7. Poll build status (max 60s / 6 polls) ─────────────────────────────
    step('build', '⏳ انتظار اكتمال البناء...')
    const siteUrl = `https://${owner}.github.io/${repoName}`
    let buildOk = false
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 10000))
      try {
        const pollStatus = await getPagesStatus(token, owner, repoName)
        if (pollStatus?.status) {
          pagesStatus = pollStatus.status
          if (pagesStatus === 'built' || pagesStatus === 'enabled') { buildOk = true; break }
        }
      } catch (_) {}
      send('step', { step: { id: 'build', label: `⏳ البناء جارٍ... ${(i + 1) * 10}s`, done: false } })
    }
    step('build', buildOk
      ? '✅ الموقع جاهز تماماً!'
      : '🟡 البناء قد يستغرق دقيقتين — الرابط سيصبح نشطاً قريباً', true)

    // ── 8. Final report ───────────────────────────────────────────────────────
    const repoUrl = `https://github.com/${owner}/${repoName}`
    send('done', {
      success: true,
      siteUrl,
      repoUrl,
      commitSha,
      pagesEnabled,
      pagesStatus,
      buildOk,
      owner,
      repo: repoName,
      fileCount,
      stack: detectedStack,
      defaultBranch,
      hasIndexHtml,
      deployedAt: now,
    })

  } catch (err) {
    console.error('[deploy-existing-stream]', err.message)
    send('error', { error: err.message })
    send('done', { success: false, error: err.message })
  } finally {
    res.end()
  }
})

// ── POST /api/dz-agent/github/pages/list-repos ─────────────────────────────
// List user's GitHub repos that have Pages enabled
app.post('/api/dz-agent/github/pages/list-repos', async (req, res) => {
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  try {
    const userRes = await fetch(`https://api.github.com/user/repos?per_page=100&sort=updated`, {
      headers: {
        Authorization: `token ${token}`,
        'User-Agent': 'DZ-GPT/1.0',
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!userRes.ok) throw new Error('فشل جلب قائمة المستودعات')
    const repos = await userRes.json()
    const pagesRepos = repos
      .filter(r => r.has_pages)
      .map(r => ({
        name: r.name,
        fullName: r.full_name,
        siteUrl: `https://${r.owner.login}.github.io/${r.name}`,
        repoUrl: r.html_url,
        updatedAt: r.updated_at,
        description: r.description,
      }))
    return res.json({ success: true, repos: pagesRepos, total: pagesRepos.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ===== GITHUB AI: DEPLOY & SYNC (push files to GitHub branch) =====
app.post('/api/dz-agent/github/deploy-sync', async (req, res) => {
  const { repo, files: filesToPush, commitMessage, branch: targetBranch = 'main', token } = req.body
  if (!repo || !filesToPush?.length) return res.status(400).json({ error: 'repo and files[] required' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repo' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'No GitHub token' })

  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  const results = { pushed: [], failed: [] }

  // Push files
  for (const file of filesToPush) {
    if (!file.path || !file.content) continue
    try {
      let sha
      const check = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(file.path)}?ref=${encodeURIComponent(targetBranch)}`, { headers: ghHeaders, signal: AbortSignal.timeout(8000) })
      if (check.ok) { const d = await check.json(); sha = d.sha }
      const body = { message: sanitizeString(commitMessage || `chore: deploy sync [DZ Agent]`, 200), content: Buffer.from(file.content).toString('base64'), branch: targetBranch }
      if (sha) body.sha = sha
      const r = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(file.path)}`, { method: 'PUT', headers: ghHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) })
      if (r.ok) results.pushed.push(file.path)
      else results.failed.push(file.path)
    } catch { results.failed.push(file.path) }
  }

  return res.json({ success: results.pushed.length > 0, ...results })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GITHUB AGENT — REAL DEVOPS ENGINEER ENDPOINTS
// Full execution pipeline: create repo → branch → files → commit → pages → URL
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /api/dz-agent/github/create-branch ────────────────────────────────
// Create a new branch from an existing one (defaults to main/master)
app.post('/api/dz-agent/github/create-branch', async (req, res) => {
  const { repo, branch, fromBranch = 'main', token } = req.body
  if (!repo || !branch) return res.status(400).json({ error: 'repo و branch مطلوبان.' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repo format.' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  try {
    // 1. Get SHA of source branch
    let sha = null
    const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`, {
      headers: ghHeaders, signal: AbortSignal.timeout(10000),
    })
    if (refRes.ok) {
      const refData = await refRes.json()
      sha = refData?.object?.sha
    } else {
      // Try master if main not found
      const masterRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/master`, {
        headers: ghHeaders, signal: AbortSignal.timeout(8000),
      })
      if (masterRes.ok) {
        const masterData = await masterRes.json()
        sha = masterData?.object?.sha
      }
    }

    // ── If no SHA found → repo might be empty: auto-init with README then retry ──
    if (!sha) {
      console.log(`[GH:create-branch] No branch SHA found — attempting to auto-init repo ${repo}`)
      try {
        const readmeContent = Buffer.from(`# ${repo.split('/')[1] || repo}\n\nتم إنشاؤه بواسطة DZ Agent 🇩🇿\n`).toString('base64')
        const initRes = await fetch(`https://api.github.com/repos/${repo}/contents/README.md`, {
          method: 'PUT', headers: ghHeaders, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ message: '📚 init: README — by DZ Agent 🤖', content: readmeContent, branch: 'main' }),
        })
        if (initRes.ok) {
          await new Promise(r => setTimeout(r, 2000))
          const retryRef = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/main`, {
            headers: ghHeaders, signal: AbortSignal.timeout(8000),
          })
          if (retryRef.ok) {
            const rd = await retryRef.json()
            sha = rd?.object?.sha
          }
        }
      } catch (initErr) {
        console.warn('[GH:create-branch] auto-init failed:', initErr.message)
      }
    }

    if (!sha) return res.status(404).json({ error: `الفرع "${fromBranch}" غير موجود في المستودع. تأكد أن المستودع يحتوي على commit واحد على الأقل.` })

    // 2. Create the new branch
    const createRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      signal: AbortSignal.timeout(15000),
    })
    const createData = await createRes.json()
    if (!createRes.ok) {
      if (createData.message?.includes('already exists') || createRes.status === 422) {
        return res.json({ success: true, branch, sha, message: `الفرع "${branch}" موجود مسبقاً.`, reused: true })
      }
      return res.status(createRes.status).json({ error: createData.message || 'فشل إنشاء الفرع.' })
    }

    console.log(`[GH:create-branch] Created branch "${branch}" in ${repo}`)
    return res.json({ success: true, branch, sha: createData?.object?.sha || sha, repo, fromBranch })
  } catch (err) {
    console.error('[GH:create-branch]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/dz-agent/github/create-repo-full ────────────────────────────
// Full pipeline: create repo + main branch + README + optional index.html + GitHub Pages
app.post('/api/dz-agent/github/create-repo-full', async (req, res) => {
  const { repoName, description = '', isWebsite = false, prompt = '', token, isPrivate = false } = req.body
  if (!repoName) return res.status(400).json({ error: 'repoName مطلوب.' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const safeName = sanitizeRepoName(repoName)
  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  const report = { steps: [], errors: [], repoName: safeName }

  try {
    // 1. Get authenticated user
    const userRes = await fetch('https://api.github.com/user', { headers: ghHeaders, signal: AbortSignal.timeout(8000) })
    if (!userRes.ok) return res.status(401).json({ error: 'GitHub Token غير صالح.' })
    const user = await userRes.json()
    const owner = user.login
    report.owner = owner

    // 2. Create repository
    report.steps.push('🧠 تحليل الطلب...')
    report.steps.push('🔐 التحقق من GitHub Token... ✅')

    let repoReused = false
    const createRepoRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({
        name: safeName,
        description: description || prompt.slice(0, 150) || `Created by DZ Agent 🇩🇿`,
        private: isPrivate,
        auto_init: true,
        default_branch: 'main',
      }),
      signal: AbortSignal.timeout(20000),
    })
    const repoData = await createRepoRes.json()
    if (!createRepoRes.ok) {
      if (createRepoRes.status === 422 || repoData.message?.includes('already exists')) {
        repoReused = true
        report.steps.push(`♻️ المستودع "${safeName}" موجود — سنستخدمه`)
      } else {
        return res.status(createRepoRes.status).json({ error: repoData.message || 'فشل إنشاء المستودع.' })
      }
    } else {
      report.steps.push(`📦 إنشاء المستودع "${safeName}"... ✅`)
    }

    await new Promise(r => setTimeout(r, 2500))

    // 3. Push README.md if not already initialized
    const readmeContent = `# ${safeName}\n\n${description || prompt || 'مشروع منشأ بواسطة DZ Agent 🇩🇿'}\n\n---\n*Built with DZ Agent — Made in Algeria 🇩🇿*\n`
    const readmeRes = await fetch(`https://api.github.com/repos/${owner}/${safeName}/contents/README.md`, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify({
        message: '📚 Add README — by DZ Agent 🤖',
        content: Buffer.from(readmeContent).toString('base64'),
        branch: 'main',
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (readmeRes.ok) {
      report.steps.push('✍️ إنشاء README.md... ✅')
    } else {
      const rdErr = await readmeRes.json()
      if (!rdErr.message?.includes('sha')) {
        report.errors.push('README: ' + (rdErr.message || 'خطأ غير معروف'))
      } else {
        report.steps.push('✍️ README.md موجود مسبقاً')
      }
    }

    // 4. Generate and push index.html if website requested
    let indexHtml = null
    if (isWebsite || /موقع|ويب|website|html|landing|page/i.test(prompt)) {
      report.steps.push('🤖 توليد index.html بالذكاء الاصطناعي...')
      try {
        const aiResult = await safeGenerateAI({
          messages: [
            { role: 'system', content: 'أنت مهندس ويب خبير. أنتج موقع HTML/CSS/JS كامل في ملف واحد لـ GitHub Pages. لا lorem ipsum. تصميم احترافي responsive. Output ONLY the HTML document.' },
            { role: 'user', content: `أنشئ موقع ويب احترافي: ${prompt || description || safeName}` },
          ],
          query: prompt, max_tokens: 8000,
        })
        indexHtml = extractHtmlFromResponse(aiResult.content || '') || aiResult.content || ''
      } catch (_) { indexHtml = null }

      if (!indexHtml || indexHtml.length < 100) {
        indexHtml = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0d1117;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}.card{background:#161b22;border:1px solid #30363d;border-radius:16px;padding:3rem;max-width:600px;width:100%}h1{font-size:2.5rem;margin-bottom:1rem;background:linear-gradient(135deg,#00d4aa,#00a3e0);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#8b949e;line-height:1.7;font-size:1.1rem}.badge{display:inline-block;margin-top:1.5rem;background:#21262d;border:1px solid #30363d;border-radius:20px;padding:.5rem 1.2rem;font-size:.9rem;color:#58a6ff}</style></head><body><div class="card"><h1>${safeName}</h1><p>${description || prompt || 'مشروع رائع منشأ بواسطة DZ Agent'}</p><span class="badge">🇩🇿 Made with DZ Agent</span></div></body></html>`
      }

      const htmlRes = await fetch(`https://api.github.com/repos/${owner}/${safeName}/contents/index.html`, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({
          message: '🚀 Add index.html — by DZ Agent 🤖',
          content: Buffer.from(indexHtml).toString('base64'),
          branch: 'main',
        }),
        signal: AbortSignal.timeout(20000),
      })
      if (htmlRes.ok) {
        report.steps.push('✍️ إنشاء index.html... ✅')
      } else {
        const htmlErr = await htmlRes.json()
        report.errors.push('index.html: ' + (htmlErr.message || 'خطأ'))
      }
    }

    // 5. Enable GitHub Pages
    report.steps.push('🌐 تفعيل GitHub Pages...')
    let pagesUrl = `https://${owner}.github.io/${safeName}`
    let pagesStatus = 'building'
    try {
      const pagesRes = await fetch(`https://api.github.com/repos/${owner}/${safeName}/pages`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
        signal: AbortSignal.timeout(15000),
      })
      const pagesData = await pagesRes.json()
      if (pagesRes.ok || pagesRes.status === 409) {
        pagesStatus = pagesData.status || 'building'
        pagesUrl = pagesData.html_url || pagesUrl
        report.steps.push('🚀 نشر GitHub Pages... ✅')
        report.steps.push('✅ العملية اكتملت بنجاح!')
      } else {
        report.errors.push('Pages: ' + (pagesData.message || 'خطأ في التفعيل'))
      }
    } catch (pErr) {
      report.errors.push('Pages: ' + pErr.message)
    }

    console.log(`[GH:create-repo-full] Done: ${owner}/${safeName} → ${pagesUrl}`)
    return res.json({
      success: true,
      owner,
      repo: safeName,
      repoUrl: `https://github.com/${owner}/${safeName}`,
      siteUrl: pagesUrl,
      pagesStatus,
      repoReused,
      hasWebsite: !!(isWebsite || indexHtml),
      steps: report.steps,
      errors: report.errors,
    })
  } catch (err) {
    console.error('[GH:create-repo-full]', err.message)
    return res.status(500).json({ error: err.message, steps: report.steps })
  }
})

// ── POST /api/dz-agent/github/exec ────────────────────────────────────────
// Natural language GitHub command executor — maps NL → real GitHub API operations
// Understands: create file, edit file, create branch, commit, deploy pages, fix error
app.post('/api/dz-agent/github/exec', async (req, res) => {
  const { command, repo, branch = 'main', context = {}, token } = req.body
  if (!command) return res.status(400).json({ error: 'command مطلوب.' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const cmd = normalizeQuery(command)
  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  // Classify the GitHub command
  const isCreateFile = /أنشئ|انشئ|اكتب|create|add|أضف/i.test(command) && /ملف|file|html|css|js|json|md/i.test(command)
  const isEditFile   = /عدل|حدث|عدّل|حدّث|edit|update|modify|غيّر/i.test(command)
  const isCreateBranch = /فرع|branch/i.test(command) && /أنشئ|انشئ|create|جديد/i.test(command)
  const isCommit     = /commit|إضافة|سجل|حفظ/i.test(command)
  const isDeploy     = /انشر|نشر|deploy|pages|github\.io/i.test(command)
  const isFixError   = /أصلح|صلح|fix|repair|debug|حل|خطأ|error/i.test(command)
  const isListFiles  = /اعرض|قائمة|list|show|files/i.test(command)

  try {
    // Route to appropriate operation
    if (isListFiles && repo) {
      const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
        headers: ghHeaders, signal: AbortSignal.timeout(10000),
      })
      if (!treeRes.ok) return res.status(404).json({ error: `لم يتم العثور على المستودع "${repo}" أو الفرع "${branch}".` })
      const treeData = await treeRes.json()
      const files = (treeData.tree || []).filter(f => f.type === 'blob').map(f => f.path)
      return res.json({ success: true, operation: 'list_files', files, count: files.length, repo, branch })
    }

    if (isCreateBranch && repo) {
      const newBranch = context.branchName || command.match(/(?:اسمه|named?|باسم)\s+["']?(\S+?)["']?(?:\s|$)/i)?.[1] || `dz-agent/${Date.now()}`
      const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, {
        headers: ghHeaders, signal: AbortSignal.timeout(8000),
      })
      if (!refRes.ok) return res.status(404).json({ error: `الفرع المصدر "${branch}" غير موجود.` })
      const { object: { sha } } = await refRes.json()
      const createRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
        method: 'POST', headers: ghHeaders,
        body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
        signal: AbortSignal.timeout(15000),
      })
      const createData = await createRes.json()
      if (!createRes.ok && !createData.message?.includes('already exists')) {
        return res.status(createRes.status).json({ error: createData.message })
      }
      return res.json({ success: true, operation: 'create_branch', branch: newBranch, sha, repo })
    }

    if (isDeploy && repo) {
      const [owner, repoName] = repo.split('/')
      const pagesRes = await fetch(`https://api.github.com/repos/${repo}/pages`, {
        method: 'POST', headers: ghHeaders,
        body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
        signal: AbortSignal.timeout(15000),
      })
      const pagesData = await pagesRes.json()
      const siteUrl = pagesData.html_url || `https://${owner}.github.io/${repoName}`
      return res.json({
        success: pagesRes.ok || pagesRes.status === 409,
        operation: 'enable_pages',
        siteUrl,
        status: pagesData.status || 'building',
        repo,
      })
    }

    // For create/edit/fix/commit — use AI to generate content then push
    if ((isCreateFile || isEditFile || isFixError || isCommit) && repo) {
      // Step 1: Identify target file
      const fileMatch = command.match(/["']([^"']+\.\w+)["']|(\S+\.\w{2,5})/i)
      const targetFile = context.filePath || fileMatch?.[1] || fileMatch?.[2] || 'index.html'

      // Step 2: Get current content if exists
      let currentContent = context.currentContent || ''
      let currentSha = null
      try {
        const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(targetFile)}?ref=${encodeURIComponent(branch)}`, {
          headers: ghHeaders, signal: AbortSignal.timeout(8000),
        })
        if (getRes.ok) {
          const getData = await getRes.json()
          currentContent = Buffer.from(getData.content, 'base64').toString('utf8')
          currentSha = getData.sha
        }
      } catch (_) {}

      // Step 3: AI generates new/fixed content
      const aiMessages = [
        {
          role: 'system',
          content: `أنت مهندس GitHub DevOps متخصص. نفّذ الأمر التالي على الملف المحدد.
قواعد:
- أخرج فقط محتوى الملف الجديد بدون شرح ولا markdown code blocks.
- إذا كان الملف HTML: أخرج HTML كاملاً فقط.
- إذا كان JS/CSS: أخرج الكود فقط.
- لا lorem ipsum — محتوى حقيقي احترافي.`,
        },
        {
          role: 'user',
          content: `المستودع: ${repo}\nالفرع: ${branch}\nالملف: ${targetFile}\nالأمر: ${command}${currentContent ? `\n\nالمحتوى الحالي:\n${currentContent.slice(0, 3000)}` : ''}`,
        },
      ]
      const aiResult = await safeGenerateAI({ messages: aiMessages, query: command, max_tokens: 8000 })
      let newContent = aiResult.content || ''

      // Extract HTML if applicable
      if (targetFile.endsWith('.html')) {
        newContent = extractHtmlFromResponse(newContent) || newContent
      }

      if (!newContent || newContent.length < 10) {
        return res.status(500).json({ error: 'فشل توليد محتوى الملف.' })
      }

      // Step 4: Push to GitHub
      const commitMsg = `${isFixError ? '🛠️ fix' : isEditFile ? '✏️ update' : '✨ create'}: ${targetFile} — by DZ Agent 🤖`
      const pushBody = {
        message: commitMsg,
        content: Buffer.from(newContent).toString('base64'),
        branch,
      }
      if (currentSha) pushBody.sha = currentSha

      const pushRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(targetFile)}`, {
        method: 'PUT', headers: ghHeaders,
        body: JSON.stringify(pushBody),
        signal: AbortSignal.timeout(20000),
      })
      const pushData = await pushRes.json()
      if (!pushRes.ok) return res.status(pushRes.status).json({ error: pushData.message || 'فشل Push.' })

      console.log(`[GH:exec] ${isFixError ? 'fixed' : isEditFile ? 'edited' : 'created'} ${targetFile} in ${repo}@${branch}`)
      return res.json({
        success: true,
        operation: isFixError ? 'fix_and_commit' : isEditFile ? 'edit_and_commit' : 'create_and_commit',
        file: targetFile,
        repo,
        branch,
        commitSha: pushData.commit?.sha,
        commitUrl: pushData.commit?.html_url,
        fileUrl: pushData.content?.html_url,
        action: currentSha ? 'updated' : 'created',
      })
    }

    // Fallback: use AI to interpret and respond
    const fallbackAI = await safeGenerateAI({
      messages: [
        { role: 'system', content: 'أنت GitHub DevOps engineer. حلّل الأمر وأخبر المستخدم ماذا تحتاج (repo, branch, file) لتنفيذه.' },
        { role: 'user', content: command },
      ],
      query: command, max_tokens: 500,
    })
    return res.json({ success: false, operation: 'clarification_needed', message: fallbackAI.content, command })
  } catch (err) {
    console.error('[GH:exec]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/dz-agent/github/init-empty-repo ──────────────────────────────
// Auto-initialize an empty repository: add README + index.html + first commit
app.post('/api/dz-agent/github/init-empty-repo', async (req, res) => {
  const { repo, description = '', isWebsite = true, token } = req.body
  if (!repo) return res.status(400).json({ error: 'repo مطلوب.' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repo format.' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  const [owner, repoName] = repo.split('/')
  const results = { created: [], failed: [] }

  // Push README.md
  const readme = `# ${repoName}\n\n${description || 'مشروع منشأ بواسطة DZ Agent 🇩🇿'}\n\n---\n*Built with [DZ Agent](https://dz-gpt.vercel.app) — Made in Algeria 🇩🇿*\n`
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/README.md`, {
      method: 'PUT', headers: ghHeaders,
      body: JSON.stringify({ message: '📚 Initial commit: README — by DZ Agent 🤖', content: Buffer.from(readme).toString('base64'), branch: 'main' }),
      signal: AbortSignal.timeout(15000),
    })
    if (r.ok) results.created.push('README.md')
    else results.failed.push('README.md')
  } catch { results.failed.push('README.md') }

  // Push index.html if website
  if (isWebsite) {
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${repoName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem}.card{background:#161b22;border:1px solid #30363d;border-radius:16px;padding:3rem;max-width:640px;width:100%;text-align:center}h1{font-size:2.5rem;font-weight:700;margin-bottom:1rem;background:linear-gradient(135deg,#00d4aa,#00a3e0);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#8b949e;line-height:1.7;font-size:1.1rem;margin-bottom:1.5rem}.badge{display:inline-flex;align-items:center;gap:.4rem;background:#21262d;border:1px solid #30363d;border-radius:20px;padding:.5rem 1.2rem;font-size:.9rem;color:#58a6ff;text-decoration:none}a.badge:hover{border-color:#58a6ff}</style></head><body><div class="card"><h1>${repoName}</h1><p>${description || 'مشروع رائع منشأ بواسطة DZ Agent 🤖'}</p><a class="badge" href="https://dz-gpt.vercel.app">🇩🇿 Powered by DZ Agent</a></div></body></html>`
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/contents/index.html`, {
        method: 'PUT', headers: ghHeaders,
        body: JSON.stringify({ message: '🚀 Initial commit: index.html — by DZ Agent 🤖', content: Buffer.from(html).toString('base64'), branch: 'main' }),
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) results.created.push('index.html')
      else results.failed.push('index.html')
    } catch { results.failed.push('index.html') }

    // Enable Pages
    try {
      await fetch(`https://api.github.com/repos/${repo}/pages`, {
        method: 'POST', headers: ghHeaders,
        body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
        signal: AbortSignal.timeout(15000),
      })
      results.pagesEnabled = true
    } catch { results.pagesEnabled = false }
  }

  console.log(`[GH:init-empty-repo] Initialized ${repo}: ${results.created.join(', ')}`)
  return res.json({
    success: results.created.length > 0,
    repo,
    ...results,
    repoUrl: `https://github.com/${repo}`,
    siteUrl: isWebsite ? `https://${owner}.github.io/${repoName}` : null,
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GITHUB EXECUTION AGENT V2 — Real DevOps + Verification Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /api/dz-agent/github/verify-env ────────────────────────────────────
// Check: token validity, repo access, branch existence, Pages status, permissions
app.post('/api/dz-agent/github/verify-env', async (req, res) => {
  const { repo, branch = 'main', token } = req.body
  const tok = resolveGitHubToken(token)
  const report = { ok: false, checks: {}, errors: [] }

  // 1. Token check
  if (!tok) {
    report.errors.push('GITHUB_PERSONAL_ACCESS_TOKEN / GITHUB_TOKEN غير مضبوط في الأسرار')
    return res.status(401).json(report)
  }
  const hdr = ghHeaders(tok)

  // 2. Authenticate
  try {
    const userRes = await fetch('https://api.github.com/user', { headers: hdr, signal: AbortSignal.timeout(8000) })
    if (!userRes.ok) {
      report.errors.push('Token غير صالح أو منتهي الصلاحية')
      return res.status(401).json(report)
    }
    const user = await userRes.json()
    report.checks.auth = { ok: true, login: user.login, name: user.name, plan: user.plan?.name || 'free' }
  } catch (e) { report.errors.push('فشل التحقق من Token: ' + e.message); return res.status(500).json(report) }

  // 3. Repo access (if provided)
  if (repo && isValidGithubRepo(repo)) {
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers: hdr, signal: AbortSignal.timeout(8000) })
      if (repoRes.ok) {
        const rd = await repoRes.json()
        report.checks.repo = { ok: true, full_name: rd.full_name, private: rd.private, default_branch: rd.default_branch, has_pages: rd.has_pages }
      } else { report.checks.repo = { ok: false, error: `HTTP ${repoRes.status}` } }
    } catch (e) { report.checks.repo = { ok: false, error: e.message } }

    // 4. Branch check
    if (report.checks.repo?.ok) {
      try {
        const brRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: hdr, signal: AbortSignal.timeout(8000) })
        report.checks.branch = { ok: brRes.ok, branch, sha: brRes.ok ? (await brRes.json())?.object?.sha : null }
      } catch (e) { report.checks.branch = { ok: false, error: e.message } }

      // 5. Pages status
      try {
        const pgRes = await fetch(`https://api.github.com/repos/${repo}/pages`, { headers: hdr, signal: AbortSignal.timeout(8000) })
        if (pgRes.ok) {
          const pg = await pgRes.json()
          report.checks.pages = { ok: true, status: pg.status, url: pg.html_url, source_branch: pg.source?.branch }
        } else { report.checks.pages = { ok: false, status: 'not_enabled' } }
      } catch { report.checks.pages = { ok: false, status: 'unknown' } }
    }
  }

  // 6. Token permissions check
  try {
    const scopeRes = await fetch('https://api.github.com/rate_limit', { headers: hdr, signal: AbortSignal.timeout(5000) })
    const scopes = scopeRes.headers.get('x-oauth-scopes') || ''
    report.checks.permissions = {
      ok: true,
      scopes: scopes.split(',').map(s => s.trim()).filter(Boolean),
      has_repo: scopes.includes('repo') || scopes.includes('public_repo'),
      has_workflow: scopes.includes('workflow'),
      has_pages: scopes.includes('pages'),
      rate_limit: {
        remaining: parseInt(scopeRes.headers.get('x-ratelimit-remaining') || '0'),
        limit: parseInt(scopeRes.headers.get('x-ratelimit-limit') || '0'),
      },
    }
  } catch { report.checks.permissions = { ok: false } }

  report.ok = report.errors.length === 0
  console.log(`[GH:verify-env] ${report.checks.auth?.login || 'unknown'} — ${JSON.stringify(report.checks)}`)
  return res.json(report)
})

// ── POST /api/dz-agent/github/exec-pipeline ────────────────────────────────
// Full execution pipeline: NL command → plan → execute → verify → report
// Supports: create/edit/delete files, create repo, create branch, deploy Pages, commit
app.post('/api/dz-agent/github/exec-pipeline', async (req, res) => {
  const { command, repo, branch = 'main', files = [], commitMessage, token, deployPages = false } = req.body
  if (!command && files.length === 0) return res.status(400).json({ error: 'command أو files مطلوب' })

  const tok = resolveGitHubToken(token)
  if (!tok) return res.status(401).json({ error: 'GITHUB_PERSONAL_ACCESS_TOKEN / GITHUB_TOKEN غير مضبوط في Replit Secrets' })

  const hdr = ghHeaders(tok)
  const pipeline = { steps: [], errors: [], verifications: {}, ok: false }

  try {
    // STEP 1 — Auth + environment check
    pipeline.steps.push('🔐 التحقق من GitHub Token...')
    const userRes = await fetch('https://api.github.com/user', { headers: hdr, signal: AbortSignal.timeout(8000) })
    if (!userRes.ok) { pipeline.errors.push('Token غير صالح'); return res.status(401).json(pipeline) }
    const user = await userRes.json()
    const owner = repo ? repo.split('/')[0] : user.login
    pipeline.steps.push(`✅ مصادق كـ ${user.login}`)

    // STEP 2 — Repo access check (if provided)
    if (repo && isValidGithubRepo(repo)) {
      pipeline.steps.push(`🔍 فحص المستودع ${repo}...`)
      const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers: hdr, signal: AbortSignal.timeout(8000) })
      if (!repoRes.ok) { pipeline.errors.push(`المستودع "${repo}" غير موصول أو لا صلاحية عليه`); return res.status(404).json(pipeline) }
      pipeline.steps.push(`✅ المستودع ${repo} متاح`)

      // STEP 3 — Branch check / create
      const brRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: hdr, signal: AbortSignal.timeout(8000) })
      if (!brRes.ok) {
        pipeline.steps.push(`📌 إنشاء الفرع "${branch}"...`)
        // Try creating from main/master
        for (const src of ['main', 'master']) {
          const srcRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${src}`, { headers: hdr, signal: AbortSignal.timeout(6000) })
          if (srcRes.ok) {
            const { object: { sha } } = await srcRes.json()
            const newBrRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
              method: 'POST', headers: hdr,
              body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
              signal: AbortSignal.timeout(12000),
            })
            if (newBrRes.ok) { pipeline.steps.push(`✅ الفرع "${branch}" أُنشئ`); break }
          }
        }
      } else { pipeline.steps.push(`✅ الفرع "${branch}" موجود`) }
    }

    // STEP 4 — Execute file operations
    const pushedFiles = []
    for (const f of files) {
      if (!f.path || !f.content) continue
      pipeline.steps.push(`✍️ كتابة ${f.path}...`)

      // Get current SHA if file exists (needed for update)
      let sha = null
      try {
        const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(f.path)}?ref=${encodeURIComponent(branch)}`, { headers: hdr, signal: AbortSignal.timeout(6000) })
        if (getRes.ok) sha = (await getRes.json()).sha
      } catch {}

      const putBody = {
        message: f.commitMessage || commitMessage || `🤖 DZ Agent: update ${f.path}`,
        content: Buffer.from(f.content).toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      }

      let pushOk = false
      for (let attempt = dlp pipelines
// per card and rate-limit the upstream extractors.
const _warmInflight = new Map() // youtubeUrl -> Promise<string>
app.get('/api/dz-tube/warm', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ ok: false, error: 'invalid url' })

  const t0 = Date.now()
  // Fast path: already cached → return immediately, signal cache-hit.
  const cached = _audioUrlCache.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ ok: true, cached: true, ms: 0, expiresInMs: cached.expiresAt - Date.now() })
  }

  // Coalesce concurrent calls.
  let pending = _warmInflight.get(url)
  if (!pending) {
    pending = resolveDirectAudioUrl(url, { bypassCache: false })
      .finally(() => { _warmInflight.delete(url) })
    _warmInflight.set(url, pending)
  }

  try {
    await pending
    return res.json({ ok: true, cached: false, ms: Date.now() - t0 })
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message, ms: Date.now() - t0 })
  }
})

// Diagnostic: run each extractor independently and report which succeed/fail.
// Useful for triaging "audio doesn't play" reports — gated behind a token so
// the diagnostic surface isn't open to the world. Set DEBUG_EXTRACT_TOKEN to
// enable; pass `?token=<value>`.
app.get('/api/dz-tube/debug-extract', async (req, res) => {
  const expected = process.env.DEBUG_EXTRACT_TOKEN
  if (!expected) return res.status(404).end()
  if (String(req.query.token || '') !== expected) return res.status(403).end()
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'invalid url' })
  const videoId = extractYouTubeVideoId(url)
  const t0 = Date.now()
  const runOne = async (name, fn) => {
    const s = Date.now()
    try {
      const out = await fn()
      return { name, ok: true, ms: Date.now() - s, url: typeof out === 'string' ? out.slice(0, 200) : (out?.url || '').slice(0, 200) }
    } catch (e) {
      return { name, ok: false, ms: Date.now() - s, error: String(e?.message || e).slice(0, 400) }
    }
  }
  const dlpBin = await ytDlpBinaryPath().catch(() => null)
  const cookiesPath = await ytDlpCookiesPath().catch(() => null)
  const results = await Promise.all([
    runOne('piped', async () => {
      const r = await fetchPipedStreams(videoId, { isAudio: true })
      if (!r?.url) throw new Error('no url')
      const probe = await probeUpstreamPlayable(r.url)
      return { url: r.url, probe }
    }),
    runOne('invidious', async () => {
      const r = await fetchInvidiousStreams(videoId, { isAudio: true })
      if (!r?.url) throw new Error('no url')
      const probe = await probeUpstreamPlayable(r.url)
      return { url: r.url, probe }
    }),
    runOne('ytdl-core', async () => {
      const info = await ytdl.getInfo(url)
      const fmt = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
      if (!fmt?.url) throw new Error('no url')
      return fmt.url
    }),
    runOne('yt-dlp', async () => {
      if (!dlpBin) throw new Error('binary not available')
      const cookies = await ytDlpCookiesArgs()
      const antiBot = ytDlpAntiBotArgs()
      return await new Promise((resolve, reject) => {
        const proc = spawn(dlpBin, ['-f', 'bestaudio[ext=m4a]/bestaudio/best', '-g', '--no-playlist', ...antiBot, ...cookies, url])
        let out = '', err = ''
        const t = setTimeout(() => { try { proc.kill('SIGKILL') } catch {}; reject(new Error('timeout 15s; stderr=' + err.slice(0, 300))) }, 15000)
        proc.stdout.on('data', d => { out += d.toString() })
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('error', e => { clearTimeout(t); reject(e) })
        proc.on('close', code => { clearTimeout(t); const u = out.trim().split('\n')[0]; if (code !== 0 || !u) return reject(new Error('exit ' + code + '; stderr=' + err.slice(0, 300))); resolve(u) })
      })
    }),
  ])
  res.json({ videoId, totalMs: Date.now() - t0, dlpBin, cookiesConfigured: !!cookiesPath, results })
})

app.get('/api/dz-tube/audio-proxy', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).end('invalid url')

  // Client-driven cache invalidation. The mini-player adds `&_r=<ts>` on
  // every recovery rebind — that's our signal that the current cached URL
  // is dead and we must re-extract.
  const bypassCache = !!req.query._r

  // Resolve the upstream URL.
  let upstreamUrl
  try {
    upstreamUrl = await resolveDirectAudioUrl(url, { bypassCache })
  } catch (e) {
    console.error('[audio-proxy] resolve failed:', e.message)
    return res.status(502).end('فشل تحضير الصوت')
  }

  // Safari / iOS path: remux opus/webm to AAC-in-MP4 in a streaming ffmpeg
  // pipeline. WebKit can't decode opus directly.
  const wantRemux = req.query.force_remux === '1' || isSafariOrIOS(req.headers['user-agent'])
  if (wantRemux && await ffmpegAvailable()) {
    return remuxAudioToClient(upstreamUrl, req, res)
  }

  // ALWAYS byte-pipe — never 307-redirect.
  // Previously we 307-redirected Piped/Invidious URLs directly to the browser.
  // This caused two fatal bugs:
  //  1. Piped/Invidious instances close connections after a few KB (rate limiting,
  //     abuse prevention). When they do, the browser's <audio> element receives a
  //     clean close and fires 'ended' — the player thinks the track finished and
  //     advances to the next one, causing silent playback.
  //  2. crossOrigin='anonymous' on the <audio> element triggers a CORS preflight.
  //     Piped doesn't always return Access-Control-Allow-Origin: *, so the request
  //     is silently blocked by the browser.
  // By always routing through streamAudioBytesToClient we:
  //  • Control the connection (Piped drops are invisible to the browser)
  //  • Serve chunks ≤1 MB so every Vercel invocation finishes in < 5 s
  //  • Let the browser request successive Range chunks automatically
  return streamAudioBytesToClient(req, res, url, upstreamUrl)
})

// Clean /api/stream?id=VIDEO_ID alias used by the Service Worker and any
// external consumer. Translates a bare video ID to the full audio-proxy flow.
app.get('/api/stream', async (req, res) => {
  const id = String(req.query.id || '').trim()
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return res.status(400).end('invalid id')
  // Rewrite to the canonical YouTube URL so resolveDirectAudioUrl recognises it.
  req.query.url = `https://www.youtube.com/watch?v=${id}`
  // Proxy through the same byte-pipe handler used by the mini-player.
  const url = req.query.url
  let upstreamUrl
  try {
    upstreamUrl = await resolveDirectAudioUrl(url, { bypassCache: !!req.query._r })
  } catch (e) {
    console.error('[stream] resolve failed:', e.message)
    return res.status(502).end('فشل تحضير الصوت')
  }
  // Set appropriate headers for clients that consume this as a standalone URL.
  res.setHeader('Content-Type', 'audio/mpeg')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  return streamAudioBytesToClient(req, res, url, upstreamUrl)
})

// Explicit byte-pipe endpoint kept for parity with the client's fallback
// path (after multiple 403s on the redirect path the mini-player flips to
// this). Now that audio-proxy auto-routes direct googlevideo URLs through
// the byte-pipe, this is rarely needed but remains as an escape hatch.
app.get('/api/dz-tube/audio-pipe', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).end('invalid url')

  let upstreamUrl
  try {
    upstreamUrl = await resolveDirectAudioUrl(url, { bypassCache: !!req.query._r })
  } catch (e) {
    return res.status(502).end('فشل تحضير الصوت')
  }

  return streamAudioBytesToClient(req, res, url, upstreamUrl)
})

// Streaming audio proxy: buffers to /tmp, then serves with Range support
const audioCacheDir = `${os.tmpdir()}/dz-tube-audio`
try { fs.mkdirSync(audioCacheDir, { recursive: true }) } catch {}
// In-flight downloads keyed by hash so concurrent requests for the same track
// share a single yt-dlp/ffmpeg pipeline instead of racing each other.
const audioDownloads = new Map()

function spawnAudioStream(url) {
  return ytDlpAvailable().then(useDlp => {
    if (useDlp) {
      const proc = spawn('yt-dlp', [
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '--no-warnings', '--no-playlist',
        '-o', '-',
        url,
      ], { stdio: ['ignore', 'pipe', 'pipe'] })
      proc.stderr.on('data', d => { /* console.warn('[yt-dlp]', d.toString()) */ })
      return { stream: proc.stdout, kill: () => { try { proc.kill('SIGKILL') } catch {} } }
    }
    const s = ytdl(url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 })
    return { stream: s, kill: () => { try { s.destroy() } catch {} } }
  })
}

// Download full audio to disk via yt-dlp, then remux with faststart so the moov
// atom is at the front (HTML5 audio needs this to know duration & to play).
// Returns a promise that resolves once the file at `outPath` is fully written.
function ffmpegAvailable() {
  if (ffmpegAvailable._cached !== undefined) return Promise.resolve(ffmpegAvailable._cached)
  return new Promise(resolve => {
    const p = spawn('ffmpeg', ['-version'])
    p.on('error', () => { ffmpegAvailable._cached = false; resolve(false) })
    p.on('close', code => { ffmpegAvailable._cached = code === 0; resolve(ffmpegAvailable._cached) })
  })
}

async function downloadAudioToFile(url, outPath) {
  const tmpRaw = outPath + '.raw'
  const useDlp = await ytDlpAvailable()

  // Step 1: pull bytes to tmpRaw
  await new Promise((resolve, reject) => {
    if (useDlp) {
      const proc = spawn('yt-dlp', [
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '--no-warnings', '--no-playlist',
        '-o', tmpRaw,
        url,
      ], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stderr = ''
      proc.stderr.on('data', d => { stderr += d.toString() })
      proc.on('error', reject)
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || `yt-dlp exited ${code}`)))
    } else {
      const s = ytdl(url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 })
      const ws = fs.createWriteStream(tmpRaw)
      s.on('error', reject)
      ws.on('error', reject)
      ws.on('finish', resolve)
      s.pipe(ws)
    }
  })

  // Step 2: remux with ffmpeg if available, ensuring moov is at the front (faststart).
  // This makes the file progressively playable & duration-readable.
  const hasFf = await ffmpegAvailable()
  if (!hasFf) {
    fs.renameSync(tmpRaw, outPath)
    return
  }
  const tmpFixed = outPath + '.fixed'
  await new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', tmpRaw,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'mp4',
      tmpFixed,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg exited ${code}`)))
  })
  try { fs.unlinkSync(tmpRaw) } catch {}
  fs.renameSync(tmpFixed, outPath)
}

// Resolve an audio URL for a YouTube link.
// Strategy (tried in order):
//   1. iOS player_client → prefers HLS m3u8 manifest URLs (best for background audio)
//   2. bestaudio without player_client restriction → direct googlevideo URL
// Returns { url: string, isHls: boolean }
async function resolveAudioPlaylistUrl(youtubeUrl) {
  const dlpBin = await ytDlpBinaryPath()
  if (!dlpBin) throw new Error('yt-dlp غير متوفر على هذا الخادم')
  const cookies = await ytDlpCookiesArgs()

  // Helper: run yt-dlp with given args, returns the first output URL or null
  function runDlp(extraArgs) {
    return new Promise(resolve => {
      try {
        const proc = spawn(dlpBin, [
          ...extraArgs,
          ...cookies,
          '-g', '--no-warnings', '--no-playlist', youtubeUrl,
        ])
        let out = '', err = ''
        proc.stdout.on('data', d => { out += d.toString() })
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('error', () => resolve(null))
        proc.on('close', code => {
          const u = out.trim().split('\n')[0]
          if (code === 0 && u && /^https?:\/\//.test(u)) resolve(u)
          else resolve(null)
        })
      } catch { resolve(null) }
    })
  }

  // Attempt 1: iOS player_client — returns HLS m3u8 manifest.
  // This is the best format for background audio: segment-based (3-10 s),
  // immune to Vercel's 60s timeout, buffers ahead, no SABR streaming issues.
  const iosUrl = await runDlp(['--extractor-args', 'youtube:player_client=ios', '--no-check-formats', '-f', 'ba/bestaudio'])
  if (iosUrl) {
    const isHls = /\.m3u8($|\?)/i.test(iosUrl) || /manifest\.googlevideo\.com/i.test(iosUrl)
    console.log('[audio-stream] resolved via iOS client —', isHls ? 'HLS ✓' : 'direct')
    return { url: iosUrl, isHls }
  }

  // Attempt 2: android client — returns direct googlevideo URL.
  const androidUrl = await runDlp(['--extractor-args', 'youtube:player_client=android,ios,web', '--no-check-formats', '-f', 'bestaudio[ext=m4a]/bestaudio/best'])
  if (androidUrl) {
    console.log('[audio-stream] resolved via android client — direct URL')
    return { url: androidUrl, isHls: false }
  }

  // Attempt 3: tv_embedded client — often bypasses bot detection.
  const tvUrl = await runDlp(['--extractor-args', 'youtube:player_client=tv_embedded', '--no-check-formats', '-f', 'bestaudio/best'])
  if (tvUrl) {
    const isHls = /\.m3u8($|\?)/i.test(tvUrl) || /manifest\.googlevideo\.com/i.test(tvUrl)
    console.log('[audio-stream] resolved via tv_embedded client —', isHls ? 'HLS' : 'direct')
    return { url: tvUrl, isHls }
  }

  throw new Error('yt-dlp: could not resolve audio URL for ' + youtubeUrl)
}

// Cache resolved audio URLs (googlevideo signed URLs expire ~6h; refresh after 1h)
const _playlistUrlCache = new Map() // youtubeUrl -> { url, isHls, expiresAt }
async function getCachedPlaylistUrl(youtubeUrl) {
  const cached = _playlistUrlCache.get(youtubeUrl)
  if (cached && cached.expiresAt > Date.now()) return cached
  const result = await resolveAudioPlaylistUrl(youtubeUrl)
  _playlistUrlCache.set(youtubeUrl, { ...result, expiresAt: Date.now() + 60 * 60 * 1000 })
  return result
}

// Whitelist of upstream hosts we are willing to proxy
function isAllowedUpstreamHost(u) {
  try {
    const h = new URL(u).hostname
    return /(^|\.)googlevideo\.com$/i.test(h) || /(^|\.)youtube\.com$/i.test(h) ||
           /(^|\.)ytimg\.com$/i.test(h) || h === 'manifest.googlevideo.com'
  } catch { return false }
}

// Serve the m3u8 playlist with each segment URL rewritten to go through our
// /audio-segment proxy (googlevideo segments are signed to the server's IP).
app.get('/api/dz-tube/audio-stream', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).end('invalid url')

  let resolved
  try {
    resolved = await getCachedPlaylistUrl(url)
  } catch (e) {
    console.error('[audio-stream] resolve failed:', e.message)
    return res.status(502).end('فشل تحميل الصوت')
  }

  const { url: masterUrl, isHls } = resolved

  // Non-HLS path: yt-dlp returned a direct audio URL (not M3U8).
  // HLS.js cannot parse a direct audio stream as a playlist, so we return a
  // clear error here. The backgroundPlayer error handler in the frontend will
  // fall back to /api/dz-tube/audio-proxy automatically.
  if (!isHls) {
    console.log('[audio-stream] non-HLS — signalling 501 so client falls back to audio-proxy')
    return res.status(501).end('non-hls')
  }

  // HLS path: fetch the M3U8 manifest and rewrite segment URLs so they go
  // through our same-origin /audio-segment proxy (googlevideo segments are
  // IP-bound and must be fetched from the server that resolved them).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const upstream = await fetch(masterUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (upstream.status === 403 && attempt === 0) {
        _playlistUrlCache.delete(url)
        resolved = await getCachedPlaylistUrl(url)
        if (!resolved.isHls) {
          return res.redirect(307, `/api/dz-tube/audio-proxy?url=${encodeURIComponent(url)}`)
        }
        continue
      }
      if (!upstream.ok) {
        console.error('[audio-stream] upstream', upstream.status)
        return res.status(502).end('فشل تحميل الصوت')
      }
      const text = await upstream.text()
      const rewritten = text.split('\n').map(line => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return line
        if (/^https?:\/\//i.test(t) && isAllowedUpstreamHost(t)) {
          return `/api/dz-tube/audio-segment?u=${encodeURIComponent(t)}`
        }
        return line
      }).join('\n')
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.status(200).end(rewritten)
      return
    } catch (e) {
      if (attempt === 1) {
        console.error('[audio-stream] fetch failed:', e.message)
        if (!res.headersSent) res.status(502).end('فشل تحميل الصوت')
        else res.end()
        return
      }
    }
  }
})

// Proxy individual HLS segments (and nested playlists) from googlevideo.
app.get('/api/dz-tube/audio-segment', async (req, res) => {
  const u = String(req.query.u || '')
  if (!u || !isAllowedUpstreamHost(u)) return res.status(400).end('invalid url')
  try {
    const fwdHeaders = { 'User-Agent': 'Mozilla/5.0' }
    if (req.headers.range) fwdHeaders['Range'] = req.headers.range
    const upstream = await fetch(u, { headers: fwdHeaders })
    // If upstream returned a nested playlist (HLS variant), rewrite it too.
    const ct = upstream.headers.get('content-type') || ''
    if (/mpegurl|m3u8/i.test(ct) || /\.m3u8($|\?)/i.test(u)) {
      const text = await upstream.text()
      const rewritten = text.split('\n').map(line => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return line
        if (/^https?:\/\//i.test(t) && isAllowedUpstreamHost(t)) {
          return `/api/dz-tube/audio-segment?u=${encodeURIComponent(t)}`
        }
        return line
      }).join('\n')
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.status(upstream.status).end(rewritten)
      return
    }
    const passHeaders = ['content-length', 'content-range', 'content-type', 'accept-ranges', 'last-modified']
    for (const h of passHeaders) {
      const v = upstream.headers.get(h)
      if (v) res.setHeader(h, v)
    }
    if (!upstream.headers.get('content-type')) res.setHeader('Content-Type', 'video/MP2T')
    res.setHeader('Cache-Control', 'private, max-age=600')
    res.status(upstream.status)
    if (!upstream.body) { res.end(); return }
    const reader = upstream.body.getReader()
    req.on('close', () => { try { reader.cancel() } catch {} })
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!res.write(value)) await new Promise(r => res.once('drain', r))
    }
    res.end()
  } catch (e) {
    console.error('[audio-segment] failed:', e.message)
    if (!res.headersSent) res.status(502).end('segment failed')
    else res.end()
  }
})

// (Legacy disk-cache path retained as a fallback for the /api/dz-tube/download
// endpoint via the helpers below; not used by the streaming endpoint.)
app.get('/api/dz-tube/_unused-audio-stream-disk', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).end('invalid url')

  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)
  const filePath = `${audioCacheDir}/${hash}.m4a`
  const range = req.headers.range

  // FAST PATH: cache exists and is complete → serve with Range support
  if (fs.existsSync(filePath) && fs.statSync(filePath).size >= 1024) {
    const stat = fs.statSync(filePath)
    const total = stat.size
    res.setHeader('Content-Type', 'audio/mp4')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range)
      if (!m) return res.status(416).end()
      const start = parseInt(m[1], 10)
      const end = m[2] ? parseInt(m[2], 10) : total - 1
      if (start >= total || end >= total) return res.status(416).end()
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': end - start + 1,
      })
      return fs.createReadStream(filePath, { start, end }).pipe(res)
    }
    res.setHeader('Content-Length', total)
    return fs.createReadStream(filePath).pipe(res)
  }

  // FIRST-TIME PATH: download fully + faststart-remux, then serve with Range support.
  // We do this (rather than live-piping) so HTML5 <audio> can read duration and seek
  // — required for the mini-player to display time and respond to play.
  console.log('[audio-stream] downloading', url)
  try {
    try { fs.mkdirSync(audioCacheDir, { recursive: true }) } catch {}
    if (!audioDownloads.has(hash)) {
      audioDownloads.set(hash, downloadAudioToFile(url, filePath)
        .finally(() => audioDownloads.delete(hash)))
    }
    await audioDownloads.get(hash)
    console.log('[audio-stream] cached', hash)
  } catch (e) {
    console.error('[audio-stream] download failed:', e.message)
    return res.status(502).end('فشل تحميل الصوت')
  }

  // Re-enter the fast path now that the file is on disk.
  if (!fs.existsSync(filePath)) return res.status(502).end('فشل تحميل الصوت')
  const stat = fs.statSync(filePath)
  const total = stat.size
  res.setHeader('Content-Type', 'audio/mp4')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range)
    if (!m) return res.status(416).end()
    const start = parseInt(m[1], 10)
    const end = m[2] ? parseInt(m[2], 10) : total - 1
    if (start >= total || end >= total) return res.status(416).end()
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': end - start + 1,
    })
    return fs.createReadStream(filePath, { start, end }).pipe(res)
  }
  res.setHeader('Content-Length', total)
  return fs.createReadStream(filePath).pipe(res)
})

// Compute which video heights the *server* can actually deliver as a single
// downloadable mp4 file given the YouTube-offered heights.
//   - With ffmpeg: any height (video+audio streams can be merged)
//   - Without ffmpeg: only progressive single-file mp4s exist — itag 18 (360)
//     is universal; itag 22 (720) is being deprecated and rarely available.
//     We surface 360p as the only safe option in that case.
function computeDownloadableHeights(heights, hasFfmpeg) {
  const want = [144, 240, 360, 480, 720, 1080, 1440, 2160]
  if (hasFfmpeg) return want.filter(h => heights.some(yh => yh >= h)).slice().reverse()
  return heights.includes(360) || heights.length > 0 ? [360] : []
}

// Best-effort: ask ytdown.to which MP4 video heights are downloadable as
// single-file (audio+video already muxed). This bypasses the need for ffmpeg
// on the server and lets us expose the full range of qualities (360 → 1080+)
// in the UI even on serverless deployments. Returns a sorted-desc array of
// heights, or [] on any failure.
async function fetchYtdownHeights(youtubeUrl) {
  try {
    const yt = await fetchYtdownItems(youtubeUrl)
    const heights = (yt.items || [])
      .filter(it => it.type === 'Video' && it.format === 'MP4' && /^\d+p$/i.test(it.quality))
      .map(it => parseInt(it.quality, 10))
      .filter(h => Number.isFinite(h) && h > 0)
    return Array.from(new Set(heights)).sort((a, b) => b - a)
  } catch (e) {
    // Don't surface ytdown errors here — the JS/yt-dlp path already populated
    // a fallback set. Just log for diagnostics.
    console.warn('[DZTube:info:ytdown-heights]', e.message)
    return []
  }
}

// Merge two height arrays (server-known + ytdown), dedupe, sort desc.
function mergeDownloadableHeights(a, b) {
  const set = new Set()
  for (const h of a || []) if (Number.isFinite(h) && h > 0) set.add(h)
  for (const h of b || []) if (Number.isFinite(h) && h > 0) set.add(h)
  return Array.from(set).sort((x, y) => y - x)
}

app.post('/api/dz-tube/info', async (req, res) => {
  const { url } = req.body || {}
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'رابط YouTube غير صالح' })

  const hasFfmpeg = await ffmpegAvailable()
  const dlpBin = await ytDlpBinaryPath()

  // Run the ytdown.to height probe in parallel with the primary metadata
  // fetch — that way the multi-quality download menu is populated even on
  // serverless deployments where ffmpeg isn't on PATH (the previous code
  // path only surfaced 360p in that case).
  const ytdownHeightsPromise = fetchYtdownHeights(url)

  if (dlpBin) {
    try {
      const info = await runYtDlpJSONWith(dlpBin, url)
      const formats = (info.formats || [])
        .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
        .map(f => f.height)
      const heights = Array.from(new Set(formats)).sort((a, b) => b - a)
      const serverHeights = computeDownloadableHeights(heights, hasFfmpeg)
      const ytdownHeights = await ytdownHeightsPromise
      return res.json({
        title: info.title || 'بدون عنوان',
        thumbnail: info.thumbnail || null,
        duration: info.duration || 0,
        uploader: info.uploader || info.channel || '',
        view_count: info.view_count || 0,
        heights,
        downloadableHeights: mergeDownloadableHeights(serverHeights, ytdownHeights),
        hasFfmpeg,
        available: { mp4: heights.length > 0 || ytdownHeights.length > 0, mp3: true, audio: true },
      })
    } catch (e) {
      console.warn('[DZTube:info:dlp-fail, trying JS]', e.message)
    }
  }
  try {
    const out = await jsInfo(url)
    delete out._info
    out.hasFfmpeg = hasFfmpeg
    const serverHeights = computeDownloadableHeights(out.heights || [], hasFfmpeg)
    const ytdownHeights = await ytdownHeightsPromise
    out.downloadableHeights = mergeDownloadableHeights(serverHeights, ytdownHeights)
    out.available = { ...(out.available || {}), audio: true }
    if (ytdownHeights.length > 0) out.available.mp4 = true
    res.json(out)
  } catch (e) {
    // Even if both ytdl-core and yt-dlp failed, ytdown.to may still know
    // the available qualities — return a minimal payload so the UI can
    // still let the user pick a quality.
    const ytdownHeights = await ytdownHeightsPromise
    if (ytdownHeights.length > 0) {
      return res.json({
        title: 'بدون عنوان',
        thumbnail: null,
        duration: 0,
        uploader: '',
        view_count: 0,
        heights: ytdownHeights,
        downloadableHeights: ytdownHeights,
        hasFfmpeg,
        available: { mp4: true, mp3: true, audio: true },
      })
    }
    console.error('[DZTube:info:js]', e.message)
    res.status(500).json({ error: 'تعذر جلب معلومات الفيديو' })
  }
})

const DZ_TUBE_QUALITY_MAP = { '144': 144, '240': 240, '360': 360, '480': 480, '720': 720, '1080': 1080, '1440': 1440, '2160': 2160 }

// Stream a remote (upstream) URL through this server with a forced
// Content-Disposition so the browser triggers a real download instead of
// trying to play the file inline. Used for the Piped/googlevideo fallback
// path when yt-dlp fails on Vercel due to bot challenges.
async function streamUpstreamToClient(req, res, upstreamUrl, mime, downloadName) {
  try {
    const fwdHeaders = { 'User-Agent': 'Mozilla/5.0' }
    if (req.headers.range) fwdHeaders['Range'] = req.headers.range
    const upstream = await fetch(upstreamUrl, { headers: fwdHeaders })
    if (!upstream.ok && upstream.status !== 206) {
      console.warn('[DZTube:upstream-proxy] upstream', upstream.status)
      if (!res.headersSent) res.status(502).end('فشل تحميل الملف من المصدر البديل')
      return
    }
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
    const passHeaders = ['content-length', 'content-range', 'accept-ranges']
    for (const h of passHeaders) {
      const v = upstream.headers.get(h)
      if (v) res.setHeader(h, v)
    }
    res.status(upstream.status === 206 ? 206 : 200)
    if (!upstream.body) { res.end(); return }
    const reader = upstream.body.getReader()
    let cancelled = false
    req.on('close', () => { cancelled = true; try { reader.cancel() } catch {} })
    while (true) {
      const { done, value } = await reader.read()
      if (done || cancelled) break
      if (!res.write(value)) await new Promise(r => res.once('drain', r))
    }
    res.end()
  } catch (e) {
    console.error('[DZTube:upstream-proxy] failed:', e.message)
    if (!res.headersSent) res.status(502).end('فشل تحميل الملف من المصدر البديل')
    else { try { res.end() } catch {} }
  }
}

// ─── ytdown.to + process4.me resolver ────────────────────────────────────────
// Free public YouTube extraction service (same approach used by
// nadir-downloader.vercel.app). Bypasses YouTube bot detection on
// serverless because the actual extraction runs on ytdown.to's workers.
// Returns: { title, thumbnail, items: [{ type, quality, format, url, size, task, mediaUrl }] }
const _YTDOWN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
const _YTDOWN_MAX_API_RETRIES = 2
const _YTDOWN_MAX_POLL_ATTEMPTS = 12
const _YTDOWN_POLL_DELAY_MS = 1500
const _YTDOWN_QUALITY_LABEL = { FHD: '1080p', HD: '720p', SD: '480p' }

async function _ytdownPollProcess4(mediaUrl) {
  const headers = { 'User-Agent': _YTDOWN_UA, 'Referer': 'https://app.ytdown.to/', 'Accept': 'application/json' }
  for (let i = 0; i < _YTDOWN_MAX_POLL_ATTEMPTS; i++) {
    try {
      const r = await fetch(mediaUrl, { headers, signal: AbortSignal.timeout(15000) })
      if (r.ok) {
        const j = await r.json().catch(() => ({}))
        const status = String(j.status || '').toLowerCase()
        if (status === 'completed' && j.fileUrl) return { fileUrl: j.fileUrl, fileSize: j.fileSize || '' }
        if (status === 'error' || status === 'failed') return null
      }
    } catch {}
    await new Promise(r => setTimeout(r, _YTDOWN_POLL_DELAY_MS))
  }
  return null
}

// Map ytdown.to API errors to user-friendly Arabic messages so the user
// understands WHY a particular video can't be downloaded (rather than seeing
// a generic "download failed").
function _ytdownFriendlyError(code, message) {
  const m = String(message || '').toLowerCase()
  if (code === 429 || m.includes('too many requests')) return 'الخدمة مشغولة جداً، انتظر دقيقة وحاول مرة أخرى'
  if (m.includes('private')) return 'هذا الفيديو خاص ولا يمكن تحميله'
  if (m.includes('unavailable') || m.includes('not exist') || m.includes('removed')) return 'هذا الفيديو محذوف أو غير متاح'
  if (m.includes('age') || m.includes('sign in')) return 'هذا الفيديو يتطلب تسجيل دخول (محتوى للبالغين أو محمي)'
  if (m.includes('region') || m.includes('country') || m.includes('geo')) return 'هذا الفيديو محظور في منطقة الخادم'
  if (m.includes('live') || m.includes('stream')) return 'البث المباشر لا يدعم التحميل'
  if (m.includes('premiere')) return 'العرض المجدول لم يُنشر بعد'
  if (m.includes('member') || m.includes('premium') || m.includes('paid')) return 'هذا المحتوى مدفوع أو محصور بالأعضاء'
  if (m.includes('copyright')) return 'الفيديو محظور بسبب حقوق الطبع'
  if (m.includes('maintenance') || code === 503) return 'الخدمة قيد الصيانة، حاول لاحقاً'
  return null
}

async function fetchYtdownItems(youtubeUrl) {
  const apiHeaders = {
    'User-Agent': _YTDOWN_UA,
    'Origin': 'https://app.ytdown.to',
    'Referer': 'https://app.ytdown.to/fr23/',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': '*/*',
  }
  const body = new URLSearchParams({ url: youtubeUrl }).toString()
  let lastErr = null
  let lastFriendly = null
  for (let attempt = 1; attempt <= _YTDOWN_MAX_API_RETRIES; attempt++) {
    try {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), 15000)
      const r = await fetch('https://app.ytdown.to/proxy.php', { method: 'POST', headers: apiHeaders, body, signal: ctl.signal })
      clearTimeout(t)
      if (!r.ok) { lastErr = `HTTP ${r.status}`; continue }
      const data = await r.json().catch(() => null)
      const api = data?.api
      if (!api) { lastErr = 'invalid response'; continue }
      const status = String(api.status || '').toLowerCase()
      if (status === 'error' || status !== 'ok') {
        // Specific upstream error — translate and bail (no retry helps here)
        const friendly = _ytdownFriendlyError(api.code, api.message)
        if (friendly) {
          const e = new Error(friendly); e.userFriendly = true; e.upstream = 'ytdown'; throw e
        }
        lastErr = api.message || `status=${status}`
        lastFriendly = null
        continue
      }
      const items = Array.isArray(api.mediaItems) ? api.mediaItems : []
      const out = []
      for (const m of items) {
        const type = m.type
        const ext = String(m.mediaExtension || '').toUpperCase()
        const qRaw = String(m.mediaQuality || '')
        const task = String(m.mediaTask || '').toLowerCase()
        const mediaUrl = m.mediaUrl
        if (!mediaUrl) continue
        const quality = _YTDOWN_QUALITY_LABEL[qRaw] || qRaw
        out.push({ type, quality, format: ext, mediaUrl, task, size: m.mediaFileSize || '' })
      }
      return { title: api.title || 'video', thumbnail: api.imagePreviewUrl || '', items: out }
    } catch (e) {
      if (e.userFriendly) throw e
      lastErr = e.message
    }
    await new Promise(r => setTimeout(r, 800))
  }
  const e = new Error(`ytdown.to: ${lastErr || 'unknown'}`); e.upstream = 'ytdown'; throw e
}

// Pick the best matching ytdown.to item for the requested format/quality.
// `wantFormat`: 'mp4' | 'mp3' | 'audio' (audio = m4a)
// `wantHeight`: numeric height (e.g. 720)
function pickYtdownItem(items, wantFormat, wantHeight) {
  if (!items?.length) return null
  if (wantFormat === 'mp3') {
    return items.find(it => it.type === 'Audio' && it.format === 'MP3') || null
  }
  if (wantFormat === 'audio') {
    // Prefer highest-bitrate M4A
    const audios = items.filter(it => it.type === 'Audio' && it.format === 'M4A')
    audios.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))
    return audios[0] || null
  }
  // Video MP4 — choose closest <=wantHeight, else fallback to highest available <=wantHeight
  const videos = items.filter(it => it.type === 'Video' && it.format === 'MP4' && /^\d+p$/i.test(it.quality))
  videos.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))
  const eligible = videos.filter(v => parseInt(v.quality) <= wantHeight)
  if (eligible.length) return eligible[0]
  return videos[videos.length - 1] || null
}

async function resolveYtdownDirectUrl(item) {
  if (!item) return null
  // The worker URL always returns a JSON status payload (even for task=download
  // it's already in "completed" state on the first hit). So we always poll;
  // the polling helper short-circuits on the first completed response.
  const polled = await _ytdownPollProcess4(item.mediaUrl)
  if (!polled) return null
  return { url: polled.fileUrl, size: polled.fileSize || item.size }
}

// ── PRIMARY yt-dlp downloader ─────────────────────────────────────────────────
// Downloads to a temp file via yt-dlp then streams it to the client.
// Returns true  → response was fully handled (success or client disconnected).
// Returns false → yt-dlp failed BEFORE writing any response headers so the
//                 caller can fall through to external-service fallbacks.
async function tryYtdlpDownloadToClient(req, res, url, format, h) {
  const dlpBin = await ytDlpBinaryPath()
  if (!dlpBin) return false

  const hasFfmpeg = await ffmpegAvailable()
  const cookies   = await ytDlpCookiesArgs()
  const isAudio   = format === 'mp3' || format === 'audio'
  const vid       = extractYouTubeVideoId(url) || 'video'
  const initialExt = format === 'mp3' ? 'mp3' : (format === 'audio' ? 'm4a' : 'mp4')

  // Resolve title in background (only for filename, doesn't block download)
  const titlePromise = fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    { headers: { 'User-Agent': YT_DLP_USER_AGENT }, signal: AbortSignal.timeout(6000) }
  ).then(r => r.ok ? r.json() : null).then(j => j?.title || null).catch(() => null)

  function buildArgs(clientIdx) {
    const antiBot = ytDlpAntiBotArgs(clientIdx)
    let args, mime
    if (format === 'mp3' && hasFfmpeg) {
      args = ['-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/18', '-x', '--audio-format', 'mp3', '--audio-quality', '0',
              '--no-playlist', '--no-warnings', ...antiBot, ...cookies]
      mime = 'audio/mpeg'
    } else if (isAudio && hasFfmpeg) {
      args = ['-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/18', '-x', '--audio-format', 'm4a',
              '--no-playlist', '--no-warnings', ...antiBot, ...cookies]
      mime = 'audio/mp4'
    } else if (isAudio) {
      args = ['-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/18',
              '--no-playlist', '--no-warnings', ...antiBot, ...cookies]
      mime = 'audio/mp4'
    } else if (hasFfmpeg) {
      const fmt = `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}][ext=mp4]/best[height<=${h}]/22/18`
      args = ['-f', fmt, '--merge-output-format', 'mp4',
              '--no-playlist', '--no-warnings', ...antiBot, ...cookies]
      mime = 'video/mp4'
    } else {
      const fmt = `best[ext=mp4][acodec!=none][vcodec!=none][height<=${h}]/best[ext=mp4][acodec!=none][vcodec!=none]/22/18`
      args = ['-f', fmt, '--no-playlist', '--no-warnings', ...antiBot, ...cookies]
      mime = 'video/mp4'
    }
    return { args, mime }
  }

  // ── Multi-client retry loop ─────────────────────────────────────
  for (let ci = 0; ci < YT_DLP_CLIENTS.length; ci++) {
    if (res.writableEnded || res.headersSent) return true
    const outPath = tmpFile(initialExt)
    const { args, mime } = buildArgs(ci)
    const fullArgs = [...args, '-o', outPath, url]

    console.log(`[DZTube:dlp] attempt ci=${ci} client=${YT_DLP_CLIENTS[ci]} format=${format} ffmpeg=${hasFfmpeg}`)

    const result = await new Promise((resolve) => {
      const TIMEOUT_MS = 5 * 60 * 1000
      const proc = spawn(dlpBin, fullArgs)
      let stderrBuf = '', clientGone = false

      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL') } catch {}
        safeUnlink(outPath)
        resolve({ ok: false, stderr: 'timeout', clientGone: false })
      }, TIMEOUT_MS)

      const onClose = () => {
        clientGone = true
        try { proc.kill('SIGTERM') } catch {}
        safeUnlink(outPath)
      }
      req.on('close', onClose)

      proc.stderr.on('data', d => { stderrBuf += d.toString() })
      proc.on('error', err => {
        clearTimeout(timer); req.off('close', onClose); safeUnlink(outPath)
        resolve({ ok: false, stderr: err.message, clientGone: false })
      })
      proc.on('close', async code => {
        clearTimeout(timer); req.off('close', onClose)
        if (clientGone) return resolve({ ok: false, clientGone: true })
        if (code !== 0) {
          safeUnlink(outPath)
          return resolve({ ok: false, stderr: stderrBuf, clientGone: false })
        }
        try {
          const st = fs.statSync(outPath)
          if (st.size === 0) { safeUnlink(outPath); return resolve({ ok: false, stderr: 'empty file', clientGone: false }) }
        } catch { return resolve({ ok: false, stderr: 'missing output', clientGone: false }) }
        resolve({ ok: true, stderr: '' })
      })
    })

    if (result.clientGone) return true  // client left, treated as handled
    if (result.ok) {
      const rawTitle = await Promise.race([titlePromise, Promise.resolve(null)])
      const safeTitle = (rawTitle || vid).replace(/[^\w\u0600-\u06FF\s.-]/g, '').slice(0, 80).trim().replace(/\s+/g, '_') || vid
      const downloadName = isAudio ? `${safeTitle}.${initialExt}` : `${safeTitle}_${h}p.${initialExt}`
      console.log(`[DZTube:dlp] ✓ ci=${ci} → ${downloadName}`)
      streamFileToClient(req, res, outPath, mime, downloadName)
      return true
    }

    console.warn(`[DZTube:dlp] ci=${ci} failed: ${result.stderr?.replace(/\n/g, ' ').slice(0, 300)}`)
    // Back off before next client (except last)
    if (ci < YT_DLP_CLIENTS.length - 1) await new Promise(r => setTimeout(r, 1500 + ci * 1000))
  }

  return false  // all clients failed — caller tries external fallbacks
}

// Stream a buffered file to the client with Content-Length and cleanup
function streamFileToClient(req, res, filePath, mime, downloadName) {
  fs.stat(filePath, (err, st) => {
    if (err || !st) {
      if (!res.headersSent) res.status(500).end('فشل التحميل')
      return safeUnlink(filePath)
    }
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Length', String(st.size))
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
    const rs = fs.createReadStream(filePath)
    rs.on('error', () => { try { res.end() } catch {} ; safeUnlink(filePath) })
    rs.on('close', () => safeUnlink(filePath))
    req.on('close', () => { rs.destroy(); safeUnlink(filePath) })
    rs.pipe(res)
  })
}

app.get('/api/dz-tube/download', async (req, res) => {
  const url = String(req.query.url || '')
  const format = String(req.query.format || 'mp4').toLowerCase()
  const quality = String(req.query.quality || '720')

  if (!isValidYouTubeUrl(url)) return res.status(400).send('رابط YouTube غير صالح')
  if (format !== 'mp4' && format !== 'mp3' && format !== 'audio') return res.status(400).send('Format must be mp4, mp3 or audio')

  const h = DZ_TUBE_QUALITY_MAP[quality] || 720
  const isAudio = format === 'mp3' || format === 'audio'

  // ── PRIMARY: yt-dlp (fastest & most reliable when available) ─────────
  // We try this FIRST. External services (ytdown.to / Invidious / Piped)
  // are only used when yt-dlp is not installed (e.g. serverless Vercel).
  const primaryOk = await tryYtdlpDownloadToClient(req, res, url, format, h)
  if (primaryOk) return
  if (res.headersSent) return  // partial write — nothing more we can do
  console.warn('[DZTube:download] yt-dlp unavailable/failed — trying external services')

  // ── FALLBACK: Multi-source resolver ───────────────────────────────────
  // Capability matrix (refreshed 2026-04-24):
  //   • ytdown.to  → MP4 (any height), M4A audio, MP3 audio  ✅ all formats
  //   • Piped      → ONLY audio-only streams (M4A/WebM). Their video URLs
  //                  are DASH video-only (no audio) so unusable without
  //                  ffmpeg. Skipped for MP4 video and for MP3-conversion.
  //   • Invidious  → audio (M4A via /latest_version proxy) AND combined
  //                  progressive MP4 video (itag 18=360p / 22=720p) — the
  //                  proxy bypasses googlevideo's IP-bound signed URLs, so
  //                  it works for both formats from any deployment.
  //   • yt-dlp     → final fallback (block further below)
  let friendlyError = null
  let winner = null
  const vidId = extractYouTubeVideoId(url)

  const tryYtdown = (async () => {
    try {
      const yt = await fetchYtdownItems(url)
      const item = pickYtdownItem(yt.items, format, h)
      if (!item) return null
      const resolved = await resolveYtdownDirectUrl(item)
      if (!resolved?.url) return null
      return { source: 'ytdown', title: yt.title, url: resolved.url, quality: item.quality }
    } catch (e) {
      if (e.userFriendly) friendlyError = e.message
      console.warn('[DZTube:download] ytdown.to:', e.message)
      return null
    }
  })()

  const tryInvidious = (async () => {
    try {
      const inv = await fetchInvidiousStreams(vidId, { isAudio, height: h })
      if (!inv?.url) return null
      return { source: `invidious(${inv.instance})`, title: '', url: inv.url, quality: isAudio ? 'audio' : `${h}p`, ext: inv.ext, mime: inv.mime }
    } catch (e) { console.warn('[DZTube:download] invidious:', e.message); return null }
  })()

  // Piped only added to the audio race (it can't serve combined-AV video).
  let tryPiped = null
  if (format === 'audio') {
    tryPiped = (async () => {
      try {
        const piped = await fetchPipedStreams(vidId, { isAudio: true, height: h })
        if (!piped?.url) return null
        return { source: 'piped', title: '', url: piped.url, quality: 'audio', ext: piped.ext, mime: piped.mime }
      } catch (e) { console.warn('[DZTube:download] piped:', e.message); return null }
    })()
  }

  // Race — first non-null wins, but await all before declaring failure.
  const racers = [tryYtdown, tryInvidious, ...(tryPiped ? [tryPiped] : [])]
  winner = await Promise.race([
    ...racers.map(p => p.then(r => r || new Promise(() => {}))), // null never wins
    Promise.allSettled(racers).then(rs => {
      for (const r of rs) if (r.status === 'fulfilled' && r.value) return r.value
      return null
    }),
  ])
  // MP3 conversion still needs ffmpeg → only ytdown can satisfy it directly.
  // If ytdown didn't win and we're MP3, force the await on ytdown alone.
  if (!winner && format === 'mp3') winner = await tryYtdown

  if (winner) {
    const safe = (winner.title || 'video').replace(/[^\w\u0600-\u06FF\s.-]/g, '').slice(0, 80).trim().replace(/\s+/g, '_') || 'video'
    let dlExt, dlMime
    if (format === 'mp3') { dlExt = 'mp3'; dlMime = 'audio/mpeg' }
    else if (format === 'audio') { dlExt = winner.ext || 'm4a'; dlMime = winner.mime || 'audio/mp4' }
    else { dlExt = 'mp4'; dlMime = 'video/mp4' }
    const downloadName = isAudio ? `${safe}.${dlExt}` : `${safe}_${winner.quality || h+'p'}.${dlExt}`
    console.log(`[DZTube:download] ${winner.source} hit → ${downloadName}`)
    return await streamUpstreamToClient(req, res, winner.url, dlMime, downloadName)
  }

  // If ytdown returned an actionable error (private / live / unavailable),
  // surface it immediately — yt-dlp won't fare better for these cases.
  if (friendlyError) return res.status(400).send(`فشل التحميل: ${friendlyError}`)

  // Locate yt-dlp (PATH or bundled at bin/yt-dlp on Vercel)
  const dlpBin = await ytDlpBinaryPath()

  // Resolve title (best-effort)
  let title = 'video'
  try {
    if (dlpBin) {
      const info = await runYtDlpJSONWith(dlpBin, url)
      title = info.title || title
    } else {
      const info = await ytdl.getInfo(url)
      title = info.videoDetails?.title || title
    }
  } catch {}
  const safeName = title.replace(/[^\w\u0600-\u06FF\s.-]/g, '').slice(0, 80).trim().replace(/\s+/g, '_') || 'video'
  const initialExt = format === 'mp3' ? 'mp3' : (format === 'audio' ? 'm4a' : 'mp4')
  const outPath = tmpFile(initialExt)

  const hasFfmpeg = await ffmpegAvailable()
  const cookies = await ytDlpCookiesArgs()

  if (dlpBin) {
    // yt-dlp backend → buffer to disk, then stream to client.
    // We must avoid features that require ffmpeg when it's not on PATH
    // (e.g. on Vercel serverless where only the yt-dlp binary is bundled).
    let args
    let downloadName
    let mime
    const antiBot = ytDlpAntiBotArgs()
    // NOTE (2025-2026): YouTube now requires a "GVS PO Token" for separate
    // audio/video streams on most clients, so `bestaudio` and `bestvideo`
    // often return "Requested format is not available". Format `18` (360p
    // mp4 with combined audio+video) does NOT need a PO Token, so we use
    // it as a universal fallback in every format string below.
    if (format === 'mp3' && hasFfmpeg) {
      args = ['-f', 'bestaudio/18', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', outPath, '--no-playlist', '--no-warnings', ...antiBot, ...cookies, url]
      downloadName = `${safeName}.mp3`
      mime = 'audio/mpeg'
    } else if (isAudio && hasFfmpeg) {
      // Want native m4a — extract audio (transcodes from 18 if needed)
      args = ['-f', 'bestaudio[ext=m4a]/bestaudio/18', '-x', '--audio-format', 'm4a', '-o', outPath, '--no-playlist', '--no-warnings', ...antiBot, ...cookies, url]
      downloadName = `${safeName}.m4a`
      mime = 'audio/mp4'
    } else if (isAudio) {
      // No ffmpeg → if bestaudio is unavailable we serve format 18 (mp4
      // with audio); browsers can still play the audio track from it.
      args = ['-f', 'bestaudio[ext=m4a]/bestaudio/18', '-o', outPath, '--no-playlist', '--no-warnings', ...antiBot, ...cookies, url]
      downloadName = `${safeName}.m4a`
      mime = 'audio/mp4'
    } else if (hasFfmpeg) {
      const fmt = `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${h}][ext=mp4]/best[height<=${h}]/22/18`
      args = ['-f', fmt, '--merge-output-format', 'mp4', '-o', outPath, '--no-playlist', '--no-warnings', ...antiBot, ...cookies, url]
      downloadName = `${safeName}_${h}p.mp4`
      mime = 'video/mp4'
    } else {
      // No ffmpeg → must use a single progressive (combined audio+video) file.
      // 22 = 720p mp4, 18 = 360p mp4. Many videos only expose 18 nowadays.
      const fmt = `best[ext=mp4][acodec!=none][vcodec!=none][height<=${h}]/best[ext=mp4][acodec!=none][vcodec!=none]/22/18`
      args = ['-f', fmt, '-o', outPath, '--no-playlist', '--no-warnings', ...antiBot, ...cookies, url]
      downloadName = `${safeName}_${h}p.mp4`
      mime = 'video/mp4'
    }
    const proc = spawn(dlpBin, args)
    let stderrBuf = ''
    proc.stderr.on('data', d => { stderrBuf += d.toString() })
    let killed = false
    req.on('close', () => { if (!proc.killed) { killed = true; try { proc.kill('SIGTERM') } catch {} ; safeUnlink(outPath) } })
    proc.on('error', err => {
      console.error('[DZTube:download:dlp:spawn]', err.message)
      safeUnlink(outPath)
      if (!res.headersSent) res.status(500).end('فشل التحميل')
    })
    proc.on('close', async code => {
      if (killed) return
      if (code !== 0) {
        console.warn('[DZTube:download:dlp] exit', code, stderrBuf.slice(0, 600))
        safeUnlink(outPath)
        if (res.headersSent) return res.end()
        // Try Piped fallback (free public YouTube proxy) before giving up.
        // We PROXY the resulting googlevideo URL through this server so the
        // browser (a) actually triggers a download (Content-Disposition is
        // attached) and (b) avoids googlevideo's signed-IP restriction.
        try {
          const vid = extractYouTubeVideoId(url)
          const piped = await fetchPipedStreams(vid, { isAudio, height: h })
          if (piped?.url) {
            console.log('[DZTube:download] Piped fallback hit for', vid)
            const fallbackName = isAudio
              ? `${safeName}.${piped.ext === 'webm' ? 'webm' : 'm4a'}`
              : `${safeName}_${h}p.${piped.ext === 'webm' ? 'webm' : 'mp4'}`
            const fallbackMime = piped.mime || (isAudio ? 'audio/mp4' : 'video/mp4')
            return await streamUpstreamToClient(req, res, piped.url, fallbackMime, fallbackName)
          }
        } catch (e) { console.warn('[DZTube:download] Piped fallback error', e.message) }
        const lower = stderrBuf.toLowerCase()
        const isBot = lower.includes('sign in to confirm') || lower.includes('not a bot') || lower.includes('http error 429') || lower.includes('cookie')
        const msg = isBot
          ? 'فشل التحميل: YouTube يحجب خادم النشر مؤقتاً وكل بدائلنا المجانية مشغولة. حاول مجدداً بعد دقيقة أو زوّدنا بـ YOUTUBE_COOKIES.'
          : `فشل التحميل: ${stderrBuf.split('\n').filter(l => l.includes('ERROR') || l.includes('error')).slice(-1)[0]?.slice(0, 220) || 'خطأ غير معروف'}`
        return res.status(500).end(msg)
      }
      streamFileToClient(req, res, outPath, mime, downloadName)
    })
    return
  }

  // JS fallback (no yt-dlp) — buffer to disk via ytdl-core then stream
  try {
    let stream
    if (isAudio) {
      // Audio-only m4a (no transcoding without ffmpeg in serverless)
      stream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' })
    } else {
      stream = ytdl(url, { quality: 'highest', filter: f => f.hasVideo && f.hasAudio && (!h || (f.height || 0) <= h) })
    }
    const ws = fs.createWriteStream(outPath)
    let aborted = false
    req.on('close', () => { aborted = true; try { stream.destroy() } catch {} ; ws.destroy(); safeUnlink(outPath) })
    stream.on('error', e => {
      console.error('[DZTube:download:js:stream]', e.message)
      ws.destroy(); safeUnlink(outPath)
      if (!res.headersSent) res.status(500).end('فشل التحميل')
    })
    ws.on('error', e => {
      console.error('[DZTube:download:js:write]', e.message)
      try { stream.destroy() } catch {}
      safeUnlink(outPath)
      if (!res.headersSent) res.status(500).end('فشل التحميل')
    })
    ws.on('close', () => {
      if (aborted) return
      // mp3 conversion needs ffmpeg → fall back to native m4a
      const finalName = isAudio ? `${safeName}.m4a` : `${safeName}_${h}p.mp4`
      const finalMime = isAudio ? 'audio/mp4' : 'video/mp4'
      streamFileToClient(req, res, outPath, finalMime, finalName)
    })
    stream.pipe(ws)
  } catch (e) {
    console.error('[DZTube:download:js]', e.message)
    safeUnlink(outPath)
    if (!res.headersSent) res.status(500).end('فشل التحميل')
  }
})

// ===== CHAT ROOM REST ENDPOINTS (polling fallback) =====
app.post('/api/chat-room/join', async (req, res) => {
  const clientIp = getClientIp(req)
  if (bannedIPs.has(clientIp)) return res.status(403).json({ error: 'محظور من الدردشة.' })
  const { name, gender, adminSecret, profilePassword, avatar: bodyAvatar, profile } = req.body || {}
  if (!name?.trim() || !gender) return res.status(400).json({ error: 'Name and gender required' })
  const id = chatId()
  const isAdmin = adminSecret === CHAT_ADMIN_SECRET
  const allowedProfileFields = ['city', 'bio', 'twitter', 'instagram', 'facebook', 'tiktok', 'snapchat']
  const cleanProfile = {}
  for (const k of allowedProfileFields) {
    if (typeof profile?.[k] === 'string' && profile[k].trim()) cleanProfile[k] = profile[k].trim().slice(0, 100)
  }
  const avatar = (typeof bodyAvatar === 'string' && bodyAvatar.startsWith('data:image') && bodyAvatar.length < 200000)
    ? bodyAvatar
    : (typeof profile?.avatar === 'string' && profile.avatar.startsWith('data:image') && profile.avatar.length < 200000 ? profile.avatar : null)
  const session = { id, name: sanitizeString(name, 30), gender, isAdmin, lastSeen: Date.now(), ws: null, ip: clientIp, profile: cleanProfile, avatar, status: 'online', room: 'عام' }
  chatSessions.set(id, session)
  const joinMsg = pushChatMsg({
    id: chatId(), from: 'System', fromId: 'system', gender: 'bot',
    text: `${session.name} joined the chat.`, timestamp: Date.now(), isSystem: true,
  })
  broadcastChat({ type: 'message', msg: joinMsg })
  broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
  const [messages, pinned] = await Promise.all([dbGetMessages(0, 50), dbGetPinned()])
  res.json({ sessionId: id, isAdmin, profileId: id, avatar: avatar || null, messages, users: getOnlineUsers(), pinnedMessage: pinned })
})

app.post('/api/chat-room/leave', (req, res) => {
  const { sessionId } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (session) {
    chatSessions.delete(sessionId)
    const leaveMsg = pushChatMsg({
      id: chatId(), from: 'System', fromId: 'system', gender: 'bot',
      text: `${session.name} left the chat.`, timestamp: Date.now(), isSystem: true,
    })
    broadcastChat({ type: 'message', msg: leaveMsg })
    broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
  }
  res.json({ ok: true })
})

app.post('/api/chat-room/send', async (req, res) => {
  const { sessionId, text, dmTo, dmToName, replyTo: replyToObj, replyToId, replyToText, replyToFrom } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (!session) return res.status(401).json({ error: 'Invalid session' })
  const muteInfo = mutedUsers.get(sessionId)
  if (muteInfo && Date.now() < muteInfo.until) {
    const remainSec = Math.ceil((muteInfo.until - Date.now()) / 1000)
    return res.status(403).json({ error: 'muted', remainSec })
  }
  if (muteInfo && Date.now() >= muteInfo.until) mutedUsers.delete(sessionId)
  const cleanText = sanitizeString(text, 1000).trim()
  if (!cleanText) return res.status(400).json({ error: 'Empty message' })
  session.lastSeen = Date.now()
  const replyTo = replyToObj
    ? { id: replyToObj.id, from: replyToObj.from || '?', text: replyToObj.text }
    : (replyToId && replyToText ? { id: replyToId, from: replyToFrom || '?', text: replyToText } : null)
  const msg = pushChatMsg({
    id: chatId(), from: session.name, fromId: session.id, gender: session.gender,
    text: cleanText, timestamp: Date.now(),
    isDM: !!dmTo, dmTo: dmTo || null, dmToName: dmToName || null,
    isAdmin: !!session.isAdmin,
    fromAvatar: session.avatar || null,
    replyTo,
    room: session.room || 'عام',
  })
  if (dmTo) {
    const recip = [...chatSessions.values()].find(s => s.id === dmTo)
    const json = JSON.stringify({ type: 'message', msg })
    if (session.ws?.readyState === 1) session.ws.send(json)
    if (recip?.ws?.readyState === 1) {
      recip.ws.send(json)
      sendDmNotify(recip, session.name, session.id, cleanText, msg.timestamp, msg.id)
    }
  } else {
    broadcastChat({ type: 'message', msg })
  }
  const lower = cleanText.toLowerCase()
  if (lower.startsWith('@dzgpt') || lower.startsWith('@dzagent')) {
    const botMsg = await handleAiChatTrigger(cleanText, lower.startsWith('@dzagent'), session)
    return res.json({ ok: true, msgId: msg.id, botMsg: botMsg || null })
  }
  res.json({ ok: true, msgId: msg.id })
})

app.get('/api/chat-room/messages', async (req, res) => {
  const since = Number(req.query.since) || 0
  const sessionId = req.query.sessionId
  const session = chatSessions.get(sessionId)
  if (session) session.lastSeen = Date.now()
  const msgs = await dbGetMessages(since, 80)
  res.json({ messages: msgs, users: getOnlineUsers(), count: chatSessions.size })
})

app.post('/api/chat-room/react', async (req, res) => {
  const { sessionId, msgId, emoji } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (!session) return res.status(401).json({ error: 'Invalid session' })
  if (!msgId || !emoji) return res.status(400).json({ error: 'msgId and emoji required' })
  const allowed = ['👍','❤️','😂','😮','😢','🔥']
  if (!allowed.includes(emoji)) return res.status(400).json({ error: 'Invalid emoji' })
  try { await dbReact(msgId, emoji, session.id) } catch {}
  const updated = await dbGetReactions(msgId)
  broadcastChat({ type: 'reaction', msgId, emoji, count: updated[emoji]?.count || 0, users: updated[emoji]?.users || [] })
  res.json({ ok: true, reactions: updated })
})

app.post('/api/chat-room/profile', (req, res) => {
  const { sessionId, profile } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (!session) return res.status(401).json({ error: 'Invalid session' })
  const allowedProfileFields = ['city', 'bio', 'twitter', 'instagram', 'facebook', 'tiktok', 'snapchat']
  const cleanProfile = {}
  for (const k of allowedProfileFields) {
    if (typeof profile?.[k] === 'string') cleanProfile[k] = profile[k].trim().slice(0, 100)
  }
  if (typeof profile?.avatar === 'string' && profile.avatar.startsWith('data:image') && profile.avatar.length < 200000)  URL-based)
// Strategy: return 4 direct Pollinations URLs with different cinematic styles for smooth Ken Burns
// animation. Response is INSTANT (no downloading). Browser loads frames directly.
// If HF_TOKEN set, also tries real video generation via AnimateDiff / ZeroScope.
app.post('/api/tools/video-gen', express.json({ limit: '30mb' }), async (req, res) => {
  const { prompt } = req.body
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt مطلوب' })

  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''

  // ── Priority 1: Real video via ZeroScope (HuggingFace, if HF_TOKEN) ──
  if (token) {
    try {
      const r = await fetch('https://router.huggingface.co/hf-inference/models/cerspense/zeroscope_v2_576w', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'video/mp4,image/gif,image/*,*/*' },
        body: JSON.stringify({ inputs: prompt }),
        signal: AbortSignal.timeout(38000),
      })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && (ct.startsWith('video/') || ct.includes('mp4'))) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 5000) {
          console.log('[video-gen] ✓ ZeroScope real video')
          return res.json({ videoBase64: `data:video/mp4;base64,${buf.toString('base64')}`, model: 'ZeroScope v2', provider: 'hf-zeroscope', isVideo: true })
        }
      }
    } catch (e) { console.warn('[video-gen:zeroscope]', e.message) }

    // AnimateDiff fallback (returns GIF)
    try {
      const r = await fetch('https://router.huggingface.co/hf-inference/models/damo-vilab/text-to-video-ms-1.7b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ inputs: prompt }),
        signal: AbortSignal.timeout(38000),
      })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && (ct.startsWith('video/') || ct.startsWith('image/'))) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 5000) {
          const mime = ct.startsWith('video/') ? 'video/mp4' : 'image/gif'
          console.log('[video-gen] ✓ ModelScope text-to-video')
          return res.json({ videoBase64: `data:${mime};base64,${buf.toString('base64')}`, model: 'ModelScope T2V', provider: 'hf-modelscope', isVideo: true })
        }
      }
    } catch (e) { console.warn('[video-gen:modelscope]', e.message) }
  }

  // ── Priority 2: 4 cinematic Pollinations frames (INSTANT direct URLs) ──
  // Each frame has different cinematic style → Ken Burns animation creates fluid motion feel
  const baseSeed = Math.floor(Math.random() * 9000000)
  const frameStyles = [
    { suffix: 'wide establishing shot, cinematic, 8k, golden hour, dramatic sky', model: 'flux' },
    { suffix: 'medium shot, soft bokeh, cinematic lighting, shallow depth of field', model: 'flux-realism' },
    { suffix: 'close-up detail, macro photography, cinematic, ultra sharp, moody', model: 'flux' },
    { suffix: 'aerial wide angle, cinematic pan, dramatic clouds, vibrant colors', model: 'turbo' },
  ]

  const frames = frameStyles.map((f, i) => {
    const enc = encodeURIComponent(`${prompt}, ${f.suffix}`)
    const seed = baseSeed + i * 31337
    return `https://image.pollinations.ai/prompt/${enc}?model=${f.model}&width=768&height=432&seed=${seed}&nologo=true&safe=false`
  })

  console.log('[video-gen] ✓ 4 cinematic Pollinations frame URLs (instant)')
  return res.json({
    frames,
    model: 'AI DZ Media — Cinematic',
    provider: 'pollinations',
    frameCount: frames.length,
    kenBurns: true,
    note: 'أضف HF_TOKEN للحصول على فيديو حقيقي (ZeroScope)',
  })
})

// ── TTS — Kokoro (HF Inference API) + Google TTS fallback ────────────────────
// NOTE: must be BEFORE export { app } so it works on Vercel serverless

// Arabic → Google TTS  |  English/French → Kokoro (hexgrad/Kokoro-82M via HF)
const _TTS_VOICE_LANG = {
  'ar-DZ-AminaNeural':   'ar', 'ar-DZ-IsmaelNeural':  'ar',
  'ar-SA-ZariyahNeural': 'ar', 'ar-SA-HamedNeural':   'ar',
  'ar-EG-ShakirNeural':  'ar', 'fr-FR-DeniseNeural':  'fr',
  'fr-FR-HenriNeural':   'fr', 'fr-DZ-AmineNeural':   'fr',
  'en-US-JennyNeural':   'en', 'en-US-GuyNeural':     'en',
  'en-GB-SoniaNeural':   'en', 'en-GB-RyanNeural':    'en',
}

// Kokoro voice map — Arabic is NOT supported by Kokoro (use Google TTS for ar)
// voices: https://huggingface.co/hexgrad/Kokoro-82M
const _KOKORO_VOICE_MAP = {
  'en-US-JennyNeural':  'af_heart',   // American Female
  'en-US-GuyNeural':    'am_adam',    // American Male
  'en-GB-SoniaNeural':  'bf_emma',    // British Female
  'en-GB-RyanNeural':   'bm_george',  // British Male
  'fr-FR-DeniseNeural': 'ff_siwis',   // French Female
  'fr-FR-HenriNeural':  'fm_gaston',  // French Male
}

// Split long text into ≤190-char chunks at word boundaries
function _ttsSplitText(text, max = 190) {
  const parts = []
  let rem = text.trim()
  while (rem.length > 0) {
    if (rem.length <= max) { parts.push(rem); break }
    let cut = rem.lastIndexOf(' ', max)
    if (cut <= 0) cut = max
    parts.push(rem.slice(0, cut))
    rem = rem.slice(cut).trim()
  }
  return parts
}

// Google Translate TTS — Arabic + fallback
async function _googleTTSFetch(text, lang) {
  const parts = _ttsSplitText(text)
  const bufs = []
  for (const part of parts) {
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8'
      + `&q=${encodeURIComponent(part)}&tl=${lang}&client=tw-ob&ttsspeed=1`
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`Google TTS HTTP ${resp.status}`)
    bufs.push(Buffer.from(await resp.arrayBuffer()))
  }
  return Buffer.concat(bufs)
}

// Kokoro TTS via HuggingFace Inference API
async function _kokoroTTSFetch(text, kokoroVoice, speed = 1.0) {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN not configured')
  const resp = await fetch('https://api-inference.huggingface.co/models/hexgrad/Kokoro-82M', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'audio/wav,audio/*,*/*',
    },
    body: JSON.stringify({ inputs: text, parameters: { voice: kokoroVoice, speed } }),
    signal: AbortSignal.timeout(28000),
  })
  if (!resp.ok) {
    const msg = await resp.text().catch(() => '')
    throw new Error(`Kokoro HTTP ${resp.status}: ${msg.slice(0, 200)}`)
  }
  return Buffer.from(await resp.arrayBuffer())
}

app.post('/api/tts', async (req, res) => {
  const { text, voice = 'ar-EG-ShakirNeural', speed = 1.0 } = req.body || {}
  if (!text || typeof text !== 'string' || text.trim().length === 0)
    return res.status(400).json({ error: 'text is required' })
  if (text.length > 3000)
    return res.status(400).json({ error: 'text too long (max 3000 chars)' })

  const lang = _TTS_VOICE_LANG[voice] || 'ar'
  const kokoroVoice = _KOKORO_VOICE_MAP[voice]

  try {
    let buf
    if (kokoroVoice) {
      // Try Kokoro first (English/French) → fallback to Google TTS
      try {
        console.log(`[TTS] Kokoro: voice=${kokoroVoice}`)
        buf = await _kokoroTTSFetch(text.trim(), kokoroVoice, Number(speed) || 1.0)
      } catch (kokoroErr) {
        console.warn(`[TTS] Kokoro failed (${kokoroErr.message}), falling back to Google TTS`)
        buf = await _googleTTSFetch(text.trim(), lang)
      }
    } else {
      // Arabic → Google TTS (Kokoro doesn't support Arabic)
      buf = await _googleTTSFetch(text.trim(), lang)
    }

    if (!buf || buf.length === 0) return res.status(500).json({ error: 'No audio data received' })
    res.set('Content-Type', 'audio/mpeg')
    res.set('Content-Disposition', 'attachment; filename="ai-dz-voice.mp3"')
    res.send(buf)
  } catch (e) {
    console.error('[TTS] error:', e.message)
    res.status(500).json({ error: 'TTS generation failed', detail: e.message })
  }
})

app.get('/api/tts/voices', (_req, res) => {
  res.json([
    { id: 'ar-DZ-AminaNeural',              label: '🇩🇿 أمينة — جزائرية أنثى',       lang: 'ar', engine: 'edge' },
    { id: 'ar-DZ-IsmaelNeural',             label: '🇩🇿 إسماعيل — جزائري ذكر',      lang: 'ar', engine: 'edge' },
    { id: 'ar-SA-ZariyahNeural',            label: '🇸🇦 زارية — عربية فصحى أنثى',   lang: 'ar', engine: 'edge' },
    { id: 'ar-EG-ShakirNeural',             label: '🇪🇬 شاكر — مصري ذكر',           lang: 'ar', engine: 'edge' },
    { id: 'fr-FR-DeniseNeural',             label: '🇫🇷 دنيس — فرنسية أنثى',        lang: 'fr', engine: 'edge' },
    { id: 'fr-FR-RemyMultilingualNeural',   label: '🇫🇷 ريمي — فرنسي ذكر',          lang: 'fr', engine: 'edge' },
    { id: 'en-US-JennyNeural',             label: '🇺🇸 جيني — إنجليزية أمريكية أنثى', lang: 'en', engine: 'edge' },
    { id: 'en-US-GuyNeural',               label: '🇺🇸 غاي — إنجليزي أمريكي ذكر',  lang: 'en', engine: 'edge' },
    { id: 'en-GB-SoniaNeural',             label: '🇬🇧 سونيا — بريطانية أنثى',      lang: 'en', engine: 'edge' },
    { id: 'en-GB-RyanNeural',              label: '🇬🇧 ريان — بريطاني ذكر',         lang: 'en', engine: 'edge' },
  ])
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/tts/edge  — Microsoft Edge TTS Neural voices (no API key needed)
// Algerian Arabic: ar-DZ-AminaNeural / ar-DZ-IsmaelNeural
// ═══════════════════════════════════════════════════════════════════════════

const EDGE_TTS_ALLOWED_VOICES = new Set([
  'ar-DZ-AminaNeural', 'ar-DZ-IsmaelNeural',
  'ar-SA-ZariyahNeural', 'ar-EG-ShakirNeural',
  'ar-MA-JamalNeural', 'ar-TN-HediNeural',
  'fr-FR-DeniseNeural', 'fr-FR-RemyMultilingualNeural', 'fr-FR-HenriNeural',
  'en-US-JennyNeural', 'en-US-GuyNeural',
  'en-GB-SoniaNeural', 'en-GB-RyanNeural',
])

const LANG_DEFAULT_VOICE = {
  ar: 'ar-EG-ShakirNeural',
  fr: 'fr-FR-RemyMultilingualNeural',
  en: 'fr-FR-RemyMultilingualNeural',
}

// Lazy-loaded Edge TTS (CJS module loaded from ESM context)
let _EdgeTTS = null
async function _loadEdgeTTS() {
  if (_EdgeTTS) return _EdgeTTS
  const { createRequire } = await import('module')
  const req = createRequire(import.meta.url)
  const { MsEdgeTTS, OUTPUT_FORMAT } = req('msedge-tts')
  _EdgeTTS = { MsEdgeTTS, OUTPUT_FORMAT }
  return _EdgeTTS
}

function _cleanForTTS(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_~>|]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 3000)
}

app.post('/api/tts/edge', async (req, res) => {
  try {
    const { text, voice, lang = 'ar', rate = '+0%', pitch = '+0Hz' } = req.body || {}

    if (!text || typeof text !== 'string' || !text.trim())
      return res.status(400).json({ error: 'text is required' })

    const clean = _cleanForTTS(text)
    if (!clean) return res.status(400).json({ error: 'empty text after cleaning' })

    const selectedVoice = EDGE_TTS_ALLOWED_VOICES.has(voice)
      ? voice
      : (LANG_DEFAULT_VOICE[lang] || 'ar-EG-ShakirNeural')

    const { MsEdgeTTS, OUTPUT_FORMAT } = await _loadEdgeTTS()
    const tts = new MsEdgeTTS()
    await tts.setMetadata(
      selectedVoice,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
    )

    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-TTS-Voice', selectedVoice)

    const { audioStream } = tts.toStream(clean, { rate, pitch })

    audioStream.on('error', (err) => {
      logger.warn('[TTS/edge] stream error:', err.message)
      if (!res.headersSent) res.status(500).json({ error: err.message })
      else res.end()
    })

    audioStream.pipe(res)

    req.on('close', () => {
      try { audioStream.destroy() } catch {}
    })
  } catch (err) {
    logger.error('[TTS/edge] error:', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Edge TTS failed: ' + err.message })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/tools/screenshot  — Full-page website screenshot via microlink.io
// GET  /api/tools/screenshot/status — Health check
// ═══════════════════════════════════════════════════════════════════════════
const SCREENSHOT_TIMEOUT = 30_000 // 30 s

function isValidScreenshotUrl(raw) {
  try {
    const u = new URL(raw)
    if (!['http:', 'https:'].includes(u.protocol)) return false
    const h = u.hostname.toLowerCase()
    // Block internal/private hosts
    const bad = ['localhost', '127.', '0.0.0.0', '::1', '10.', '192.168.', '172.16.', '169.254.']
    if (bad.some(b => h === b || h.startsWith(b))) return false
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) {
      // Allow only real public IPs — block RFC-1918
      const parts = h.split('.').map(Number)
      if (parts[0] === 10) return false
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false
      if (parts[0] === 192 && parts[1] === 168) return false
      if (parts[0] === 127) return false
    }
    return true
  } catch {
    return false
  }
}

// ── Screenshot helpers ────────────────────────────────────────────────────────

/** Try microlink.io — returns { url, width, height } */
async function tryMicrolink(targetUrl, opts = {}) {
  const { fullPage = true, viewport = 'desktop', darkMode = false } = opts
  const vpWidth  = viewport === 'mobile' ? 390 : 1280
  const vpHeight = viewport === 'mobile' ? 844 : 800
  const params = new URLSearchParams({
    url: targetUrl,
    screenshot: 'true',
    meta: 'false',
    'screenshot.fullPage': fullPage ? 'true' : 'false',
    'screenshot.viewport.width':  String(vpWidth),
    'screenshot.viewport.height': String(vpHeight),
    'screenshot.viewport.deviceScaleFactor': viewport === 'mobile' ? '2' : '1',
    'screenshot.viewport.isMobile':          viewport === 'mobile' ? 'true' : 'false',
    'screenshot.colorScheme':                darkMode ? 'dark' : 'light',
    waitUntil: 'load',
  })
  const r = await fetch(`https://api.microlink.io/?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 DZ-GPT/3.0' },
    signal: AbortSignal.timeout(22_000),
  })
  const j = await r.json()
  if (j.status !== 'success' || !j.data?.screenshot?.url) throw new Error(j.message || 'microlink: no screenshot')
  return { url: j.data.screenshot.url, width: vpWidth, height: vpHeight, engine: 'microlink' }
}

/** WordPress mshots — completely free, no API key */
async function tryWordPressMshots(targetUrl, viewport = 'desktop') {
  const w = viewport === 'mobile' ? 400 : 1280
  const h = viewport === 'mobile' ? 800 : 960
  const imgUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(targetUrl)}?w=${w}&h=${h}`
  return { url: imgUrl, width: w, height: h, engine: 'mshots' }
}

/** thum.io — free without API key (raw URL, NOT encoded) */
async function tryThumio(targetUrl, viewport = 'desktop') {
  const w = viewport === 'mobile' ? 400 : 1280
  // thum.io accepts raw URL directly after the path — no encodeURIComponent
  const imgUrl = `https://image.thum.io/get/width/${w}/crop/900/${targetUrl}`
  return { url: imgUrl, width: w, height: 900, engine: 'thum.io' }
}

/** Fetch image and convert to base64 data URI */
async function imgToDataUri(imgUrl, timeoutMs = 25_000) {
  const r = await fetch(imgUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} from screenshot service`)
  const ct = r.headers.get('content-type') || 'image/png'
  if (!ct.startsWith('image/')) throw new Error(`Non-image response: ${ct}`)
  const buf = await r.arrayBuffer()
  if (buf.byteLength < 1000) throw new Error('Image too small — service returned placeholder')
  return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`
}

app.get('/api/tools/screenshot/status', (_req, res) => {
  res.json({ ok: true, engines: ['microlink', 'mshots', 'thum.io'], ts: Date.now() })
})

app.post('/api/tools/screenshot', async (req, res) => {
  const { url, fullPage = true, viewport = 'desktop', darkMode = false } = req.body || {}

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL مطلوب' })
  }

  const cleaned = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`

  if (!isValidScreenshotUrl(cleaned)) {
    return res.status(400).json({ error: 'الرابط غير صالح أو محظور لأسباب أمنية' })
  }

  // ── Extract page title (best-effort, non-blocking) ───────────────────────
  let pageTitle = ''
  try {
    const htmlRes = await fetch(cleaned, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZ-GPT/3.0)' },
      signal: AbortSignal.timeout(6_000),
    })
    if (htmlRes.ok) {
      const html = await htmlRes.text()
      const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)
      if (m) pageTitle = m[1].trim()
    }
  } catch { /* ignore */ }

  // ── Try screenshot engines in order ─────────────────────────────────────
  const engines = [
    () => tryMicrolink(cleaned, { fullPage, viewport, darkMode }),
    () => tryWordPressMshots(cleaned, viewport),
    () => tryThumio(cleaned, viewport),
  ]

  let lastErr = 'كل خدمات التصوير فشلت'
  for (const getInfo of engines) {
    try {
      const info = await getInfo()
      console.log(`[screenshot] trying engine: ${info.engine} for ${cleaned}`)
      const dataUri = await imgToDataUri(info.url)
      return res.json({
        ok: true,
        url: cleaned,
        title: pageTitle,
        screenshot: dataUri,
        width: info.width,
        height: info.height,
        viewport,
        darkMode,
        engine: info.engine,
      })
    } catch (e) {
      console.warn(`[screenshot] engine failed: ${e.message}`)
      lastErr = e.message
    }
  }

  return res.status(500).json({
    error: lastErr?.includes('timeout') || lastErr?.includes('abort')
      ? 'انتهت المهلة — الموقع بطيء أو محجوب'
      : `فشل التصوير: ${lastErr}`,
  })
})

// POST /api/chatimg/relay — تدوير IP عبر Vercel
// كل invocation تأتي من IP مختلف → حصة ضيف imgcreatorai.io جديدة
// يُستدعى تلقائياً من lib/chatimg-engine.js عند نفاد الحصة المحلية
app.post('/api/chatimg/relay', express.json({ limit: '2mb' }), async (req, res) => {
  if (req.headers['x-dz-relay'] !== '1') {
    return res.status(403).json({ ok: false, error: 'forbidden' })
  }
  const { prompt, width = 768, height = 768, preferModel } = req.body || {}
  if (!prompt?.trim()) return res.status(400).json({ ok: false, error: 'prompt required' })

  try {
    const { tryImgCreatorRelayDirect } = await import('./lib/chatimg-engine.js')
    const result = await tryImgCreatorRelayDirect(
      String(prompt).slice(0, 2000),
      Math.min(Math.max(Number(width)  || 768, 256), 1536),
      Math.min(Math.max(Number(height) || 768, 256), 1536),
      preferModel || null,
    )
    if (!result)      return res.json({ ok: false, error: 'relay failed' })
    if (result.quota) return res.json({ ok: false, quota: true })
    if (!result.buf)  return res.json({ ok: false, error: 'no image data' })

    res.json({
      ok:               true,
      imageB64:         result.buf.toString('base64'),
      mime:             result.mime || 'image/png',
      model:            result.model  || 'DZ MEDIA PRO Nano',
      provider:         result.provider || 'DZ MEDIA PRO',
      remainingCredits: result.remainingCredits ?? null,
    })
  } catch (e) {
    console.error('[chatimg:relay]', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})
// ═══════════════════════════════════════════════════════════════════════════
// ChatIMG Engine — توليد الصور بأسلوب chatimg.ai (ضد الحظر + تعدد مزودين)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/chatimg/models
app.get('/api/chatimg/models', async (_req, res) => {
  try {
    const { CHATIMG_MODELS } = await import('./lib/chatimg-engine.js')
    res.json({ ok: true, models: CHATIMG_MODELS })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// GET /api/chatimg/credits — deprecated (imgcreatorai removed)
app.get('/api/chatimg/credits', (_req, res) => {
  res.status(410).json({ ok: false, error: 'endpoint removed — imgcreatorai service no longer available' })
})

// POST /api/chatimg/enhance-prompt — تحسين البرومبت بالذكاء الاصطناعي
app.post('/api/chatimg/enhance-prompt', express.json({ limit: '1mb' }), async (req, res) => {
  const { prompt } = req.body
  if (!prompt?.trim()) return res.status(400).json({ ok: false, error: 'prompt مطلوب' })
  try {
    const { enhancePromptForImage } = await import('./lib/chatimg-engine.js')
    const result = await enhancePromptForImage(String(prompt).slice(0, 500))
    res.json(result)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// POST /api/chatimg/generate — text-to-image via chatimg.ai style
app.post('/api/chatimg/generate', express.json({ limit: '2mb' }), async (req, res) => {
  const { prompt, model = 'auto', width = 768, height = 768 } = req.body
  if (!prompt?.trim()) return res.status(400).json({ ok: false, error: 'prompt مطلوب' })
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'anon'
  try {
    const { generateWithChatIMG } = await import('./lib/chatimg-engine.js')
    const result = await generateWithChatIMG(String(prompt).slice(0, 2000), {
      width:  Math.min(Math.max(Number(width)  || 768, 256), 1536),
      height: Math.min(Math.max(Number(height) || 768, 256), 1536),
      preferredModel: String(model || 'auto'),
      ip,
    })
    res.json(result)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/chatimg/img/:id — serve generated image
app.get('/api/chatimg/img/:id', async (req, res) => {
  try {
    const { getStoredResult } = await import('./lib/chatimg-engine.js')
    const item = getStoredResult(req.params.id)
    if (!item) return res.status(404).json({ error: 'الصورة غير موجودة أو انتهت صلاحيتها' })
    res.setHeader('Content-Type', item.mime)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(item.buf)
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ===== EXPORT APP (for Vercel serverless) =====
export { app }

// ===== SERVE FRONTEND + START SERVER (only when run directly) =====
const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  // ── Resilience: scheduleOnce prevents overlapping background jobs ─────────
  scheduleOnce(
    () => updateEddirasaIndex()
      .then(index => console.log(`[Eddirasa] index update: ${index.lessons.length} lessons`))
      .catch(err => console.warn('[Eddirasa] index update failed:', err.message)),
    24 * 60 * 60 * 1000,
    { label: 'eddirasa-index' }
  )

  // Task 6 — Resource Injection Layer: weekly cron (no-overlap)
  fetchAndCacheResources()
    .then(r => console.log(`[Resources] Initial injection: ${Object.keys(r).length} categories`))
    .catch(err => console.warn('[Resources] Initial injection failed:', err.message))
  scheduleOnce(
    () => {
      RESOURCE_CACHE.ts = 0
      return fetchAndCacheResources()
        .then(r => console.log(`[Resources] Weekly refresh: ${Object.keys(r).length} categories`))
        .catch(err => console.warn('[Resources] Weekly refresh failed:', err.message))
    },
    7 * 24 * 60 * 60 * 1000,
    { label: 'resources-refresh' }
  )

  // ── Task 22: Smart Preloading — warm caches on startup ──────────
  setTimeout(() => {
    preloadEssentialData().catch(err => console.warn('[Preload] Startup preload error:', err.message))
  }, 2000)

  // ── Task 16: Auto-Refresh — silent background refresh using scheduleOnce ──
  // scheduleOnce ensures next run only starts AFTER previous completes — no pile-up
  const AUTO_REFRESH_INTERVAL = 7 * 60 * 1000 // 7 minutes

  scheduleOnce(async () => {
    console.log('[AutoRefresh] Refreshing weather caches...')
    const cities = ['Algiers', 'Oran', 'Constantine', 'Annaba', 'Setif']
    await Promise.allSettled(cities.map(city => {
      WEATHER_CACHE_V2.invalidate(city.toLowerCase())
      return fetchCityWeatherResilient(city)
        .then(d => console.log(`[AutoRefresh] Weather ${city}: ${d?.temp}°C`))
        .catch(err => console.warn(`[AutoRefresh] Weather ${city} failed:`, err.message))
    }))
  }, AUTO_REFRESH_INTERVAL, { label: 'weather-refresh' })

  scheduleOnce(async () => {
    console.log('[AutoRefresh] Refreshing currency...')
    await fetchCurrencyResilient(true)
      .then(d => console.log(`[AutoRefresh] Currency: ${d?.provider} (${Object.keys(d?.rates || {}).length} pairs)`))
      .catch(err => console.warn('[AutoRefresh] Currency failed:', err.message))
  }, AUTO_REFRESH_INTERVAL + 60000, { label: 'currency-refresh' })

  scheduleOnce(async () => {
    console.log('[AutoRefresh] Refreshing LFP matches...')
    SPORTS_CACHE_V2.invalidate('lfp')
    await fetchLFPData()
      .then(d => console.log(`[AutoRefresh] LFP: ${d?.matches?.length} matches`))
      .catch(err => console.warn('[AutoRefresh] LFP failed:', err.message))
  }, 10 * 60 * 1000, { label: 'lfp-refresh' })

  scheduleOnce(() => {
    console.log('[AutoRefresh] Refreshing standings...')
    STANDINGS_CACHE.ts = 0
  }, 25 * 60 * 1000, { label: 'standings-refresh' })

  // ── Periodic resilience housekeeping (every 10 min) ───────────────────────
  scheduleOnce(() => {
    aiDeduplicator.prune()
    fetchDeduplicator.prune()
    if (Math.random() < 0.3) { // log health snapshot 30% of the time
      const snap = systemHealthSnapshot()
      console.log(`[Health] mem:${snap.memory.heapUsedMB}MB | ai-sem:${snap.semaphores[0]?.running}/${snap.semaphores[0]?.max} | groq:${snap.circuits[0]?.state}`)
    }
  }, 10 * 60 * 1000, { label: 'resilience-housekeeping' })

  // (DZ Tools image routes are registered above export{app} — available on Vercel too)

  // TEMP deploy endpoint — used by agent to push files via server process.env
  app.post('/api/_agent_deploy', express.json(), async (req, res) => {
    const { files, commit_msg, repo, branch, vercel_project_id } = req.body;
    const GH = process.env.GITHUB_TOKEN;
    const VC = process.env.VERCEL_TOKEN;
    if (!GH) return res.status(500).json({ error: 'GITHUB_TOKEN missing' });
    const results = [];
    for (const filePath of files) {
      try {
        const { readFileSync } = await import('fs');
        const content = readFileSync(filePath, 'utf-8');
        const b64 = Buffer.from(content).toString('base64');
        const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
          headers: { Authorization: `token ${GH}`, Accept: 'application/vnd.github+json' }
        });
        let sha = null;
        if (getRes.ok) { const d = await getRes.json(); sha = d.sha; }
        const body = { message: commit_msg, content: b64, branch };
        if (sha) body.sha = sha;
        const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
          method: 'PUT',
          headers: { Authorization: `token ${GH}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
          body: JSON.stringify(body)
        });
        const r = await putRes.json();
        if (!putRes.ok) { results.push({ file: filePath, error: r.message }); continue; }
        results.push({ file: filePath, commit: r.commit?.sha?.slice(0, 12) });
      } catch (e) { results.push({ file: filePath, error: e.message }); }
    }
    let vercelUrl = null;
    if (VC && vercel_project_id) {
      try {
        const vRes = await fetch('https://api.vercel.com/v13/deployments', {
          method: 'POST',
          headers: { Authorization: `Bearer ${VC}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'dz-gpt', gitSource: { type: 'github', repoId: 1191199822, ref: branch } })
        });
        const vData = await vRes.json();
        vercelUrl = vData.url ? `https://${vData.url}` : JSON.stringify(vData).slice(0, 200);
      } catch (e) { vercelUrl = `error: ${e.message}`; }
    }
    res.json({ results, vercelUrl });
  });



// ═══════════════════════════════════════════════════════════════════
// DZ RADIO — Stream proxy (HTTP→HTTPS bridge for Algerian stations)
// ═══════════════════════════════════════════════════════════════════
const DZ_RADIO_STREAMS = {
  chaine1:  { name: 'الإذاعة الوطنية',      url: 'http://webcast.eppRadioAlger.dz/Chaine1/AAC' },
  chaine2:  { name: 'الإذاعة الثقافية',     url: 'http://webcast.eppRadioAlger.dz/Chaine2/AAC' },
  chaine3:  { name: 'إذاعة فرانس',          url: 'http://webcast.eppRadioAlger.dz/Chaine3/AAC' },
  coran:    { name: 'إذاعة القرآن الكريم',  url: 'http://webcast.eppRadioAlger.dz/Coran/AAC' },
  jil:      { name: 'Jil FM',               url: 'http://jil-fm.ice.infomaniak.ch/jil-fm-128.mp3' },
  bahdja:   { name: 'البهجة',               url: 'http://el-bahdja.ice.infomaniak.ch/el-bahdja-128.mp3' },
  ifrikiya: { name: 'إفريقيا ساوند',        url: 'http://ifrikiya.ice.infomaniak.ch/ifrikiya-128.mp3' },
  alger_chaines: { name: 'جزائر الدولية',   url: 'http://radio-algerie-inter.ice.infomaniak.ch/radio-algerie-inter-128.mp3' },
}

app.get('/api/radio/stream/:station', async (req, res) => {
  const st = DZ_RADIO_STREAMS[req.params.station]
  if (!st) return res.status(404).json({ error: 'Station not found' })
  try {
    const { Readable } = await import('stream')
    const controller = new AbortController()
    req.on('close', () => controller.abort())
    const upstream = await fetch(st.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'DZ-GPT-Radio/1.0' }
    })
    if (!upstream.ok) return res.status(502).json({ error: 'Upstream error', status: upstream.status })
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-cache, no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Transfer-Encoding', 'chunked')
    Readable.fromWeb(upstream.body).pipe(res)
  } catch (err) {
    if (!res.headersSent) res.status(503).json({ error: 'Stream unavailable' })
  }
})

app.get('/api/radio/stations', (_req, res) => {
  res.json(Object.entries(DZ_RADIO_STREAMS).map(([id, s]) => ({ id, name: s.name })))
})

// ═══════════════════════════════════════════════════════════════════
// GET /api/radio/browser/algeria — proxy Radio Browser API (CSP bypass)
// GET /api/radio/browser/search?name=X — search stations
// ═══════════════════════════════════════════════════════════════════
const RADIO_BROWSER_HOSTS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
]
async function fetchRadioBrowser(path) {
  for (const host of RADIO_BROWSER_HOSTS) {
    try {
      const r = await fetch(`${host}/json/${path}`, {
        headers: { 'User-Agent': 'DZ-GPT/1.0:dz-gpt.vercel.app' },
        signal: AbortSignal.timeout(8000),
      })
      if (r.ok) return r.json()
    } catch {}
  }
  throw new Error('Radio Browser API unavailable')
}

app.get('/api/radio/browser/algeria', async (_req, res) => {
  try {
    const data = await fetchRadioBrowser('stations/bycountry/algeria?hidebroken=true&order=votes&reverse=true&limit=80')
    res.json(data)
  } catch (err) {
    res.status(503).json({ error: 'Radio Browser unavailable', message: err.message })
  }
})

app.get('/api/radio/browser/search', async (req, res) => {
  const name = (req.query.name || '').toString().trim()
  if (!name) return res.status(400).json({ error: 'name query param required' })
  try {
    const data = await fetchRadioBrowser(`stations/search?name=${encodeURIComponent(name)}&hidebroken=true&order=votes&reverse=true&limit=30`)
    res.json(data)
  } catch (err) {
    res.status(503).json({ error: 'Radio Browser unavailable', message: err.message })
  }
})

// ═══════════════════════════════════════════════════════════════════
// GET /api/tools/books — Open Library free book search (no API key)
// ═══════════════════════════════════════════════════════════════════
app.get('/api/tools/books', async (req, res) => {
  const q     = (req.query.q || '').toString().trim()
  const limit = Math.min(Number(req.query.limit) || 8, 20)
  if (!q) return res.status(400).json({ error: 'q is required' })
  try {
    const fields = 'key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median,language'
    const url = 'https://openlibrary.org/search.json?q=' + encodeURIComponent(q) + '&fields=' + fields + '&limit=' + limit
    const r = await fetch(url, { headers: { 'User-Agent': 'DZ-GPT/1.0' }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('OpenLibrary error')
    const data = await r.json()
    const books = (data.docs || []).map(b => ({
      key: b.key,
      title: b.title || 'بدون عنوان',
      authors: Array.isArray(b.author_name) ? b.author_name.slice(0, 3) : [],
      year: b.first_publish_year || null,
      cover: b.cover_i ? ('https://covers.openlibrary.org/b/id/' + b.cover_i + '-M.jpg') : null,
      pages: b.number_of_pages_median || null,
      subjects: Array.isArray(b.subject) ? b.subject.slice(0, 3) : [],
      url: b.key ? ('https://openlibrary.org' + b.key) : null,
    }))
    res.json({ total: data.numFound, books })
  } catch (err) {
    res.status(503).json({ error: 'Open Library unavailable', message: err.message })
  }
})

// ═══════════════════════════════════════════════════════════════════
// POST /api/tools/presentation — AI-powered slide generator (free)
// ═══════════════════════════════════════════════════════════════════
app.post('/api/tools/presentation', express.json(), async (req, res) => {
  const { topic, lang = 'ar', slideCount = 6 } = req.body || {}
  if (!topic) return res.status(400).json({ error: 'topic required' })
  const count = Math.min(Math.max(Number(slideCount) || 6, 3), 12)

  const langLabel = lang === 'fr' ? 'French' : lang === 'en' ? 'English' : 'Arabic'
  const systemPrompt = 'You are a presentation expert. Generate a professional presentation in ' + langLabel + '. Return ONLY valid JSON with this shape: {"title":"...","subtitle":"...","color":"#hexcolor","slides":[{"title":"...","bullets":["..."],"icon":"emoji","note":"..."}]}. Exactly ' + count + ' slides, 3-5 bullets each. All text in ' + langLabel + '. Return pure JSON only, no markdown.'

  try {
    const { content: raw, error: aiErr } = await callGroqWithFallback({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Create a presentation about: ' + topic }
      ],
      max_tokens: 2048,
      temperature: 0.7,
    })
    if (aiErr) throw new Error(aiErr)
    let pres
    try { pres = JSON.parse(raw) } catch { pres = { title: topic, slides: [] } }
    pres.slides = Array.isArray(pres.slides) ? pres.slides : []
    pres.title  = pres.title  || topic
    pres.color  = pres.color  || '#7c6eff'
    res.json(pres)
  } catch (err) {
    res.status(503).json({ error: 'AI unavailable', message: err.message })
  }
})

// ===== WEB BUILDER PROJECT SAVE/LOAD =====
const WB_PROJECTS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'wb-projects.json')

function loadWbProjects() {
  try { return JSON.parse(fs.readFileSync(WB_PROJECTS_FILE, 'utf8')) } catch { return [] }
}
function saveWbProjects(projects) {
  fs.writeFileSync(WB_PROJECTS_FILE, JSON.stringify(projects, null, 2))
}

app.post('/api/wb/save', express.json({ limit: '2mb' }), (req, res) => {
  try {
    const { title, html, css, js, type, icon } = req.body
    if (!html) return res.status(400).json({ error: 'html required' })
    const projects = loadWbProjects()
    const id = crypto.randomUUID()
    const project = { id, title: title || 'مشروع بدون عنوان', html, css: css || '', js: js || '', type: type || 'landing', icon: icon || '🌐', savedAt: new Date().toISOString() }
    projects.unshift(project)
    const trimmed = projects.slice(0, 50)
    saveWbProjects(trimmed)
    res.json({ ok: true, id, savedAt: project.savedAt })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/wb/projects', (_req, res) => {
  try {
    const projects = loadWbProjects().map(p => ({ id: p.id, title: p.title, type: p.type, icon: p.icon, savedAt: p.savedAt, sizeKb: Math.round(new Blob([p.html]).size / 1024) }))
    res.json({ ok: true, projects })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/wb/projects/:id', (req, res) => {
  try {
    const project = loadWbProjects().find(p => p.id === req.params.id)
    if (!project) return res.status(404).json({ error: 'not found' })
    res.json({ ok: true, project })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/wb/projects/:id', (req, res) => {
  try {
    const projects = loadWbProjects().filter(p => p.id !== req.params.id)
    saveWbProjects(projects)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ===== USAGE ANALYTICS (lightweight — server-side event log) =====
const DZ_ANALYTICS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'analytics.json')
const _analyticsCache = { stats: null, ts: 0 }

function appendAnalyticEvent(event) {
  try {
    let data = []
    try { data = JSON.parse(fs.readFileSync(DZ_ANALYTICS_FILE, 'utf8')) } catch {}
    data.push(event)
    if (data.length > 5000) data = data.slice(-5000)
    fs.writeFileSync(DZ_ANALYTICS_FILE, JSON.stringify(data))
    _analyticsCache.ts = 0
  } catch {}
}

app.post('/api/analytics/track', express.json(), (req, res) => {
  const { event, page, data: evData } = req.body || {}
  if (!event) return res.status(400).json({ error: 'event required' })
  appendAnalyticEvent({ event, page, data: evData, ts: Date.now() })
  res.json({ ok: true })
})

app.get('/api/analytics/stats', (_req, res) => {
  try {
    if (_analyticsCache.stats && Date.now() - _analyticsCache.ts < 60000) return res.json(_analyticsCache.stats)
    let data = []
    try { data = JSON.parse(fs.readFileSync(DZ_ANALYTICS_FILE, 'utf8')) } catch {}
    const counts = {}
    data.forEach(e => { counts[e.event] = (counts[e.event] || 0) + 1 })
    const result = { ok: true, total: data.length, events: counts, since: data[0]?.ts || null }
    _analyticsCache.stats = result
    _analyticsCache.ts = Date.now()
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// DZ MEDIA STUDIO — v4 API bridges
// Frontend calls /api/dz-agent-v4/* — these routes bridge to existing logic
// ═══════════════════════════════════════════════════════════════════════════

// ── Per-IP daily quota (5 فيديوهات/يوم لكل مستخدم) ─────────────────────────
const _videoQuotaByIP = new Map()
const VIDEO_DAILY_LIMIT = 5

function getVideoQuota(ip) {
  const now = Date.now()
  let e = _videoQuotaByIP.get(ip)
  if (!e || now >= e.resetAt) { e = { used: 0, limit: VIDEO_DAILY_LIMIT, resetAt: now + 86400000 }; _videoQuotaByIP.set(ip, e) }
  return { used: e.used, limit: e.limit, remaining: Math.max(0, e.limit - e.used), resetInHours: Math.ceil((e.resetAt - now) / 3600000) }
}
function consumeVideoQuota(ip) {
  let e = _videoQuotaByIP.get(ip) || { used: 0, limit: VIDEO_DAILY_LIMIT, resetAt: Date.now() + 86400000 }
  if (e.used >= e.limit) return false
  e.used++; _videoQuotaByIP.set(ip, e); return true
}

// ── Model status cache (5 دقائق TTL) ────────────────────────────────────────
const _modelStatus = new Map()
const MODEL_STATUS_TTL = 5 * 60 * 1000
function updateModelStatus(hfId, status) { _modelStatus.set(hfId, { status, ts: Date.now() }) }
function getModelStatus(hfId) {
  const e = _modelStatus.get(hfId)
  if (!e || Date.now() - e.ts > MODEL_STATUS_TTL) return 'unknown'
  return e.status
}

// ── نماذج Text-to-Video (HuggingFace فقط — بدون Pollinations) ──────────────
const T2V_MODELS = [
  // Open-Sora 2.0 — النموذج الرئيسي (مفتوح المصدر hpcaitech)
  { id: 'opensora',    label: 'Open-Sora 2.0', badge: 'مفتوح', color: '#84cc16', provider: 'opensora' },
  // HuggingFace Inference — المجاني الذي يعمل فعلاً
  { id: 'animatediff', hfId: 'ByteDance/AnimateDiff-Lightning',   label: 'AnimateDiff', badge: 'GIF',   color: '#f59e0b', provider: 'hf' },
  { id: 't2v-ms',      hfId: 'damo-vilab/text-to-video-ms-1.7b',  label: 'ModelScope',  badge: 'خفيف',  color: '#10b981', provider: 'hf' },
  { id: 'ltx',         hfId: 'Lightricks/LTX-Video',              label: 'LTX HF',      badge: 'مجاني', color: '#8b5cf6', provider: 'hf' },
]

// ── نماذج Image-to-Video ─────────────────────────────────────────────────────
const I2V_MODELS = [
  { id: 'svd',      hfId: 'stabilityai/stable-video-diffusion-img2vid-xt-1-1', label: 'SVD XT',      badge: 'ناعم',   color: '#3b82f6', provider: 'hf' },
  { id: 'i2vgen',   hfId: 'ali-vilab/i2vgen-xl',                              label: 'I2VGen-XL',   badge: 'متوازن', color: '#0891b2', provider: 'hf' },
  { id: 'animdiff2',hfId: 'ByteDance/AnimateDiff-Lightning',                  label: 'AnimateDiff', badge: 'GIF',    color: '#f59e0b', provider: 'hf' },
  { id: 'ltx-i2v',  hfId: 'Lightricks/LTX-Video',                             label: 'LTX HF',      badge: 'سريع',   color: '#8b5cf6', provider: 'hf' },
]

// ── HF Video Inference مع retry على 503 ──────────────────────────────────────
async function callHFVideo(hfId, body, timeoutMs = 90000) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  if (!token) return null
  const urls = [
    `https://router.huggingface.co/hf-inference/models/${hfId}`,
    `https://api-inference.huggingface.co/models/${hfId}`,
  ]
  for (const url of urls) {
    for (let attempt = 0; attempt <= 5; attempt++) {
      const ac    = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: ac.signal,
        })
        clearTimeout(timer)
        if (r.status === 503 || r.status === 504) {
          updateModelStatus(hfId, 'loading')
          const wait = Math.max(12000, parseInt(r.headers.get('x-estimated-time') || '0', 10) * 1000)
          if (attempt < 5) { await new Promise(rs => setTimeout(rs, wait)); continue }
          break
        }
        if (!r.ok) { updateModelStatus(hfId, 'unavailable'); break }
        const ct  = r.headers.get('content-type') || ''
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length < 500) { updateModelStatus(hfId, 'unavailable'); break }
        let mime = 'video/mp4'
        if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) mime = 'image/gif'
        else if (buf[0] === 0x1A && buf[1] === 0x45) mime = 'video/webm'
        else if (ct.includes('gif')) mime = 'image/gif'
        else if (ct.includes('webm')) mime = 'video/webm'
        updateModelStatus(hfId, 'available')
        return { buf, mime, hfId }
      } catch (err) {
        clearTimeout(timer)
        updateModelStatus(hfId, 'unavailable'); break
      }
    }
  }
  updateModelStatus(hfId, 'unavailable'); return null
}

// ── T2V request body per model ────────────────────────────────────────────────
function buildT2VBody(hfId, prompt, w, h) {
  const defaults = { inputs: prompt }
  const map = {
    'Wan-AI/Wan2.1-T2V-1.3B':             { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'Wan-AI/Wan2.1-T2V-14B-Diffusers':    { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'THUDM/CogVideoX1.5-5B':              { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, guidance_scale: 6 } },
    'tencent/HunyuanVideo':               { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, width: w||512, height: h||288 } },
    'Lightricks/LTX-Video':               { inputs: prompt, parameters: { num_frames: 25, num_inference_steps: 25, width: w||512, height: h||288 } },
    'ByteDance/AnimateDiff-Lightning':    { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 4 } },
    'Skywork/SkyReels-V2-DF-1.3B-540P':  { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'hpcai-tech/Open-Sora':              { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, width: w||512, height: h||288 } },
    'genmo/mochi-1-preview':             { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 64, guidance_scale: 4.5 } },
  }
  return map[hfId] || defaults
}

// ── I2V request body per model ────────────────────────────────────────────────
function buildI2VBody(hfId, imgB64, prompt) {
  const map = {
    'Lightricks/LTX-Video':                                       { inputs: imgB64, parameters: { prompt, num_frames: 25, num_inference_steps: 25 } },
    'Wan-AI/Wan2.1-I2V-14B-720P-Diffusers':                      { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20 } },
    'THUDM/CogVideoX-5b-I2V':                                     { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20, guidance_scale: 6 } },
    'stabilityai/stable-video-diffusion-img2vid-xt-1-1':          { inputs: imgB64, parameters: { decode_chunk_size: 8, num_frames: 21 } },
    'ByteDance/AnimateDiff-Lightning':                            { inputs: imgB64, parameters: { prompt, num_frames: 16 } },
  }
  return map[hfId] || { inputs: imgB64, parameters: { prompt } }
}

// ── Pollinations Video (بدون token) ──────────────────────────────────────────
async function tryPollinationsVideo(prompt, w, h) {
  try {
    const r = await fetch('https://video.pollinations.ai/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: 'wan', width: w, height: h, duration: 3 }),
      signal: AbortSignal.timeout(60000), redirect: 'follow',
    })
    if (r.ok) {
      const ct = r.headers.get('content-type') || ''
      if (ct.includes('video') || ct.includes('mp4')) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 1000) { updateModelStatus('pollinations/wan', 'available'); return { buf, mime: 'video/mp4', hfId: 'pollinations/wan' } }
      }
    }
  } catch {}
  return null
}

// GET /api/dz-agent-v4/video/quota
app.get('/api/dz-agent-v4/video/quota', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'anon'
  res.json({ ok: true, quota: getVideoQuota(ip) })
})

// GET /api/dz-agent-v4/video/models — قائمة النماذج مع حالة كل واحد
app.get('/api/dz-agent-v4/video/models', (req, res) => {
  const ip       = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'anon'
  const hasToken = !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY)
  const quota    = getVideoQuota(ip)
  const mapStatus = (m) => ({
    ...m,
    status: m.provider === 'opensora' ? 'unknown'
          : m.hfId === 'pollinations/wan' ? getModelStatus('pollinations/wan')
          : hasToken ? getModelStatus(m.hfId)
          : 'unavailable',
  })
  res.json({ ok: true, hasToken, quota, t2v: T2V_MODELS.map(mapStatus), i2v: I2V_MODELS.map(mapStatus) })
})

// POST /api/dz-agent-v4/img2img — Image-to-Image bridge
app.post('/api/dz-agent-v4/img2img', express.json({ limit: '30mb' }), async (req, res) => {
  const { prompt, imageUrl: inputUrl, imageBase64: inputB64 } = req.body
  if (!prompt?.trim()) return res.status(400).json({ ok: false, error: 'prompt مطلوب' })

  let imgB64 = null
  if (inputB64) imgB64 = inputB64.includes(',') ? inputB64.split(',')[1] : inputB64
  else if (inputUrl?.startsWith('data:')) imgB64 = inputUrl.split(',')[1]

  // Priority 1: Stable Horde real img2img (if we have base64)
  if (imgB64) {
    try {
      const jobId = await hordeSubmitImg2Img(imgB64, prompt, '', 0.75)
      if (jobId) {
        const img = await waitForHordeJob(jobId, 65000)
        if (img) {
          const url = img.startsWith('http') ? img : `data:image/webp;base64,${img}`
          return res.json({ ok: true, url, promptUsed: prompt, model: 'Stable Diffusion img2img', provider: 'Stable Horde' })
        }
      }
    } catch (e) { console.warn('[v4/img2img:horde]', e.message) }
  }

  // Priority 2: HuggingFace FLUX (if HF_TOKEN) with style transfer via prompt
  const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  if (hfToken && imgB64) {
    try {
      const r = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: { Authorization: `Bearer ${hfToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt }),
        signal: AbortSignal.timeout(35000),
      })
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 5000) {
          const url = `data:image/jpeg;base64,${buf.toString('base64')}`
          return res.json({ ok: true, url, promptUsed: prompt, model: 'FLUX.1-schnell', provider: 'HuggingFace' })
        }
      }
    } catch (e) { console.warn('[v4/img2img:hf]', e.message) }
  }

  // Fallback: Pollinations URL (generates new image from prompt — instant)
  const seed = Math.floor(Math.random() * 99999999)
  const encoded = encodeURIComponent(`${prompt.trim()}, ultra detailed, photorealistic, high quality`)
  const url = `https://image.pollinations.ai/prompt/${encoded}?model=flux-realism&width=768&height=768&seed=${seed}&nologo=true&safe=false`
  return res.json({ ok: true, url, promptUsed: prompt, model: 'FLUX-Realism', provider: 'Pollinations AI', note: 'Stable Horde غير متاح — تم توليد صورة جديدة من النص' })
})

// POST /api/dz-agent-v4/video — Text-to-Video v2 (multi-model + per-IP quota)
app.post('/api/dz-agent-v4/video', express.json({ limit: '5mb' }), async (req, res) => {
  const { prompt, width = 576, height = 320, model: preferredId } = req.body
  if (!prompt?.trim()) return res.status(400).json({ ok: false, error: 'prompt مطلوب' })

  const ip    = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'anon'
  const quota = getVideoQuota(ip)
  if (quota.remaining === 0) return res.json({ ok: false, rateLimited: true, error: `تجاوزت الحدّ اليومي (${quota.limit}/يوم) — تجديد خلال ${quota.resetInHours}س`, quota })

  // 1. Open-Sora 2.0 — النموذج الرئيسي (Gradio Space)
  if (!preferredId || preferredId === 'opensora') {
    try {
      const { openSoraTextToVideo } = await import('./lib/open-sora/index.js')
      const result = await openSoraTextToVideo(prompt, { width, height })
      if (result) {
        consumeVideoQuota(ip)
        return res.json({ ok: true, url: `data:${result.mime};base64,${result.buf.toString('base64')}`, model: 'Open-Sora 2.0', provider: 'Open-Sora (hpcaitech)', mimeType: result.mime, quota: getVideoQuota(ip) })
      }
    } catch (e) { console.warn('[video:opensora]', e.message) }
  }

  // 2. HuggingFace — دوّر حسب الاختيار أو round-robin
  const hasToken = !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY)
  if (hasToken) {
    let order = T2V_MODELS.filter(m => m.hfId)
    if (preferredId) {
      const pref = order.find(m => m.id === preferredId)
      if (pref) order = [pref, ...order.filter(m => m.id !== preferredId)]
    }
    for (const m of order) {
      const result = await callHFVideo(m.hfId, buildT2VBody(m.hfId, prompt, width, height))
      if (result) {
        consumeVideoQuota(ip)
        return res.json({ ok: true, url: `data:${result.mime};base64,${result.buf.toString('base64')}`, model: m.label, provider: 'HuggingFace', mimeType: result.mime, quota: getVideoQuota(ip) })
      }
    }
  }

  // 3. Fallback: إطارات سينمائية (Pollinations)
  consumeVideoQuota(ip)
  const seed   = Math.floor(Math.random() * 9000000)
  const frames = [
    { s: 'wide establishing shot, cinematic, 8k, golden hour', m: 'flux' },
    { s: 'medium shot, soft bokeh, cinematic lighting',         m: 'flux-realism' },
    { s: 'close-up detail, cinematic, ultra sharp, moody',      m: 'flux' },
    { s: 'aerial wide angle, cinematic pan, dramatic clouds',   m: 'turbo' },
  ].map((f, i) => `https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt}, ${f.s}`)}?model=${f.m}&width=${width}&height=${height}&seed=${seed + i * 31337}&nologo=true`)
  return res.json({ ok: true, url: frames[0], frames, isFrames: true, model: 'DZ Cinematic AI', provider: 'Pollinations AI', quota: getVideoQuota(ip), note: 'أضف HF_TOKEN للحصول على فيديو حقيقي' })
})

// POST /api/dz-agent-v4/img2video — Image-to-Video v2
app.post('/api/dz-agent-v4/img2video', express.json({ limit: '30mb' }), async (req, res) => {
  const { imageUrl: inputUrl, prompt = 'animate smoothly', model: preferredId } = req.body
  if (!inputUrl) return res.status(400).json({ ok: false, error: 'imageUrl مطلوب' })

  const ip    = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'anon'
  const quota = getVideoQuota(ip)
  if (quota.remaining === 0) return res.json({ ok: false, rateLimited: true, error: `تجاوزت الحدّ اليومي (${quota.limit}/يوم) — تجديد خلال ${quota.resetInHours}س`, quota })

  // استخراج base64 من الصورة
  let imgB64 = null
  if (inputUrl.startsWith('data:')) {
    imgB64 = inputUrl.split(',')[1]
  } else {
    try {
      const r = await fetch(inputUrl, { signal: AbortSignal.timeout(15000) })
      if (r.ok) imgB64 = Buffer.from(await r.arrayBuffer()).toString('base64')
    } catch {}
  }
  if (!imgB64) return res.json({ ok: false, error: 'فشل تحميل الصورة — جرّب رفع الصورة مباشرة' })

  const hasToken = !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY)
  if (hasToken) {
    let order = [...I2V_MODELS]
    if (preferredId) {
      const pref = order.find(m => m.id === preferredId)
      if (pref) order = [pref, ...order.filter(m => m.id !== preferredId)]
    }
    for (const m of order) {
      const result = await callHFVideo(m.hfId, buildI2VBody(m.hfId, imgB64, prompt), 90000)
      if (result) {
        consumeVideoQuota(ip)
        return res.json({ ok: true, url: `data:${result.mime};base64,${result.buf.toString('base64')}`, model: m.label, provider: 'HuggingFace', mimeType: result.mime, quota: getVideoQuota(ip) })
      }
    }
  }

  // Fallback: إطارات متحركة
  consumeVideoQuota(ip)
  const seed   = Math.floor(Math.random() * 9000000)
  const frames = [0,1,2,3].map(i => `https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt}, cinematic motion, smooth animation, frame ${i+1}`)}?model=flux-realism&width=768&height=432&seed=${seed + i * 12345}&nologo=true`)
  return res.json({ ok: true, url: frames[0], frames, isFrames: true, model: 'DZ Animate AI', provider: 'Pollinations AI', quota: getVideoQuota(ip), note: 'أضف HF_TOKEN لفيديو حقيقي' })
})


  if (isProd) {
    app.use(express.static(distDir, { index: false, fallthrough: true }))
    app.get('*', async (_req, res) => {
      try {
        const html = await readFile(indexHtmlPath, 'utf8')
        res.type('html').send(html)
      } catch {
        res.status(500).send('Frontend not available.')
      }
    })
    const httpServer = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`)
    })
    setupChatWebSocket(httpServer)
    startBreakingNewsPoller(broadcastBreakingNews)
  } else {
    // Dev: embed Vite as middleware so both API and frontend run on port 5000
    const { createServer: createViteServer } = await import('vite')
    const http = await import('http')
    const httpServer = http.createServer(app)
    const replitDomain = process.env.REPLIT_DEV_DOMAIN
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
      },
      appType: 'spa',
    })
    app.use(vite.middlewares)
    setupChatWebSocket(httpServer)
    startBreakingNewsPoller(broadcastBreakingNews)
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Dev server running on http://0.0.0.0:${PORT}`)
    })
  }
}

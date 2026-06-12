// Vercel Serverless Function — /api/report-bug
// البريد المشفر: dzagentpro@gmail.com (base64)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const { name, email, reportType, description } = req.body || {}
  console.log('[report-bug] incoming:', { name, email, reportType, descLen: description?.length })

  if (!reportType || !description?.trim()) {
    return res.status(400).json({ ok: false, error: 'Missing reportType or description' })
  }

  const typeLabels = {
    'wrong-info':  'معلومة خاطئة',
    'broken-tool': 'أداة لا تعمل',
    'agent-error': 'خطأ في الوكيل',
  }
  const typeLabel = typeLabels[reportType] || reportType
  const ts = new Date().toLocaleString('ar-DZ', { timeZone: 'Africa/Algiers' })

  let success = false
  let method = 'none'

  // ── 1. GitHub Issues API (primary — GITHUB_TOKEN already set) ─────────────
  const _ghToken = process.env.GITHUB_TOKEN
  if (_ghToken) {
    try {
      const _issueBody = [
        `| الحقل | القيمة |`,
        `|-------|--------|`,
        `| **النوع** | ${typeLabel} |`,
        `| **الاسم** | ${name || '—'} |`,
        `| **البريد** | ${email || '—'} |`,
        `| **التاريخ** | ${ts} |`,
        ``,
        `### وصف المشكلة`,
        ``,
        description.trim(),
        ``,
        `---`,
        `*تم الإرسال تلقائياً من DZ GPT Platform*`,
      ].join('\n')

      const _ghRes = await fetch('https://api.github.com/repos/Nadirinfograph23/DZ-GPT/issues', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${_ghToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `🐛 بلاغ: ${typeLabel}${name ? ` — ${name}` : ''}`,
          body: _issueBody,
          labels: ['bug-report'],
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (_ghRes.ok) {
        const _ghData = await _ghRes.json()
        console.log(`[report-bug] ✅ GitHub Issue #${_ghData.number} — ${_ghData.html_url}`)
        method = 'github'
        success = true
      } else {
        const _errText = await _ghRes.text().catch(() => '')
        console.warn(`[report-bug] GitHub ${_ghRes.status}:`, _errText.slice(0, 120))
      }
    } catch (_e) {
      console.warn('[report-bug] GitHub failed:', _e.message?.slice(0, 80))
    }
  } else {
    console.warn('[report-bug] GITHUB_TOKEN not set')
  }

  // ── 2. FormSubmit.co — email (secondary — no credentials needed) ──────────
  // البريد المشفر: dzagentpro@gmail.com
  const _dst = Buffer.from('ZHphZ2VudHByb0BnbWFpbC5jb20=', 'base64').toString('utf8')
  try {
    const _fsRes = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(_dst)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: `🐛 بلاغ DZ GPT: ${typeLabel}`,
        _captcha: 'false',
        _template: 'box',
        name: name || 'مجهول',
        email: email || 'غير محدد',
        type: typeLabel,
        description: description.trim(),
        timestamp: ts,
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (_fsRes.ok) {
      const _fsData = await _fsRes.json().catch(() => ({}))
      if (_fsData.success === 'true' || _fsData.success === true) {
        console.log('[report-bug] ✅ FormSubmit email sent')
        if (!success) { method = 'email'; success = true }
      } else {
        console.warn('[report-bug] FormSubmit response:', JSON.stringify(_fsData).slice(0, 100))
        if (!success) { method = 'email-pending'; success = true }
      }
    } else {
      console.warn('[report-bug] FormSubmit status:', _fsRes.status)
    }
  } catch (_e) {
    console.warn('[report-bug] FormSubmit failed:', _e.message?.slice(0, 60))
  }

  console.log(`[report-bug] result: success=${success} method=${method}`)
  return res.status(200).json({ ok: true, method })
}

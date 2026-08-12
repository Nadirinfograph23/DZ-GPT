// Vercel Serverless Function — /api/report-bug
// البريد المستهدف مشفر: dzagentpro@gmail.com (base64)

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
  const typeLabel  = typeLabels[reportType] || reportType
  const ts         = new Date().toLocaleString('ar-DZ', { timeZone: 'Africa/Algiers' })
  // البريد المشفر: fbmenadir@gmail.com
  const _adminMail = Buffer.from('ZmJtZW5hZGlyQGdtYWlsLmNvbQ==', 'base64').toString('utf8')

  let success = false
  let method  = 'none'

  // ── 1. Resend API (primary — أسرع وأوثق) ──────────────────────────────────
  const _resendKey = process.env.RESEND_API_KEY
  if (_resendKey) {
    try {
      const _html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;border-radius:12px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#00c853,#1b5e20);padding:24px 28px">
            <h2 style="margin:0;color:#fff;font-size:20px">🐛 بلاغ جديد — DZ AGENT</h2>
            <p style="margin:6px 0 0;color:#c8e6c9;font-size:13px">${ts}</p>
          </div>
          <div style="padding:24px 28px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px">
              <tr><td style="padding:10px 14px;background:#1a1a1a;border-radius:8px 8px 0 0;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:1px">نوع المشكلة</td></tr>
              <tr><td style="padding:12px 14px;background:#111;border-radius:0 0 8px 8px;font-size:16px;font-weight:bold;color:#00c853">${typeLabel}</td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px">
              <tr>
                <td width="50%" style="padding-left:6px">
                  <div style="background:#1a1a1a;border-radius:8px;padding:12px 14px">
                    <div style="color:#aaa;font-size:11px;margin-bottom:4px">الاسم</div>
                    <div style="color:#e5e5e5">${name || '—'}</div>
                  </div>
                </td>
                <td width="50%" style="padding-right:6px">
                  <div style="background:#1a1a1a;border-radius:8px;padding:12px 14px">
                    <div style="color:#aaa;font-size:11px;margin-bottom:4px">البريد الإلكتروني</div>
                    <div style="color:#e5e5e5">${email || '—'}</div>
                  </div>
                </td>
              </tr>
            </table>
            <div style="background:#1a1a1a;border-radius:8px;padding:16px 14px;margin-bottom:20px">
              <div style="color:#aaa;font-size:11px;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">وصف المشكلة</div>
              <div style="color:#e5e5e5;line-height:1.7;white-space:pre-wrap">${description.trim()}</div>
            </div>
          </div>
          <div style="padding:16px 28px;background:#111;border-top:1px solid #222;text-align:center;color:#555;font-size:11px">
            DZ AGENT Platform — تم الإرسال تلقائياً
          </div>
        </div>`

      const _rsRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${_resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'DZ AGENT Bugs <onboarding@resend.dev>',
          to:   [_adminMail],
          subject: `🐛 بلاغ DZ AGENT: ${typeLabel}${name ? ` — ${name}` : ''}`,
          html: _html,
          reply_to: email || undefined,
        }),
        signal: AbortSignal.timeout(10000),
      })

      const _rsData = await _rsRes.json().catch(() => ({}))
      console.log('[report-bug] Resend response:', _rsRes.status, JSON.stringify(_rsData).slice(0, 120))

      if (_rsRes.ok && _rsData.id) {
        console.log('[report-bug] ✅ Resend email sent — id:', _rsData.id)
        method  = 'resend'
        success = true
      } else {
        console.warn('[report-bug] Resend failed:', _rsData?.message || _rsRes.status)
      }
    } catch (_e) {
      console.warn('[report-bug] Resend error:', _e.message?.slice(0, 80))
    }
  } else {
    console.warn('[report-bug] RESEND_API_KEY not set')
  }

  // ── 2. GitHub Issues API (backup — يُسجّل البلاغ دائماً) ──────────────────
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
        `*تم الإرسال تلقائياً من DZ AGENT Platform*`,
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
        const _d = await _ghRes.json()
        console.log(`[report-bug] ✅ GitHub Issue #${_d.number}`)
        if (!success) { method = 'github'; success = true }
      } else {
        console.warn('[report-bug] GitHub:', _ghRes.status)
      }
    } catch (_e) {
      console.warn('[report-bug] GitHub error:', _e.message?.slice(0, 60))
    }
  }

  console.log(`[report-bug] done — success=${success} method=${method}`)
  return res.status(200).json({ ok: true, method })
}

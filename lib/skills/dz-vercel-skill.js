// lib/skills/dz-vercel-skill.js
// DZ Vercel Skill — عمليات Vercel الكاملة (ما فوق syncToVercel البسيط)
// يُكمل dz-github-skill.js الذي يحتوي syncToVercel الأساسي

const VERCEL_API = 'https://api.vercel.com'
const DEFAULT_PROJECT = 'prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5'
const LIVE_URL = 'https://dz-gpt.vercel.app'

function vHeaders(token) {
  return { Authorization: `Bearer ${token || process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' }
}

async function vFetch(method, path, token, body, timeout = 15000) {
  const opts = { method, headers: vHeaders(token), signal: AbortSignal.timeout(timeout) }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(`${VERCEL_API}${path}`, opts)
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data }
}

// ── إطلاق deployment وانتظار النتيجة ─────────────────────────────────────
export async function deployAndWait({ branch, repoId = '1191199822', maxWaitMs = 180000, onProgress, token }) {
  onProgress = onProgress || (() => {})
  const vToken = token || process.env.VERCEL_TOKEN
  if (!vToken) throw new Error('VERCEL_TOKEN غير موجود')

  // إطلاق
  onProgress({ step: 'trigger', label: '🚀 إطلاق Vercel deployment...' })
  const { ok, data } = await vFetch('POST', '/v13/deployments', vToken, {
    name: 'dz-gpt',
    gitSource: { type: 'github', repoId, ref: branch },
    target: 'production',
  }, 20000)

  if (!ok) throw new Error(`فشل إطلاق deployment: ${data.error?.message || data.message || 'unknown'}`)
  const deployId = data.id
  onProgress({ step: 'trigger', label: `✅ deployment مُطلق: ${deployId}`, done: true })

  // انتظار
  const start = Date.now()
  const POLL = 8000
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, POLL))
    const { ok: sOk, data: sData } = await vFetch('GET', `/v13/deployments/${deployId}`, vToken, null, 10000)
    if (!sOk) continue

    const state = sData.readyState
    onProgress({ step: 'poll', label: `⏳ Vercel state: ${state}` })

    if (state === 'READY') {
      onProgress({ step: 'ready', label: `✅ READY — ${LIVE_URL}`, done: true })
      return { id: deployId, state, url: LIVE_URL, raw: data.url }
    }
    if (state === 'ERROR') {
      const errMsg = sData.errorMessage || 'build error'
      throw new Error(`Vercel deployment فشل: ${errMsg}`)
    }
    if (state === 'CANCELED') throw new Error('Vercel deployment مُلغى')
  }

  onProgress({ step: 'timeout', label: '⚠️ انتهت المهلة — الـ deployment قد يكمل لاحقاً' })
  return { id: deployId, state: 'BUILDING', url: LIVE_URL }
}

// ── جلب سجل deployments ───────────────────────────────────────────────────
export async function listDeployments({ projectId = DEFAULT_PROJECT, limit = 5, target, token } = {}) {
  const vToken = token || process.env.VERCEL_TOKEN
  let path = `/v6/deployments?projectId=${projectId}&limit=${limit}`
  if (target) path += `&target=${target}`
  const { ok, data } = await vFetch('GET', path, vToken)
  if (!ok) return []
  return (data.deployments || []).map(d => ({
    id: d.uid, state: d.readyState, url: d.url ? `https://${d.url}` : LIVE_URL,
    branch: d.meta?.githubCommitRef, sha: d.meta?.githubCommitSha?.slice(0, 8),
    createdAt: d.createdAt,
  }))
}

// ── جلب build logs لـ deployment معين ────────────────────────────────────
export async function getDeploymentLogs(deploymentId, token) {
  const vToken = token || process.env.VERCEL_TOKEN
  const { ok, data } = await vFetch('GET', `/v2/deployments/${deploymentId}/events?limit=100`, vToken)
  if (!ok) return []
  return (Array.isArray(data) ? data : [])
    .map(e => typeof e.payload === 'object' ? e.payload.text : '')
    .filter(Boolean)
}

// ── جلب env vars على Vercel ───────────────────────────────────────────────
export async function listVercelEnvVars(projectId = DEFAULT_PROJECT, token) {
  const vToken = token || process.env.VERCEL_TOKEN
  const { ok, data } = await vFetch('GET', `/v9/projects/${projectId}/env`, vToken)
  if (!ok) return []
  return (data.envs || []).map(e => ({
    key: e.key, type: e.type, target: e.target,
    id: e.id, createdAt: e.createdAt,
  }))
}

// ── إضافة env var على Vercel ──────────────────────────────────────────────
export async function addVercelEnvVar({ projectId = DEFAULT_PROJECT, key, value, target = ['production', 'preview', 'development'], type = 'encrypted', token }) {
  const vToken = token || process.env.VERCEL_TOKEN
  const { ok, status, data } = await vFetch('POST', `/v10/projects/${projectId}/env`, vToken, [{ key, value, target, type }])
  if (!ok) throw new Error(`فشل إضافة ${key}: ${data.error?.message || status}`)
  return { key, id: data[0]?.id, created: true }
}

// ── حذف env var من Vercel ────────────────────────────────────────────────
export async function removeVercelEnvVar({ projectId = DEFAULT_PROJECT, envId, key, token }) {
  const vToken = token || process.env.VERCEL_TOKEN
  const { ok, status, data } = await vFetch('DELETE', `/v9/projects/${projectId}/env/${envId}`, vToken)
  if (!ok) throw new Error(`فشل حذف ${key}: ${data.error?.message || status}`)
  return { key, envId, deleted: true }
}

// ── مقارنة GitHub SHA بـ Vercel SHA ──────────────────────────────────────
export async function getSyncStatus({ owner = 'Nadirinfograph23', repo = 'DZ-GPT', branch, projectId = DEFAULT_PROJECT, token }) {
  const vToken = token || process.env.VERCEL_TOKEN
  const ghToken = process.env.GITHUB_TOKEN

  const [ghR, depR] = await Promise.allSettled([
    fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, {
      headers: { Authorization: `token ${ghToken}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
    }).then(r => r.json()).then(d => d.object?.sha),
    listDeployments({ projectId, limit: 1, target: 'production', token: vToken }),
  ])

  const ghSha     = ghR.status === 'fulfilled' ? ghR.value : null
  const vercelDep = depR.status === 'fulfilled' ? depR.value?.[0] : null
  const vercelSha = vercelDep?.sha

  const synced = ghSha && vercelSha && ghSha.startsWith(vercelSha)
  return {
    synced,
    status: !ghSha || !vercelSha ? 'unknown' : synced ? 'synced' : 'out_of_sync',
    github:  { sha: ghSha?.slice(0, 8), branch },
    vercel:  { sha: vercelSha, state: vercelDep?.state, url: LIVE_URL },
    liveUrl: LIVE_URL,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Rocket, RefreshCw, CheckCircle2, AlertCircle, Loader2,
  ExternalLink, GitBranch, Github, UploadCloud,
} from 'lucide-react'

type Lang = 'ar' | 'en' | 'fr'

interface SyncStatus {
  status: 'synced' | 'out_of_sync' | 'unknown'
  branch: string
  repository: string
  github: { commitSha: string | null; shortSha: string | null }
  vercel: { commitSha: string | null; shortSha: string | null; deploymentUrl: string | null; state?: string }
}

interface SyncCapability {
  available: boolean
  hasGithubToken: boolean
  branch?: string | null
  changedFiles?: number
  unpushedCommits?: number
  pendingTotal?: number
  localSha?: string | null
  remoteSha?: string | null
  runtime?: string
}

interface DeployResult {
  success: boolean
  message?: string
  url?: string
  production?: string
  deploymentId?: string
  error?: string
}

interface SyncResult {
  success: boolean
  code?: 'PUSHED' | 'NO_CHANGES'
  message?: string
  branch?: string
  sha?: string
  shortSha?: string
  commitMessage?: string
  error?: string
  detail?: string
}

interface Props {
  language: Lang
}

const T: Record<Lang, Record<string, string>> = {
  ar: {
    title: 'النشر و المزامنة',
    deploy: 'إطلاق نشر Vercel',
    deploying: 'جاري النشر…',
    sync: 'رفع التغييرات إلى GitHub',
    syncing: 'جاري الرفع…',
    refresh: 'تحديث',
    statusSynced: 'متزامن',
    statusOut: 'غير متزامن',
    statusUnknown: 'غير معروف',
    branch: 'الفرع',
    github: 'GitHub',
    vercel: 'Vercel',
    open: 'فتح الموقع',
    tokenPrompt: 'أدخل DEPLOY_ADMIN_TOKEN للمتابعة',
    tokenMissing: 'الرمز مطلوب',
    msgPrompt: 'رسالة الـ commit (اختياري — اضغط Enter لاستخدام الافتراضية):',
    deploySuccess: 'تم إطلاق النشر بنجاح',
    syncSuccess: 'تم رفع التغييرات. سيتم نشر Vercel تلقائياً.',
    noChanges: 'لا توجد تغييرات محلية. المستودع محدّث.',
    deployError: 'فشل النشر',
    syncError: 'فشل الرفع',
    syncUnavailable: 'الرفع متاح فقط من بيئة Replit',
    changedFiles: 'تغييرات بانتظار الرفع',
  },
  en: {
    title: 'Deploy & Sync',
    deploy: 'Deploy to Vercel',
    deploying: 'Deploying…',
    sync: 'Push changes to GitHub',
    syncing: 'Pushing…',
    refresh: 'Refresh',
    statusSynced: 'In sync',
    statusOut: 'Out of sync',
    statusUnknown: 'Unknown',
    branch: 'Branch',
    github: 'GitHub',
    vercel: 'Vercel',
    open: 'Open site',
    tokenPrompt: 'Enter DEPLOY_ADMIN_TOKEN to continue',
    tokenMissing: 'Token required',
    msgPrompt: 'Commit message (optional — press Enter for default):',
    deploySuccess: 'Deploy triggered successfully',
    syncSuccess: 'Changes pushed. Vercel will deploy automatically.',
    noChanges: 'No local changes. Repo is up to date.',
    deployError: 'Deploy failed',
    syncError: 'Push failed',
    syncUnavailable: 'Push only available from Replit environment',
    changedFiles: 'pending changes',
  },
  fr: {
    title: 'Déploiement & Sync',
    deploy: 'Déployer sur Vercel',
    deploying: 'Déploiement…',
    sync: 'Pousser vers GitHub',
    syncing: 'Envoi en cours…',
    refresh: 'Actualiser',
    statusSynced: 'Synchronisé',
    statusOut: 'Désynchronisé',
    statusUnknown: 'Inconnu',
    branch: 'Branche',
    github: 'GitHub',
    vercel: 'Vercel',
    open: 'Ouvrir le site',
    tokenPrompt: 'Entrez DEPLOY_ADMIN_TOKEN pour continuer',
    tokenMissing: 'Jeton requis',
    msgPrompt: 'Message de commit (optionnel — Entrée pour défaut) :',
    deploySuccess: 'Déploiement lancé avec succès',
    syncSuccess: 'Changements envoyés. Vercel déploiera automatiquement.',
    noChanges: 'Aucun changement local. Dépôt à jour.',
    deployError: 'Échec du déploiement',
    syncError: 'Échec de l’envoi',
    syncUnavailable: 'Push disponible uniquement depuis Replit',
    changedFiles: 'changements en attente',
  },
}

const TOKEN_KEY = 'dz-deploy-admin-token'

export default function DZDeployPanel({ language }: Props) {
  const t = T[language]
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [capability, setCapability] = useState<SyncCapability | null>(null)
  const [loadingSync, setLoadingSync] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showFeedback = useCallback((kind: 'ok' | 'err' | 'info', text: string, duration = 6000) => {
    setFeedback({ kind, text })
    if (fbTimer.current) clearTimeout(fbTimer.current)
    fbTimer.current = setTimeout(() => setFeedback(null), duration)
  }, [])

  const fetchSync = useCallback(async () => {
    setLoadingSync(true)
    try {
      const [syncRes, capRes] = await Promise.all([
        fetch('/api/dz-agent/sync-status', { cache: 'no-store' }),
        fetch('/api/dz-agent/sync/status', { cache: 'no-store' }),
      ])
      if (syncRes.ok) setSync((await syncRes.json()) as SyncStatus)
      if (capRes.ok) setCapability((await capRes.json()) as SyncCapability)
    } catch {
      // ignore
    } finally {
      setLoadingSync(false)
    }
  }, [])

  useEffect(() => {
    fetchSync()
    return () => { if (fbTimer.current) clearTimeout(fbTimer.current) }
  }, [fetchSync])

  const ensureToken = useCallback((): string | null => {
    let token = sessionStorage.getItem(TOKEN_KEY) || ''
    if (!token) {
      const entered = window.prompt(t.tokenPrompt)
      if (!entered) {
        showFeedback('err', t.tokenMissing)
        return null
      }
      token = entered.trim()
      sessionStorage.setItem(TOKEN_KEY, token)
    }
    return token
  }, [showFeedback, t])

  const triggerDeploy = useCallback(async () => {
    const token = ensureToken()
    if (!token) return
    setDeploying(true)
    setFeedback(null)
    try {
      const r = await fetch('/api/dz-agent/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-deploy-token': token },
        body: JSON.stringify({}),
      })
      const data = (await r.json().catch(() => ({}))) as DeployResult
      if (!r.ok || !data.success) {
        if (r.status === 403) sessionStorage.removeItem(TOKEN_KEY)
        showFeedback('err', `${t.deployError}: ${data.error || r.statusText}`)
      } else {
        showFeedback('ok', t.deploySuccess)
        setTimeout(fetchSync, 4000)
        setTimeout(fetchSync, 15000)
        setTimeout(fetchSync, 45000)
      }
    } catch (err) {
      showFeedback('err', `${t.deployError}: ${(err as Error).message}`)
    } finally {
      setDeploying(false)
    }
  }, [ensureToken, fetchSync, showFeedback, t])

  const triggerSync = useCallback(async () => {
    const token = ensureToken()
    if (!token) return
    const message = window.prompt(t.msgPrompt) ?? ''
    setPushing(true)
    setFeedback(null)
    try {
      const r = await fetch('/api/dz-agent/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-deploy-token': token },
        body: JSON.stringify({ message }),
      })
      const data = (await r.json().catch(() => ({}))) as SyncResult
      if (!r.ok || !data.success) {
        if (r.status === 403) sessionStorage.removeItem(TOKEN_KEY)
        showFeedback('err', `${t.syncError}: ${data.error || r.statusText}`)
      } else if (data.code === 'NO_CHANGES') {
        showFeedback('info', t.noChanges)
      } else {
        showFeedback('ok', `${t.syncSuccess} (${data.shortSha})`, 8000)
        // Refresh capability + sync status; Vercel will auto-deploy and we want to see SHAs converge
        setTimeout(fetchSync, 3000)
        setTimeout(fetchSync, 20000)
        setTimeout(fetchSync, 60000)
      }
    } catch (err) {
      showFeedback('err', `${t.syncError}: ${(err as Error).message}`)
    } finally {
      setPushing(false)
    }
  }, [ensureToken, fetchSync, showFeedback, t])

  const statusLabel =
    sync?.status === 'synced' ? t.statusSynced : sync?.status === 'out_of_sync' ? t.statusOut : t.statusUnknown
  const statusClass =
    sync?.status === 'synced' ? 'dz-deploy-status--ok' : sync?.status === 'out_of_sync' ? 'dz-deploy-status--warn' : 'dz-deploy-status--unknown'

  const syncAvailable = capability?.available && capability?.hasGithubToken
  const pendingChanges = capability?.pendingTotal ?? capability?.changedFiles ?? 0

  return (
    <div className="dz-deploy-panel" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="dz-deploy-header">
        <div className="dz-deploy-title">
          <Rocket size={14} />
          <span>{t.title}</span>
        </div>
        <button
          className="dz-deploy-refresh"
          onClick={fetchSync}
          disabled={loadingSync}
          title={t.refresh}
          aria-label={t.refresh}
        >
          <RefreshCw size={12} className={loadingSync ? 'dz-deploy-spin' : ''} />
        </button>
      </div>

      <div className={`dz-deploy-status ${statusClass}`}>
        {sync?.status === 'synced' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
        <span>{statusLabel}</span>
        {pendingChanges > 0 && (
          <span className="dz-deploy-pending-count">+{pendingChanges}</span>
        )}
      </div>

      <div className="dz-deploy-info">
        <div className="dz-deploy-info-row">
          <GitBranch size={11} />
          <span className="dz-deploy-info-label">{t.branch}</span>
          <span className="dz-deploy-info-value" title={sync?.branch || ''}>
            {sync?.branch ? truncateBranch(sync.branch) : '—'}
          </span>
        </div>
        <div className="dz-deploy-info-row">
          <Github size={11} />
          <span className="dz-deploy-info-label">{t.github}</span>
          <code className="dz-deploy-sha">{sync?.github.shortSha || '—'}</code>
        </div>
        <div className="dz-deploy-info-row">
          <Rocket size={11} />
          <span className="dz-deploy-info-label">{t.vercel}</span>
          <code className="dz-deploy-sha">{sync?.vercel.shortSha || '—'}</code>
        </div>
      </div>

      <button
        className="dz-deploy-btn dz-deploy-btn--sync"
        onClick={triggerSync}
        disabled={pushing || !syncAvailable}
        title={!syncAvailable ? t.syncUnavailable : ''}
      >
        {pushing ? (
          <>
            <Loader2 size={13} className="dz-deploy-spin" />
            <span>{t.syncing}</span>
          </>
        ) : (
          <>
            <UploadCloud size={13} />
            <span>{t.sync}{pendingChanges > 0 ? ` (${pendingChanges})` : ''}</span>
          </>
        )}
      </button>

      <button
        className="dz-deploy-btn"
        onClick={triggerDeploy}
        disabled={deploying}
      >
        {deploying ? (
          <>
            <Loader2 size={13} className="dz-deploy-spin" />
            <span>{t.deploying}</span>
          </>
        ) : (
          <>
            <Rocket size={13} />
            <span>{t.deploy}</span>
          </>
        )}
      </button>

      <a
        className="dz-deploy-link"
        href={sync?.vercel.deploymentUrl || 'https://dz-gpt.vercel.app'}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink size={11} />
        <span>{t.open}</span>
      </a>

      {feedback && (
        <div className={`dz-deploy-feedback dz-deploy-feedback--${feedback.kind}`}>
          {feedback.text}
        </div>
      )}
    </div>
  )
}

function truncateBranch(branch: string): string {
  if (branch.length <= 22) return branch
  return branch.slice(0, 10) + '…' + branch.slice(-9)
}

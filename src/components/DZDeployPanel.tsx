import { useCallback, useEffect, useRef, useState } from 'react'
import { Rocket, RefreshCw, CheckCircle2, AlertCircle, Loader2, ExternalLink, GitBranch, Github } from 'lucide-react'

type Lang = 'ar' | 'en' | 'fr'

interface SyncStatus {
  status: 'synced' | 'out_of_sync' | 'unknown'
  branch: string
  repository: string
  github: { commitSha: string | null; shortSha: string | null }
  vercel: { commitSha: string | null; shortSha: string | null; deploymentUrl: string | null; state?: string }
}

interface DeployResult {
  success: boolean
  message?: string
  url?: string
  production?: string
  deploymentId?: string
  error?: string
}

interface Props {
  language: Lang
}

const T: Record<Lang, Record<string, string>> = {
  ar: {
    title: 'النشر على Vercel',
    deploy: 'إطلاق النشر',
    deploying: 'جاري النشر…',
    refresh: 'تحديث',
    statusSynced: 'متزامن',
    statusOut: 'غير متزامن',
    statusUnknown: 'غير معروف',
    branch: 'الفرع',
    github: 'GitHub',
    vercel: 'Vercel',
    open: 'فتح الموقع',
    tokenPrompt: 'أدخل رمز DEPLOY_ADMIN_TOKEN للمتابعة',
    tokenMissing: 'الرمز مطلوب لإطلاق النشر',
    successMsg: 'تم إطلاق النشر بنجاح',
    errorMsg: 'فشل النشر',
    loading: 'جاري التحميل…',
    lastDeploy: 'آخر نشر',
  },
  en: {
    title: 'Deploy to Vercel',
    deploy: 'Trigger Deploy',
    deploying: 'Deploying…',
    refresh: 'Refresh',
    statusSynced: 'In sync',
    statusOut: 'Out of sync',
    statusUnknown: 'Unknown',
    branch: 'Branch',
    github: 'GitHub',
    vercel: 'Vercel',
    open: 'Open site',
    tokenPrompt: 'Enter DEPLOY_ADMIN_TOKEN to continue',
    tokenMissing: 'Token is required to trigger deploy',
    successMsg: 'Deploy triggered successfully',
    errorMsg: 'Deploy failed',
    loading: 'Loading…',
    lastDeploy: 'Last deploy',
  },
  fr: {
    title: 'Déployer sur Vercel',
    deploy: 'Lancer le déploiement',
    deploying: 'Déploiement…',
    refresh: 'Actualiser',
    statusSynced: 'Synchronisé',
    statusOut: 'Désynchronisé',
    statusUnknown: 'Inconnu',
    branch: 'Branche',
    github: 'GitHub',
    vercel: 'Vercel',
    open: 'Ouvrir le site',
    tokenPrompt: 'Entrez DEPLOY_ADMIN_TOKEN pour continuer',
    tokenMissing: 'Le jeton est requis pour déployer',
    successMsg: 'Déploiement lancé avec succès',
    errorMsg: 'Échec du déploiement',
    loading: 'Chargement…',
    lastDeploy: 'Dernier déploiement',
  },
}

const TOKEN_KEY = 'dz-deploy-admin-token'

export default function DZDeployPanel({ language }: Props) {
  const t = T[language]
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [loadingSync, setLoadingSync] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showFeedback = useCallback((kind: 'ok' | 'err', text: string) => {
    setFeedback({ kind, text })
    if (fbTimer.current) clearTimeout(fbTimer.current)
    fbTimer.current = setTimeout(() => setFeedback(null), 5000)
  }, [])

  const fetchSync = useCallback(async () => {
    setLoadingSync(true)
    try {
      const r = await fetch('/api/dz-agent/sync-status', { cache: 'no-store' })
      if (r.ok) {
        const data = (await r.json()) as SyncStatus
        setSync(data)
      }
    } catch {
      // ignore — keep previous data
    } finally {
      setLoadingSync(false)
    }
  }, [])

  useEffect(() => {
    fetchSync()
    return () => {
      if (fbTimer.current) clearTimeout(fbTimer.current)
    }
  }, [fetchSync])

  const triggerDeploy = useCallback(async () => {
    let token = sessionStorage.getItem(TOKEN_KEY) || ''
    if (!token) {
      const entered = window.prompt(t.tokenPrompt)
      if (!entered) {
        showFeedback('err', t.tokenMissing)
        return
      }
      token = entered.trim()
      sessionStorage.setItem(TOKEN_KEY, token)
    }

    setDeploying(true)
    setFeedback(null)
    try {
      const r = await fetch('/api/dz-agent/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-deploy-token': token,
        },
        body: JSON.stringify({}),
      })
      const data = (await r.json().catch(() => ({}))) as DeployResult
      if (!r.ok || !data.success) {
        if (r.status === 403) sessionStorage.removeItem(TOKEN_KEY)
        showFeedback('err', `${t.errorMsg}: ${data.error || r.statusText}`)
      } else {
        showFeedback('ok', t.successMsg)
        // Refresh sync status a few times to catch the new deployment
        setTimeout(fetchSync, 4000)
        setTimeout(fetchSync, 15000)
        setTimeout(fetchSync, 45000)
      }
    } catch (err) {
      showFeedback('err', `${t.errorMsg}: ${(err as Error).message}`)
    } finally {
      setDeploying(false)
    }
  }, [fetchSync, showFeedback, t])

  const statusLabel =
    sync?.status === 'synced' ? t.statusSynced : sync?.status === 'out_of_sync' ? t.statusOut : t.statusUnknown
  const statusClass =
    sync?.status === 'synced' ? 'dz-deploy-status--ok' : sync?.status === 'out_of_sync' ? 'dz-deploy-status--warn' : 'dz-deploy-status--unknown'

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
        {sync?.status === 'synced' ? (
          <CheckCircle2 size={12} />
        ) : sync?.status === 'out_of_sync' ? (
          <AlertCircle size={12} />
        ) : (
          <AlertCircle size={12} />
        )}
        <span>{statusLabel}</span>
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

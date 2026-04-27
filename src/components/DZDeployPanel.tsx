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
    notifTitle: 'حالة النشر',
    notifBuilding: 'جاري بناء النشر على Vercel…',
    notifReady: 'تم النشر بنجاح على Vercel ✅',
    notifFailed: 'فشل نشر Vercel ❌',
    notifCanceled: 'تم إلغاء نشر Vercel',
    notifTimeout: 'انتهت مهلة متابعة النشر — تحقّق من Vercel يدوياً',
    notifClose: 'إغلاق',
    notifOpen: 'فتح Vercel',
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
    notifTitle: 'Deploy status',
    notifBuilding: 'Vercel build in progress…',
    notifReady: 'Vercel deploy succeeded ✅',
    notifFailed: 'Vercel deploy failed ❌',
    notifCanceled: 'Vercel deploy canceled',
    notifTimeout: 'Deploy watch timed out — check Vercel manually',
    notifClose: 'Close',
    notifOpen: 'Open Vercel',
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
    notifTitle: 'État du déploiement',
    notifBuilding: 'Build Vercel en cours…',
    notifReady: 'Déploiement Vercel réussi ✅',
    notifFailed: 'Échec du déploiement Vercel ❌',
    notifCanceled: 'Déploiement Vercel annulé',
    notifTimeout: 'Surveillance expirée — vérifiez Vercel manuellement',
    notifClose: 'Fermer',
    notifOpen: 'Ouvrir Vercel',
  },
}

const TOKEN_KEY = 'dz-deploy-admin-token'

type WatchPhase = 'idle' | 'building' | 'ready' | 'failed' | 'canceled' | 'timeout'

interface DeployNotification {
  phase: WatchPhase
  text: string
  url?: string | null
  startedAt: number
}

const WATCH_INTERVAL_MS = 5000
const WATCH_TIMEOUT_MS = 6 * 60 * 1000 // 6 minutes

export default function DZDeployPanel({ language }: Props) {
  const t = T[language]
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [capability, setCapability] = useState<SyncCapability | null>(null)
  const [loadingSync, setLoadingSync] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [watching, setWatching] = useState(false)
  const [notification, setNotification] = useState<DeployNotification | null>(null)
  const watchRef = useRef<{
    timer: ReturnType<typeof setInterval> | null
    timeout: ReturnType<typeof setTimeout> | null
    baselineSha: string | null
    startedAt: number
  }>({ timer: null, timeout: null, baselineSha: null, startedAt: 0 })

  const [githubConnected, setGithubConnected] = useState<boolean>(() => {
    try { return !!sessionStorage.getItem('dz-agent-gh-token') } catch { return false }
  })

  useEffect(() => {
    let cancelled = false
    fetch('/api/dz-agent/github/status')
      .then(r => r.json())
      .then(d => { if (!cancelled && d?.connected) setGithubConnected(true) })
      .catch(() => {})

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dz-agent-gh-token') {
        setGithubConnected(!!e.newValue)
      }
    }
    const onTokenChange = () => {
      try { setGithubConnected(!!sessionStorage.getItem('dz-agent-gh-token')) } catch {}
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('dz-agent-gh-token-change', onTokenChange)
    return () => {
      cancelled = true
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('dz-agent-gh-token-change', onTokenChange)
    }
  }, [])

  const showFeedback = useCallback((kind: 'ok' | 'err' | 'info', text: string, duration = 6000) => {
    setFeedback({ kind, text })
    if (fbTimer.current) clearTimeout(fbTimer.current)
    fbTimer.current = setTimeout(() => setFeedback(null), duration)
  }, [])

  const fetchSync = useCallback(async (): Promise<SyncStatus | null> => {
    setLoadingSync(true)
    try {
      const [syncRes, capRes] = await Promise.all([
        fetch('/api/dz-agent/sync-status', { cache: 'no-store' }),
        fetch('/api/dz-agent/sync/status', { cache: 'no-store' }),
      ])
      let next: SyncStatus | null = null
      if (syncRes.ok) {
        next = (await syncRes.json()) as SyncStatus
        setSync(next)
      }
      if (capRes.ok) setCapability((await capRes.json()) as SyncCapability)
      return next
    } catch {
      return null
    } finally {
      setLoadingSync(false)
    }
  }, [])

  const stopWatch = useCallback(() => {
    if (watchRef.current.timer) clearInterval(watchRef.current.timer)
    if (watchRef.current.timeout) clearTimeout(watchRef.current.timeout)
    watchRef.current.timer = null
    watchRef.current.timeout = null
    setWatching(false)
  }, [])

  const startDeployWatch = useCallback(() => {
    stopWatch()
    const baseline = sync?.vercel?.commitSha || null
    watchRef.current.baselineSha = baseline
    watchRef.current.startedAt = Date.now()
    setWatching(true)
    setNotification({
      phase: 'building',
      text: t.notifBuilding,
      url: sync?.vercel?.deploymentUrl || null,
      startedAt: Date.now(),
    })

    const tick = async () => {
      const next = await fetchSync()
      if (!next) return
      const state = (next.vercel?.state || '').toUpperCase()
      const newSha = next.vercel?.commitSha || null
      const url = next.vercel?.deploymentUrl || null
      const shaChanged = newSha && newSha !== watchRef.current.baselineSha

      if (state === 'READY' && (shaChanged || next.status === 'synced')) {
        stopWatch()
        setNotification({ phase: 'ready', text: t.notifReady, url, startedAt: Date.now() })
      } else if (state === 'ERROR' || state === 'FAILED') {
        stopWatch()
        setNotification({ phase: 'failed', text: t.notifFailed, url, startedAt: Date.now() })
      } else if (state === 'CANCELED') {
        stopWatch()
        setNotification({ phase: 'canceled', text: t.notifCanceled, url, startedAt: Date.now() })
      } else {
        setNotification({
          phase: 'building',
          text: t.notifBuilding,
          url,
          startedAt: watchRef.current.startedAt,
        })
      }
    }

    watchRef.current.timer = setInterval(tick, WATCH_INTERVAL_MS)
    watchRef.current.timeout = setTimeout(() => {
      stopWatch()
      setNotification({ phase: 'timeout', text: t.notifTimeout, startedAt: Date.now() })
    }, WATCH_TIMEOUT_MS)
    setTimeout(tick, 1500)
  }, [fetchSync, stopWatch, sync, t])

  useEffect(() => {
    if (githubConnected) fetchSync()
    return () => {
      if (fbTimer.current) clearTimeout(fbTimer.current)
      if (watchRef.current.timer) clearInterval(watchRef.current.timer)
      if (watchRef.current.timeout) clearTimeout(watchRef.current.timeout)
    }
  }, [fetchSync, githubConnected])

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
        startDeployWatch()
      }
    } catch (err) {
      showFeedback('err', `${t.deployError}: ${(err as Error).message}`)
    } finally {
      setDeploying(false)
    }
  }, [ensureToken, showFeedback, startDeployWatch, t])

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
        startDeployWatch()
      }
    } catch (err) {
      showFeedback('err', `${t.syncError}: ${(err as Error).message}`)
    } finally {
      setPushing(false)
    }
  }, [ensureToken, showFeedback, startDeployWatch, t])

  const statusLabel =
    sync?.status === 'synced' ? t.statusSynced : sync?.status === 'out_of_sync' ? t.statusOut : t.statusUnknown
  const statusClass =
    sync?.status === 'synced' ? 'dz-deploy-status--ok' : sync?.status === 'out_of_sync' ? 'dz-deploy-status--warn' : 'dz-deploy-status--unknown'

  const syncAvailable = capability?.available && capability?.hasGithubToken
  const pendingChanges = capability?.pendingTotal ?? capability?.changedFiles ?? 0

  if (!githubConnected) return null

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

      {notification && (
        <div
          className={`dz-deploy-toast dz-deploy-toast--${notification.phase}`}
          dir={language === 'ar' ? 'rtl' : 'ltr'}
          role="status"
          aria-live="polite"
        >
          <div className="dz-deploy-toast-icon">
            {notification.phase === 'building' ? (
              <Loader2 size={16} className="dz-deploy-spin" />
            ) : notification.phase === 'ready' ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
          </div>
          <div className="dz-deploy-toast-body">
            <div className="dz-deploy-toast-title">{t.notifTitle}</div>
            <div className="dz-deploy-toast-text">{notification.text}</div>
            {watching && (
              <div className="dz-deploy-toast-elapsed">
                {Math.max(0, Math.round((Date.now() - notification.startedAt) / 1000))}s
              </div>
            )}
          </div>
          <div className="dz-deploy-toast-actions">
            {notification.url && (
              <a
                className="dz-deploy-toast-link"
                href={notification.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={12} />
                <span>{t.notifOpen}</span>
              </a>
            )}
            <button
              className="dz-deploy-toast-close"
              onClick={() => { stopWatch(); setNotification(null) }}
              aria-label={t.notifClose}
              title={t.notifClose}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function truncateBranch(branch: string): string {
  if (branch.length <= 22) return branch
  return branch.slice(0, 10) + '…' + branch.slice(-9)
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Globe, RefreshCw, CheckCircle2, AlertCircle, Loader2,
  ExternalLink, GitBranch, Github, Clock, Rocket,
} from 'lucide-react'

type Lang = 'ar' | 'en' | 'fr'

interface PagesStatus {
  url: string | null
  status: string | null
  branch: string | null
  buildType: string | null
  lastChecked: number
}

interface DeployState {
  deploying: boolean
  phase: 'idle' | 'checking' | 'uploading' | 'enabling' | 'done' | 'error'
  message: string | null
  liveUrl: string | null
}

interface Props {
  language: Lang
  owner: string
  repo: string
  token: string
}

const T: Record<Lang, Record<string, string>> = {
  ar: {
    title: 'نشر GitHub Pages',
    statusActive: 'الموقع نشط',
    statusBuilding: 'جاري البناء...',
    statusInactive: 'غير منشور',
    statusUnknown: 'غير معروف',
    branch: 'فرع النشر',
    lastDeployTime: 'آخر نشر',
    liveUrl: 'رابط الموقع',
    deployBtn: 'نشر عبر github.io',
    redeployBtn: 'إعادة النشر',
    openBtn: 'فتح الموقع',
    refreshBtn: 'تحديث الحالة',
    deploying: 'جاري النشر...',
    checkingFiles: 'التحقق من الملفات...',
    uploadingFiles: 'رفع الملفات...',
    enablingPages: 'تفعيل GitHub Pages...',
    deployDone: 'تم النشر بنجاح',
    deployError: 'فشل النشر',
    noToken: 'يجب ربط GitHub أولاً',
    noRepo: 'لا يوجد مستودع محدد',
    buildType: 'نوع البناء',
    notAvailable: 'غير متاح',
  },
  en: {
    title: 'GitHub Pages Deploy',
    statusActive: 'Site is live',
    statusBuilding: 'Building...',
    statusInactive: 'Not published',
    statusUnknown: 'Unknown',
    branch: 'Deploy branch',
    lastDeployTime: 'Last deploy',
    liveUrl: 'Live URL',
    deployBtn: 'Deploy to github.io',
    redeployBtn: 'Redeploy',
    openBtn: 'Open site',
    refreshBtn: 'Refresh status',
    deploying: 'Deploying...',
    checkingFiles: 'Checking files...',
    uploadingFiles: 'Uploading files...',
    enablingPages: 'Enabling GitHub Pages...',
    deployDone: 'Deployed successfully',
    deployError: 'Deploy failed',
    noToken: 'Connect GitHub first',
    noRepo: 'No repository selected',
    buildType: 'Build type',
    notAvailable: 'N/A',
  },
  fr: {
    title: 'Déploiement GitHub Pages',
    statusActive: 'Site en ligne',
    statusBuilding: 'En construction...',
    statusInactive: 'Non publié',
    statusUnknown: 'Inconnu',
    branch: 'Branche de déploiement',
    lastDeployTime: 'Dernier déploiement',
    liveUrl: 'URL du site',
    deployBtn: 'Déployer sur github.io',
    redeployBtn: 'Re-déployer',
    openBtn: 'Ouvrir le site',
    refreshBtn: 'Actualiser',
    deploying: 'Déploiement...',
    checkingFiles: 'Vérification des fichiers...',
    uploadingFiles: 'Envoi des fichiers...',
    enablingPages: 'Activation GitHub Pages...',
    deployDone: 'Déploiement réussi',
    deployError: 'Échec du déploiement',
    noToken: 'Connectez GitHub d\'abord',
    noRepo: 'Aucun dépôt sélectionné',
    buildType: 'Type de build',
    notAvailable: 'N/D',
  },
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function DZDeployPanel({ language, owner, repo, token }: Props) {
  const t = T[language]
  const isRtl = language === 'ar'

  const [pages, setPages] = useState<PagesStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [deploy, setDeploy] = useState<DeployState>({
    deploying: false,
    phase: 'idle',
    message: null,
    liveUrl: null,
  })

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPagesStatus = useCallback(async () => {
    if (!token || !owner || !repo) return
    setLoadingStatus(true)
    try {
      const r = await fetch(
        `/api/dz-agent/github/pages/status?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        { cache: 'no-store' }
      )
      if (r.ok) {
        const d = await r.json()
        setPages({
          url: d.url || null,
          status: d.status || null,
          branch: d.branch || d.source?.branch || 'main',
          buildType: d.buildType || null,
          lastChecked: Date.now(),
        })
      } else {
        setPages(prev => prev ? { ...prev, status: 'inactive', lastChecked: Date.now() } : {
          url: null, status: 'inactive', branch: 'main', buildType: null, lastChecked: Date.now(),
        })
      }
    } catch {
      /* silent */
    } finally {
      setLoadingStatus(false)
    }
  }, [token, owner, repo])

  useEffect(() => {
    if (token && owner && repo) fetchPagesStatus()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchPagesStatus, token, owner, repo])

  // Poll while building
  useEffect(() => {
    if (pages?.status === 'building' || pages?.status === null) {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchPagesStatus, 12000)
      }
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [pages?.status, fetchPagesStatus])

  const triggerDeploy = useCallback(async () => {
    if (!token) { setDeploy(s => ({ ...s, message: t.noToken, phase: 'error' })); return }
    if (!owner || !repo) { setDeploy(s => ({ ...s, message: t.noRepo, phase: 'error' })); return }

    setDeploy({ deploying: true, phase: 'checking', message: t.checkingFiles, liveUrl: null })

    try {
      setDeploy(s => ({ ...s, phase: 'uploading', message: t.uploadingFiles }))

      const r = await fetch('/api/dz-agent/github/pages/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, owner, repo }),
      })
      const data = await r.json()

      if (!r.ok) throw new Error(data.error || 'Deploy failed')

      setDeploy(s => ({ ...s, phase: 'enabling', message: t.enablingPages }))
      await new Promise(res => setTimeout(res, 2000))

      const liveUrl = data.siteUrl || `https://${owner}.github.io/${repo}`
      setDeploy({ deploying: false, phase: 'done', message: t.deployDone, liveUrl })
      setPages(prev => ({
        url: liveUrl,
        status: 'building',
        branch: prev?.branch || 'main',
        buildType: prev?.buildType || null,
        lastChecked: Date.now(),
      }))

      // Refresh status after 5s
      setTimeout(fetchPagesStatus, 5000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setDeploy({ deploying: false, phase: 'error', message: `${t.deployError}: ${msg}`, liveUrl: null })
    }
  }, [token, owner, repo, t, fetchPagesStatus])

  if (!token || !owner || !repo) return null

  const isLive = pages?.status === 'built' || pages?.status === 'active'
  const isBuilding = pages?.status === 'building' || pages?.status === null
  const liveUrl = pages?.url || deploy.liveUrl || `https://${owner}.github.io/${repo}`

  const statusLabel = isLive
    ? t.statusActive
    : isBuilding && pages !== null
      ? t.statusBuilding
      : pages?.status === 'inactive' || !pages
        ? t.statusInactive
        : t.statusUnknown

  const statusClass = isLive
    ? 'ghp-status--live'
    : isBuilding && pages !== null
      ? 'ghp-status--building'
      : 'ghp-status--inactive'

  return (
    <div className="ghp-panel" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="ghp-header">
        <div className="ghp-title">
          <Globe size={14} />
          <span>{t.title}</span>
        </div>
        <button
          className="ghp-icon-btn"
          onClick={fetchPagesStatus}
          disabled={loadingStatus}
          title={t.refreshBtn}
          aria-label={t.refreshBtn}
        >
          <RefreshCw size={12} className={loadingStatus ? 'ghp-spin' : ''} />
        </button>
      </div>

      {/* Status badge */}
      <div className={`ghp-status ${statusClass}`}>
        {isLive ? (
          <CheckCircle2 size={12} />
        ) : isBuilding && pages !== null ? (
          <Loader2 size={12} className="ghp-spin" />
        ) : (
          <AlertCircle size={12} />
        )}
        <span>{statusLabel}</span>
      </div>

      {/* Info rows */}
      <div className="ghp-info">
        <div className="ghp-info-row">
          <GitBranch size={11} />
          <span className="ghp-info-label">{t.branch}</span>
          <code className="ghp-info-value">{pages?.branch || 'main'}</code>
        </div>
        {pages?.buildType && (
          <div className="ghp-info-row">
            <Github size={11} />
            <span className="ghp-info-label">{t.buildType}</span>
            <code className="ghp-info-value">{pages.buildType}</code>
          </div>
        )}
        {pages?.lastChecked && (
          <div className="ghp-info-row">
            <Clock size={11} />
            <span className="ghp-info-label">{t.lastDeployTime}</span>
            <span className="ghp-info-value">{formatTime(pages.lastChecked)}</span>
          </div>
        )}
        {liveUrl && (
          <div className="ghp-info-row ghp-info-row--url">
            <Globe size={11} />
            <span className="ghp-info-label">{t.liveUrl}</span>
            <a
              className="ghp-url-link"
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={liveUrl}
            >
              {liveUrl.replace('https://', '')}
              <ExternalLink size={9} />
            </a>
          </div>
        )}
      </div>

      {/* Deploy message / progress */}
      {deploy.message && (
        <div className={`ghp-msg ghp-msg--${deploy.phase === 'error' ? 'error' : deploy.phase === 'done' ? 'ok' : 'info'}`}>
          {deploy.deploying && <Loader2 size={11} className="ghp-spin" />}
          <span>{deploy.message}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="ghp-actions">
        <button
          className="ghp-btn ghp-btn--deploy"
          onClick={triggerDeploy}
          disabled={deploy.deploying}
        >
          {deploy.deploying ? (
            <>
              <Loader2 size={13} className="ghp-spin" />
              <span>{t.deploying}</span>
            </>
          ) : isLive ? (
            <>
              <Rocket size={13} />
              <span>{t.redeployBtn}</span>
            </>
          ) : (
            <>
              <Rocket size={13} />
              <span>{t.deployBtn}</span>
            </>
          )}
        </button>

        {(isLive || deploy.liveUrl) && (
          <a
            className="ghp-btn ghp-btn--open"
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={13} />
            <span>{t.openBtn}</span>
          </a>
        )}
      </div>
    </div>
  )
}

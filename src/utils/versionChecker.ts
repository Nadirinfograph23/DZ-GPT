import buildInfo from '../../data/build-info.json'
import { createServerVersionKey, hasClientCommitMismatch, normalizeCommitSha, shouldShowUpdate } from '../lib/version-check-state.js'

/**
 * versionChecker.ts — نظام الكشف عن الإصدار الجديد وإخطار المستخدم
 *
 * المعيار: deployedAt timestamp (ليس commit) — يتغيّر في كل deploy حتماً.
 * المصدر: /version.json?_=<timestamp> (cache-bust) + /api/version كـ fallback
 * الـ SW يرسل NEW_VERSION / SW_UPDATED → يُطلق البانر فوراً
 */

const POLL_INTERVAL_MS = 20 * 1000          // كل 20 ثانية
const BANNER_ID        = 'dz-update-banner'
const LAST_DEPLOY_KEY  = 'dz-last-deploy-ts' // timestamp آخر deploy شاهده المستخدم
const DISMISSED_VERSION_KEY = 'dz-dismissed-server-version'
const CLIENT_BUILD_COMMIT = normalizeCommitSha(buildInfo.commit)
const JUST_UPDATED_KEY = 'dz-just-updated'
const SUPPRESS_MS      = 30_000             // 30 ثانية بعد "تحديث الآن"

let _currentDeployTs: string | null = null
let _currentVersionKey: string | null = null
let _pollTimer: ReturnType<typeof setInterval> | null = null
let _bannerShown = false
let _initialCheckComplete = false
let _checkInFlight = false

// ── جلب معلومات الإصدار — يتجاوز كل الكاش بـ query param ──────────────────
async function fetchVersion(): Promise<{ deployTs: string; label: string; commit: string } | null> {
  const bust = Date.now()
  const endpoints = ['/api/version', '/version.json']

  // Read both endpoints. During a Cloudflare rollout the Worker API and the
  // static asset can briefly be on different versions; choosing the newest
  // deployedAt prevents a stale API response from hiding the update banner.
  const candidates = await Promise.all(endpoints.map(async (endpoint) => {
    try {
      const res = await fetch(`${endpoint}?_=${bust}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' },
      })
      if (!res.ok) return null
      const d = await res.json()
      const deployTs = d.deployedAt || d.buildAt || null
      if (!deployTs) return null
      return {
        endpoint,
        deployTs: String(deployTs),
        label: String(d.commitShort || d.commit || d.version || 'new'),
        commit: String(d.commit || ''),
      }
    } catch {
      return null
    }
  }))

  const valid = candidates.filter((item): item is { endpoint: string; deployTs: string; label: string; commit: string } => Boolean(item))
  if (!valid.length) return null

  valid.sort((a, b) => {
    const aTime = Date.parse(a.deployTs)
    const bTime = Date.parse(b.deployTs)
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime
    // If timestamps are not parseable or equal, prefer the canonical API.
    return a.endpoint === '/api/version' ? -1 : 1
  })
  return { deployTs: valid[0].deployTs, label: valid[0].label, commit: valid[0].commit }
}

// ── عرض البانر ────────────────────────────────────────────────────────────
export function triggerUpdateBanner() { showUpdateBanner() }

function showUpdateBanner() {
  // لا تُعد الإظهار خلال 30 ثانية من آخر تحديث
  const ts = sessionStorage.getItem(JUST_UPDATED_KEY)
  if (ts && Date.now() - Number(ts) < SUPPRESS_MS) return
  if (_bannerShown || document.getElementById(BANNER_ID)) return
  _bannerShown = true

  const banner = document.createElement('div')
  banner.id = BANNER_ID
  banner.setAttribute('dir', 'rtl')
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
    'background:linear-gradient(90deg,#00d2ff,#7b2ff7)',
    'color:#fff', 'text-align:center', 'padding:12px 16px',
    'font-family:sans-serif', 'font-size:14px',
    'display:flex', 'align-items:center', 'justify-content:center', 'gap:12px',
    'box-shadow:0 2px 16px rgba(0,0,0,.5)',
    'animation:dzSlideDown .35s ease',
  ].join(';')

  const style = document.createElement('style')
  style.textContent = `@keyframes dzSlideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}`
  document.head.appendChild(style)

  banner.innerHTML = `
    <span>🆕 <strong>نسخة جديدة من DZ Agent جاهزة</strong> — يمكنك التحديث الآن</span>
    <button id="dz-update-btn" style="
      background:#fff;color:#7b2ff7;border:none;
      padding:6px 18px;border-radius:20px;cursor:pointer;
      font-weight:bold;font-size:13px;white-space:nowrap;
    ">🚀 تحديث الآن</button>
    <button id="dz-update-later" style="
      background:transparent;color:#fff;
      border:1px solid rgba(255,255,255,.5);
      padding:4px 12px;border-radius:20px;cursor:pointer;font-size:12px;
    ">✕</button>
  `
  document.body.prepend(banner)


  document.getElementById('dz-update-btn')?.addEventListener('click', () => { void forceUpdate() })
  document.getElementById('dz-update-later')?.addEventListener('click', () => {
    document.getElementById(BANNER_ID)?.remove()
    _bannerShown = false
    // حفظ deploy الحالي حتى لا يظهر البانر مجدداً عن نفس الـ deploy
    if (_currentDeployTs) localStorage.setItem(LAST_DEPLOY_KEY, _currentDeployTs)
    if (_currentVersionKey) localStorage.setItem(DISMISSED_VERSION_KEY, _currentVersionKey)
  })
}

// ── تحديث إجباري مع مسح الكاش ────────────────────────────────────────────
async function forceUpdate() {
  const btn = document.getElementById('dz-update-btn') as HTMLButtonElement | null
  if (btn) { btn.textContent = '⏳ جارٍ التحديث...'; btn.disabled = true }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg?.waiting)    reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      if (reg?.installing) reg.installing.postMessage({ type: 'SKIP_WAITING' })
      if (navigator.serviceWorker.controller)
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister()))
    }
  } catch (e) { console.warn('[VersionChecker] cleanup error:', e) }

  sessionStorage.setItem(JUST_UPDATED_KEY, String(Date.now()))
  if (_currentDeployTs) localStorage.setItem(LAST_DEPLOY_KEY, _currentDeployTs)

  const base = window.location.href.split('?')[0].split('#')[0]
  window.location.replace(base + '?v=' + Date.now())
}

// ── منطق المقارنة الرئيسي ─────────────────────────────────────────────────
async function checkForUpdate() {
  if (_checkInFlight) return
  _checkInFlight = true
  try {
    const info = await fetchVersion()
    if (!info) return

    const { deployTs, label, commit } = info
    _currentDeployTs = deployTs
    _currentVersionKey = createServerVersionKey(deployTs, commit)

    const firstSuccessfulCheck = !_initialCheckComplete
    const stored = localStorage.getItem(LAST_DEPLOY_KEY)
    const dismissedVersionKey = localStorage.getItem(DISMISSED_VERSION_KEY)
    _initialCheckComplete = true

    const clientIsStale = hasClientCommitMismatch(CLIENT_BUILD_COMMIT, commit)
    const shouldNotify = shouldShowUpdate({
      storedDeployTs: stored,
      deployTs,
      clientCommit: CLIENT_BUILD_COMMIT,
      serverCommit: commit,
      dismissedVersionKey,
    })

    if (shouldNotify) {
      const reason = clientIsStale ? 'client bundle SHA differs from server' : 'server deployment changed'
      console.log('[VersionChecker] 🆕 Update available (' + reason + '): ' + deployTs + ' (' + label + ')')
      showUpdateBanner()
      return
    }

    if (!stored) {
      // First visit (or cleared storage) with a matching client: remember this deploy quietly.
      localStorage.setItem(LAST_DEPLOY_KEY, deployTs)
      console.log('[VersionChecker] 🔖 First visit — stored deploy: ' + deployTs + ' (' + label + ')')
    } else if (firstSuccessfulCheck) {
      console.log('[VersionChecker] ✓ Up-to-date: ' + deployTs + ' (' + label + ')')
    }
  } catch (error) {
    console.warn('[VersionChecker] Version check failed:', error)
  } finally {
    _checkInFlight = false
  }
}

// ── بدء المراقبة ──────────────────────────────────────────────────────────
export function startVersionChecker() {
  if (typeof window === 'undefined') return

  // The first successful network response, not the timer handle, initializes version state.
  void checkForUpdate()

  // polling دوري
  _pollTimer = setInterval(() => { void checkForUpdate() }, POLL_INTERVAL_MS)

  // رسائل Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NEW_VERSION' || event.data?.type === 'SW_UPDATED') {
        // Do not show a banner merely because the SW activated: that also happens
        // on a first install. Confirm that the deployed version actually changed.
        console.log('[VersionChecker] SW message:', event.data.type)
        void checkForUpdate()
      }
    })

    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return
      if (reg.waiting) {
        console.log('[VersionChecker] SW waiting on load → verify server SHA')
        void checkForUpdate()
      }
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[VersionChecker] new SW installed → verify server SHA')
            void checkForUpdate()
          }
        })
      })
    }).catch(() => {})
  }

  // فحص عند عودة التبويب للواجهة
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  })
}

export function stopVersionChecker() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
}

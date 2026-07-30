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
const JUST_UPDATED_KEY = 'dz-just-updated'
const SUPPRESS_MS      = 30_000             // 30 ثانية بعد "تحديث الآن"

let _currentDeployTs: string | null = null
let _pollTimer: ReturnType<typeof setInterval> | null = null
let _bannerShown = false

// ── جلب معلومات الإصدار — يتجاوز كل الكاش بـ query param ──────────────────
async function fetchVersion(): Promise<{ deployTs: string; label: string } | null> {
  const bust = Date.now()

  // 1) version.json — ملف ثابت، أسرع
  try {
    const res = await fetch(`/version.json?_=${bust}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' },
    })
    if (res.ok) {
      const d = await res.json()
      // deployedAt هو المعيار الأساسي — يتغيّر في كل deploy
      const deployTs = d.deployedAt || d.buildAt || null
      const label    = d.commitShort || d.commit || 'new'
      if (deployTs) return { deployTs, label }
    }
  } catch { /* تجاهل */ }

  // 2) /api/version — fallback
  try {
    const res = await fetch(`/api/version?_=${bust}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    })
    if (!res.ok) return null
    const d = await res.json()
    const deployTs = d.deployedAt || d.serverTime || null
    const label    = d.commit || d.version || 'new'
    if (deployTs) return { deployTs, label }
  } catch {}

  return null
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

  let countdown = 15
  banner.innerHTML = `
    <span>🆕 <strong>نسخة جديدة من DZ Agent جاهزة</strong> — يتحدث تلقائياً خلال <b id="dz-cdwn">${countdown}</b>ث</span>
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

  const cdEl = () => document.getElementById('dz-cdwn')
  const timer = setInterval(() => {
    countdown--
    const el = cdEl(); if (el) el.textContent = String(countdown)
    if (countdown <= 0) { clearInterval(timer); forceUpdate() }
  }, 1000)

  document.getElementById('dz-update-btn')?.addEventListener('click', () => { clearInterval(timer); forceUpdate() })
  document.getElementById('dz-update-later')?.addEventListener('click', () => {
    clearInterval(timer)
    document.getElementById(BANNER_ID)?.remove()
    _bannerShown = false
    // حفظ deploy الحالي حتى لا يظهر البانر مجدداً عن نفس الـ deploy
    if (_currentDeployTs) localStorage.setItem(LAST_DEPLOY_KEY, _currentDeployTs)
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
  const info = await fetchVersion()
  if (!info) return

  const { deployTs, label } = info
  _currentDeployTs = deployTs

  // أول استدعاء في هذه الجلسة
  if (_pollTimer === null) {
    const stored = localStorage.getItem(LAST_DEPLOY_KEY)

    if (!stored) {
      // أول زيارة على الإطلاق — احفظ ولا تُزعج
      localStorage.setItem(LAST_DEPLOY_KEY, deployTs)
      console.log(`[VersionChecker] 🔖 First visit — stored deploy: ${deployTs} (${label})`)
    } else if (stored !== deployTs) {
      // زيارة بعد نشر جديد → بانر فوري
      console.log(`[VersionChecker] 🆕 New deploy since last visit: ${stored} → ${deployTs} (${label})`)
      showUpdateBanner()
    } else {
      console.log(`[VersionChecker] ✓ Up-to-date: ${deployTs}`)
    }
    return
  }

  // استدعاءات لاحقة (polling أثناء الجلسة)
  const prev = localStorage.getItem(LAST_DEPLOY_KEY)
  if (prev && prev !== deployTs) {
    console.log(`[VersionChecker] 🆕 Hot deploy detected: ${prev} → ${deployTs} (${label})`)
    _currentDeployTs = deployTs
    showUpdateBanner()
  }
}

// ── بدء المراقبة ──────────────────────────────────────────────────────────
export function startVersionChecker() {
  if (typeof window === 'undefined') return

  // فحص فوري عند التحميل
  checkForUpdate()

  // polling دوري
  _pollTimer = setInterval(checkForUpdate, POLL_INTERVAL_MS)

  // رسائل Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NEW_VERSION' || event.data?.type === 'SW_UPDATED') {
        console.log('[VersionChecker] SW message:', event.data.type)
        showUpdateBanner()
      }
    })

    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return
      if (reg.waiting) {
        console.log('[VersionChecker] SW waiting on load → show banner')
        showUpdateBanner()
      }
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[VersionChecker] new SW installed → show banner')
            showUpdateBanner()
          }
        })
      })
    }).catch(() => {})
  }

  // فحص عند عودة التبويب للواجهة
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  })
}

export function stopVersionChecker() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
}

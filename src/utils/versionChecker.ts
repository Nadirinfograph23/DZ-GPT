/**
 * versionChecker.ts — نظام الكشف عن الإصدار الجديد وإخطار المستخدم
 * يعمل بثلاث طرق:
 *  1. polling /api/version كل 45 ثانية
 *  2. استقبال رسائل Service Worker (NEW_VERSION / SW_UPDATED)
 *  3. registration.updatefound — يكشف SW جديد فور بدء تحميله
 *
 * البانر يظهر فقط عند وجود نشر جديد من Replit — ليس في كل جلسة
 */

const POLL_INTERVAL_MS  = 45 * 1000
const BANNER_ID         = 'dz-update-banner'
const LAST_COMMIT_KEY   = 'dz-last-known-commit'

let _lastCommit: string | null = null
let _pollTimer: ReturnType<typeof setInterval> | null = null
let _bannerShown = false

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch('/api/version', {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.commit || data.version || null
  } catch {
    return null
  }
}

export function triggerUpdateBanner() { showUpdateBanner() }

// مفتاح sessionStorage — يمنع إعادة ظهور البانر بعد التحديث مباشرة
const JUST_UPDATED_KEY = 'dz-just-updated'
const SUPPRESS_MS      = 90_000  // 90 ثانية كافية لاكتمال دورة الـ SW

function showUpdateBanner() {
  // لا تُظهر البانر إذا كان المستخدم قد حدّث للتو (خلال 90 ثانية)
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
    'animation:slideDown .35s ease',
  ].join(';')

  const style = document.createElement('style')
  style.textContent = `@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}`
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

  // عداد تنازلي — يُطلق التحديث تلقائياً بعد 15 ثانية
  const cdEl = () => document.getElementById('dz-cdwn')
  const timer = setInterval(() => {
    countdown--
    const el = cdEl()
    if (el) el.textContent = String(countdown)
    if (countdown <= 0) { clearInterval(timer); forceUpdate() }
  }, 1000)

  document.getElementById('dz-update-btn')?.addEventListener('click', () => { clearInterval(timer); forceUpdate() })
  document.getElementById('dz-update-later')?.addEventListener('click', () => {
    clearInterval(timer)
    document.getElementById(BANNER_ID)?.remove()
    _bannerShown = false
  })
}

/**
 * forceUpdate — ترغم التحديث الكامل:
 *  1. إرسال SKIP_WAITING للـ SW الجديد
 *  2. مسح جميع الكاش
 *  3. إلغاء تسجيل الـ SW القديم
 *  4. التنقل بـ cache-bust query لتجاوز CDN
 */
async function forceUpdate() {
  const btn = document.getElementById('dz-update-btn') as HTMLButtonElement | null
  if (btn) { btn.textContent = '⏳ جارٍ التحديث...'; btn.disabled = true }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg?.waiting)    reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      if (reg?.installing) reg.installing.postMessage({ type: 'SKIP_WAITING' })
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
      }
    }

    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister()))
    }
  } catch (e) {
    console.warn('[VersionChecker] cleanup error:', e)
  }

  // سجّل وقت التحديث لمنع ظهور البانر مجدداً فوراً بعد الـ reload
  sessionStorage.setItem(JUST_UPDATED_KEY, String(Date.now()))

  // حدّث آخر commit معروف في localStorage حتى لا يظهر البانر مجدداً بعد الـ reload
  if (_lastCommit) localStorage.setItem(LAST_COMMIT_KEY, _lastCommit)

  const base = window.location.href.split('?')[0].split('#')[0]
  window.location.replace(base + '?v=' + Date.now())
}

async function checkForUpdate() {
  const commit = await fetchVersion()
  if (!commit) return

  if (_lastCommit === null) {
    // أول استدعاء في هذه الجلسة — قارن مع آخر commit محفوظ بين الجلسات
    _lastCommit = commit
    const stored = localStorage.getItem(LAST_COMMIT_KEY)
    if (stored && stored !== commit) {
      // فتح الصفحة بعد نشر جديد → أظهر البانر فوراً
      console.log(`[VersionChecker] 🆕 New version since last session: ${stored} → ${commit}`)
      showUpdateBanner()
    } else if (!stored) {
      // أول زيارة على الإطلاق — احفظ فقط
      localStorage.setItem(LAST_COMMIT_KEY, commit)
    }
    return
  }

  if (commit !== _lastCommit) {
    console.log(`[VersionChecker] 🆕 New version: ${_lastCommit} → ${commit}`)
    _lastCommit = commit
    showUpdateBanner()
  }
}

export function startVersionChecker() {
  if (typeof window === 'undefined') return

  checkForUpdate()
  _pollTimer = setInterval(checkForUpdate, POLL_INTERVAL_MS)

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
        console.log('[VersionChecker] updatefound — new SW installing')
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[VersionChecker] new SW installed → show banner')
            showUpdateBanner()
          }
        })
      })
    }).catch(() => {})
  }
}

export function stopVersionChecker() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
}

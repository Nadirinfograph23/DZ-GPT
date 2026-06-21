/**
 * versionChecker.ts — نظام الكشف عن الإصدار الجديد وإخطار المستخدم
 * يعمل بطريقتين: polling مباشر من الصفحة + استقبال رسائل Service Worker
 */

const POLL_INTERVAL_MS  = 45 * 1000  // كل 45 ثانية — أسرع للكشف عن تحديثات
const BANNER_ID         = 'dz-update-banner'

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

function showUpdateBanner() {
  if (_bannerShown || document.getElementById(BANNER_ID)) return
  _bannerShown = true

  const banner = document.createElement('div')
  banner.id = BANNER_ID
  banner.setAttribute('dir', 'rtl')
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
    'background:linear-gradient(90deg,#00d2ff,#7b2ff7)',
    'color:#fff', 'text-align:center', 'padding:10px 16px',
    'font-family:sans-serif', 'font-size:14px',
    'display:flex', 'align-items:center', 'justify-content:center', 'gap:12px',
    'box-shadow:0 2px 16px rgba(0,0,0,.4)',
    'animation:slideDown .3s ease',
  ].join(';')

  const style = document.createElement('style')
  style.textContent = `@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}`
  document.head.appendChild(style)

  banner.innerHTML = `
    <span>✨ <strong>إصدار جديد</strong> من DZ GPT متاح!</span>
    <button onclick="window.location.reload(true)" style="
      background:#fff;color:#7b2ff7;border:none;
      padding:5px 16px;border-radius:20px;cursor:pointer;
      font-weight:bold;font-size:13px;white-space:nowrap;
    ">تحديث الآن 🚀</button>
    <button onclick="document.getElementById('${BANNER_ID}')?.remove()" style="
      background:transparent;color:#fff;
      border:1px solid rgba(255,255,255,.5);
      padding:4px 12px;border-radius:20px;cursor:pointer;font-size:12px;
    ">لاحقاً</button>
  `
  document.body.prepend(banner)
}

async function checkForUpdate() {
  const commit = await fetchVersion()
  if (!commit) return

  if (_lastCommit === null) {
    _lastCommit = commit
    return
  }

  if (commit !== _lastCommit) {
    console.log(`[VersionChecker] 🆕 New version: ${_lastCommit} → ${commit}`)
    showUpdateBanner()
  }
}

export function startVersionChecker() {
  if (typeof window === 'undefined') return

  // جلب الإصدار الأولي
  checkForUpdate()

  // polling دوري
  _pollTimer = setInterval(checkForUpdate, POLL_INTERVAL_MS)

  // استقبال رسائل Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NEW_VERSION') {
        console.log('[VersionChecker] SW → new version detected:', event.data.version)
        showUpdateBanner()
      }
      if (event.data?.type === 'SW_UPDATED') {
        showUpdateBanner()
      }
    })
  }
}

export function stopVersionChecker() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
}

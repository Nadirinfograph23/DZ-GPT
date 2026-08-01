/**
 * broadcastBanner.ts — بانر إذاعة المشرف العالمي
 *
 * نفس آلية versionChecker.ts — vanilla JS مباشر على DOM، بدون React.
 * يضمن الظهور الفوري لجميع المستخدمين بما فيهم المشرف نفسه.
 */

const BANNER_ID   = 'dz-broadcast-banner'
const STYLE_ID    = 'dz-broadcast-style'
const SEEN_KEY    = 'dz_bcast_seen_v2'        // sessionStorage — لا تكرار في نفس الجلسة
const PENDING_TS  = 'dz_pending_notif_ts'     // localStorage  — للمستخدمين الغائبين

interface BroadcastPayload {
  id:        string
  text:      string
  from:      string
  timestamp: number
  link?:     string | null
  linkText?: string | null
}

// ── حالة داخلية ────────────────────────────────────────────────────────────
let _es:         EventSource | null = null
let _retryTimer: ReturnType<typeof setTimeout> | null = null

// ── الرسائل المشاهدة في هذه الجلسة ─────────────────────────────────────────
function getSeenSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}
function markSeen(id: string) {
  try {
    const s = getSeenSet(); s.add(id)
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-100)))
  } catch {}
}

// ── حقن CSS مرة واحدة ───────────────────────────────────────────────────────
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    @keyframes dzBcastDown {
      from { transform: translateY(-110%); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
    @keyframes dzBcastUp {
      from { transform: translateY(0);     opacity: 1; }
      to   { transform: translateY(-110%); opacity: 0; }
    }
    #${BANNER_ID} {
      position:    fixed;
      top:         0; left: 0; right: 0;
      z-index:     1000001;
      background:  linear-gradient(90deg, #090e1a 0%, #0f172a 55%, #111827 100%);
      border-bottom: 1.5px solid rgba(52,211,153,.38);
      color:       #f1f5f9;
      font-family: 'Cairo','Segoe UI',sans-serif;
      font-size:   13.5px;
      padding:     10px 14px;
      display:     flex;
      align-items: center;
      gap:         10px;
      direction:   rtl;
      box-shadow:  0 4px 28px rgba(0,0,0,.65), 0 0 0 1px rgba(52,211,153,.07) inset;
      animation:   dzBcastDown .38s cubic-bezier(.4,0,.2,1) forwards;
      min-height:  44px;
    }
    #${BANNER_ID}.dz-bcast-out {
      animation: dzBcastUp .32s cubic-bezier(.4,0,.2,1) forwards;
    }
    #dz-bcast-badge {
      background:    rgba(52,211,153,.14);
      border:        1px solid rgba(52,211,153,.32);
      color:         #34d399;
      font-size:     10px;
      font-weight:   800;
      padding:       2px 9px;
      border-radius: 20px;
      flex-shrink:   0;
      white-space:   nowrap;
      letter-spacing:.02em;
    }
    #dz-bcast-divider {
      width: 1px; height: 18px;
      background: rgba(255,255,255,.12);
      flex-shrink: 0;
    }
    #dz-bcast-text {
      flex:         1;
      font-weight:  500;
      color:        #f1f5f9;
      line-height:  1.45;
      overflow:     hidden;
      text-overflow:ellipsis;
      white-space:  nowrap;
      min-width:    0;
    }
    #dz-bcast-link {
      background:    rgba(52,211,153,.12);
      border:        1px solid rgba(52,211,153,.38);
      color:         #6ee7b7;
      padding:       4px 14px;
      border-radius: 20px;
      cursor:        pointer;
      font-size:     12px;
      font-weight:   700;
      font-family:   inherit;
      display:       flex;
      align-items:   center;
      gap:           5px;
      flex-shrink:   0;
      white-space:   nowrap;
      border-style:  solid;
      transition:    background .15s;
    }
    #dz-bcast-link:hover { background: rgba(52,211,153,.22); }
    #dz-bcast-from {
      font-size:   11px;
      color:       #64748b;
      flex-shrink: 0;
      white-space: nowrap;
    }
    #dz-bcast-close {
      background:    transparent;
      border:        none;
      color:         #475569;
      cursor:        pointer;
      padding:       5px 7px;
      border-radius: 8px;
      font-size:     16px;
      line-height:   1;
      flex-shrink:   0;
      transition:    color .15s, background .15s;
      font-family:   inherit;
    }
    #dz-bcast-close:hover {
      color:       #94a3b8;
      background:  rgba(255,255,255,.07);
    }
    @media (max-width:600px) {
      #${BANNER_ID} { font-size:12px; padding:8px 10px; gap:7px; }
      #dz-bcast-from { display:none; }
    }
  `
  document.head.appendChild(s)
}

// ── عرض البانر ──────────────────────────────────────────────────────────────
export function showBroadcastBanner(payload: BroadcastPayload) {
  if (getSeenSet().has(payload.id)) return
  markSeen(payload.id)

  injectStyle()

  // أزل أي بانر قديم بدون انتظار
  const old = document.getElementById(BANNER_ID)
  if (old) old.remove()

  const banner = document.createElement('div')
  banner.id = BANNER_ID
  banner.setAttribute('dir', 'rtl')

  const linkHtml = payload.link ? `
    <button id="dz-bcast-link">
      ${payload.linkText || 'انتقل'}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    </button>` : ''

  banner.innerHTML = `
    <span style="color:#34d399;flex-shrink:0;display:flex;align-items:center;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 11l19-9-9 19-2-8-8-2z"/>
      </svg>
    </span>
    <span id="dz-bcast-badge">📢 إذاعة</span>
    <span id="dz-bcast-divider"></span>
    <span id="dz-bcast-text">${escHtml(payload.text)}</span>
    ${linkHtml}
    <span id="dz-bcast-from">من: <strong style="color:#94a3b8;">${escHtml(payload.from)}</strong></span>
    <button id="dz-bcast-close" title="إغلاق">✕</button>
  `

  document.body.prepend(banner)

  // ── رابط ─────────────────────────────────────────────────────────────────
  if (payload.link) {
    document.getElementById('dz-bcast-link')?.addEventListener('click', () => {
      try {
        const url = new URL(payload.link!)
        if (url.origin === location.origin) {
          window.history.pushState({}, '', url.pathname + url.search)
          window.dispatchEvent(new PopStateEvent('popstate'))
        } else {
          window.open(payload.link!, '_blank', 'noopener,noreferrer')
        }
      } catch {
        window.open(payload.link!, '_blank', 'noopener,noreferrer')
      }
      dismissBanner()
    })
  }

  // ── إغلاق ────────────────────────────────────────────────────────────────
  document.getElementById('dz-bcast-close')?.addEventListener('click', dismissBanner)
}

function dismissBanner() {
  const banner = document.getElementById(BANNER_ID)
  if (!banner) return
  banner.classList.add('dz-bcast-out')
  setTimeout(() => banner.remove(), 340)
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── فحص الرسائل المعلّقة (للمستخدمين الغائبين) ─────────────────────────────
async function checkPending() {
  try {
    const res = await fetch('/api/pending-notifications', { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    const list: BroadcastPayload[] = data.notifications || []
    if (!list.length) return
    const lastTs = parseInt(localStorage.getItem(PENDING_TS) || '0', 10)
    const fresh  = list.filter(n => n.timestamp > lastTs && !getSeenSet().has(n.id))
    if (fresh.length) showBroadcastBanner(fresh[fresh.length - 1])
    const newest = list.reduce((m, n) => Math.max(m, n.timestamp), 0)
    if (newest > lastTs) localStorage.setItem(PENDING_TS, String(newest))
  } catch {}
}

// ── اتصال SSE ───────────────────────────────────────────────────────────────
function connectSSE() {
  if (_es) { try { _es.close() } catch {} }

  _es = new EventSource('/api/notifications/stream')

  _es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as BroadcastPayload & { type: string }
      if (data.type === 'admin_broadcast' && data.id && data.text) {
        // تحديث timestamp المرجعي حتى لا يُعاد عرضه من الطابور
        try {
          const cur = parseInt(localStorage.getItem(PENDING_TS) || '0', 10)
          if (data.timestamp > cur) localStorage.setItem(PENDING_TS, String(data.timestamp))
        } catch {}
        // تأخير 8 ثوانٍ قبل العرض (كرسالة التحديث التلقائي)
        setTimeout(() => showBroadcastBanner(data), 8_000)
      }
    } catch {}
  }

  _es.onerror = () => {
    _es?.close()
    _es = null
    if (_retryTimer) clearTimeout(_retryTimer)
    _retryTimer = setTimeout(connectSSE, 15_000)
  }
}

// ── نقطة الدخول الرئيسية ────────────────────────────────────────────────────
export function startBroadcastListener() {
  if (typeof window === 'undefined') return
  checkPending()
  connectSSE()

  // استئناف الاتصال عند عودة التبويب للواجهة
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!_es || _es.readyState === EventSource.CLOSED)) {
      connectSSE()
    }
  })
}

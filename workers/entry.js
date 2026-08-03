/**
 * Cloudflare Workers entry point — DZ-GPT
 * =========================================
 * • /api/* and /ws/*  →  Express app (server.js)
 * • everything else   →  static assets (ASSETS binding)
 *
 * Requires wrangler.toml:
 *   main = "workers/entry.js"
 *   compatibility_flags = ["nodejs_compat_v2"]
 *   [assets]  directory = "./dist"  binding = "ASSETS"
 */
import { createServerAdapter } from '@whatwg-node/server'

let adapter = null

/**
 * Inject Cloudflare secrets/vars into process.env so that
 * server.js (which reads process.env.XYZ) finds its keys.
 * Skips bindings that are objects (KV/R2/Durable Objects).
 */
function injectEnv(env) {
  for (const [key, val] of Object.entries(env)) {
    if (typeof val === 'string' && !process.env[key]) {
      process.env[key] = val
    }
  }
  process.env.CF_PAGES  = '1'   // disables Replit-only intervals in server.js
  process.env.NODE_ENV  = 'production'
}

/**
 * CF Workers / unenv يُعيد {} بدلاً من دالة لـ iconv-lite/lib/streams.js
 * السبب: iconv-lite يستدعي require("./streams")(iconv) فقط إذا كانت
 *   process.versions.node تُحقّق: major > 0 || minor >= 10
 * الحل: نضبط node = "0.9.0" ← major=0, minor=9 ← كلا الشرطين يفشلان
 *   → streams لا تُحمَّل أبداً → لا crash
 */
function patchIconvLiteForCF() {
  try {
    if (process.versions && typeof process.versions === 'object') {
      Object.defineProperty(process.versions, 'node', {
        value: '0.9.0',
        writable: true,
        configurable: true,
      })
    }
  } catch (_) {
    // إذا فشل defineProperty نحاول الكتابة المباشرة
    try { process.versions.node = '0.9.0' } catch (_2) { /* ignore */ }
  }
}

async function getAdapter(env) {
  if (adapter) return adapter
  injectEnv(env)
  patchIconvLiteForCF()
  const { app } = await import('../server.js')
  adapter = createServerAdapter(app)
  return adapter
}

export default {
  /**
   * Main fetch handler — called for every incoming request.
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // ── API + WebSocket routes → Express ─────────────────────────────────────
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) {
      try {
        const a = await getAdapter(env)
        return a.fetch(request, env, ctx)
      } catch (err) {
        console.error('[Worker] API error:', err?.message)
        return new Response(
          JSON.stringify({ error: 'Server error', message: err?.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // ── Static assets → ASSETS binding (served from dist/) ───────────────────
    if (env.ASSETS) {
      return env.ASSETS.fetch(request)
    }

    return new Response('Not Found', { status: 404 })
  },
}

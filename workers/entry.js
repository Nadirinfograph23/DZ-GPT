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

async function getAdapter(env) {
  if (adapter) return adapter
  injectEnv(env)
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

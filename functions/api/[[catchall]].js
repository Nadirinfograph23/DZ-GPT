/**
 * Cloudflare Pages Function — catch-all API handler
 * Routes every /api/* request to the Express app in server.js
 *
 * Requires wrangler.toml: compatibility_flags = ["nodejs_compat_v2"]
 */
import { createServerAdapter } from '@whatwg-node/server'

let adapter = null

/**
 * Inject Cloudflare env bindings into process.env so that
 * server.js (which reads process.env.XYZ) finds its secrets.
 */
function injectEnv(env) {
  for (const [key, val] of Object.entries(env)) {
    if (val !== undefined && val !== null && !process.env[key]) {
      process.env[key] = String(val)
    }
  }
  // Tell server.js it is running inside Cloudflare Pages
  process.env.CF_PAGES  = '1'
  process.env.NODE_ENV  = process.env.NODE_ENV  || 'production'
}

async function getAdapter(env) {
  if (adapter) return adapter

  injectEnv(env)

  const { app } = await import('../../server.js')
  adapter = createServerAdapter(app)
  return adapter
}

export async function onRequest(context) {
  const { request, env } = context
  const a = await getAdapter(env)
  return a.fetch(request, env, context)
}

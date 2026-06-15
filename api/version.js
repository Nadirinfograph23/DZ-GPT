/**
 * api/version.js — DZ-GPT Version & Deploy Info Endpoint
 * GET /api/version → { version, commit, branch, deployedAt, env, uptime }
 */

const START_TIME = Date.now()

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const commit    = (process.env.VERCEL_GIT_COMMIT_SHA   || '').slice(0, 7) || 'dev'
  const branch    = process.env.VERCEL_GIT_BRANCH        || process.env.BRANCH || 'local'
  const message   = process.env.VERCEL_GIT_COMMIT_MESSAGE || ''
  const deployUrl = process.env.VERCEL_URL               || process.env.REPLIT_DEV_DOMAIN || 'localhost'
  const region    = process.env.VERCEL_REGION             || 'local'

  res.status(200).json({
    version: `1.0.0-${commit}`,
    commit,
    branch,
    message: message.slice(0, 120),
    deployedAt: process.env.VERCEL_GIT_COMMIT_DATE || new Date().toISOString(),
    serverTime: new Date().toISOString(),
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    env: process.env.NODE_ENV || 'production',
    region,
    host: deployUrl,
    cache: {
      policy: 'no-cache',
      apiRoutes: 'bypass',
      staticAssets: 'immutable (max-age=31536000)',
    },
    status: 'ok',
  })
}

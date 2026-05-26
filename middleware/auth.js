/**
 * middleware/auth.js
 * Authentication & authorization middleware for DZ-GPT.
 *
 * Roles:
 *   admin  — full system access (env DEPLOY_ADMIN_TOKEN)
 *   owner  — project owner (GitHub identity Nadirinfograph23)
 *   user   — authenticated API user (future: JWT)
 *
 * Usage:
 *   import { requireAdmin, requireOwner, optionalAuth } from '../middleware/auth.js'
 *   router.get('/secure', requireAdmin, handler)
 */

const ADMIN_TOKEN = (process.env.DEPLOY_ADMIN_TOKEN || '').trim()

/**
 * Extract bearer/token from request headers or body.
 */
function extractToken(req) {
  return (
    (req.headers['x-admin-token'] || '') ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '').replace(/^token\s+/i, '').trim() ||
    (req.body?.adminToken || '') ||
    ''
  ).trim()
}

/**
 * requireAdmin
 * Protects routes that need admin-level access.
 * - If DEPLOY_ADMIN_TOKEN is not set: allows access (legacy/open mode)
 * - If DEPLOY_ADMIN_TOKEN is set: requires matching token in header or body
 *
 * Send token via:
 *   Header: Authorization: Bearer <token>
 *   Header: X-Admin-Token: <token>
 *   Body:   { adminToken: "<token>" }
 */
export function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next()
  const token = extractToken(req)
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({
      ok: false,
      error: 'Admin authentication required.',
      hint: 'Provide token via Authorization header or x-admin-token header.',
    })
  }
  req.adminAuthenticated = true
  next()
}

/**
 * requireOwner
 * Protects routes that need project-owner access (Nadirinfograph23).
 * Verifies GitHub identity via verifyOwnerToken.
 * Falls back to requireAdmin if owner-commands module unavailable.
 */
export async function requireOwner(req, res, next) {
  const token = extractToken(req) || (req.body?.githubToken || '') || process.env.GITHUB_TOKEN || ''
  try {
    const { verifyOwnerToken } = await import('../lib/owner-commands.js')
    const isOwner = await verifyOwnerToken(token)
    if (!isOwner) {
      return res.status(403).json({
        ok: false,
        error: 'Owner authentication required.',
        hint: 'Provide a valid GitHub token for account Nadirinfograph23.',
      })
    }
    req.ownerAuthenticated = true
    next()
  } catch (err) {
    res.status(403).json({ ok: false, error: 'Authentication failed: ' + err.message })
  }
}

/**
 * optionalAuth
 * Non-blocking — attaches auth status to req without rejecting.
 * Use for routes that behave differently for authenticated users.
 */
export function optionalAuth(req, _res, next) {
  if (ADMIN_TOKEN) {
    const token = extractToken(req)
    if (token === ADMIN_TOKEN) req.adminAuthenticated = true
  }
  next()
}

/**
 * roles — role-based access control helper.
 * Usage: router.get('/route', roles('admin', 'owner'), handler)
 */
export function roles(...allowedRoles) {
  return (req, res, next) => {
    const hasAdmin = req.adminAuthenticated && allowedRoles.includes('admin')
    const hasOwner = req.ownerAuthenticated && allowedRoles.includes('owner')
    if (hasAdmin || hasOwner) return next()
    res.status(403).json({ ok: false, error: `Access requires one of: ${allowedRoles.join(', ')}` })
  }
}

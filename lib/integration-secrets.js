/**
 * Centralized access to integration secrets.
 *
 * Values are intentionally never returned by the status helper or logged.
 * Replit Secrets are exposed to the server process as environment variables.
 */

const SECRET_KEYS = Object.freeze({
  github: ['GITHUB_TOKEN', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'GH_TOKEN'],
  vercel: ['VERCEL_TOKEN'],
})

function readSecret(keys) {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function getIntegrationSecret(name) {
  const keys = SECRET_KEYS[name]
  if (!keys) throw new Error(`Unknown integration secret: ${name}`)
  return readSecret(keys)
}

export function getIntegrationSecretStatus() {
  return {
    github: { configured: Boolean(readSecret(SECRET_KEYS.github)) },
    vercel: { configured: Boolean(readSecret(SECRET_KEYS.vercel)) },
  }
}

export function requireIntegrationSecret(name) {
  const keys = SECRET_KEYS[name]
  if (!keys) throw new Error(`Unknown integration secret: ${name}`)
  const value = readSecret(keys)
  if (!value) throw new Error(`${Array.isArray(keys) ? keys[0] : keys} غير مضبوط في Replit Secrets`)
  return value
}
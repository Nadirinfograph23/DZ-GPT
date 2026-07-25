/**
 * Centralized access to integration secrets.
 *
 * Values are intentionally never returned by the status helper or logged.
 * Replit Secrets are exposed to the server process as environment variables.
 */

const SECRET_KEYS = Object.freeze({
  github: 'GITHUB_TOKEN',
  vercel: 'VERCEL_TOKEN',
})

function readSecret(key) {
  const value = process.env[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function getIntegrationSecret(name) {
  const key = SECRET_KEYS[name]
  if (!key) throw new Error(`Unknown integration secret: ${name}`)
  return readSecret(key)
}

export function getIntegrationSecretStatus() {
  return {
    github: { configured: Boolean(readSecret(SECRET_KEYS.github)) },
    vercel: { configured: Boolean(readSecret(SECRET_KEYS.vercel)) },
  }
}

export function requireIntegrationSecret(name) {
  const key = SECRET_KEYS[name]
  if (!key) throw new Error(`Unknown integration secret: ${name}`)
  const value = readSecret(key)
  if (!value) throw new Error(`${key} غير مضبوط في Replit Secrets`)
  return value
}
const SHA_RE = /^[0-9a-f]{40}$/i

/** @param {unknown} value @returns {string} */
export function normalizeCommitSha(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return SHA_RE.test(normalized) ? normalized : ''
}

/** @param {unknown} clientCommit @param {unknown} serverCommit @returns {boolean} */
export function hasClientCommitMismatch(clientCommit, serverCommit) {
  const clientSha = normalizeCommitSha(clientCommit)
  const serverSha = normalizeCommitSha(serverCommit)
  return Boolean(clientSha && serverSha && clientSha !== serverSha)
}

/** @param {string} deployTs @param {unknown} serverCommit @returns {string} */
export function createServerVersionKey(deployTs, serverCommit) {
  const serverSha = normalizeCommitSha(serverCommit)
  return serverSha ? `${serverSha}:${deployTs}` : `timestamp:${deployTs}`
}

/**
 * @param {{ storedDeployTs?: string | null, deployTs?: string | null, clientCommit?: unknown, serverCommit?: unknown, dismissedVersionKey?: string | null }} options
 * @returns {boolean}
 */
export function shouldShowUpdate(options = {}) {
  const { storedDeployTs = null, deployTs = null, clientCommit = '', serverCommit = '', dismissedVersionKey = null } = options
  if (!deployTs) return false

  const newDeployment = Boolean(storedDeployTs && storedDeployTs !== deployTs)
  const clientIsStale = hasClientCommitMismatch(clientCommit, serverCommit)
  const dismissedCurrentVersion = dismissedVersionKey === createServerVersionKey(deployTs, serverCommit)
  return newDeployment || (clientIsStale && !dismissedCurrentVersion)
}

export function normalizeCommitSha(value: unknown): string
export function hasClientCommitMismatch(clientCommit: unknown, serverCommit: unknown): boolean
export function createServerVersionKey(deployTs: string, serverCommit: unknown): string
export function shouldShowUpdate(options?: {
  storedDeployTs?: string | null
  deployTs?: string | null
  clientCommit?: unknown
  serverCommit?: unknown
  dismissedVersionKey?: string | null
}): boolean

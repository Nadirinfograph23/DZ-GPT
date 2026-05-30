const LOG_PREFIX = '[safeStorage]'

export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (e) {
    console.warn(LOG_PREFIX, 'setItem failed for key:', key, e)
    return false
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {}
}

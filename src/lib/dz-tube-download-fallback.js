export function shouldAttemptCobaltFallback(status) {
  return status === 0 || (Number.isInteger(status) && status >= 500 && status < 600)
}

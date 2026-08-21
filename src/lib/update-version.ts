// Every production build can expose a monotonically changing build marker.
// Consumers should compare this value with the marker returned by /api/version.
export function getBuildMarker(): string {
  return (import.meta.env.VITE_BUILD_ID || import.meta.env.VITE_GIT_COMMIT_SHA || '').trim();
}

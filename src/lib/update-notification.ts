export function installUpdateNotification() {
  const buildId = (import.meta.env.VITE_BUILD_ID || import.meta.env.VITE_GIT_COMMIT_SHA || '').trim();
  if (!buildId || typeof window === 'undefined') return;
  const key = 'dzagent-last-build-id';
  const previous = localStorage.getItem(key);
  localStorage.setItem(key, buildId);
  if (previous && previous !== buildId) {
    window.dispatchEvent(new CustomEvent('dzagent:update-available', { detail: { buildId } }));
  }
}

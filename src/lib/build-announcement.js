export function createBuildAnnouncement(version = {}) {
  const message = String(version.message || '')
  const isImageUpdate = /image|img[-\s]?gen|photo|picture|صورة|توليد/i.test(message)
  const sourceId = String(version.commit || version.commitShort || 'latest').trim()
  const safeId = sourceId.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'latest'
  const deployedAt = Date.parse(String(version.deployedAt || ''))
  return {
    id: 'dzagent-build-' + safeId,
    title: isImageUpdate ? 'توليد الصور' : 'تحديث جديد في DZ Agent',
    text: isImageUpdate ? 'تم تحسين توليد الصور في DZ Agent وDZ Media ليعتمد على وصف المستخدم فقط.' : 'تم تحديث DZ Agent بتحسينات جديدة في هذا الإصدار.',
    link: null,
    linkText: null,
    timestamp: Number.isFinite(deployedAt) ? deployedAt : Date.now(),
    from: 'DZ Agent',
    badge: 'NEW',
    type: 'update',
  }
}

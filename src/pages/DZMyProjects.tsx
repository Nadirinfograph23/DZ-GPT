import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/dz-my-projects.css'

export interface SavedProject {
  id: string
  title: string
  htmlCode: string
  siteType: string
  stylePreset: string
  prompt: string
  savedAt: string
  thumbnail?: string
}

const STORAGE_KEY = 'dz-saved-projects'

export function loadProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveProject(project: Omit<SavedProject, 'id' | 'savedAt'>): SavedProject {
  const projects = loadProjects()
  const newProject: SavedProject = {
    ...project,
    id: `proj_${Date.now()}`,
    savedAt: new Date().toISOString(),
  }
  projects.unshift(newProject)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.slice(0, 50)))
  return newProject
}

export function deleteProject(id: string): void {
  const projects = loadProjects().filter(p => p.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

const SITE_TYPE_LABELS: Record<string, string> = {
  landing: '🚀 صفحة هبوط',
  dashboard: '📊 لوحة تحكم',
  portfolio: '🎨 بورتفوليو',
  ecommerce: '🛍️ متجر',
  saas: '⚡ SaaS',
  blog: '📝 مدونة',
  restaurant: '🍽️ مطعم',
  agency: '🏢 وكالة',
  ai: '🤖 AI',
  education: '🎓 تعليم',
}

const STYLE_LABELS: Record<string, string> = {
  glassmorphism: '🪟 زجاجي',
  minimal: '⬜ مينيمال',
  neon: '💚 نيون',
  gradient: '🌈 تدرجات',
  corporate: '💼 كوربوريت',
  luxury: '🌟 فاخر',
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export default function DZMyProjects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<SavedProject[]>([])
  const [preview, setPreview] = useState<SavedProject | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    setProjects(loadProjects())
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleDelete = useCallback((id: string) => {
    deleteProject(id)
    setProjects(loadProjects())
    setDeleteConfirm(null)
    if (preview?.id === id) setPreview(null)
    showToast('🗑️ تم حذف المشروع')
  }, [preview])

  const handleRestore = useCallback((project: SavedProject) => {
    navigate('/web-builder', { state: { restoreProject: project } })
  }, [navigate])

  const handleDownload = useCallback((project: SavedProject) => {
    const blob = new Blob([project.htmlCode], { type: 'text/html;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${project.title.replace(/\s+/g, '-')}-${project.id.slice(-6)}.html`
    a.click()
    showToast('⬇️ تم تحميل الملف')
  }, [])

  const handleClearAll = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
    setProjects([])
    setPreview(null)
    setDeleteConfirm(null)
    showToast('🗑️ تم حذف جميع المشاريع')
  }

  const filtered = projects.filter(p =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.prompt.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="dzmp" dir="rtl">

      {/* ── Toast ── */}
      {toast && <div className="dzmp-toast">{toast}</div>}

      {/* ── Header ── */}
      <header className="dzmp-header">
        <button className="dzmp-back" onClick={() => navigate(-1)} title="رجوع">
          ← رجوع
        </button>
        <div className="dzmp-header-title">
          <div className="dzmp-header-icon">💾</div>
          <div>
            <h1 className="dzmp-title">مشاريعي المحفوظة</h1>
            <p className="dzmp-subtitle">{projects.length} مشروع محفوظ على جهازك</p>
          </div>
        </div>
        <div className="dzmp-header-actions">
          <button className="dzmp-new-btn" onClick={() => navigate('/web-builder')}>
            ⚡ مشروع جديد
          </button>
          {projects.length > 0 && (
            <button className="dzmp-clear-btn" onClick={() => setDeleteConfirm('__ALL__')} title="حذف الكل">
              🗑️
            </button>
          )}
        </div>
      </header>

      {/* ── Search ── */}
      {projects.length > 0 && (
        <div className="dzmp-search-wrap">
          <input
            className="dzmp-search"
            type="text"
            placeholder="🔍 ابحث في مشاريعك…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {/* ── Empty State ── */}
      {projects.length === 0 && (
        <div className="dzmp-empty">
          <div className="dzmp-empty-icon">🏗️</div>
          <h2 className="dzmp-empty-title">لا توجد مشاريع محفوظة بعد</h2>
          <p className="dzmp-empty-sub">أنشئ موقعك الأول واحفظه من Web Builder</p>
          <button className="dzmp-empty-cta" onClick={() => navigate('/web-builder')}>
            ⚡ ابنِ موقعك الآن
          </button>
        </div>
      )}

      {/* ── Projects Grid ── */}
      {filtered.length > 0 && (
        <main className="dzmp-grid">
          {filtered.map(project => (
            <div key={project.id} className="dzmp-card">

              {/* Mini Preview */}
              <div className="dzmp-card-preview" onClick={() => setPreview(project)}>
                <iframe
                  srcDoc={project.htmlCode}
                  className="dzmp-card-iframe"
                  sandbox="allow-scripts"
                  title={project.title}
                  scrolling="no"
                />
                <div className="dzmp-card-preview-overlay">
                  <span className="dzmp-preview-btn">🔍 معاينة</span>
                </div>
              </div>

              {/* Card Info */}
              <div className="dzmp-card-body">
                <h3 className="dzmp-card-title">{project.title}</h3>
                {project.prompt && (
                  <p className="dzmp-card-prompt">{project.prompt.slice(0, 80)}{project.prompt.length > 80 ? '…' : ''}</p>
                )}
                <div className="dzmp-card-tags">
                  <span className="dzmp-tag dzmp-tag--type">{SITE_TYPE_LABELS[project.siteType] || project.siteType}</span>
                  <span className="dzmp-tag dzmp-tag--style">{STYLE_LABELS[project.stylePreset] || project.stylePreset}</span>
                </div>
                <p className="dzmp-card-date">📅 {formatDate(project.savedAt)}</p>
              </div>

              {/* Actions */}
              <div className="dzmp-card-actions">
                <button
                  className="dzmp-action dzmp-action--restore"
                  onClick={() => handleRestore(project)}
                  title="استعادة في Web Builder"
                >
                  ♻️ استعادة
                </button>
                <button
                  className="dzmp-action dzmp-action--preview"
                  onClick={() => setPreview(project)}
                  title="معاينة كاملة"
                >
                  🔍 معاينة
                </button>
                <button
                  className="dzmp-action dzmp-action--download"
                  onClick={() => handleDownload(project)}
                  title="تحميل HTML"
                >
                  ⬇️
                </button>
                <button
                  className="dzmp-action dzmp-action--delete"
                  onClick={() => setDeleteConfirm(project.id)}
                  title="حذف"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </main>
      )}

      {/* ── No Results ── */}
      {projects.length > 0 && filtered.length === 0 && (
        <div className="dzmp-empty">
          <div className="dzmp-empty-icon">🔍</div>
          <p className="dzmp-empty-sub">لا توجد نتائج لـ "{searchQuery}"</p>
          <button className="dzmp-empty-cta" onClick={() => setSearchQuery('')}>مسح البحث</button>
        </div>
      )}

      {/* ── Full Preview Modal ── */}
      {preview && (
        <div className="dzmp-modal-overlay" onClick={() => setPreview(null)}>
          <div className="dzmp-modal" onClick={e => e.stopPropagation()}>
            <div className="dzmp-modal-header">
              <div className="dzmp-modal-title">
                <span>{preview.title}</span>
                <div className="dzmp-modal-tags">
                  <span className="dzmp-tag dzmp-tag--type">{SITE_TYPE_LABELS[preview.siteType] || preview.siteType}</span>
                  <span className="dzmp-tag dzmp-tag--style">{STYLE_LABELS[preview.stylePreset] || preview.stylePreset}</span>
                </div>
              </div>
              <div className="dzmp-modal-actions">
                <button className="dzmp-modal-btn dzmp-modal-btn--restore" onClick={() => { setPreview(null); handleRestore(preview) }}>
                  ♻️ استعادة
                </button>
                <button className="dzmp-modal-btn dzmp-modal-btn--download" onClick={() => handleDownload(preview)}>
                  ⬇️ تحميل
                </button>
                <button className="dzmp-modal-close" onClick={() => setPreview(null)}>✕</button>
              </div>
            </div>
            <iframe
              srcDoc={preview.htmlCode}
              className="dzmp-modal-iframe"
              sandbox="allow-scripts allow-forms allow-popups"
              title={preview.title}
            />
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm && (
        <div className="dzmp-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="dzmp-confirm" onClick={e => e.stopPropagation()}>
            <div className="dzmp-confirm-icon">🗑️</div>
            <h3 className="dzmp-confirm-title">
              {deleteConfirm === '__ALL__' ? 'حذف جميع المشاريع؟' : 'حذف هذا المشروع؟'}
            </h3>
            <p className="dzmp-confirm-sub">لا يمكن التراجع عن هذا الإجراء</p>
            <div className="dzmp-confirm-btns">
              <button
                className="dzmp-confirm-yes"
                onClick={() => deleteConfirm === '__ALL__' ? handleClearAll() : handleDelete(deleteConfirm)}
              >
                نعم، احذف
              </button>
              <button className="dzmp-confirm-no" onClick={() => setDeleteConfirm(null)}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

import React, { useState } from 'react'
import { Download, ExternalLink, CheckCircle, Loader2, FileCode, ChevronDown, ChevronUp } from 'lucide-react'

export interface SmartRepo {
  url: string
  name: string
  owner: string
  category: string
  descAr: string
  install: { type: string; pkg: string }
  starterFiles: Record<string, string>
  score?: number
}

interface Props {
  repos: SmartRepo[]
  currentRepo?: string
  githubToken?: string
  onImportDone?: (repoName: string, message: string) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  media: '#e85d04',
  ai: '#7c3aed',
  web: '#0ea5e9',
  database: '#16a34a',
  automation: '#d97706',
  ui: '#ec4899',
  visualization: '#06b6d4',
}

const CATEGORY_ICONS: Record<string, string> = {
  media: '🎬', ai: '🤖', web: '🌐', database: '🗄️',
  automation: '⚙️', ui: '🎨', visualization: '📊',
}

const CATEGORY_LABELS: Record<string, string> = {
  media: 'وسائط', ai: 'ذكاء اصطناعي', web: 'ويب',
  database: 'قواعد بيانات', automation: 'أتمتة',
  ui: 'واجهات', visualization: 'بيانات وعرض',
}

const INSTALL_COLORS: Record<string, string> = {
  pip: '#3b82f6', npm: '#f59e0b', npx: '#8b5cf6',
}

export default function SmartRepoSuggestion({ repos, currentRepo, githubToken, onImportDone }: Props) {
  const [importing, setImporting] = useState<string | null>(null)
  const [imported, setImported] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)

  async function handleImport(repo: SmartRepo) {
    setImporting(repo.name)
    try {
      const res = await fetch('/api/dz-agent/smart-repos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName: repo.name,
          currentRepo: currentRepo || '',
          token: githubToken || '',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setImported(prev => new Set([...prev, repo.name]))
        onImportDone?.(repo.name, data.message)
      }
    } catch (_) {}
    setImporting(null)
  }

  return (
    <div className="srs-container">
      <div className="srs-header">
        <span className="srs-header-icon">🔗</span>
        <span>DZ Agent يقترح هذه المستودعات لمشروعك</span>
      </div>
      <div className="srs-cards">
        {repos.map(repo => {
          const color = CATEGORY_COLORS[repo.category] || '#10a37f'
          const isImporting = importing === repo.name
          const isDone = imported.has(repo.name)
          const isExpanded = expanded === repo.name
          const fileCount = Object.keys(repo.starterFiles || {}).length
          return (
            <div key={repo.url} className="srs-card" style={{ '--srs-accent': color } as React.CSSProperties}>
              <div className="srs-card-top">
                <div className="srs-card-meta">
                  <span className="srs-category-badge" style={{ background: `${color}22`, color }}>
                    {CATEGORY_ICONS[repo.category]} {CATEGORY_LABELS[repo.category] || repo.category}
                  </span>
                  <span className={`srs-install-badge srs-install-${repo.install.type}`}>
                    {repo.install.type}
                  </span>
                </div>
                <div className="srs-card-name-row">
                  <span className="srs-name">{repo.name}</span>
                  <a href={repo.url} target="_blank" rel="noopener noreferrer" className="srs-gh-link" title="عرض في GitHub">
                    <ExternalLink size={12} />
                  </a>
                </div>
                <p className="srs-desc">{repo.descAr}</p>
                <div className="srs-install-cmd">
                  <code>{repo.install.type} install {repo.install.pkg}</code>
                </div>
              </div>

              <div className="srs-card-footer">
                {fileCount > 0 && (
                  <button
                    className="srs-files-toggle"
                    onClick={() => setExpanded(isExpanded ? null : repo.name)}
                  >
                    <FileCode size={12} />
                    <span>{fileCount} ملفات Starter</span>
                    {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </button>
                )}
                <button
                  className={`srs-import-btn ${isDone ? 'srs-import-done' : ''}`}
                  disabled={isImporting || isDone}
                  onClick={() => handleImport(repo)}
                  style={{ background: isDone ? 'rgba(16,163,127,.15)' : `${color}22`, borderColor: isDone ? '#10a37f' : color, color: isDone ? '#10a37f' : color }}
                >
                  {isImporting
                    ? <><Loader2 size={13} className="srs-spin" /> جاري الاستيراد...</>
                    : isDone
                    ? <><CheckCircle size={13} /> تم الاستيراد</>
                    : <><Download size={13} /> استيراد الآن</>
                  }
                </button>
              </div>

              {isExpanded && (
                <div className="srs-files-list">
                  {Object.keys(repo.starterFiles || {}).map(f => (
                    <div key={f} className="srs-file-item">
                      <FileCode size={11} />
                      <code>{f}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

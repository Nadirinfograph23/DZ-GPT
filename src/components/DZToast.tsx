import { useEffect, useRef } from 'react'
import { Github, Globe, Download, CheckCircle2, XCircle, Info } from 'lucide-react'
import '../styles/dz-toast.css'

export type ToastType = 'commit' | 'deploy' | 'import' | 'success' | 'error' | 'info' | 'push'

export interface Toast {
  id: string
  type: ToastType
  title: string
  desc?: string
  link?: string
  linkLabel?: string
  duration?: number
}

interface Props {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

const ICONS: Record<ToastType, React.ReactNode> = {
  commit: <Github size={15} />,
  push:   <Github size={15} />,
  deploy: <Globe size={15} />,
  import: <Download size={15} />,
  success:<CheckCircle2 size={15} />,
  error:  <XCircle size={15} />,
  info:   <Info size={15} />,
}

const COLORS: Record<ToastType, string> = {
  commit:  '#10a37f',
  push:    '#10a37f',
  deploy:  '#38bdf8',
  import:  '#a78bfa',
  success: '#10a37f',
  error:   '#ef4444',
  info:    '#94a3b8',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const barRef = useRef<HTMLDivElement>(null)
  const duration = toast.duration ?? 4000

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), duration)
    if (barRef.current) {
      barRef.current.style.transition = `width ${duration}ms linear`
      barRef.current.style.width = '0%'
    }
    return () => clearTimeout(timer)
  }, [toast.id, duration, onDismiss])

  const color = COLORS[toast.type]

  return (
    <div
      className="dzt-item"
      style={{ '--dzt-color': color } as React.CSSProperties}
      onClick={() => onDismiss(toast.id)}
    >
      <div className="dzt-icon">{ICONS[toast.type]}</div>
      <div className="dzt-body">
        <span className="dzt-title">{toast.title}</span>
        {toast.desc && <span className="dzt-desc">{toast.desc}</span>}
        {toast.link && (
          <a
            href={toast.link}
            target="_blank"
            rel="noopener noreferrer"
            className="dzt-link"
            onClick={e => e.stopPropagation()}
          >
            {toast.linkLabel || toast.link}
          </a>
        )}
      </div>
      <div className="dzt-progress" ref={barRef} />
    </div>
  )
}

export default function DZToast({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null
  return (
    <div className="dzt-container" dir="rtl">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}


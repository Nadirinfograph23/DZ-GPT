import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutGrid, Home, Bot, MessageCircle, BookOpen,
  Video, BarChart2, Wrench, Globe, ScanText, X, ChevronRight,
  FileSpreadsheet, Gamepad2, Github, Radio, Award, Clapperboard, FolderOpen
} from 'lucide-react'
import '../styles/quick-nav.css'

interface NavItem {
  path: string
  label: string
  labelEn: string
  icon: React.ReactNode
  color: string
  external?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { path: '/',             label: 'الرئيسية',     labelEn: 'Home',         icon: <Home size={18} />,            color: '#c8ff00' },
  { path: '/dz-agent',     label: 'DZ Agent',     labelEn: 'AI Chat',      icon: <Bot size={18} />,             color: '#4ade80' },
  { path: '/dzchat',       label: 'DZ Chat',      labelEn: 'Live Chat',    icon: <MessageCircle size={18} />,   color: '#38bdf8' },
  { path: '/quran',        label: 'القرآن AI',    labelEn: 'AI Quran',     icon: <BookOpen size={18} />,        color: '#fbbf24' },
  { path: '/dz-tube',      label: 'DZ Tube',      labelEn: 'Video AI',     icon: <Video size={18} />,           color: '#f87171' },
  { path: '/stats',        label: 'الإحصائيات',   labelEn: 'Stats',        icon: <BarChart2 size={18} />,       color: '#34d399' },
  { path: '/tools',        label: 'الأدوات',      labelEn: 'Tools',        icon: <Wrench size={18} />,          color: '#fb923c' },
  { path: '/web-builder',  label: 'Web Builder',  labelEn: 'Site Builder', icon: <Globe size={18} />,           color: '#a78bfa' },
  { path: '/ocr-dz',       label: 'OCR DZ',       labelEn: 'Text Scanner', icon: <ScanText size={18} />,        color: '#f472b6' },
  { path: '/excel',        label: 'DZ Excel',     labelEn: 'Smart Sheets', icon: <FileSpreadsheet size={18} />, color: '#4ade80' },
  { path: '/le3ba',        label: 'DZ Le3ba',     labelEn: 'Word Games',   icon: <Gamepad2 size={18} />,        color: '#fb7185' },
  { path: '/github-agent', label: 'DZ GitHub',    labelEn: 'Git Deploy',   icon: <Github size={18} />,          color: '#60a5fa' },
  { path: '/radio',        label: 'DZ Radio',     labelEn: 'Live Radio',   icon: <Radio size={18} />,           color: '#38bdf8' },
  { path: '/media',        label: 'DZ Media',     labelEn: 'صور وفيديو AI', icon: <Clapperboard size={18} />,   color: '#e879f9' },
  { path: '/my-projects',  label: 'مشاريعي',      labelEn: 'My Projects',  icon: <FolderOpen size={18} />,      color: '#34d399' },
  {
    path: 'https://dzagent.app/dz-agent-certificate.html',
    label: 'Certificate',
    labelEn: 'شهادة DZ Agent',
    icon: <Award size={18} />,
    color: '#f59e0b',
    external: true,
  },
]

const HIDE_ON: string[] = []

export default function QuickNav() {
  const [open, setOpen]       = useState(false)
  const [visible, setVisible] = useState(false)
  const navigate    = useNavigate()
  const { pathname } = useLocation()
  const drawerRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (HIDE_ON.includes(pathname)) { setVisible(false); return }
    setVisible(true)
  }, [pathname])

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('dz:open-quicknav', handler)
    return () => window.removeEventListener('dz:open-quicknav', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onClickOut = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setOpen(false)
    }
    setTimeout(() => document.addEventListener('mousedown', onClickOut), 10)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [open])

  if (!visible) return null

  const go = (item: NavItem) => {
    setOpen(false)
    if (item.external) {
      window.open(item.path, '_blank')
    } else {
      navigate(item.path)
    }
  }

  return (
    <>
      {open && <div className="qnav-backdrop" onClick={() => setOpen(false)} />}

      <button
        className={`qnav-fab${open ? ' qnav-fab--open' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="قائمة التنقل السريع"
        aria-label="Quick navigation"
      >
        {open ? <X size={20} /> : <LayoutGrid size={20} />}
      </button>

      <div ref={drawerRef} className={`qnav-drawer${open ? ' qnav-drawer--open' : ''}`}>
        <div className="qnav-drawer-header">
          <span className="qnav-drawer-title">تنقل سريع</span>
          <button className="qnav-drawer-close" onClick={() => setOpen(false)} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <nav className="qnav-list">
          {NAV_ITEMS.map(item => {
            const active = !item.external && (pathname === item.path ||
              (item.path !== '/' && pathname.startsWith(item.path)))
            return (
              <button
                key={item.path}
                className={`qnav-item${active ? ' qnav-item--active' : ''}`}
                style={{ '--item-color': item.color } as React.CSSProperties}
                onClick={() => go(item)}
              >
                <span className="qnav-item-icon">{item.icon}</span>
                <span className="qnav-item-text">
                  <span className="qnav-item-label">{item.label}</span>
                  <span className="qnav-item-sub">{item.labelEn}</span>
                </span>
                {active && <span className="qnav-item-active-dot" />}
                {!active && <ChevronRight size={14} className="qnav-item-arrow" />}
              </button>
            )
          })}
        </nav>

        <div className="qnav-drawer-footer">
          <span>DZ AGENT</span>
          <span className="qnav-version">v5</span>
        </div>
      </div>
    </>
  )
}

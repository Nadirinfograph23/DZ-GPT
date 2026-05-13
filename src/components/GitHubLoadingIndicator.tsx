import { useEffect, useState } from 'react'
import {
  GitBranch, FileCode, Upload, Search, GitCommit,
  GitPullRequest, Globe, Cpu, RefreshCw, Layers,
  FolderOpen, FilePlus, Shield, Zap,
} from 'lucide-react'

interface Phase {
  icon: React.ReactNode
  dz: string
  cmd: string
  color: string
}

const PHASES: Phase[] = [
  { icon: <Cpu size={13} />,          dz: 'راني نخمم...',              cmd: '> analyzing request...',          color: '#60a5fa' },
  { icon: <Search size={13} />,       dz: 'نفهم طلبك...',              cmd: '> parsing intent...',              color: '#a78bfa' },
  { icon: <FolderOpen size={13} />,   dz: 'نشوف المستودعات...',        cmd: '> listing repositories...',        color: '#34d399' },
  { icon: <GitBranch size={13} />,    dz: 'نحلل الفروع...',            cmd: '> reading branches...',            color: '#fbbf24' },
  { icon: <FileCode size={13} />,     dz: 'نقرى الكود...',             cmd: '> reading source files...',        color: '#60a5fa' },
  { icon: <FilePlus size={13} />,     dz: 'نكتب الكود...',             cmd: '> generating code...',             color: '#34d399' },
  { icon: <Upload size={13} />,       dz: 'نرفع الملفات...',           cmd: '> pushing to GitHub...',           color: '#f472b6' },
  { icon: <GitCommit size={13} />,    dz: 'نسجل التغييرات...',         cmd: '> committing changes...',          color: '#fbbf24' },
  { icon: <GitPullRequest size={13}/>, dz: 'نفتح Pull Request...',     cmd: '> creating pull request...',      color: '#a78bfa' },
  { icon: <Globe size={13} />,        dz: 'ننشر الموقع...',            cmd: '> enabling GitHub Pages...',       color: '#34d399' },
  { icon: <Shield size={13} />,       dz: 'نتحقق من النتيجة...',       cmd: '> verifying deployment...',        color: '#60a5fa' },
  { icon: <Layers size={13} />,       dz: 'نرتب المشروع...',           cmd: '> organizing project structure...', color: '#f472b6' },
  { icon: <RefreshCw size={13} />,    dz: 'نحاول مرة أخرى...',        cmd: '> retrying operation...',          color: '#fbbf24' },
  { icon: <Zap size={13} />,          dz: 'يقريب يكمل...',             cmd: '> finalizing...',                  color: '#34d399' },
]

const FAKE_LOGS = [
  'git status → working tree clean',
  'git fetch origin main',
  'api.github.com/repos → 200 OK',
  'HEAD → refs/heads/main',
  'tree: e8b72c25396d',
  'blob: pushed 1 object',
  'commit: 7b0c473185f7',
  'pages: source { branch: main }',
  'deploy: status → building...',
  'check: HTTP 200 OK',
]

export default function GitHubLoadingIndicator() {
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [logLines, setLogLines] = useState<string[]>([])
  const [cursor, setCursor] = useState(true)
  const [progress, setProgress] = useState(8)
  const [dots, setDots] = useState('')

  useEffect(() => {
    const phaseTimer = setInterval(() => {
      setPhaseIdx(i => (i + 1) % PHASES.length)
    }, 1800)
    return () => clearInterval(phaseTimer)
  }, [])

  useEffect(() => {
    const logTimer = setInterval(() => {
      const line = FAKE_LOGS[Math.floor(Math.random() * FAKE_LOGS.length)]
      setLogLines(prev => [...prev.slice(-4), line])
      setProgress(p => Math.min(p + Math.floor(Math.random() * 6 + 2), 92))
    }, 1200)
    return () => clearInterval(logTimer)
  }, [])

  useEffect(() => {
    const cursorTimer = setInterval(() => setCursor(c => !c), 500)
    return () => clearInterval(cursorTimer)
  }, [])

  useEffect(() => {
    const dotsTimer = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    return () => clearInterval(dotsTimer)
  }, [])

  const phase = PHASES[phaseIdx]

  return (
    <div className="gh-loading">
      {/* Top status bar */}
      <div className="gh-loading-bar">
        <div className="gh-loading-bar-left">
          <span className="gh-loading-dot gh-loading-dot--red" />
          <span className="gh-loading-dot gh-loading-dot--yellow" />
          <span className="gh-loading-dot gh-loading-dot--green" />
          <span className="gh-loading-title">DZ Agent · GitHub Terminal</span>
        </div>
        <span className="gh-loading-badge">
          <RefreshCw size={9} className="gh-loading-spin" />
          running
        </span>
      </div>

      {/* Main content */}
      <div className="gh-loading-body">
        {/* Darija message */}
        <div className="gh-loading-dz">
          <span className="gh-loading-dz-icon" style={{ color: phase.color }}>
            {phase.icon}
          </span>
          <span className="gh-loading-dz-text" style={{ color: phase.color }}>
            {phase.dz}
          </span>
          <span className="gh-loading-dz-cursor">{cursor ? '█' : ' '}</span>
        </div>

        {/* Terminal log */}
        <div className="gh-loading-terminal">
          {logLines.map((line, i) => (
            <div
              key={i}
              className="gh-loading-log-line"
              style={{ opacity: 0.4 + (i / logLines.length) * 0.6 }}
            >
              <span className="gh-loading-prompt">$</span>
              <span>{line}</span>
            </div>
          ))}
          <div className="gh-loading-log-line gh-loading-log-line--active">
            <span className="gh-loading-prompt">$</span>
            <span style={{ color: phase.color }}>{phase.cmd}</span>
            <span style={{ opacity: cursor ? 1 : 0 }}>▌</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="gh-loading-progress-wrap">
          <div className="gh-loading-progress-track">
            <div
              className="gh-loading-progress-fill"
              style={{ width: `${progress}%`, background: phase.color }}
            />
          </div>
          <span className="gh-loading-progress-pct">{progress}%</span>
        </div>

        {/* Wait message */}
        <div className="gh-loading-wait">
          أصبر{dots} قاعد يشتغل DZ Agent
        </div>
      </div>
    </div>
  )
}

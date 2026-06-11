import { StrictMode, Component, ReactNode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css'
import './App.css'
import './styles/mini-player.css'

// ── Lazy-loaded pages — reduces initial bundle by ~60% ────────────────────────
const App            = lazy(() => import('./App.tsx'))
const DZHome         = lazy(() => import('./pages/DZHome.tsx'))
const DZAgent        = lazy(() => import('./pages/DZAgent.tsx'))
const AIQuran        = lazy(() => import('./pages/AIQuran.tsx'))
const DZChat         = lazy(() => import('./pages/DZChat.tsx'))
const DZTube         = lazy(() => import('./pages/DZTube.tsx'))
const DZStats        = lazy(() => import('./pages/DZStats.tsx'))
const DZTools        = lazy(() => import('./pages/DZTools.tsx'))
const DZWebBuilder   = lazy(() => import('./pages/DZWebBuilder.tsx'))
const OCRDZ          = lazy(() => import('./pages/OCRDZ.tsx'))
const DZLe3ba        = lazy(() => import('./pages/DZLe3ba.tsx'))
const DZAgentGitHub  = lazy(() => import('./pages/DZAgentGitHub.tsx'))
const DZExcel        = lazy(() => import('./pages/DZExcel.tsx'))
const DZRadio        = lazy(() => import('./pages/DZRadio.tsx'))
const DZMyProjects   = lazy(() => import('./pages/DZMyProjects.tsx'))
const DZMediaStudio  = lazy(() => import('./pages/DZMediaStudio.tsx'))

// Loading fallback — dark-themed spinner
function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '3px solid rgba(99,102,241,0.2)',
        borderTopColor: '#6366f1',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <span style={{ color: '#64748b', fontSize: 13, fontFamily: "'Cairo', sans-serif" }}>
        جارٍ التحميل…
      </span>
    </div>
  )
}
import { MiniPlayerProvider } from './context/MiniPlayerContext.tsx'
import { RadioPlayerProvider } from './context/RadioPlayerContext.tsx'
import MiniPlayer from './components/MiniPlayer.tsx'
import RadioMiniPlayer from './components/RadioMiniPlayer.tsx'
import QuickNav from './components/QuickNav.tsx'
import GlobalRobot from './components/GlobalRobot.tsx'
import './styles/radio-mini-player.css'

const HIDE_MINIPLAYER_ROUTES = ['/web-builder']

function ConditionalMiniPlayer() {
  const { pathname } = useLocation()
  if (HIDE_MINIPLAYER_ROUTES.includes(pathname)) return null
  return <MiniPlayer />
}

// ── Root boundary: catches catastrophic failures (provider crashes, etc.) ───────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: unknown) {
    console.error('[RootErrorBoundary] caught:', error.message, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',
          fontFamily: "'Cairo', 'Segoe UI', sans-serif", padding: '24px',
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid rgba(99,102,241,.3)', borderRadius: '20px',
            padding: '40px 32px', maxWidth: '440px', width: '100%', textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,.6)',
          }}>
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ color: '#f1f5f9', fontSize: '20px', fontWeight: 700, margin: '0 0 12px' }}>
              حدث خطأ غير متوقع
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.7, margin: '0 0 28px' }}>
              عذراً، واجه DZ Agent مشكلة داخلية. يمكنك إعادة تحميل الصفحة للمتابعة.
            </p>
            <button onClick={() => window.location.reload()} style={{
              background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', border: 'none',
              borderRadius: '12px', padding: '12px 32px', fontSize: '15px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              🔄 إعادة التحميل
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Page boundary: isolates individual page crashes ──────────────────────────
// If one page crashes, the MiniPlayer / GlobalRobot / navigation still work.
interface PageBoundaryState { error: Error | null }
interface PageBoundaryProps { children: ReactNode; name: string }
class PageErrorBoundary extends Component<PageBoundaryProps, PageBoundaryState> {
  constructor(props: PageBoundaryProps) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error): PageBoundaryState { return { error } }
  componentDidCatch(error: Error, info: unknown) {
    console.error(`[PageErrorBoundary:${this.props.name}] caught:`, error.message, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',
          fontFamily: "'Cairo', 'Segoe UI', sans-serif", padding: '24px',
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid rgba(239,68,68,.25)', borderRadius: '20px',
            padding: '36px 28px', maxWidth: '420px', width: '100%', textAlign: 'center',
            boxShadow: '0 20px 56px rgba(0,0,0,.7)',
          }}>
            <div style={{ fontSize: '46px', marginBottom: '14px' }}>🔧</div>
            <h2 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: 700, margin: '0 0 10px' }}>
              خطأ في صفحة {this.props.name}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '13.5px', lineHeight: 1.7, margin: '0 0 24px' }}>
              هذه الصفحة واجهت مشكلة. باقي التطبيق يعمل بشكل طبيعي.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => this.setState({ error: null })}
                style={{
                  background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: '#fff', border: 'none',
                  borderRadius: '10px', padding: '10px 22px', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                🔄 إعادة المحاولة
              </button>
              <button
                onClick={() => { window.location.href = '/' }}
                style={{
                  background: 'rgba(255,255,255,.07)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: '10px', padding: '10px 22px', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                🏠 الرئيسية
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Helper to wrap a page element with PageErrorBoundary
function pb(name: string, element: ReactNode) {
  return <PageErrorBoundary name={name}>{element}</PageErrorBoundary>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <MiniPlayerProvider>
          <RadioPlayerProvider>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"             element={pb('DZHome',        <DZHome />)} />
            <Route path="/chat"         element={pb('DZ Chat',        <App />)} />
            <Route path="/dz-agent"     element={pb('DZ Agent',       <DZAgent />)} />
            <Route path="/quran"        element={pb('AI Quran',       <AIQuran />)} />
            <Route path="/dzchat"       element={pb('DZ Chat',        <DZChat />)} />
            <Route path="/dz-tube"      element={pb('DZ Tube',        <DZTube />)} />
            <Route path="/dztube"       element={<Navigate to="/dz-tube" replace />} />
            <Route path="/aiquran"      element={<Navigate to="/quran" replace />} />
            <Route path="/stats"        element={pb('DZ Stats',       <DZStats />)} />
            <Route path="/tools"        element={pb('DZ Tools',       <DZTools />)} />
            <Route path="/web-builder"  element={pb('Web Builder',    <DZWebBuilder />)} />
            <Route path="/ocr-dz"       element={pb('OCR DZ',         <OCRDZ />)} />
            <Route path="/le3ba"        element={pb('DZ Le3ba',       <DZLe3ba />)} />
            <Route path="/github-agent" element={pb('GitHub Agent',   <DZAgentGitHub />)} />
            <Route path="/excel"        element={pb('DZ Excel',       <DZExcel />)} />
            <Route path="/radio"        element={pb('DZ Radio',       <DZRadio />)} />
            <Route path="/dz-radio"     element={<Navigate to="/radio" replace />} />
            <Route path="/my-projects"  element={pb('مشاريعي',         <DZMyProjects />)} />
            <Route path="/media"        element={pb('DZ Media Studio', <DZMediaStudio />)} />
            <Route path="/dz-media"     element={<Navigate to="/media" replace />} />
            <Route path="*"             element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          <ConditionalMiniPlayer />
          <RadioMiniPlayer />
          <QuickNav />
          <GlobalRobot />
          </RadioPlayerProvider>
        </MiniPlayerProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

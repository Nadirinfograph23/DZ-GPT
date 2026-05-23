import { StrictMode, Component, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css'
import './styles/mini-player.css'
import App from './App.tsx'
import DZHome from './pages/DZHome.tsx'
import DZAgent from './pages/DZAgent.tsx'
import DZAgentV3 from './pages/DZAgentV3.tsx'
import AIQuran from './pages/AIQuran.tsx'
import DZChat from './pages/DZChat.tsx'
import DZTube from './pages/DZTube.tsx'
import DZStats from './pages/DZStats.tsx'
import DZTools from './pages/DZTools.tsx'
import DZWebBuilder from './pages/DZWebBuilder.tsx'
import OCRDZ from './pages/OCRDZ.tsx'
import DZLe3ba from './pages/DZLe3ba.tsx'
import { MiniPlayerProvider } from './context/MiniPlayerContext.tsx'
import MiniPlayer from './components/MiniPlayer.tsx'
import QuickNav from './components/QuickNav.tsx'

const HIDE_MINIPLAYER_ROUTES = ['/web-builder']

function ConditionalMiniPlayer() {
  const { pathname } = useLocation()
  if (HIDE_MINIPLAYER_ROUTES.includes(pathname)) return null
  return <MiniPlayer />
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary] caught:', error.message, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, color: 'red', background: '#111', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <h2>React Error</h2>
          <p>{this.state.error.message}</p>
          <pre>{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <MiniPlayerProvider>
          <Routes>
            <Route path="/" element={<DZHome />} />
            <Route path="/chat" element={<App />} />
            <Route path="/dz-agent" element={<DZAgent />} />
            <Route path="/agent" element={<DZAgentV3 />} />
            <Route path="/quran" element={<AIQuran />} />
            <Route path="/dzchat" element={<DZChat />} />
            <Route path="/dz-tube" element={<DZTube />} />
            <Route path="/dztube" element={<Navigate to="/dz-tube" replace />} />
            <Route path="/aiquran" element={<Navigate to="/quran" replace />} />
            <Route path="/stats" element={<DZStats />} />
            <Route path="/tools" element={<DZTools />} />
            <Route path="/web-builder" element={<DZWebBuilder />} />
            <Route path="/ocr-dz" element={<OCRDZ />} />
            <Route path="/le3ba" element={<DZLe3ba />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ConditionalMiniPlayer />
          <QuickNav />
        </MiniPlayerProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

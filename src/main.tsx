import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import './styles/mini-player.css'
import App from './App.tsx'
import DZAgent from './pages/DZAgent.tsx'
import DZAgentV3 from './pages/DZAgentV3.tsx'
import AIQuran from './pages/AIQuran.tsx'
import DZChat from './pages/DZChat.tsx'
import DZTube from './pages/DZTube.tsx'
import { MiniPlayerProvider } from './context/MiniPlayerContext.tsx'
import MiniPlayer from './components/MiniPlayer.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <MiniPlayerProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/dz-agent" element={<DZAgent />} />
          <Route path="/agent" element={<DZAgentV3 />} />
          <Route path="/quran" element={<AIQuran />} />
          <Route path="/dzchat" element={<DZChat />} />
          <Route path="/dz-tube" element={<DZTube />} />
          <Route path="/dztube" element={<Navigate to="/dz-tube" replace />} />
          <Route path="/aiquran" element={<Navigate to="/quran" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <MiniPlayer />
      </MiniPlayerProvider>
    </BrowserRouter>
  </StrictMode>,
)

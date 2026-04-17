import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import DZAgent from './pages/DZAgent.tsx'
import AIQuran from './pages/AIQuran.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/dz-agent" element={<DZAgent />} />
        <Route path="/quran" element={<AIQuran />} />
        <Route path="/aiquran" element={<Navigate to="/quran" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

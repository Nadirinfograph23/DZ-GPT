import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import DZAgent from './pages/DZAgent.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dz-agent" replace />} />
        <Route path="/dz-agent" element={<DZAgent />} />
        <Route path="*" element={<Navigate to="/dz-agent" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Sparkles } from 'lucide-react'
import DZDashboard from '../components/DZDashboard'
import '../styles/dz-agent.css'

export default function DZAgent() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | null>(null)

  function handleStartChat() {
    let finalName = username.trim()
    if (!finalName) {
      finalName = 'DZ_User_' + Math.floor(Math.random() * 10000)
    }
    const userId = crypto.randomUUID()
    localStorage.setItem('username', finalName)
    localStorage.setItem('userId', userId)
    if (gender) localStorage.setItem('gender', gender)
    navigate('/chat')
  }

  return (
    <div className="dza-page-root">
      {/* ===== HEADER ===== */}
      <header className="dza-page-header">
        <div className="dza-page-logo">
          <div className="dza-page-logo-icon">
            <Bot size={24} />
            <Sparkles size={10} className="dza-page-logo-spark" />
          </div>
          <div className="dza-page-logo-text">
            <span className="dza-page-logo-name">DZ Agent</span>
            <span className="dza-page-logo-sub">BY NADIR HOUAMRIA</span>
          </div>
        </div>
        <button className="dza-page-back-btn" onClick={() => navigate('/')}>
          ← العودة إلى DZ GPT
        </button>
      </header>

      {/* ===== DASHBOARD (weather / prayer / news) ===== */}
      <div className="dza-page-dashboard">
        <DZDashboard onSend={(q) => {
          localStorage.setItem('dz-agent-pending-query', q)
          handleStartChat()
        }} />
      </div>

      {/* ===== CHAT ENTRY CARD ===== */}
      <div className="dza-entry-section">
        <div className="dza-entry-card">
          <h2 className="dza-entry-title">ابدأ المحادثة</h2>
          <p className="dza-entry-desc">اختر اسمك المستعار وابدأ</p>

          <div className="dza-entry-field">
            <input
              type="text"
              className="dza-entry-input"
              placeholder="أدخل اسمك المستعار..."
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={30}
              onKeyDown={e => e.key === 'Enter' && handleStartChat()}
              dir="auto"
              autoFocus
            />
          </div>

          <div className="dza-gender-label">اختر جنسك</div>
          <div className="dza-gender-row">
            <button
              className={`dza-gender-btn ${gender === 'male' ? 'dza-gender-btn--active' : ''}`}
              onClick={() => setGender(gender === 'male' ? null : 'male')}
              type="button"
            >
              <span className="dza-gender-icon">👨</span>
              <span>ذكر</span>
            </button>
            <button
              className={`dza-gender-btn ${gender === 'female' ? 'dza-gender-btn--active' : ''}`}
              onClick={() => setGender(gender === 'female' ? null : 'female')}
              type="button"
            >
              <span className="dza-gender-icon">👩</span>
              <span>أنثى</span>
            </button>
          </div>

          <button className="dza-entry-start-btn" onClick={handleStartChat}>
            ابدأ المحادثة
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Home, MessageSquare, Sparkles } from 'lucide-react'
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
        <div className="dza-page-actions">
          <button className="dza-page-action-btn" onClick={() => navigate('/')}>
            <Home size={14} />
            HOME
          </button>
          <button className="dza-page-action-btn dza-page-action-btn--primary" onClick={handleStartChat}>
            <MessageSquare size={14} />
            AI-DZ CHAT
          </button>
        </div>
      </header>

      <section className="dza-chat-cta">
        <div>
          <span className="dza-chat-cta-kicker">الشات الجماعي</span>
          <h1>AI-DZ CHAT صار في صفحة مستقلة</h1>
          <p>ادخل للشات من الزر، واستخدم الأكواد داخل المحادثة لاستدعاء DZ Agent أو DZ GPT مباشرة.</p>
        </div>
        <button className="dza-chat-cta-btn" onClick={handleStartChat}>
          <MessageSquare size={18} />
          دخول الشات
        </button>
      </section>

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
          <h2 className="dza-entry-title">ملف دخول سريع</h2>
          <p className="dza-entry-desc">اختياري: اختر اسمك ثم ادخل إلى AI-DZ CHAT</p>

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
            دخول AI-DZ CHAT
          </button>
        </div>
      </div>
    </div>
  )
}

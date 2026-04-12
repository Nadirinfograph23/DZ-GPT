import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Sparkles } from 'lucide-react'
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
    <div className="dza-entry-root">
      <div className="dza-entry-card">
        <div className="dza-entry-logo">
          <div className="dza-entry-logo-icon">
            <Bot size={32} />
            <Sparkles size={14} className="dza-entry-spark" />
          </div>
          <div className="dza-entry-logo-text">
            <span className="dza-entry-logo-name">DZ Agent</span>
            <span className="dza-entry-logo-sub">BY NADIR HOUAMRIA</span>
          </div>
        </div>

        <h2 className="dza-entry-title">الدخول للمحادثة</h2>
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

        <button className="dza-entry-back-btn" onClick={() => navigate('/')}>
          ← العودة إلى DZ GPT
        </button>
      </div>
    </div>
  )
}

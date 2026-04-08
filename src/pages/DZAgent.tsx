import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Bot } from 'lucide-react'
import DZChatBox from '../components/DZChatBox'
import '../styles/dz-agent.css'

export default function DZAgent() {
  const navigate = useNavigate()

  return (
    <div className="dz-agent-page">
      {/* Header */}
      <header className="dz-agent-header">
        <button className="dz-back-btn" onClick={() => navigate('/')} title="Back to DZ GPT">
          <ArrowLeft size={18} />
        </button>
        <div className="dz-agent-logo">
          <div className="dz-agent-logo-icon">
            <Bot size={20} />
            <Sparkles size={12} className="dz-agent-logo-spark" />
          </div>
          <div className="dz-agent-logo-text">
            <span className="dz-agent-name">DZ Agent</span>
            <span className="dz-agent-tagline">BY NADIR HOUAMRIA</span>
          </div>
        </div>
        <div className="dz-agent-badge">FREE · AI</div>
      </header>

      {/* Chat area */}
      <div className="dz-agent-body">
        <DZChatBox />
      </div>
    </div>
  )
}

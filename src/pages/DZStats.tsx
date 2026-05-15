import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart2, Zap, Star, Clock, MessageSquare } from 'lucide-react'
import { getTopIntents, getTopFeatures, getRecentQueries } from '../utils/dzMemory'
import type { UserIntent, StoredQuery } from '../utils/dzMemory'
import '../styles/dz-stats.css'

const INTENT_LABELS: Record<UserIntent, string> = {
  coding: '💻 برمجة',
  quran: '📖 قرآن',
  ocr: '🔍 OCR',
  news: '📰 أخبار',
  sports: '⚽ رياضة',
  weather: '🌤️ طقس',
  github: '🐙 GitHub',
  currency: '💱 صرف',
  education: '📚 تعليم',
  general: '💬 عام',
}

const FEATURE_LABELS: Record<string, string> = {
  'web-reader': '🌐 قارئ الويب',
  'website-builder': '🏗️ بناء مواقع',
  'doctor-search': '👨‍⚕️ بحث أطباء',
  'github': '🐙 GitHub',
  'youtube': '▶️ YouTube',
  'ocr': '🔍 OCR',
  'map': '🗺️ الخرائط',
  'education': '📚 التعليم',
}

export default function DZStats() {
  const navigate = useNavigate()
  const [queries, setQueries] = useState<StoredQuery[]>([])
  const [topIntents, setTopIntents] = useState<{ intent: UserIntent; count: number }[]>([])
  const [topFeatures, setTopFeatures] = useState<string[]>([])
  const [conversationCount, setConversationCount] = useState(0)
  const [ratings, setRatings] = useState<{ up: number; down: number }>({ up: 0, down: 0 })
  const [totalTokens, setTotalTokens] = useState(0)

  useEffect(() => {
    const q = getRecentQueries(20)
    setQueries(q)

    const intentsRaw: Record<string, number> = JSON.parse(localStorage.getItem('dza-memory-intents') || '{}')
    const sorted = Object.entries(intentsRaw)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([intent, count]) => ({ intent: intent as UserIntent, count }))
    setTopIntents(sorted)

    setTopFeatures(getTopFeatures(6))

    const ratingsRaw: Record<string, string> = JSON.parse(localStorage.getItem('dz-msg-ratings') || '{}')
    let up = 0, down = 0
    Object.values(ratingsRaw).forEach(v => { if (v === 'up') up++; else down++ })
    setRatings({ up, down })

    const convCount = parseInt(localStorage.getItem('dz-conv-count') || '0', 10)
    setConversationCount(convCount)

    const tokens = parseInt(localStorage.getItem('dz-total-tokens') || '0', 10)
    setTotalTokens(tokens)
  }, [])

  const totalIntentEvents = topIntents.reduce((s, i) => s + i.count, 0)

  const relativeTime = (ts: number) => {
    const diff = (Date.now() - ts) / 1000
    if (diff < 60) return 'الآن'
    if (diff < 3600) return `${Math.floor(diff / 60)} دقيقة`
    if (diff < 86400) return `${Math.floor(diff / 3600)} ساعة`
    return `${Math.floor(diff / 86400)} يوم`
  }

  return (
    <div className="dzs-layout">
      <div className="dzs-header">
        <button className="dzs-back" onClick={() => navigate('/dz-agent')}>
          <ArrowRight size={18} />
        </button>
        <div>
          <div className="dzs-title">📊 إحصاءاتك</div>
          <div className="dzs-subtitle">لمحة شاملة عن استخدامك لـ DZ Agent</div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="dzs-grid">
        <div className="dzs-card dzs-card-accent">
          <span className="dzs-card-icon">💬</span>
          <div className="dzs-card-value">{queries.length}</div>
          <div className="dzs-card-label">طلب مُرسل</div>
        </div>
        <div className="dzs-card">
          <span className="dzs-card-icon">📅</span>
          <div className="dzs-card-value">{conversationCount || Math.max(1, Math.floor(queries.length / 4))}</div>
          <div className="dzs-card-label">محادثة</div>
        </div>
        <div className="dzs-card">
          <span className="dzs-card-icon">👍</span>
          <div className="dzs-card-value" style={{ color: '#22c55e' }}>{ratings.up}</div>
          <div className="dzs-card-label">تقييم إيجابي</div>
        </div>
        <div className="dzs-card">
          <span className="dzs-card-icon">🎯</span>
          <div className="dzs-card-value">{topFeatures.length}</div>
          <div className="dzs-card-label">ميزة مستخدمة</div>
        </div>
      </div>

      {/* Top intents */}
      {topIntents.length > 0 && (
        <div className="dzs-section">
          <div className="dzs-section-title">
            <BarChart2 size={16} />
            المواضيع المفضلة
          </div>
          {topIntents.map(({ intent, count }) => (
            <div key={intent} className="dzs-intent-row">
              <div className="dzs-intent-label">{INTENT_LABELS[intent] || intent}</div>
              <div className="dzs-intent-bar-wrap">
                <div
                  className="dzs-intent-bar"
                  style={{ width: `${totalIntentEvents > 0 ? Math.round((count / topIntents[0].count) * 100) : 0}%` }}
                />
              </div>
              <div className="dzs-intent-count">{count}</div>
            </div>
          ))}
        </div>
      )}

      {/* Top features */}
      {topFeatures.length > 0 && (
        <div className="dzs-section">
          <div className="dzs-section-title">
            <Zap size={16} />
            الميزات الأكثر استخداماً
          </div>
          <div className="dzs-feature-list">
            {topFeatures.map(f => (
              <span key={f} className="dzs-feature-chip">
                {FEATURE_LABELS[f] || f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ratings */}
      {(ratings.up + ratings.down) > 0 && (
        <div className="dzs-section">
          <div className="dzs-section-title">
            <Star size={16} />
            تقييماتك
          </div>
          <div className="dzs-ratings-row">
            <div className="dzs-rating-box dzs-rating-up">
              <div className="dzs-rating-box-val">{ratings.up}</div>
              <div className="dzs-rating-box-lbl">👍 ممتاز</div>
            </div>
            <div className="dzs-rating-box dzs-rating-down">
              <div className="dzs-rating-box-val">{ratings.down}</div>
              <div className="dzs-rating-box-lbl">👎 يحتاج تحسين</div>
            </div>
            <div className="dzs-rating-box">
              <div className="dzs-rating-box-val" style={{ color: '#fbbf24' }}>
                {ratings.up + ratings.down > 0
                  ? Math.round((ratings.up / (ratings.up + ratings.down)) * 100)
                  : 0}%
              </div>
              <div className="dzs-rating-box-lbl">نسبة الرضا</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent queries */}
      {queries.length > 0 ? (
        <div className="dzs-section">
          <div className="dzs-section-title">
            <Clock size={16} />
            آخر طلباتك
          </div>
          {queries.slice(0, 10).map((q, i) => (
            <div key={i} className="dzs-query-item">
              <span className="dzs-query-intent">{INTENT_LABELS[q.intent] || q.intent}</span>
              <span className="dzs-query-text">{q.text.slice(0, 80)}{q.text.length > 80 ? '...' : ''}</span>
              <span className="dzs-query-time">{relativeTime(q.ts)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="dzs-empty">
          <div className="dzs-empty-icon">📊</div>
          <div className="dzs-empty-text">لا توجد إحصاءات بعد — ابدأ محادثة مع DZ Agent</div>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          className="dzs-back"
          style={{ width: 'auto', padding: '8px 18px', borderRadius: 10, gap: 7, display: 'flex', alignItems: 'center', fontSize: 13, color: '#ef4444', borderColor: 'rgba(239,68,68,.3)' }}
          onClick={() => {
            if (confirm('هل تريد مسح كل الإحصاءات؟')) {
              ['dza-memory-queries','dza-memory-intents','dza-memory-features','dz-msg-ratings','dz-conv-count','dz-user-memory'].forEach(k => localStorage.removeItem(k))
              window.location.reload()
            }
          }}
        >
          🗑️ مسح الإحصاءات
        </button>
        <button
          className="dzs-back"
          style={{ width: 'auto', padding: '8px 18px', borderRadius: 10, gap: 7, display: 'flex', alignItems: 'center', fontSize: 13, color: '#c8ff00', borderColor: 'rgba(200,255,0,.3)' }}
          onClick={() => navigate('/dz-agent')}
        >
          <MessageSquare size={14} />
          العودة للوكيل
        </button>
      </div>
    </div>
  )
}

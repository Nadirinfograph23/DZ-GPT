import { useEffect, useRef, useState } from 'react'
import {
  Search, Database, FileText, BookOpen, CheckCircle2,
  Loader2, XCircle, Sparkles,
} from 'lucide-react'
import '../styles/search-steps-panel.css'

export interface SearchPipelineStep {
  step: number
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  detail?: string
}

interface Props {
  query: string
  onDone?: (confidence: number, source: string) => void
}

const STEP_META: Record<number, { label: string; icon: React.ReactNode }> = {
  1: { label: 'إرسال الاستعلام',          icon: <Search size={11} /> },
  2: { label: 'بحث Wikidata + Wikipedia', icon: <Database size={11} /> },
  3: { label: 'اختيار المقالة',           icon: <FileText size={11} /> },
  4: { label: 'استخراج المحتوى',          icon: <BookOpen size={11} /> },
  5: { label: 'الإجابة النهائية',         icon: <CheckCircle2 size={11} /> },
}

function initialSteps(): SearchPipelineStep[] {
  return [1, 2, 3, 4, 5].map(n => ({
    step: n,
    label: STEP_META[n].label,
    status: 'pending',
  }))
}

function fmtDetail(stepNum: number, data: Record<string, unknown> | null, query: string): string {
  if (!data) return ''
  if (stepNum === 1) return String(data.cleaned || data.original || query)
  if (stepNum === 2) {
    const wd = String(data.wikidata || 'لا نتيجة')
    const wp = String(data.wikipedia || 'لا نتيجة')
    return `Wikidata: ${wd.slice(0, 35)} | Wiki: ${wp.slice(0, 30)}`
  }
  if (stepNum === 3) {
    const t = String(data.title || 'لا شيء')
    const c = String(data.confidence || '')
    const s = String(data.source || '')
    return `${t} — ${s} ${c}`
  }
  if (stepNum === 4) {
    return `${data.chars || 0} حرف [${data.source || '?'}]`
  }
  if (stepNum === 5) {
    const t = String(data.title || '')
    return t ? `${t} ✓` : 'جاهزة ✓'
  }
  return ''
}

export default function SearchStepsPanel({ query, onDone }: Props) {
  const [steps, setSteps] = useState<SearchPipelineStep[]>(initialSteps)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [isDone, setIsDone] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!query) return
    setSteps(initialSteps())
    setConfidence(null)
    setSource(null)
    setIsDone(false)

    const url = `/api/dz-agent/search-steps?q=${encodeURIComponent(query)}`
    const es = new EventSource(url)
    esRef.current = es

    setSteps(prev => prev.map(s => s.step === 1 ? { ...s, status: 'running' } : s))

    es.onmessage = (e) => {
      if (e.data === '[DONE]') { es.close(); return }
      try {
        const payload = JSON.parse(e.data)

        if (payload.done) {
          setConfidence(payload.confidence ?? null)
          setSource(payload.source ?? null)
          setIsDone(true)
          setSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })))
          onDone?.(payload.confidence ?? 0, payload.source ?? '')
          es.close()
          return
        }

        if (payload.error) {
          setSteps(prev => prev.map(s =>
            s.status === 'running' ? { ...s, status: 'error' as const } : s
          ))
          es.close()
          return
        }

        const { step: n, data: d } = payload as { step: number; data: Record<string, unknown> | null }
        const detail = fmtDetail(n, d, query)

        setSteps(prev => prev.map(s => {
          if (s.step < n)  return { ...s, status: 'done' as const }
          if (s.step === n) return { ...s, status: 'running' as const, detail }
          return s
        }))
      } catch {}
    }

    es.onerror = () => {
      setSteps(prev => prev.map(s =>
        s.status === 'running' ? { ...s, status: 'error' as const } : s
      ))
      es.close()
    }

    return () => { es.close() }
  }, [query])

  const confClass = confidence === null ? '' : confidence >= 80 ? 'sfp-conf--high' : confidence >= 60 ? 'sfp-conf--med' : 'sfp-conf--low'
  const hasRunning = steps.some(s => s.status === 'running')

  return (
    <div className={`sfp-wrap ${isDone ? 'sfp-wrap--done' : ''}`}>
      <div className="sfp-header">
        <span className="sfp-title">
          <Sparkles size={10} />
          بحث أولاً
        </span>
        {confidence !== null && (
          <span className={`sfp-conf ${confClass}`}>{confidence}% ثقة · {source}</span>
        )}
        {hasRunning && <Loader2 size={11} className="sfp-spin" />}
      </div>

      <div className="sfp-steps">
        {steps.map((step, idx) => (
          <div key={step.step} className={`sfp-row sfp-row--${step.status}`}>
            <div className="sfp-row-left">
              <div className={`sfp-dot sfp-dot--${step.status}`}>
                {step.status === 'running' ? <Loader2 size={10} className="sfp-spin" />
                : step.status === 'done'    ? <CheckCircle2 size={10} />
                : step.status === 'error'   ? <XCircle size={10} />
                : STEP_META[step.step]?.icon}
              </div>
              {idx < steps.length - 1 && (
                <div className={`sfp-line ${step.status !== 'pending' ? 'sfp-line--lit' : ''}`} />
              )}
            </div>
            <div className="sfp-row-body">
              <span className="sfp-row-label">
                <span className="sfp-row-icon">{STEP_META[step.step]?.icon}</span>
                {step.label}
              </span>
              {step.detail && <span className="sfp-row-detail">{step.detail}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

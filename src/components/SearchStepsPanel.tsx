import { useEffect, useRef, useState } from 'react'
import {
  Search, Database, FileText, BookOpen, CheckCircle2,
  Loader2, XCircle, Sparkles, Cloud, Thermometer, Wind,
  BarChart2, Trophy, Activity, CalendarDays, TableProperties,
} from 'lucide-react'
import '../styles/search-steps-panel.css'

// ─── Types ────────────────────────────────────────────────────────────────────
export type SearchPanelMode = 'person' | 'weather' | 'sports'

export interface SearchPipelineStep {
  step: number
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  detail?: string
}

interface StepTemplate {
  label: string
  icon: React.ReactNode
  detail?: string
  delayMs: number
}

interface Props {
  query: string
  mode?: SearchPanelMode
  onDone?: (confidence?: number, source?: string) => void
}

// ─── Step templates per mode ──────────────────────────────────────────────────
const PERSON_META: Record<number, { label: string; icon: React.ReactNode }> = {
  1: { label: 'إرسال الاستعلام',          icon: <Search size={11} /> },
  2: { label: 'بحث Wikidata + Wikipedia', icon: <Database size={11} /> },
  3: { label: 'اختيار المقالة',           icon: <FileText size={11} /> },
  4: { label: 'استخراج المحتوى',          icon: <BookOpen size={11} /> },
  5: { label: 'الإجابة النهائية',         icon: <CheckCircle2 size={11} /> },
}

const WEATHER_STEPS: StepTemplate[] = [
  { label: 'استلام الموقع الجغرافي',   icon: <Search size={11} />,      delayMs: 0   },
  { label: 'استدعاء Open-Meteo API',   icon: <Cloud size={11} />,        delayMs: 500 },
  { label: 'جلب توقعات 7 أيام',        icon: <Thermometer size={11} />,  delayMs: 1100 },
  { label: 'حساب مؤشرات الرياح والرطوبة', icon: <Wind size={11} />,      delayMs: 1700 },
  { label: 'تنسيق الجدول المناخي',     icon: <TableProperties size={11} />, delayMs: 2300 },
]

const SPORTS_STEPS: StepTemplate[] = [
  { label: 'تحليل الاستعلام الرياضي',  icon: <Search size={11} />,       delayMs: 0   },
  { label: 'استدعاء LFP / RSCA API',  icon: <BarChart2 size={11} />,     delayMs: 500 },
  { label: 'جلب نتائج المباريات',       icon: <CalendarDays size={11} />, delayMs: 1100 },
  { label: 'ترتيب الجدول الرياضي',     icon: <Trophy size={11} />,        delayMs: 1700 },
  { label: 'تنسيق الإجابة النهائية',   icon: <Activity size={11} />,      delayMs: 2300 },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fromTemplate(tpl: StepTemplate[]): SearchPipelineStep[] {
  return tpl.map((t, i) => ({ step: i + 1, label: t.label, status: 'pending' }))
}

function fmtPersonDetail(
  stepNum: number,
  data: Record<string, unknown> | null,
  query: string,
): string {
  if (!data) return ''
  if (stepNum === 1) return String(data.cleaned || data.original || query)
  if (stepNum === 2) {
    return `Wikidata: ${String(data.wikidata || 'لا نتيجة').slice(0, 35)} | Wiki: ${String(data.wikipedia || 'لا نتيجة').slice(0, 30)}`
  }
  if (stepNum === 3) return `${String(data.title || 'لا شيء')} — ${String(data.source || '')} ${String(data.confidence || '')}`
  if (stepNum === 4) return `${data.chars || 0} حرف [${data.source || '?'}]`
  if (stepNum === 5) { const t = String(data.title || ''); return t ? `${t} ✓` : 'جاهزة ✓' }
  return ''
}

function titleFor(mode: SearchPanelMode): string {
  if (mode === 'weather') return 'بحث مناخي'
  if (mode === 'sports')  return 'بحث رياضي'
  return 'بحث أولاً'
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SearchStepsPanel({ query, mode = 'person', onDone }: Props) {
  const [steps, setSteps] = useState<SearchPipelineStep[]>(() => {
    if (mode === 'weather') return fromTemplate(WEATHER_STEPS)
    if (mode === 'sports')  return fromTemplate(SPORTS_STEPS)
    return Object.keys(PERSON_META).map(k => ({
      step: +k, label: PERSON_META[+k].label, status: 'pending',
    }))
  })
  const [confidence, setConfidence] = useState<number | null>(null)
  const [source, setSource]         = useState<string | null>(null)
  const [isDone, setIsDone]         = useState(false)
  const esRef     = useRef<EventSource | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // ── Timed simulation (weather / sports) ────────────────────────────────────
  useEffect(() => {
    if (mode === 'person') return

    const tpl = mode === 'weather' ? WEATHER_STEPS : SPORTS_STEPS
    timersRef.current = []

    tpl.forEach((t, i) => {
      const stepN = i + 1
      const tid = setTimeout(() => {
        setSteps(prev => prev.map(s => {
          if (s.step < stepN) return { ...s, status: 'done' as const }
          if (s.step === stepN) return { ...s, status: 'running' as const, detail: t.detail }
          return s
        }))
      }, t.delayMs)
      timersRef.current.push(tid)
    })

    return () => { timersRef.current.forEach(clearTimeout) }
  }, [query, mode])

  // ── SSE mode (person query) ─────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'person' || !query) return
    setSteps(Object.keys(PERSON_META).map(k => ({
      step: +k, label: PERSON_META[+k].label, status: 'pending',
    })))
    setConfidence(null)
    setSource(null)
    setIsDone(false)

    const url = `/api/dz-agent/search-steps?q=${encodeURIComponent(query)}`
    const es  = new EventSource(url)
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
        const detail = fmtPersonDetail(n, d, query)

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
  }, [query, mode])

  // ── Icon lookup ─────────────────────────────────────────────────────────────
  function iconFor(step: number): React.ReactNode {
    if (mode === 'weather') return WEATHER_STEPS[step - 1]?.icon
    if (mode === 'sports')  return SPORTS_STEPS[step - 1]?.icon
    return PERSON_META[step]?.icon
  }

  const confClass   = confidence === null ? '' : confidence >= 80 ? 'sfp-conf--high' : confidence >= 60 ? 'sfp-conf--med' : 'sfp-conf--low'
  const hasRunning  = steps.some(s => s.status === 'running')
  const modeClass   = `sfp-wrap--${mode}`

  return (
    <div className={`sfp-wrap ${modeClass} ${isDone ? 'sfp-wrap--done' : ''}`}>
      <div className="sfp-header">
        <span className="sfp-title">
          {mode === 'weather' ? <Cloud size={10} />
           : mode === 'sports' ? <Trophy size={10} />
           : <Sparkles size={10} />}
          {titleFor(mode)}
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
                : iconFor(step.step)}
              </div>
              {idx < steps.length - 1 && (
                <div className={`sfp-line ${step.status !== 'pending' ? 'sfp-line--lit' : ''}`} />
              )}
            </div>
            <div className="sfp-row-body">
              <span className="sfp-row-label">
                <span className="sfp-row-icon">{iconFor(step.step)}</span>
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

import { useState } from 'react'
import {
  Brain, Wrench, Eye, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronUp, Github, Zap, Clock,
  FileCode, GitBranch, GitPullRequest, FolderOpen,
  FilePlus, Trash2, Info, AlertTriangle,
} from 'lucide-react'

export interface ReActStep {
  type: 'start' | 'thinking' | 'tool_call' | 'observation' | 'done' | 'error' | 'timeout'
  message?: string
  iteration?: number
  tool?: string
  thought?: string
  args?: Record<string, unknown>
  result?: Record<string, unknown>
}

interface Props {
  steps: ReActStep[]
  isLive?: boolean
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  create_repo:        <GitBranch size={12} />,
  list_repos:         <FolderOpen size={12} />,
  list_files:         <FolderOpen size={12} />,
  read_file:          <FileCode size={12} />,
  push_file:          <FilePlus size={12} />,
  push_files_batch:   <FilePlus size={12} />,
  list_branches:      <GitBranch size={12} />,
  create_branch:      <GitBranch size={12} />,
  delete_branch:      <Trash2 size={12} />,
  create_pull_request:<GitPullRequest size={12} />,
  enable_pages:       <Zap size={12} />,
  get_repo_info:      <Info size={12} />,
  get_auth_user:      <Github size={12} />,
}

const TOOL_LABELS: Record<string, string> = {
  create_repo:        'إنشاء مستودع',
  list_repos:         'عرض المستودعات',
  list_files:         'عرض الملفات',
  read_file:          'قراءة ملف',
  push_file:          'رفع ملف',
  push_files_batch:   'رفع ملفات (دفعة)',
  list_branches:      'عرض الفروع',
  create_branch:      'إنشاء فرع',
  delete_branch:      'حذف فرع',
  create_pull_request:'إنشاء Pull Request',
  enable_pages:       'تفعيل GitHub Pages',
  get_repo_info:      'معلومات المستودع',
  get_auth_user:      'هوية المستخدم',
}

function ArgsPreview({ args }: { args: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  const entries = Object.entries(args).filter(([k]) => k !== 'token' && k !== '_login')
  if (!entries.length) return null
  const preview = entries.slice(0, 2).map(([k, v]) =>
    `${k}: ${typeof v === 'string' ? v.slice(0, 40) : JSON.stringify(v).slice(0, 40)}`
  ).join(' · ')

  return (
    <div className="react-args">
      <button className="react-args-toggle" onClick={() => setOpen(o => !o)}>
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        <span>{preview}{entries.length > 2 ? ' …' : ''}</span>
      </button>
      {open && (
        <pre className="react-args-full">
          {JSON.stringify(Object.fromEntries(entries), null, 2)}
        </pre>
      )}
    </div>
  )
}

function ResultPreview({ result }: { result: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  if (!result) return null
  const isError = !!result.error
  const summary = isError
    ? String(result.error).slice(0, 80)
    : result.html_url
      ? String(result.html_url)
      : result.full_name
        ? String(result.full_name)
        : result.commit
          ? `commit: ${result.commit}`
          : result.files_pushed
            ? `${result.files_pushed} ملف مرفوع`
            : result.count !== undefined
              ? `${result.count} عنصر`
              : JSON.stringify(result).slice(0, 80)

  return (
    <div className={`react-result ${isError ? 'react-result--error' : 'react-result--ok'}`}>
      <button className="react-args-toggle" onClick={() => setOpen(o => !o)}>
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        <span className="react-result-summary">{summary}</span>
      </button>
      {open && (
        <pre className="react-args-full">
          {JSON.stringify(result, null, 2).slice(0, 600)}
        </pre>
      )}
    </div>
  )
}

export default function GitHubReActPanel({ steps, isLive = false }: Props) {
  if (!steps || steps.length === 0) return null

  const startStep  = steps.find(s => s.type === 'start')
  const doneStep   = steps.find(s => s.type === 'done')
  const errorStep  = steps.find(s => s.type === 'error' || s.type === 'timeout')
  const toolCalls  = steps.filter(s => s.type === 'tool_call')
  const iterations = steps.filter(s => s.type === 'thinking').length

  const ghUser = startStep?.message?.match(/@([\w-]+)/)?.[1]

  const isComplete = !!doneStep
  const isFailed   = !!errorStep && !isComplete

  const actionSteps: Array<{ call: ReActStep; obs?: ReActStep }> = []
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].type === 'tool_call') {
      const obs = steps[i + 1]?.type === 'observation' ? steps[i + 1] : undefined
      actionSteps.push({ call: steps[i], obs })
    }
  }

  return (
    <div className={`react-panel ${isLive ? 'react-panel--live' : ''} ${isComplete ? 'react-panel--done' : ''} ${isFailed ? 'react-panel--error' : ''}`}>

      {/* Header */}
      <div className="react-header">
        <div className="react-header-left">
          <Github size={13} />
          <span className="react-header-title">GitHub ReAct Agent</span>
          {ghUser && <span className="react-header-user">@{ghUser}</span>}
        </div>
        <div className="react-header-right">
          {isLive && !isComplete && !isFailed && (
            <span className="react-live-badge">
              <Loader2 size={10} className="react-spin" />
              يعمل
            </span>
          )}
          {isComplete && (
            <span className="react-done-badge">
              <CheckCircle2 size={10} />
              اكتمل
            </span>
          )}
          {isFailed && (
            <span className="react-error-badge">
              <XCircle size={10} />
              فشل
            </span>
          )}
          {iterations > 0 && (
            <span className="react-iter-badge">
              <Clock size={10} />
              {iterations} دورة
            </span>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="react-timeline">

        {/* Start row */}
        {startStep && (
          <div className="react-row react-row--start">
            <div className="react-dot react-dot--start">
              <Brain size={11} />
            </div>
            <div className="react-row-body">
              <span className="react-row-label">بدء الوكيل</span>
              {ghUser && <span className="react-row-detail">مرتبط بـ @{ghUser}</span>}
            </div>
          </div>
        )}

        {/* Tool call + observation pairs */}
        {actionSteps.map((pair, idx) => {
          const { call, obs } = pair
          const toolName = call.tool || ''
          const obsOk = obs && !obs.result?.error
          const obsFailed = obs && !!obs.result?.error

          return (
            <div key={idx} className="react-action-group">
              {/* Thought */}
              {call.thought && (
                <div className="react-row react-row--thought">
                  <div className="react-dot react-dot--thought">
                    <Brain size={10} />
                  </div>
                  <div className="react-row-body">
                    <span className="react-thought-text">"{call.thought.slice(0, 120)}"</span>
                  </div>
                </div>
              )}

              {/* Tool call */}
              <div className="react-row react-row--tool">
                <div className="react-dot react-dot--tool">
                  <Wrench size={11} />
                </div>
                <div className="react-row-body">
                  <div className="react-tool-line">
                    <span className="react-tool-icon">{TOOL_ICONS[toolName] || <Wrench size={11} />}</span>
                    <span className="react-tool-name">{TOOL_LABELS[toolName] || toolName}</span>
                    <code className="react-tool-code">{toolName}()</code>
                  </div>
                  {call.args && Object.keys(call.args).filter(k => k !== 'token' && k !== '_login').length > 0 && (
                    <ArgsPreview args={call.args} />
                  )}
                </div>
              </div>

              {/* Observation */}
              {obs && (
                <div className={`react-row react-row--obs ${obsOk ? 'react-row--obs-ok' : ''} ${obsFailed ? 'react-row--obs-err' : ''}`}>
                  <div className={`react-dot react-dot--obs ${obsOk ? 'react-dot--ok' : ''} ${obsFailed ? 'react-dot--err' : ''}`}>
                    {obsOk ? <CheckCircle2 size={10} /> : obsFailed ? <XCircle size={10} /> : <Eye size={10} />}
                  </div>
                  <div className="react-row-body">
                    <span className="react-row-label">
                      {obsOk ? '✅ نجح' : obsFailed ? '❌ فشل' : 'نتيجة'}
                    </span>
                    {obs.result && <ResultPreview result={obs.result} />}
                  </div>
                </div>
              )}

              {/* Loading next obs */}
              {!obs && isLive && (
                <div className="react-row react-row--obs-pending">
                  <div className="react-dot react-dot--pending">
                    <Loader2 size={10} className="react-spin" />
                  </div>
                  <div className="react-row-body">
                    <span className="react-row-label react-row-label--muted">جاري التنفيذ...</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Live thinking indicator */}
        {isLive && !isComplete && !isFailed && toolCalls.length === 0 && (
          <div className="react-row react-row--thinking">
            <div className="react-dot react-dot--thinking">
              <Loader2 size={10} className="react-spin" />
            </div>
            <div className="react-row-body">
              <span className="react-row-label react-row-label--muted">يحلّل الطلب...</span>
              <div className="react-thinking-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {isFailed && (
          <div className="react-row react-row--failed">
            <div className="react-dot react-dot--err">
              <AlertTriangle size={10} />
            </div>
            <div className="react-row-body">
              <span className="react-row-label">{errorStep?.message || 'حدث خطأ'}</span>
            </div>
          </div>
        )}

        {/* Done */}
        {isComplete && (
          <div className="react-row react-row--complete">
            <div className="react-dot react-dot--done">
              <CheckCircle2 size={11} />
            </div>
            <div className="react-row-body">
              <span className="react-row-label react-row-label--done">
                اكتملت المهمة — {toolCalls.length} عملية
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

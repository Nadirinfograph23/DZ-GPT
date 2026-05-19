import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { Download, Upload, Sparkles, Bold, Italic, AlignRight, AlignCenter, AlignLeft, X, ChevronDown } from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────────────────────
const ROWS = 50
const COLS = 10   // A–J
const numToCol = (n: number) => String.fromCharCode(65 + n)
const colToNum = (c: string) => c.toUpperCase().charCodeAt(0) - 65
const cellKey  = (col: number, row: number) => `${numToCol(col)}${row + 1}`

// ── Types ──────────────────────────────────────────────────────────────────────
interface CellData {
  raw: string
  bold?:   boolean
  italic?: boolean
  align?:  'right' | 'center' | 'left'
  bg?:     string
  color?:  string
}

type Cells = Record<string, CellData>

// ── Formula Engine ─────────────────────────────────────────────────────────────
function parseRef(ref: string): { col: number; row: number } | null {
  const m = ref.trim().toUpperCase().match(/^([A-J])(\d+)$/)
  if (!m) return null
  const col = colToNum(m[1])
  const row  = parseInt(m[2]) - 1
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null
  return { col, row }
}

function expandRange(range: string): string[] {
  const [from, to] = range.split(':').map(s => s.trim().toUpperCase())
  if (!to) return [from]
  const r1 = parseRef(from), r2 = parseRef(to)
  if (!r1 || !r2) return [from]
  const refs: string[] = []
  for (let c = Math.min(r1.col, r2.col); c <= Math.max(r1.col, r2.col); c++)
    for (let r = Math.min(r1.row, r2.row); r <= Math.max(r1.row, r2.row); r++)
      refs.push(cellKey(c, r))
  return refs
}

function evaluateCell(key: string, cells: Cells, visited = new Set<string>()): string | number {
  if (visited.has(key)) return '#REF!'
  visited.add(key)
  const cell = cells[key]
  if (!cell || cell.raw === '' || cell.raw === undefined) return ''
  const raw = cell.raw.trim()
  if (!raw.startsWith('=')) {
    const n = Number(raw)
    return isNaN(n) || raw === '' ? raw : n
  }
  try {
    return evalFormula(raw.slice(1), cells, visited)
  } catch {
    return '#ERR!'
  }
}

function getNum(ref: string, cells: Cells, visited: Set<string>): number {
  const v = evaluateCell(ref, cells, new Set(visited))
  return typeof v === 'number' ? v : parseFloat(String(v)) || 0
}

function evalFormula(expr: string, cells: Cells, visited: Set<string>): string | number {
  expr = expr.trim()

  // ── Built-in functions ──────────────────────────────────────────────────────
  const fnMatch = expr.match(/^([A-Z]+)\s*\((.*)?\)$/is)
  if (fnMatch) {
    const fn   = fnMatch[1].toUpperCase()
    const args = splitArgs(fnMatch[2] || '')

    const numericRefs = (argList: string[]): number[] => {
      const nums: number[] = []
      for (const a of argList) {
        const t = a.trim()
        if (t.includes(':')) expandRange(t).forEach(r => nums.push(getNum(r, cells, visited)))
        else if (/^[A-J]\d+$/i.test(t)) nums.push(getNum(t.toUpperCase(), cells, visited))
        else { const n = parseFloat(t); if (!isNaN(n)) nums.push(n) }
      }
      return nums
    }

    const strVal = (a: string): string => {
      const t = a.trim()
      if (/^".*"$/.test(t)) return t.slice(1,-1)
      if (/^[A-J]\d+$/i.test(t)) return String(evaluateCell(t.toUpperCase(), cells, new Set(visited)))
      return t
    }

    switch (fn) {
      case 'SUM':     { const n = numericRefs(args); return n.reduce((a,b)=>a+b, 0) }
      case 'AVERAGE': { const n = numericRefs(args); return n.length ? n.reduce((a,b)=>a+b,0)/n.length : 0 }
      case 'MIN':     { const n = numericRefs(args); return n.length ? Math.min(...n) : 0 }
      case 'MAX':     { const n = numericRefs(args); return n.length ? Math.max(...n) : 0 }
      case 'COUNT':   return numericRefs(args).length
      case 'COUNTA':  {
        let cnt = 0
        for (const a of args) {
          const t = a.trim()
          if (t.includes(':')) cnt += expandRange(t).filter(r => { const v = evaluateCell(r, cells, new Set(visited)); return v !== '' }).length
          else if (/^[A-J]\d+$/i.test(t)) { if (evaluateCell(t.toUpperCase(), cells, new Set(visited)) !== '') cnt++ }
        }
        return cnt
      }
      case 'ABS':     return Math.abs(numericRefs(args)[0] ?? 0)
      case 'ROUND':   {
        const n = numericRefs(args)
        return Math.round((n[0]??0) * Math.pow(10, n[1]??0)) / Math.pow(10, n[1]??0)
      }
      case 'SQRT':    return Math.sqrt(numericRefs(args)[0] ?? 0)
      case 'POWER':   { const n = numericRefs(args); return Math.pow(n[0]??0, n[1]??2) }
      case 'MOD':     { const n = numericRefs(args); return (n[0]??0) % (n[1]??1) }
      case 'INT':     return Math.floor(numericRefs(args)[0] ?? 0)
      case 'CEIL': case 'CEILING': return Math.ceil(numericRefs(args)[0] ?? 0)
      case 'FLOOR':   return Math.floor(numericRefs(args)[0] ?? 0)
      case 'LEN':     return strVal(args[0]??'""').length
      case 'UPPER':   return strVal(args[0]??'""').toUpperCase()
      case 'LOWER':   return strVal(args[0]??'""').toLowerCase()
      case 'TRIM':    return strVal(args[0]??'""').trim()
      case 'LEFT':    { const s = strVal(args[0]??'""'); const n = numericRefs([args[1]??'1'])[0]??1; return s.slice(0, n) }
      case 'RIGHT':   { const s = strVal(args[0]??'""'); const n = numericRefs([args[1]??'1'])[0]??1; return s.slice(-n) }
      case 'MID':     {
        const s = strVal(args[0]??'""')
        const start = (numericRefs([args[1]??'1'])[0]??1) - 1
        const len   = numericRefs([args[2]??'1'])[0]??1
        return s.slice(start, start+len)
      }
      case 'CONCATENATE': case 'CONCAT': return args.map(a=>strVal(a)).join('')
      case 'TODAY':   return new Date().toLocaleDateString('ar-DZ')
      case 'NOW':     return new Date().toLocaleString('ar-DZ')
      case 'YEAR':    return new Date().getFullYear()
      case 'MONTH':   return new Date().getMonth() + 1
      case 'DAY':     return new Date().getDate()
      case 'IF': {
        if (args.length < 2) return '#ERR!'
        const cond = evalCondition(args[0].trim(), cells, visited)
        return cond ? (args[1] ? strOrNum(strVal(args[1]), cells, visited) : '')
                    : (args[2] ? strOrNum(strVal(args[2]), cells, visited) : '')
      }
      case 'AND': return args.every(a => evalCondition(a.trim(), cells, visited)) ? 'TRUE' : 'FALSE'
      case 'OR':  return args.some(a  => evalCondition(a.trim(), cells, visited)) ? 'TRUE' : 'FALSE'
      case 'NOT': return !evalCondition(args[0]?.trim()??'', cells, visited) ? 'TRUE' : 'FALSE'
      case 'IFERROR': {
        try {
          const v = evalFormula(args[0]?.trim()??'', cells, visited)
          if (String(v).startsWith('#')) return strVal(args[1]??'""')
          return v
        } catch { return strVal(args[1]??'""') }
      }
      case 'TEXT': {
        const n = numericRefs(args)[0] ?? 0
        return n.toLocaleString('fr-DZ', { minimumFractionDigits: 2 })
      }
      case 'VALUE': { const n = parseFloat(strVal(args[0]??'""').replace(/[^0-9.-]/g,'')); return isNaN(n)?'#VALUE!':n }
      case 'VLOOKUP': {
        const lookup = strVal(args[0]??'""')
        if (!args[1]?.includes(':')) return '#N/A'
        const refs = expandRange(args[1].trim())
        const colIdx = (numericRefs([args[2]??'1'])[0]??1) - 1
        // Get first column ref col
        const firstColChar = refs[0]?.[0] ?? 'A'
        const baseCol = colToNum(firstColChar)
        // Find matching row
        for (const r of refs) {
          const rp = parseRef(r); if (!rp) continue
          if (rp.col !== baseCol) continue
          const cellVal = String(evaluateCell(r, cells, new Set(visited)))
          if (cellVal === lookup) {
            const targetKey = cellKey(baseCol + colIdx, rp.row)
            return evaluateCell(targetKey, cells, new Set(visited))
          }
        }
        return '#N/A'
      }
      case 'SUMIF': {
        if (args.length < 2) return '#ERR!'
        const rangeRefs = expandRange(args[0].trim())
        const criteria  = strVal(args[1]??'""')
        const sumRefs   = args[2] ? expandRange(args[2].trim()) : rangeRefs
        let total = 0
        rangeRefs.forEach((r, i) => {
          const cv = String(evaluateCell(r, cells, new Set(visited)))
          if (cv === criteria) total += getNum(sumRefs[i]??r, cells, visited)
        })
        return total
      }
      case 'COUNTIF': {
        const rangeRefs2 = expandRange(args[0]?.trim()??'A1')
        const criteria2  = strVal(args[1]??'""')
        return rangeRefs2.filter(r => String(evaluateCell(r, cells, new Set(visited))) === criteria2).length
      }
      default: return `#NAME?`
    }
  }

  // ── Arithmetic with cell refs ───────────────────────────────────────────────
  // Replace cell refs A1, B2 etc.
  let math = expr.replace(/([A-J]\d+)/gi, (ref) => {
    const v = evaluateCell(ref.toUpperCase(), cells, new Set(visited))
    return typeof v === 'number' ? String(v) : `"${v}"`
  })

  // Handle string concat with &
  if (math.includes('&')) {
    return math.split('&').map(p => {
      const t = p.trim()
      if (/^".*"$/.test(t)) return t.slice(1,-1)
      const n = Number(t); return isNaN(n) ? t : n
    }).join('')
  }

  // Safe arithmetic eval (only numbers and operators)
  if (/^[\d\s\+\-\*\/\(\)\.\^%]+$/.test(math)) {
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${math.replace(/\^/g,'**')})`)()
      return typeof result === 'number' ? result : String(result)
    } catch { return '#ERR!' }
  }

  return expr
}

function strOrNum(s: string, cells: Cells, visited: Set<string>): string | number {
  if (/^[A-J]\d+$/i.test(s)) return evaluateCell(s.toUpperCase(), cells, new Set(visited))
  const n = Number(s); return isNaN(n) ? s : n
}

function evalCondition(cond: string, cells: Cells, visited: Set<string>): boolean {
  const opMatch = cond.match(/^(.+?)(>=|<=|<>|!=|>|<|=)(.+)$/)
  if (!opMatch) {
    const v = evalFormula(cond, cells, visited)
    if (v === 'TRUE' || v === true || v === 1) return true
    if (v === 'FALSE'|| v === false|| v === 0 || v === '') return false
    return Boolean(v)
  }
  const [,left,op,right] = opMatch
  const l = evalFormula(left.trim(), cells, visited)
  const r = evalFormula(right.trim(), cells, visited)
  const ln = Number(l), rn = Number(r)
  const useNum = !isNaN(ln) && !isNaN(rn)
  switch (op) {
    case '>=': return useNum ? ln >= rn : String(l) >= String(r)
    case '<=': return useNum ? ln <= rn : String(l) <= String(r)
    case '>':  return useNum ? ln >  rn : String(l) >  String(r)
    case '<':  return useNum ? ln <  rn : String(l) <  String(r)
    case '<>': case '!=': return String(l) !== String(r)
    case '=':  return String(l) === String(r)
    default:   return false
  }
}

function splitArgs(raw: string): string[] {
  const args: string[] = []
  let depth = 0, cur = '', inStr = false
  for (const ch of raw) {
    if (ch === '"') inStr = !inStr
    if (!inStr && ch === '(') depth++
    if (!inStr && ch === ')') depth--
    if (!inStr && depth === 0 && ch === ',') { args.push(cur); cur = '' }
    else cur += ch
  }
  if (cur.trim()) args.push(cur)
  return args
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SpreadsheetTool() {
  const [cells, setCells]           = useState<Cells>({})
  const [selected, setSelected]     = useState<string>('A1')
  const [editing, setEditing]       = useState<string | null>(null)
  const [editVal, setEditVal]       = useState('')
  const [aiOpen, setAiOpen]         = useState(false)
  const [aiQuery, setAiQuery]       = useState('')
  const [aiResult, setAiResult]     = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [fileName, setFileName]     = useState('مصنف-DZ.xlsx')
  const fileRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const getCell = (key: string): CellData => cells[key] || { raw: '' }
  const setCell = (key: string, data: Partial<CellData>) =>
    setCells(prev => ({ ...prev, [key]: { ...getCell(key), ...data } }))

  const displayValue = useCallback((key: string): string => {
    const c = cells[key]
    if (!c || c.raw === '') return ''
    const v = evaluateCell(key, cells)
    if (typeof v === 'number') return isNaN(v) ? String(v) : v.toLocaleString('fr-DZ', { maximumFractionDigits: 6 })
    return String(v)
  }, [cells])

  const selectedCell = getCell(selected)
  const selectedParsed = parseRef(selected)

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const navigate = useCallback((dir: 'up'|'down'|'left'|'right'|'tab', shift = false) => {
    const p = parseRef(selected)
    if (!p) return
    let { col, row } = p
    if (dir === 'up'    || (dir === 'tab' && shift)) row = Math.max(0, row - 1)
    if (dir === 'down')                               row = Math.min(ROWS-1, row + 1)
    if (dir === 'left')                               col = Math.max(0, col - 1)
    if (dir === 'right' || dir === 'tab')             col = Math.min(COLS-1, col + 1)
    setSelected(cellKey(col, row))
    setEditing(null)
  }, [selected])

  const commitEdit = useCallback(() => {
    if (editing) setCell(editing, { raw: editVal })
    setEditing(null)
  }, [editing, editVal])

  const startEdit = (key: string) => {
    setEditing(key)
    setEditVal(getCell(key).raw)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return
    const key = e.key
    if (key === 'Enter' || key === 'F2') { e.preventDefault(); startEdit(selected); return }
    if (key === 'Delete' || key === 'Backspace') { setCell(selected, { raw: '' }); return }
    if (key === 'ArrowUp')    { e.preventDefault(); navigate('up'); return }
    if (key === 'ArrowDown')  { e.preventDefault(); navigate('down'); return }
    if (key === 'ArrowLeft')  { e.preventDefault(); navigate('left'); return }
    if (key === 'ArrowRight') { e.preventDefault(); navigate('right'); return }
    if (key === 'Tab')        { e.preventDefault(); navigate('tab', e.shiftKey); return }
    if (key.length === 1 && !e.ctrlKey && !e.metaKey) { startEdit(selected); setEditVal(key) }
  }

  const handleInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { commitEdit(); navigate('down') }
    if (e.key === 'Escape') { setEditing(null) }
    if (e.key === 'Tab')    { e.preventDefault(); commitEdit(); navigate('tab', e.shiftKey) }
    if (e.key === 'ArrowUp'   && e.ctrlKey) { commitEdit(); navigate('up') }
    if (e.key === 'ArrowDown' && e.ctrlKey) { commitEdit(); navigate('down') }
  }

  // ── Formatting ──────────────────────────────────────────────────────────────
  const toggleFmt = (prop: 'bold' | 'italic') =>
    setCell(selected, { [prop]: !selectedCell[prop] })
  const setAlign = (align: 'right'|'center'|'left') =>
    setCell(selected, { align })

  // ── Import CSV ──────────────────────────────────────────────────────────────
  const importCSV = async (file: File) => {
    const text = await file.text()
    const rows  = text.split('\n').filter(Boolean)
    const newCells: Cells = {}
    rows.forEach((row, ri) => {
      const cols2 = row.split(',')
      cols2.forEach((val, ci) => {
        if (ci >= COLS) return
        const k = cellKey(ci, ri)
        newCells[k] = { raw: val.trim().replace(/^"|"$/g,'') }
      })
    })
    setCells(newCells)
    setFileName(file.name.replace(/\.csv$/i, '.xlsx') || 'مصنف-DZ.xlsx')
  }

  const importXLSX = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const XLSX   = await import('xlsx')
    const wb     = XLSX.read(buffer, { type: 'array' })
    const ws     = wb.Sheets[wb.SheetNames[0]]
    const data   = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
    const newCells: Cells = {}
    data.slice(0, ROWS).forEach((row, ri) => {
      (row as (string|number)[]).slice(0, COLS).forEach((val, ci) => {
        if (val !== undefined && val !== null && val !== '') {
          newCells[cellKey(ci, ri)] = { raw: String(val) }
        }
      })
    })
    setCells(newCells)
    setFileName(file.name)
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows: string[] = []
    for (let r = 0; r < ROWS; r++) {
      const row: string[] = []
      let hasData = false
      for (let c = 0; c < COLS; c++) {
        const k = cellKey(c, r)
        const v = displayValue(k)
        if (v) hasData = true
        row.push(v.includes(',') ? `"${v}"` : v)
      }
      if (hasData) rows.push(row.join(','))
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = fileName.replace(/\.xlsx$/i, '.csv'); a.click()
  }

  const exportXLSX = async () => {
    const XLSX = await import('xlsx')
    const data: (string|number)[][] = []
    for (let r = 0; r < ROWS; r++) {
      const row: (string|number)[] = []
      let hasData = false
      for (let c = 0; c < COLS; c++) {
        const k = cellKey(c, r)
        const v = displayValue(k)
        if (v) hasData = true
        const n = Number(v.replace(/\s/g,'').replace(',',''))
        row.push(isNaN(n) || v === '' ? v : n)
      }
      if (hasData || r < 1) data.push(row)
    }
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, fileName)
  }

  // ── AI Formula Assistant ────────────────────────────────────────────────────
  const askAI = async () => {
    if (!aiQuery.trim()) return
    setAiLoading(true); setAiResult('')
    const prompt = `أنت خبير في دوال Excel وجداول البيانات. 
المستخدم يريد: "${aiQuery}"

قدّم:
1. **الدالة الجاهزة للنسخ** (مثال: =SUM(A1:A10))
2. **شرح مبسط** بالعربية لما تفعله هذه الدالة
3. **مثال عملي** على الاستخدام
4. **دوال بديلة** إن وجدت

قاعدة: الدوال المدعومة: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, AND, OR, ROUND, ABS, SQRT, POWER, MOD, INT, LEN, UPPER, LOWER, TRIM, LEFT, RIGHT, MID, CONCATENATE, TODAY, YEAR, MONTH, DAY, IFERROR, TEXT, VALUE, VLOOKUP, SUMIF, COUNTIF`

    try {
      const res  = await fetch('/api/dz-agent-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], tool: 'excel-assistant' })
      })
      const data = await res.json()
      setAiResult(data.content || 'لم أتمكن من توليد الإجابة.')
    } catch { setAiResult('⚠️ خطأ في الاتصال، حاول مرة أخرى.') }
    setAiLoading(false)
  }

  const insertFormula = (formula: string) => {
    const match = formula.match(/=[\w\(\)\:,\+\-\*\/\.\s"'A-Z]+/i)
    if (match) {
      setCell(selected, { raw: match[0] })
      setAiOpen(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="dzt-xl-wrap" onKeyDown={handleKeyDown} tabIndex={0} ref={gridRef}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="dzt-xl-toolbar">
        <div className="dzt-xl-toolbar-left">
          <button className="dzt-xl-tool-btn" onClick={()=>fileRef.current?.click()} title="استيراد ملف">
            <Upload size={14}/> استيراد
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}}
            onChange={e=>{ const f=e.target.files?.[0]; if(!f) return; f.name.endsWith('.csv')?importCSV(f):importXLSX(f) }} />

          <div className="dzt-xl-divider" />

          <button className="dzt-xl-tool-btn" onClick={exportXLSX} title="تصدير Excel">
            <Download size={14}/> Excel
          </button>
          <button className="dzt-xl-tool-btn" onClick={exportCSV} title="تصدير CSV">
            <Download size={14}/> CSV
          </button>

          <div className="dzt-xl-divider" />

          <button
            className={`dzt-xl-fmt-btn${selectedCell.bold?' active':''}`}
            onClick={()=>toggleFmt('bold')} title="عريض">
            <Bold size={13}/>
          </button>
          <button
            className={`dzt-xl-fmt-btn${selectedCell.italic?' active':''}`}
            onClick={()=>toggleFmt('italic')} title="مائل">
            <Italic size={13}/>
          </button>

          <div className="dzt-xl-divider" />

          <button className={`dzt-xl-fmt-btn${selectedCell.align==='right'?' active':''}`}  onClick={()=>setAlign('right')}><AlignRight  size={13}/></button>
          <button className={`dzt-xl-fmt-btn${selectedCell.align==='center'?' active':''}`} onClick={()=>setAlign('center')}><AlignCenter size={13}/></button>
          <button className={`dzt-xl-fmt-btn${selectedCell.align==='left'?' active':''}`}   onClick={()=>setAlign('left')}><AlignLeft   size={13}/></button>

          <div className="dzt-xl-divider" />

          <label className="dzt-xl-tool-btn" title="لون الخلية" style={{padding:'4px 8px',gap:4}}>
            🎨
            <input type="color" style={{width:22,height:22,border:'none',background:'none',cursor:'pointer',padding:0}}
              value={selectedCell.bg||'#1a1a1a'}
              onChange={e=>setCell(selected,{bg:e.target.value})} />
          </label>
        </div>

        <div className="dzt-xl-toolbar-right">
          <div className="dzt-xl-filename">
            <input className="dzt-xl-filename-input" value={fileName}
              onChange={e=>setFileName(e.target.value)} />
          </div>
          <button
            className={`dzt-xl-ai-btn${aiOpen?' active':''}`}
            onClick={()=>setAiOpen(v=>!v)}>
            <Sparkles size={14}/> مساعد الدوال AI
            <ChevronDown size={12}/>
          </button>
        </div>
      </div>

      {/* ── Formula Bar ─────────────────────────────────────────────────────── */}
      <div className="dzt-xl-formulabar">
        <div className="dzt-xl-cellref">{selected}</div>
        <div className="dzt-xl-fx">ƒx</div>
        <input
          ref={inputRef}
          className="dzt-xl-formula-input"
          value={editing === selected ? editVal : selectedCell.raw}
          placeholder={editing === selected ? '' : 'أدخل قيمة أو دالة (=SUM(A1:A5))...'}
          onFocus={() => startEdit(selected)}
          onChange={e => setEditVal(e.target.value)}
          onKeyDown={handleInputKey}
          onBlur={commitEdit}
        />
      </div>

      {/* ── AI Assistant Panel ───────────────────────────────────────────────── */}
      {aiOpen && (
        <div className="dzt-xl-ai-panel">
          <div className="dzt-xl-ai-header">
            <span><Sparkles size={14}/> مساعد الدوال — اكتب ما تريد بالعربية</span>
            <button onClick={()=>setAiOpen(false)}><X size={14}/></button>
          </div>
          <div className="dzt-xl-ai-body">
            <div className="dzt-xl-ai-quick">
              {['جمع عمود كامل','متوسط القيم','أعلى قيمة','أصغر قيمة','عدّ الخلايا المملوءة',
                'إذا A1 أكبر من 0','ابحث عن قيمة في جدول','جمع مشروط','اليوم تاريخ','ربط نصين'].map(q=>(
                <button key={q} className="dzt-xl-ai-quick-btn" onClick={()=>setAiQuery(q)}>{q}</button>
              ))}
            </div>
            <div className="dzt-xl-ai-input-row">
              <input
                className="dzt-xl-ai-input"
                placeholder="مثال: احسب مجموع المبيعات إذا كانت أكبر من 1000..."
                value={aiQuery}
                onChange={e=>setAiQuery(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&askAI()}
              />
              <button className="dzt-btn" style={{padding:'10px 18px',fontSize:13}} onClick={askAI} disabled={aiLoading}>
                {aiLoading ? '...' : 'اسأل'}
              </button>
            </div>
            {aiResult && (
              <div className="dzt-xl-ai-result">
                <ReactMarkdown>{aiResult}</ReactMarkdown>
                {/* Extract formula and show insert button */}
                {aiResult.match(/=[\w\(\)\:,\+\-\*\/\.\s"'A-Z]+/i) && (
                  <button className="dzt-xl-ai-insert-btn"
                    onClick={()=>insertFormula(aiResult)}>
                    ⬆️ أدخل الدالة في الخلية {selected}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Functions Reference ──────────────────────────────────────────────── */}
      <div className="dzt-xl-fn-chips">
        {['SUM','AVERAGE','IF','VLOOKUP','SUMIF','COUNTIF','MAX','MIN','ROUND','CONCATENATE','TODAY','IFERROR'].map(fn=>(
          <button key={fn} className="dzt-xl-fn-chip"
            onClick={()=>{ setCell(selected,{raw:`=${fn}(`}); startEdit(selected); setEditVal(`=${fn}(`) }}>
            {fn}
          </button>
        ))}
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      <div className="dzt-xl-grid-wrap">
        <table className="dzt-xl-table">
          <thead>
            <tr>
              <th className="dzt-xl-th-corner" />
              {Array.from({length:COLS},(_,i)=>(
                <th key={i} className={`dzt-xl-th-col${selectedParsed?.col===i?' sel':''}`}>
                  {numToCol(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({length:ROWS},(_,ri)=>(
              <tr key={ri}>
                <td className={`dzt-xl-th-row${selectedParsed?.row===ri?' sel':''}`}>{ri+1}</td>
                {Array.from({length:COLS},(_,ci)=>{
                  const k    = cellKey(ci,ri)
                  const cell = getCell(k)
                  const isSel  = selected === k
                  const isEdit = editing === k
                  const val    = displayValue(k)
                  const isErr  = val.startsWith('#')
                  return (
                    <td
                      key={ci}
                      className={`dzt-xl-cell${isSel?' sel':''}${isErr?' err':''}`}
                      style={{
                        background: cell.bg || undefined,
                        fontWeight: cell.bold ? 700 : undefined,
                        fontStyle:  cell.italic ? 'italic' : undefined,
                        textAlign:  cell.align || (typeof evaluateCell(k,cells)==='number'?'left':'right'),
                        color:      isErr ? '#f87171' : cell.color || undefined,
                      }}
                      onClick={()=>{ commitEdit(); setSelected(k) }}
                      onDoubleClick={()=>startEdit(k)}
                    >
                      {isEdit ? (
                        <input
                          ref={inputRef}
                          className="dzt-xl-cell-input"
                          value={editVal}
                          onChange={e=>setEditVal(e.target.value)}
                          onKeyDown={handleInputKey}
                          onBlur={commitEdit}
                          autoFocus
                        />
                      ) : val}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Status Bar ──────────────────────────────────────────────────────── */}
      <div className="dzt-xl-statusbar">
        <span>الخلية: <strong>{selected}</strong></span>
        <span>القيمة: <strong>{displayValue(selected) || '—'}</strong></span>
        <span>الصيغة: <strong style={{color:'#c8ff00'}}>{selectedCell.raw || '—'}</strong></span>
        <span style={{marginRight:'auto'}}>
          {Object.keys(cells).filter(k=>cells[k]?.raw).length} خلية مملوءة
        </span>
        <span>النقر: تحديد | Double: تعديل | Enter/F2: تعديل | Arrows: تنقل | Delete: حذف</span>
      </div>
    </div>
  )
}

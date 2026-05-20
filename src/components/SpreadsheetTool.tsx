import { useState, useRef, useCallback, KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { Download, Upload, Sparkles, Bold, Italic, AlignRight, AlignCenter, AlignLeft, X, ChevronDown, ChevronRight, BarChart2 } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// ── Constants ──────────────────────────────────────────────────────────────────
const ROWS = 100
const COLS = 16  // A–P
const numToCol = (n: number) => String.fromCharCode(65 + n)
const colToNum = (c: string) => c.toUpperCase().charCodeAt(0) - 65
const cellKey  = (col: number, row: number) => `${numToCol(col)}${row + 1}`

// ── Function Categories ────────────────────────────────────────────────────────
const FN_CATEGORIES = [
  {
    id: 'math', label: '🔢 رياضيات', color: '#4ade80',
    fns: [
      { name: 'SUM',        sig: 'SUM(range)',              desc: 'مجموع نطاق من الأرقام' },
      { name: 'PRODUCT',    sig: 'PRODUCT(range)',          desc: 'حاصل ضرب كل الأرقام' },
      { name: 'SUMPRODUCT', sig: 'SUMPRODUCT(r1,r2)',       desc: 'مجموع حواصل الضرب بين نطاقين' },
      { name: 'ABS',        sig: 'ABS(num)',                desc: 'القيمة المطلقة' },
      { name: 'ROUND',      sig: 'ROUND(num,digits)',       desc: 'تقريب لعدد محدد من الخانات' },
      { name: 'ROUNDUP',    sig: 'ROUNDUP(num,digits)',     desc: 'تقريب للأعلى دائماً' },
      { name: 'ROUNDDOWN',  sig: 'ROUNDDOWN(num,digits)',   desc: 'تقريب للأسفل دائماً' },
      { name: 'SQRT',       sig: 'SQRT(num)',               desc: 'الجذر التربيعي' },
      { name: 'POWER',      sig: 'POWER(base,exp)',         desc: 'رفع الأس' },
      { name: 'MOD',        sig: 'MOD(num,divisor)',        desc: 'باقي القسمة' },
      { name: 'INT',        sig: 'INT(num)',                desc: 'تقريب للأسفل لأقرب صحيح' },
      { name: 'TRUNC',      sig: 'TRUNC(num,digits)',       desc: 'اقتطاع الكسر دون تقريب' },
      { name: 'CEILING',    sig: 'CEILING(num)',            desc: 'تقريب للأعلى لأقرب صحيح' },
      { name: 'FLOOR',      sig: 'FLOOR(num)',              desc: 'تقريب للأسفل لأقرب صحيح' },
      { name: 'SIGN',       sig: 'SIGN(num)',               desc: 'إشارة العدد 1، 0، أو -1' },
      { name: 'LOG',        sig: 'LOG(num,base)',           desc: 'لوغاريتم بأساس محدد' },
      { name: 'LOG10',      sig: 'LOG10(num)',              desc: 'لوغاريتم أساس 10' },
      { name: 'LN',         sig: 'LN(num)',                 desc: 'اللوغاريتم الطبيعي (e)' },
      { name: 'EXP',        sig: 'EXP(num)',                desc: 'e مرفوعاً للأس num' },
      { name: 'PI',         sig: 'PI()',                    desc: 'قيمة π = 3.14159...' },
      { name: 'SIN',        sig: 'SIN(angle)',              desc: 'جيب الزاوية (راديان)' },
      { name: 'COS',        sig: 'COS(angle)',              desc: 'جيب التمام (راديان)' },
      { name: 'TAN',        sig: 'TAN(angle)',              desc: 'الظل (راديان)' },
      { name: 'RADIANS',    sig: 'RADIANS(degrees)',        desc: 'تحويل درجات → راديان' },
      { name: 'DEGREES',    sig: 'DEGREES(radians)',        desc: 'تحويل راديان → درجات' },
      { name: 'FACT',       sig: 'FACT(num)',               desc: 'مضروب العدد (factorial)' },
      { name: 'COMBIN',     sig: 'COMBIN(n,k)',             desc: 'عدد التوافيق C(n,k)' },
      { name: 'GCD',        sig: 'GCD(a,b)',                desc: 'القاسم المشترك الأكبر' },
      { name: 'LCM',        sig: 'LCM(a,b)',                desc: 'المضاعف المشترك الأصغر' },
      { name: 'RAND',       sig: 'RAND()',                  desc: 'عدد عشوائي بين 0 و1' },
      { name: 'RANDBETWEEN',sig: 'RANDBETWEEN(min,max)',    desc: 'عدد صحيح عشوائي بين حدين' },
      { name: 'EVEN',       sig: 'EVEN(num)',               desc: 'تقريب لأقرب زوجي' },
      { name: 'ODD',        sig: 'ODD(num)',                desc: 'تقريب لأقرب فردي' },
    ],
  },
  {
    id: 'stats', label: '📊 إحصاء', color: '#60a5fa',
    fns: [
      { name: 'AVERAGE',    sig: 'AVERAGE(range)',          desc: 'المتوسط الحسابي' },
      { name: 'MEDIAN',     sig: 'MEDIAN(range)',           desc: 'الوسيط (القيمة الوسطى)' },
      { name: 'MODE',       sig: 'MODE(range)',             desc: 'المنوال (الأكثر تكراراً)' },
      { name: 'MIN',        sig: 'MIN(range)',              desc: 'أصغر قيمة' },
      { name: 'MAX',        sig: 'MAX(range)',              desc: 'أكبر قيمة' },
      { name: 'COUNT',      sig: 'COUNT(range)',            desc: 'عدد الخلايا الرقمية' },
      { name: 'COUNTA',     sig: 'COUNTA(range)',           desc: 'عدد الخلايا غير الفارغة' },
      { name: 'COUNTBLANK', sig: 'COUNTBLANK(range)',       desc: 'عدد الخلايا الفارغة' },
      { name: 'COUNTIF',    sig: 'COUNTIF(range,criteria)', desc: 'عدد الخلايا المطابقة لشرط' },
      { name: 'COUNTIFS',   sig: 'COUNTIFS(r1,c1,r2,c2)',  desc: 'عدد الخلايا وفق شروط متعددة' },
      { name: 'SUMIF',      sig: 'SUMIF(range,crit,sumR)',  desc: 'مجموع مشروط' },
      { name: 'SUMIFS',     sig: 'SUMIFS(sumR,r1,c1,...)',  desc: 'مجموع وفق شروط متعددة' },
      { name: 'AVERAGEIF',  sig: 'AVERAGEIF(range,crit)',   desc: 'متوسط مشروط' },
      { name: 'AVERAGEIFS', sig: 'AVERAGEIFS(avgR,r1,c1)', desc: 'متوسط وفق شروط متعددة' },
      { name: 'LARGE',      sig: 'LARGE(range,k)',          desc: 'القيمة الكبرى رقم k' },
      { name: 'SMALL',      sig: 'SMALL(range,k)',          desc: 'القيمة الصغرى رقم k' },
      { name: 'RANK',       sig: 'RANK(val,range,order)',   desc: 'ترتيب قيمة داخل نطاق' },
      { name: 'PERCENTILE', sig: 'PERCENTILE(range,k)',     desc: 'المئيني k (0-1)' },
      { name: 'QUARTILE',   sig: 'QUARTILE(range,q)',       desc: 'الربيع q (0-4)' },
      { name: 'STDEV',      sig: 'STDEV(range)',            desc: 'الانحراف المعياري' },
      { name: 'VAR',        sig: 'VAR(range)',              desc: 'التباين الإحصائي' },
    ],
  },
  {
    id: 'text', label: '✍️ نص', color: '#f59e0b',
    fns: [
      { name: 'LEN',         sig: 'LEN(text)',              desc: 'طول النص' },
      { name: 'UPPER',       sig: 'UPPER(text)',            desc: 'تحويل لأحرف كبيرة' },
      { name: 'LOWER',       sig: 'LOWER(text)',            desc: 'تحويل لأحرف صغيرة' },
      { name: 'PROPER',      sig: 'PROPER(text)',           desc: 'تكبير أول حرف من كل كلمة' },
      { name: 'TRIM',        sig: 'TRIM(text)',             desc: 'إزالة المسافات الزائدة' },
      { name: 'LEFT',        sig: 'LEFT(text,n)',           desc: 'n حرف من اليسار' },
      { name: 'RIGHT',       sig: 'RIGHT(text,n)',          desc: 'n حرف من اليمين' },
      { name: 'MID',         sig: 'MID(text,start,len)',    desc: 'استخراج جزء من النص' },
      { name: 'FIND',        sig: 'FIND(find,within)',      desc: 'موضع نص داخل نص (حساس)' },
      { name: 'SEARCH',      sig: 'SEARCH(find,within)',    desc: 'موضع نص داخل نص (غير حساس)' },
      { name: 'REPLACE',     sig: 'REPLACE(txt,start,n,new)', desc: 'استبدال جزء من النص' },
      { name: 'SUBSTITUTE',  sig: 'SUBSTITUTE(txt,old,new)', desc: 'استبدال نص بآخر' },
      { name: 'CONCATENATE', sig: 'CONCATENATE(t1,t2,...)', desc: 'دمج نصوص متعددة' },
      { name: 'TEXTJOIN',    sig: 'TEXTJOIN(delim,skip,r)', desc: 'دمج نطاق بفاصل' },
      { name: 'REPT',        sig: 'REPT(text,n)',           desc: 'تكرار النص n مرة' },
      { name: 'EXACT',       sig: 'EXACT(t1,t2)',           desc: 'مقارنة نصين (حساس للحالة)' },
      { name: 'TEXT',        sig: 'TEXT(num,format)',       desc: 'تحويل رقم لنص منسّق' },
      { name: 'VALUE',       sig: 'VALUE(text)',            desc: 'تحويل نص لرقم' },
      { name: 'CHAR',        sig: 'CHAR(code)',             desc: 'حرف من رمز ASCII' },
      { name: 'CODE',        sig: 'CODE(text)',             desc: 'رمز ASCII لأول حرف' },
    ],
  },
  {
    id: 'logic', label: '⚡ منطق', color: '#a78bfa',
    fns: [
      { name: 'IF',      sig: 'IF(cond,yes,no)',        desc: 'شرط بسيط' },
      { name: 'IFS',     sig: 'IFS(c1,v1,c2,v2,...)',  desc: 'شروط متعددة متتالية' },
      { name: 'AND',     sig: 'AND(c1,c2,...)',         desc: 'صح إذا كل الشروط صحيحة' },
      { name: 'OR',      sig: 'OR(c1,c2,...)',          desc: 'صح إذا شرط واحد صحيح' },
      { name: 'NOT',     sig: 'NOT(condition)',         desc: 'عكس قيمة منطقية' },
      { name: 'XOR',     sig: 'XOR(c1,c2)',            desc: 'صح إذا شرط واحد فقط صحيح' },
      { name: 'IFERROR', sig: 'IFERROR(val,if_error)', desc: 'قيمة بديلة عند الخطأ' },
      { name: 'IFNA',    sig: 'IFNA(val,if_na)',       desc: 'قيمة بديلة عند #N/A' },
      { name: 'SWITCH',  sig: 'SWITCH(expr,v1,r1,...)', desc: 'اختيار حسب قيمة' },
      { name: 'TRUE',    sig: 'TRUE()',                 desc: 'القيمة المنطقية صح' },
      { name: 'FALSE',   sig: 'FALSE()',                desc: 'القيمة المنطقية خطأ' },
    ],
  },
  {
    id: 'date', label: '📅 تاريخ', color: '#34d399',
    fns: [
      { name: 'TODAY',    sig: 'TODAY()',              desc: 'تاريخ اليوم' },
      { name: 'NOW',      sig: 'NOW()',                desc: 'التاريخ والوقت الآن' },
      { name: 'YEAR',     sig: 'YEAR()',               desc: 'السنة الحالية' },
      { name: 'MONTH',    sig: 'MONTH()',              desc: 'الشهر الحالي' },
      { name: 'DAY',      sig: 'DAY()',                desc: 'اليوم الحالي' },
      { name: 'HOUR',     sig: 'HOUR()',               desc: 'الساعة الحالية' },
      { name: 'MINUTE',   sig: 'MINUTE()',             desc: 'الدقيقة الحالية' },
      { name: 'DATE',     sig: 'DATE(y,m,d)',          desc: 'إنشاء تاريخ من مكوناته' },
      { name: 'WEEKDAY',  sig: 'WEEKDAY()',            desc: 'رقم يوم الأسبوع (1=أحد)' },
      { name: 'DAYS360',  sig: 'DAYS360(start,end)',   desc: 'الفرق بالأيام (سنة 360 يوم)' },
    ],
  },
  {
    id: 'lookup', label: '🔍 بحث', color: '#fb923c',
    fns: [
      { name: 'VLOOKUP', sig: 'VLOOKUP(val,range,col)', desc: 'بحث رأسي في جدول' },
      { name: 'HLOOKUP', sig: 'HLOOKUP(val,range,row)', desc: 'بحث أفقي في جدول' },
      { name: 'INDEX',   sig: 'INDEX(range,row,col)',   desc: 'قيمة عند تقاطع صف وعمود' },
      { name: 'MATCH',   sig: 'MATCH(val,range,type)',  desc: 'موضع قيمة في نطاق' },
      { name: 'CHOOSE',  sig: 'CHOOSE(idx,v1,v2,...)',  desc: 'اختيار قيمة من قائمة' },
    ],
  },
  {
    id: 'finance', label: '💰 مالي', color: '#f472b6',
    fns: [
      { name: 'PMT',  sig: 'PMT(rate,nper,pv)',       desc: 'قسط القرض الدوري' },
      { name: 'FV',   sig: 'FV(rate,nper,pmt,pv)',    desc: 'القيمة المستقبلية للاستثمار' },
      { name: 'PV',   sig: 'PV(rate,nper,pmt,fv)',    desc: 'القيمة الحالية للاستثمار' },
      { name: 'NPV',  sig: 'NPV(rate,v1,v2,...)',     desc: 'صافي القيمة الحالية' },
      { name: 'RATE', sig: 'RATE(nper,pmt,pv)',       desc: 'معدل الفائدة الدوري' },
      { name: 'NPER', sig: 'NPER(rate,pmt,pv)',       desc: 'عدد دفعات القرض' },
      { name: 'IPMT', sig: 'IPMT(rate,per,nper,pv)',  desc: 'الفائدة في دفعة محددة' },
      { name: 'PPMT', sig: 'PPMT(rate,per,nper,pv)',  desc: 'أصل القرض في دفعة محددة' },
    ],
  },
]

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
  const m = ref.trim().toUpperCase().match(/^([A-P])(\d+)$/)
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

function strOrNum(s: string, cells: Cells, visited: Set<string>): string | number {
  if (/^[A-P]\d+$/i.test(s)) return evaluateCell(s.toUpperCase(), cells, new Set(visited))
  const n = Number(s); return isNaN(n) ? s : n
}

function evalCondition(cond: string, cells: Cells, visited: Set<string>): boolean {
  const opMatch = cond.match(/^(.+?)(>=|<=|<>|!=|>|<|=)(.+)$/)
  if (!opMatch) {
    const v = evalFormula(cond, cells, visited)
    if (v === 'TRUE' || v === 1) return true
    if (v === 'FALSE' || v === 0 || v === '') return false
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

function matchesCriteria(cellVal: string | number, criteria: string): boolean {
  const c = criteria.trim()
  const opM = c.match(/^(>=|<=|<>|!=|>|<)(.+)$/)
  if (opM) {
    const [,op,val] = opM
    const cv = Number(cellVal), rv = Number(val)
    const useNum = !isNaN(cv) && !isNaN(rv)
    switch (op) {
      case '>=': return useNum ? cv >= rv : String(cellVal) >= val
      case '<=': return useNum ? cv <= rv : String(cellVal) <= val
      case '>':  return useNum ? cv >  rv : String(cellVal) >  val
      case '<':  return useNum ? cv <  rv : String(cellVal) <  val
      case '<>': case '!=': return String(cellVal) !== val
    }
  }
  if (c.includes('*') || c.includes('?')) {
    const pattern = c.replace(/\*/g,'.*').replace(/\?/g,'.')
    return new RegExp(`^${pattern}$`, 'i').test(String(cellVal))
  }
  return String(cellVal) === c
}

// ─ Factorial helper
function factorial(n: number): number {
  if (n < 0) return NaN
  if (n === 0 || n === 1) return 1
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r
}

// ─ GCD helper
function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b))
  while (b) { [a, b] = [b, a % b] }
  return a
}

// ─ Newton-Raphson for RATE
function solveRate(nper: number, pmt: number, pv: number, fv = 0, guess = 0.01): number {
  let r = guess
  for (let i = 0; i < 100; i++) {
    const f = pv * Math.pow(1+r,nper) + pmt*(Math.pow(1+r,nper)-1)/r + fv
    const df = nper*pv*Math.pow(1+r,nper-1) + pmt*(nper*r*Math.pow(1+r,nper-1)*(r) - (Math.pow(1+r,nper)-1))/(r*r)
    const rn = r - f/df
    if (Math.abs(rn - r) < 1e-9) return rn
    r = rn
  }
  return r
}

function evalFormula(expr: string, cells: Cells, visited: Set<string>): string | number {
  expr = expr.trim()

  const fnMatch = expr.match(/^([A-Z_]+)\s*\((.*)?\)$/is)
  if (fnMatch) {
    const fn   = fnMatch[1].toUpperCase()
    const args = splitArgs(fnMatch[2] || '')

    const numericRefs = (argList: string[]): number[] => {
      const nums: number[] = []
      for (const a of argList) {
        const t = a.trim()
        if (t.includes(':')) expandRange(t).forEach(r => { const v = evaluateCell(r, cells, new Set(visited)); if (v !== '') nums.push(typeof v==='number'?v:parseFloat(String(v))||0) })
        else if (/^[A-P]\d+$/i.test(t)) { const v = evaluateCell(t.toUpperCase(), cells, new Set(visited)); if (v !== '') nums.push(typeof v==='number'?v:parseFloat(String(v))||0) }
        else { const n = parseFloat(t); if (!isNaN(n)) nums.push(n) }
      }
      return nums
    }

    const allRefs = (argList: string[]): Array<string|number> => {
      const vals: Array<string|number> = []
      for (const a of argList) {
        const t = a.trim()
        if (t.includes(':')) expandRange(t).forEach(r => vals.push(evaluateCell(r, cells, new Set(visited))))
        else if (/^[A-P]\d+$/i.test(t)) vals.push(evaluateCell(t.toUpperCase(), cells, new Set(visited)))
        else if (/^".*"$/.test(t)) vals.push(t.slice(1,-1))
        else vals.push(t)
      }
      return vals
    }

    const strVal = (a: string): string => {
      const t = a.trim()
      if (/^".*"$/.test(t)) return t.slice(1,-1)
      if (/^[A-P]\d+$/i.test(t)) return String(evaluateCell(t.toUpperCase(), cells, new Set(visited)))
      return t
    }

    const n0 = () => numericRefs(args)
    const s0 = () => strVal(args[0]??'""')

    switch (fn) {
      // ── Math ──
      case 'SUM':        { const n=n0(); return n.reduce((a,b)=>a+b,0) }
      case 'PRODUCT':    { const n=n0(); return n.reduce((a,b)=>a*b,1) }
      case 'SUMPRODUCT': {
        const r1 = expandRange(args[0]?.trim()??'A1').map(r=>getNum(r,cells,visited))
        const r2 = expandRange(args[1]?.trim()??'A1').map(r=>getNum(r,cells,visited))
        return r1.reduce((s,v,i)=>s+v*(r2[i]??0),0)
      }
      case 'ABS':        return Math.abs(numericRefs(args)[0]??0)
      case 'ROUND':      { const n=n0(); return Math.round((n[0]??0)*Math.pow(10,n[1]??0))/Math.pow(10,n[1]??0) }
      case 'ROUNDUP':    { const n=n0(); const f=Math.pow(10,n[1]??0); return Math.ceil((n[0]??0)*f)/f }
      case 'ROUNDDOWN':  { const n=n0(); const f=Math.pow(10,n[1]??0); return Math.floor((n[0]??0)*f)/f }
      case 'TRUNC':      { const n=n0(); const f=Math.pow(10,n[1]??0); return Math.trunc((n[0]??0)*f)/f }
      case 'SQRT':       return Math.sqrt(n0()[0]??0)
      case 'POWER':      { const n=n0(); return Math.pow(n[0]??0,n[1]??2) }
      case 'MOD':        { const n=n0(); return (n[0]??0)%(n[1]??1) }
      case 'INT':        return Math.floor(n0()[0]??0)
      case 'CEIL': case 'CEILING': return Math.ceil(n0()[0]??0)
      case 'FLOOR':      return Math.floor(n0()[0]??0)
      case 'SIGN':       { const v=n0()[0]??0; return v>0?1:v<0?-1:0 }
      case 'LOG':        { const n=n0(); return Math.log(n[0]??1)/Math.log(n[1]??10) }
      case 'LOG10':      return Math.log10(n0()[0]??1)
      case 'LN':         return Math.log(n0()[0]??1)
      case 'EXP':        return Math.exp(n0()[0]??0)
      case 'PI':         return Math.PI
      case 'SIN':        return Math.sin(n0()[0]??0)
      case 'COS':        return Math.cos(n0()[0]??0)
      case 'TAN':        return Math.tan(n0()[0]??0)
      case 'RADIANS':    return (n0()[0]??0)*Math.PI/180
      case 'DEGREES':    return (n0()[0]??0)*180/Math.PI
      case 'FACT':       return factorial(n0()[0]??0)
      case 'COMBIN':     { const n=n0(); const [nn,kk]=[Math.round(n[0]??0),Math.round(n[1]??0)]; return factorial(nn)/(factorial(kk)*factorial(nn-kk)) }
      case 'GCD':        { const n=n0(); return gcd(n[0]??0,n[1]??0) }
      case 'LCM':        { const n=n0(); const [a,b]=[Math.round(n[0]??1),Math.round(n[1]??1)]; return Math.abs(a*b)/gcd(a,b) }
      case 'RAND':       return Math.random()
      case 'RANDBETWEEN':{ const n=n0(); return Math.floor(Math.random()*(((n[1]??1)-(n[0]??0))+1))+(n[0]??0) }
      case 'EVEN':       { const v=n0()[0]??0; const c=Math.ceil(v); return c%2===0?c:c+1 }
      case 'ODD':        { const v=n0()[0]??0; const c=Math.ceil(v); return c%2!==0?c:c+1 }

      // ── Statistics ──
      case 'AVERAGE':    { const n=n0(); return n.length?n.reduce((a,b)=>a+b,0)/n.length:0 }
      case 'MIN':        { const n=n0(); return n.length?Math.min(...n):0 }
      case 'MAX':        { const n=n0(); return n.length?Math.max(...n):0 }
      case 'COUNT':      return n0().length
      case 'COUNTA': {
        let cnt=0
        for (const a of args) {
          const t=a.trim()
          if (t.includes(':')) cnt+=expandRange(t).filter(r=>{ const v=evaluateCell(r,cells,new Set(visited)); return v!=='' }).length
          else if (/^[A-P]\d+$/i.test(t)) { if (evaluateCell(t.toUpperCase(),cells,new Set(visited))!=='') cnt++ }
        }
        return cnt
      }
      case 'COUNTBLANK': {
        let cnt=0
        for (const a of args) {
          const t=a.trim()
          if (t.includes(':')) cnt+=expandRange(t).filter(r=>evaluateCell(r,cells,new Set(visited))==='').length
        }
        return cnt
      }
      case 'MEDIAN': {
        const n=n0().sort((a,b)=>a-b)
        const mid=Math.floor(n.length/2)
        return n.length%2?n[mid]??0:((n[mid-1]??0)+(n[mid]??0))/2
      }
      case 'MODE': {
        const n=n0(); if (!n.length) return '#N/A'
        const freq: Record<number,number>={}; let maxF=0,mode=n[0]??0
        for (const v of n) { freq[v]=(freq[v]??0)+1; if (freq[v]>maxF){maxF=freq[v];mode=v} }
        return mode
      }
      case 'STDEV': {
        const n=n0(); if (n.length<2) return 0
        const avg=n.reduce((a,b)=>a+b,0)/n.length
        return Math.sqrt(n.reduce((s,v)=>s+Math.pow(v-avg,2),0)/(n.length-1))
      }
      case 'VAR': {
        const n=n0(); if (n.length<2) return 0
        const avg=n.reduce((a,b)=>a+b,0)/n.length
        return n.reduce((s,v)=>s+Math.pow(v-avg,2),0)/(n.length-1)
      }
      case 'LARGE': { const n=n0().sort((a,b)=>b-a); const k=Math.round(numericRefs([args[1]??'1'])[0]??1)-1; return n[k]??'#NUM!' }
      case 'SMALL': { const n=n0().sort((a,b)=>a-b); const k=Math.round(numericRefs([args[1]??'1'])[0]??1)-1; return n[k]??'#NUM!' }
      case 'RANK': {
        const val=numericRefs([args[0]??'0'])[0]??0
        const rng=expandRange(args[1]?.trim()??'A1').map(r=>getNum(r,cells,visited))
        const order=numericRefs([args[2]??'0'])[0]??0
        const sorted=[...rng].sort((a,b)=>order?a-b:b-a)
        return sorted.indexOf(val)+1
      }
      case 'PERCENTILE': {
        const n=n0().sort((a,b)=>a-b); const k=numericRefs([args[1]??'0.5'])[0]??0.5
        const idx=k*(n.length-1); const lo=Math.floor(idx)
        return (n[lo]??0)+((n[lo+1]??0)-(n[lo]??0))*(idx-lo)
      }
      case 'QUARTILE': {
        const q=numericRefs([args[1]??'2'])[0]??2
        return evalFormula(`PERCENTILE(${args[0]},${q/4})`,cells,visited)
      }
      case 'COUNTIF': {
        const rangeRefs=expandRange(args[0]?.trim()??'A1')
        const criteria=strVal(args[1]??'""')
        return rangeRefs.filter(r=>matchesCriteria(evaluateCell(r,cells,new Set(visited)),criteria)).length
      }
      case 'COUNTIFS': {
        if (args.length<2) return '#ERR!'
        const baseRefs=expandRange(args[0]?.trim()??'A1')
        let count=baseRefs.length
        for (let i=0;i<args.length;i+=2) {
          const rr=expandRange(args[i]?.trim()??'A1')
          const cr=strVal(args[i+1]??'""')
          count=rr.filter((_,idx)=>{
            const matched=baseRefs.slice(0,count)
            return idx<matched.length && matchesCriteria(evaluateCell(rr[idx]??'A1',cells,new Set(visited)),cr)
          }).length
        }
        return count
      }
      case 'SUMIF': {
        if (args.length<2) return '#ERR!'
        const rangeRefs=expandRange(args[0].trim())
        const criteria=strVal(args[1]??'""')
        const sumRefs=args[2]?expandRange(args[2].trim()):rangeRefs
        let total=0
        rangeRefs.forEach((r,i)=>{
          if (matchesCriteria(evaluateCell(r,cells,new Set(visited)),criteria))
            total+=getNum(sumRefs[i]??r,cells,visited)
        })
        return total
      }
      case 'SUMIFS': {
        if (args.length<3) return '#ERR!'
        const sumRange=expandRange(args[0].trim())
        let result=0
        sumRange.forEach((sr,idx)=>{
          let match=true
          for (let i=1;i<args.length;i+=2) {
            const cr=expandRange(args[i]?.trim()??'A1')
            const crit=strVal(args[i+1]??'""')
            if (!matchesCriteria(evaluateCell(cr[idx]??sr,cells,new Set(visited)),crit)){ match=false;break }
          }
          if (match) result+=getNum(sr,cells,visited)
        })
        return result
      }
      case 'AVERAGEIF': {
        const rr=expandRange(args[0]?.trim()??'A1')
        const cr=strVal(args[1]??'""')
        const ar=args[2]?expandRange(args[2].trim()):rr
        const nums:number[]=[]; rr.forEach((r,i)=>{ if(matchesCriteria(evaluateCell(r,cells,new Set(visited)),cr)) nums.push(getNum(ar[i]??r,cells,visited)) })
        return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:'#DIV/0!'
      }
      case 'AVERAGEIFS': {
        const ar2=expandRange(args[0]?.trim()??'A1')
        const nums2:number[]=[]; ar2.forEach((sr,idx)=>{ let ok=true; for(let i=1;i<args.length;i+=2){ const cr=expandRange(args[i]?.trim()??'A1'); if(!matchesCriteria(evaluateCell(cr[idx]??sr,cells,new Set(visited)),strVal(args[i+1]??'""'))){ok=false;break} } if(ok)nums2.push(getNum(sr,cells,visited)) })
        return nums2.length?nums2.reduce((a,b)=>a+b,0)/nums2.length:'#DIV/0!'
      }

      // ── Text ──
      case 'LEN':     return s0().length
      case 'UPPER':   return s0().toUpperCase()
      case 'LOWER':   return s0().toLowerCase()
      case 'PROPER':  return s0().replace(/\b\w/g,c=>c.toUpperCase())
      case 'TRIM':    return s0().trim()
      case 'LEFT':    { const s=s0(); const n=numericRefs([args[1]??'1'])[0]??1; return s.slice(0,n) }
      case 'RIGHT':   { const s=s0(); const n=numericRefs([args[1]??'1'])[0]??1; return s.slice(-n) }
      case 'MID':     { const s=s0(); const start=(numericRefs([args[1]??'1'])[0]??1)-1; const len=numericRefs([args[2]??'1'])[0]??1; return s.slice(start,start+len) }
      case 'FIND':    { const needle=strVal(args[0]??'""'); const haystack=strVal(args[1]??'""'); const pos=haystack.indexOf(needle); return pos===-1?'#VALUE!':pos+1 }
      case 'SEARCH':  { const needle=strVal(args[0]??'""'); const haystack=strVal(args[1]??'""'); const pos=haystack.toLowerCase().indexOf(needle.toLowerCase()); return pos===-1?'#VALUE!':pos+1 }
      case 'REPLACE': { const s=strVal(args[0]??'""'); const start=(numericRefs([args[1]??'1'])[0]??1)-1; const len=numericRefs([args[2]??'0'])[0]??0; const rep=strVal(args[3]??'""'); return s.slice(0,start)+rep+s.slice(start+len) }
      case 'SUBSTITUTE': { const s=strVal(args[0]??'""'); const old2=strVal(args[1]??'""'); const n=strVal(args[2]??'""'); return s.split(old2).join(n) }
      case 'REPT':    { const s=s0(); const n=numericRefs([args[1]??'0'])[0]??0; return s.repeat(n) }
      case 'EXACT':   return strVal(args[0]??'""')===strVal(args[1]??'""')?'TRUE':'FALSE'
      case 'CONCATENATE': case 'CONCAT': return args.map(a=>strVal(a)).join('')
      case 'TEXTJOIN': {
        const delim=strVal(args[0]??'","')
        const skip=strVal(args[1]??'TRUE')!=='FALSE'
        const parts=allRefs(args.slice(2)).map(String)
        return (skip?parts.filter(p=>p!==''):parts).join(delim)
      }
      case 'TEXT': { const n2=numericRefs(args)[0]??0; return n2.toLocaleString('fr-DZ',{minimumFractionDigits:2}) }
      case 'VALUE': { const n3=parseFloat(strVal(args[0]??'""').replace(/[^0-9.-]/g,'')); return isNaN(n3)?'#VALUE!':n3 }
      case 'CHAR':  return String.fromCharCode(Math.round(numericRefs(args)[0]??65))
      case 'CODE':  { const s2=s0(); return s2.length?s2.charCodeAt(0):'#VALUE!' }

      // ── Logic ──
      case 'IF': {
        if (args.length<2) return '#ERR!'
        const cond=evalCondition(args[0].trim(),cells,visited)
        return cond?(args[1]?strOrNum(strVal(args[1]),cells,visited):''):(args[2]?strOrNum(strVal(args[2]),cells,visited):'')
      }
      case 'IFS': {
        for (let i=0;i<args.length-1;i+=2) {
          if (evalCondition(args[i].trim(),cells,visited)) return strOrNum(strVal(args[i+1]??'""'),cells,visited)
        }
        return '#N/A'
      }
      case 'SWITCH': {
        const val2=evalFormula(args[0]?.trim()??'',cells,visited)
        for (let i=1;i<args.length-1;i+=2) {
          if (String(val2)===strVal(args[i])) return strOrNum(strVal(args[i+1]??'""'),cells,visited)
        }
        return args.length%2===0?strOrNum(strVal(args[args.length-1]??'""'),cells,visited):'#N/A'
      }
      case 'AND': return args.every(a=>evalCondition(a.trim(),cells,visited))?'TRUE':'FALSE'
      case 'OR':  return args.some(a=>evalCondition(a.trim(),cells,visited))?'TRUE':'FALSE'
      case 'NOT': return !evalCondition(args[0]?.trim()??'',cells,visited)?'TRUE':'FALSE'
      case 'XOR': { const truths=args.filter(a=>evalCondition(a.trim(),cells,visited)); return truths.length%2===1?'TRUE':'FALSE' }
      case 'TRUE':  return 'TRUE'
      case 'FALSE': return 'FALSE'
      case 'IFERROR': {
        try {
          const v=evalFormula(args[0]?.trim()??'',cells,visited)
          if (String(v).startsWith('#')) return strVal(args[1]??'""')
          return v
        } catch { return strVal(args[1]??'""') }
      }
      case 'IFNA': {
        const v2=evalFormula(args[0]?.trim()??'',cells,visited)
        return String(v2)==='#N/A'?strOrNum(strVal(args[1]??'""'),cells,visited):v2
      }

      // ── Date ──
      case 'TODAY':   return new Date().toLocaleDateString('ar-DZ')
      case 'NOW':     return new Date().toLocaleString('ar-DZ')
      case 'YEAR':    return new Date().getFullYear()
      case 'MONTH':   return new Date().getMonth()+1
      case 'DAY':     return new Date().getDate()
      case 'HOUR':    return new Date().getHours()
      case 'MINUTE':  return new Date().getMinutes()
      case 'DATE':    { const n4=n0(); return `${n4[0]??2024}-${String(n4[1]??1).padStart(2,'0')}-${String(n4[2]??1).padStart(2,'0')}` }
      case 'WEEKDAY': return new Date().getDay()+1
      case 'DAYS360': { const n5=n0(); return Math.round(n5[1]??0)-(Math.round(n5[0]??0)) }

      // ── Lookup ──
      case 'VLOOKUP': {
        const lookup=strVal(args[0]??'""')
        if (!args[1]?.includes(':')) return '#N/A'
        const refs=expandRange(args[1].trim())
        const colIdx=(numericRefs([args[2]??'1'])[0]??1)-1
        const firstColChar=refs[0]?.[0]??'A'
        const baseCol=colToNum(firstColChar)
        for (const r of refs) {
          const rp=parseRef(r); if(!rp) continue
          if (rp.col!==baseCol) continue
          const cellVal=String(evaluateCell(r,cells,new Set(visited)))
          if (cellVal===lookup) return evaluateCell(cellKey(baseCol+colIdx,rp.row),cells,new Set(visited))
        }
        return '#N/A'
      }
      case 'HLOOKUP': {
        const lookup=strVal(args[0]??'""')
        if (!args[1]?.includes(':')) return '#N/A'
        const refs=expandRange(args[1].trim())
        const rowIdx=(numericRefs([args[2]??'1'])[0]??1)-1
        const firstRef=parseRef(refs[0]??'A1'); if(!firstRef) return '#N/A'
        const baseRow=firstRef.row
        for (const r of refs) {
          const rp=parseRef(r); if(!rp) continue
          if (rp.row!==baseRow) continue
          if (String(evaluateCell(r,cells,new Set(visited)))===lookup)
            return evaluateCell(cellKey(rp.col,baseRow+rowIdx),cells,new Set(visited))
        }
        return '#N/A'
      }
      case 'INDEX': {
        const rng=expandRange(args[0]?.trim()??'A1')
        const rowN=(numericRefs([args[1]??'1'])[0]??1)-1
        const colN=(numericRefs([args[2]??'1'])[0]??1)-1
        const firstR=parseRef(rng[0]??'A1'); if(!firstR) return '#REF!'
        return evaluateCell(cellKey(firstR.col+colN,firstR.row+rowN),cells,new Set(visited))
      }
      case 'MATCH': {
        const val3=strVal(args[0]??'""')
        const rng2=expandRange(args[1]?.trim()??'A1')
        for (let i=0;i<rng2.length;i++) {
          if (String(evaluateCell(rng2[i]??'A1',cells,new Set(visited)))===val3) return i+1
        }
        return '#N/A'
      }
      case 'CHOOSE': {
        const idx=Math.round(numericRefs([args[0]??'1'])[0]??1)-1
        return idx>=0&&idx<args.length-1?strOrNum(strVal(args[idx+1]??'""'),cells,visited):'#VALUE!'
      }

      // ── Financial ──
      case 'PMT': {
        const [rate,nper,pv]=n0()
        if (!rate||!nper) return '#NUM!'
        return (rate*(pv??0)*Math.pow(1+rate,nper))/(Math.pow(1+rate,nper)-1)*-1
      }
      case 'FV': {
        const [rate,nper,pmt2,pv2=0]=n0()
        if (rate===undefined||nper===undefined||pmt2===undefined) return '#NUM!'
        return -((pv2)*Math.pow(1+rate,nper)+pmt2*((Math.pow(1+rate,nper)-1)/rate))
      }
      case 'PV': {
        const [rate,nper,pmt3,fv2=0]=n0()
        if (rate===undefined||nper===undefined||pmt3===undefined) return '#NUM!'
        return -(pmt3*((1-Math.pow(1+rate,-nper))/rate)+fv2*Math.pow(1+rate,-nper))
      }
      case 'NPV': {
        const [rate,...vals]=n0()
        return vals.reduce((acc,v,i)=>acc+v/Math.pow(1+(rate??0.1),i+1),0)
      }
      case 'RATE': {
        const [nper,pmt4,pv3]=n0()
        if (!nper||!pmt4||!pv3) return '#NUM!'
        return solveRate(nper,pmt4,pv3)
      }
      case 'NPER': {
        const [rate,pmt5,pv4]=n0()
        if (!rate||!pmt5||!pv4) return '#NUM!'
        return Math.log(pmt5/(pmt5+(pv4??0)*rate))/Math.log(1+rate)
      }
      case 'IPMT': {
        const [rate,per,nper,pv5]=n0()
        if (!rate||!per||!nper||!pv5) return '#NUM!'
        const pmt6=-(rate*pv5*Math.pow(1+rate,nper))/(Math.pow(1+rate,nper)-1)
        return -(pv5*Math.pow(1+rate,per-1)*rate+pmt6*(Math.pow(1+rate,per-1)-1))
      }
      case 'PPMT': {
        const [rate,per,nper,pv6]=n0()
        if (!rate||!per||!nper||!pv6) return '#NUM!'
        const totalPmt=-(rate*pv6*Math.pow(1+rate,nper))/(Math.pow(1+rate,nper)-1)
        const ipmt=-(pv6*Math.pow(1+rate,per-1)*rate+totalPmt*(Math.pow(1+rate,per-1)-1))
        return totalPmt-ipmt
      }

      default: return `#NAME?`
    }
  }

  // ── Arithmetic with cell refs ───────────────────────────────────────────────
  let math = expr.replace(/([A-P]\d+)/gi, (ref) => {
    const v = evaluateCell(ref.toUpperCase(), cells, new Set(visited))
    return typeof v === 'number' ? String(v) : `"${v}"`
  })

  if (math.includes('&')) {
    return math.split('&').map(p => {
      const t = p.trim()
      if (/^".*"$/.test(t)) return t.slice(1,-1)
      const n = Number(t); return isNaN(n) ? t : n
    }).join('')
  }

  if (/^[\d\s\+\-\*\/\(\)\.\^%]+$/.test(math)) {
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${math.replace(/\^/g,'**')})`)()
      return typeof result === 'number' ? result : String(result)
    } catch { return '#ERR!' }
  }

  return expr
}

// ── AI Quick Prompts by Category ───────────────────────────────────────────────
const AI_QUICK = [
  { label: '📊 مجموع عمود',      q: 'جمع كل القيم في عمود A من A1 إلى A20' },
  { label: '📈 متوسط نطاق',      q: 'حساب متوسط القيم في B1:B10' },
  { label: '🔍 بحث في جدول',     q: 'ابحث عن اسم في العمود A وأرجع القيمة المقابلة من B' },
  { label: '💰 قسط القرض',       q: 'احسب قسط قرض شهري بمعدل 8% سنوياً لمدة 5 سنوات' },
  { label: '📉 أكبر قيمة',       q: 'إيجاد أكبر 3 قيم في نطاق' },
  { label: '🎯 شرط متعدد',       q: 'IF متداخل: إذا A1>90 ممتاز، >70 جيد، غير ذلك مقبول' },
  { label: '📅 فرق التاريخ',     q: 'حساب عدد الأيام بين تاريخين' },
  { label: '🔢 انحراف معياري',   q: 'حساب الانحراف المعياري لمجموعة أرقام' },
  { label: '💸 مجموع مشروط',     q: 'مجموع المبيعات التي تزيد عن 1000' },
  { label: '📋 دمج نصوص',       q: 'دمج الاسم الأول والأخير مع مسافة بينهما' },
  { label: '📐 إحصاء مشروط',    q: 'عد الخلايا التي تحتوي على كلمة "نجح"' },
  { label: '🏦 قيمة مستقبلية',   q: 'القيمة المستقبلية لاستثمار 100000 بفائدة 6% لـ 10 سنوات' },
]

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SpreadsheetTool() {
  const [cells, setCells]               = useState<Cells>({})
  const [selected, setSelected]         = useState<string>('A1')
  const [editing, setEditing]           = useState<string | null>(null)
  const [editVal, setEditVal]           = useState('')
  const [aiOpen, setAiOpen]             = useState(false)
  const [aiQuery, setAiQuery]           = useState('')
  const [aiResult, setAiResult]         = useState('')
  const [aiLoading, setAiLoading]       = useState(false)
  const [fileName, setFileName]         = useState('مصنف-DZ.xlsx')
  const [activeCat, setActiveCat]       = useState<string | null>(null)
  const [fnRefOpen, setFnRefOpen]       = useState(false)
  const [fxOpen, setFxOpen]             = useState(false)
  const [canUndo, setCanUndo]           = useState(false)
  const [canRedo, setCanRedo]           = useState(false)
  const historyRef                       = useRef<Cells[]>([{}])
  const histIdxRef                       = useRef(0)
  const [chartOpen, setChartOpen]       = useState(false)
  const [chartRange, setChartRange]     = useState('A1:B10')
  const [chartType, setChartType]       = useState<'bar'|'line'|'area'|'pie'|'radar'>('bar')
  const [chartTitle, setChartTitle]     = useState('')
  const [chartScheme, setChartScheme]   = useState<'dz'|'blue'|'warm'|'purple'>('dz')
  const [chartBuilt, setChartBuilt]     = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const getCell = (key: string): CellData => cells[key] || { raw: '' }
  const setCell = (key: string, data: Partial<CellData>) => {
    setCells(prev => {
      const next = { ...prev, [key]: { ...(prev[key] || { raw: '' }), ...data } }
      const h = historyRef.current.slice(0, histIdxRef.current + 1)
      h.push(next)
      historyRef.current = h.length > 60 ? h.slice(-60) : h
      histIdxRef.current = historyRef.current.length - 1
      return next
    })
    setCanUndo(true)
    setCanRedo(false)
  }

  const undo = () => {
    if (histIdxRef.current <= 0) return
    histIdxRef.current--
    setCells(historyRef.current[histIdxRef.current])
    setCanUndo(histIdxRef.current > 0)
    setCanRedo(true)
  }

  const redo = () => {
    if (histIdxRef.current >= historyRef.current.length - 1) return
    histIdxRef.current++
    setCells(historyRef.current[histIdxRef.current])
    setCanUndo(true)
    setCanRedo(histIdxRef.current < historyRef.current.length - 1)
  }

  const displayValue = useCallback((key: string): string => {
    const c = cells[key]
    if (!c || c.raw === '') return ''
    const v = evaluateCell(key, cells)
    if (typeof v === 'number') return isNaN(v) ? '#NUM!' : v.toLocaleString('fr-DZ', { maximumFractionDigits: 6 })
    return String(v)
  }, [cells])

  const selectedCell   = getCell(selected)
  const selectedParsed = parseRef(selected)

  // ── Status bar aggregates ──────────────────────────────────────────────────
  const statusNums = Object.keys(cells)
    .filter(k => cells[k]?.raw)
    .map(k => evaluateCell(k, cells))
    .filter(v => typeof v === 'number') as number[]

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (e.key === 'ArrowUp'    && e.ctrlKey) { commitEdit(); navigate('up') }
    if (e.key === 'ArrowDown'  && e.ctrlKey) { commitEdit(); navigate('down') }
  }

  // ── Formatting ──────────────────────────────────────────────────────────────
  const toggleFmt = (prop: 'bold' | 'italic') => setCell(selected, { [prop]: !selectedCell[prop] })
  const setAlign  = (align: 'right'|'center'|'left') => setCell(selected, { align })

  // ── Import ──────────────────────────────────────────────────────────────────
  const importCSV = async (file: File) => {
    const text = await file.text()
    const rows  = text.split('\n').filter(Boolean)
    const newCells: Cells = {}
    rows.forEach((row, ri) => {
      row.split(',').forEach((val, ci) => {
        if (ci >= COLS) return
        newCells[cellKey(ci, ri)] = { raw: val.trim().replace(/^"|"$/g,'') }
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
        if (val !== undefined && val !== null && val !== '')
          newCells[cellKey(ci, ri)] = { raw: String(val) }
      })
    })
    setCells(newCells)
    setFileName(file.name)
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows: string[] = []
    for (let r = 0; r < ROWS; r++) {
      const row: string[] = []; let hasData = false
      for (let c = 0; c < COLS; c++) {
        const k = cellKey(c, r); const v = displayValue(k)
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
      const row: (string|number)[] = []; let hasData = false
      for (let c = 0; c < COLS; c++) {
        const k = cellKey(c, r); const v = displayValue(k)
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

    const allFnNames = FN_CATEGORIES.flatMap(c => c.fns.map(f => f.name)).join(', ')
    const prompt = `أنت خبير متقدم في دوال Excel وجداول البيانات يساعد مستخدمين جزائريين.
المستخدم يريد: "${aiQuery}"

الجدول الحالي: يحتوي على ${Object.keys(cells).filter(k=>cells[k]?.raw).length} خلية مملوءة.
الخلية المحددة: ${selected}

قدّم إجابة منظمة تشمل:
1. **الدالة الجاهزة** (مثال: =SUM(A1:A10)) — ابدأ مباشرة بعلامة =
2. **شرح مبسط** بالعربية لما تفعله
3. **مثال عملي** بالجزائري: مثال بأرقام حقيقية
4. **دوال بديلة أو مكملة** إن وجدت

الدوال المدعومة (${allFnNames})

ملاحظة: الخلايا من A1 إلى P100، استخدم نطاقات منطقية مثل A1:A20.
قدّم الدوال المالية بالدينار الجزائري (DA) دائماً.`

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
    const match = formula.match(/=[\w\(\)\:,\+\-\*\/\.\s"'A-Z0-9]+/i)
    if (match) { setCell(selected, { raw: match[0] }); setAiOpen(false) }
  }

  const clickFn = (fnName: string) => {
    const formula = `=${fnName}(`
    setCell(selected, { raw: formula })
    startEdit(selected)
    setEditVal(formula)
    setFxOpen(false)
  }

  // ── Chart helpers ────────────────────────────────────────────────────────────
  const COLOR_SCHEMES: Record<string, string[]> = {
    dz:     ['#c8ff00','#4ade80','#22c55e','#86efac','#bbf7d0','#a3e635'],
    blue:   ['#60a5fa','#3b82f6','#93c5fd','#1d4ed8','#bfdbfe','#2563eb'],
    warm:   ['#fb923c','#f59e0b','#fbbf24','#ef4444','#fde68a','#f97316'],
    purple: ['#a78bfa','#8b5cf6','#c4b5fd','#7c3aed','#ddd6fe','#6d28d9'],
  }

  const buildChartData = () => {
    const refs = expandRange(chartRange.toUpperCase().trim())
    if (!refs.length) return { data: [], keys: [], headers: [] }
    const parsed = refs.map(r => parseRef(r)).filter(Boolean) as {col:number, row:number}[]
    const minRow = Math.min(...parsed.map(p=>p.row))
    const maxRow = Math.max(...parsed.map(p=>p.row))
    const minCol = Math.min(...parsed.map(p=>p.col))
    const maxCol = Math.max(...parsed.map(p=>p.col))
    const headers: string[] = []
    for (let c = minCol; c <= maxCol; c++) {
      const v = evaluateCell(cellKey(c, minRow), cells)
      headers.push(v !== '' ? String(v) : numToCol(c))
    }
    const data: Record<string, string|number>[] = []
    for (let r = minRow + 1; r <= maxRow; r++) {
      const row: Record<string, string|number> = {}
      for (let c = minCol; c <= maxCol; c++) {
        const v = evaluateCell(cellKey(c, r), cells)
        row[headers[c - minCol] ?? numToCol(c)] = v === '' ? 0 : (typeof v === 'number' ? v : (parseFloat(String(v)) || String(v)))
      }
      data.push(row)
    }
    return { data, keys: headers.slice(1), headers }
  }

  const downloadChart = () => {
    const el = chartRef.current
    if (!el) return
    const svg = el.querySelector('svg')
    if (!svg) return
    const canvas = document.createElement('canvas')
    const bb = svg.getBoundingClientRect()
    canvas.width = bb.width * 2; canvas.height = bb.height * 2
    const ctx = canvas.getContext('2d')!
    const xml = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([xml], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#0f0f0f'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `${chartTitle || 'chart'}-DZ.png`
      a.click()
      URL.revokeObjectURL(url)
    }
    img.src = url
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

          <button className={`dzt-xl-fmt-btn${selectedCell.bold?' active':''}`} onClick={()=>toggleFmt('bold')} title="عريض">
            <Bold size={13}/>
          </button>
          <button className={`dzt-xl-fmt-btn${selectedCell.italic?' active':''}`} onClick={()=>toggleFmt('italic')} title="مائل">
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

          <div className="dzt-xl-divider" />

          <button className="dzt-xl-undo-btn" onClick={undo} disabled={!canUndo} title="تراجع (Ctrl+Z)">
            ↩
          </button>
          <button className="dzt-xl-undo-btn" onClick={redo} disabled={!canRedo} title="إعادة (Ctrl+Y)">
            ↪
          </button>

          <div className="dzt-xl-divider" />

          <button className={`dzt-xl-tool-btn${fxOpen?' active':''}`}
            onClick={()=>setFxOpen(v=>!v)} style={{gap:4,fontWeight:700,letterSpacing:.5}}>
            الدوال <span style={{fontFamily:'monospace',fontStyle:'italic',color:'#c8ff00'}}>FX</span>
            <ChevronDown size={12} style={{transform:fxOpen?'rotate(180deg)':'none',transition:'transform .2s'}}/>
          </button>

          <div className="dzt-xl-divider" />

          <button className={`dzt-xl-tool-btn${fnRefOpen?' active':''}`} onClick={()=>setFnRefOpen(v=>!v)} style={{gap:4}}>
            📚 دليل الدوال <ChevronDown size={12}/>
          </button>

          <div className="dzt-xl-divider" />

          <button className={`dzt-xl-tool-btn${chartOpen?' active':''}`}
            onClick={()=>{ setChartOpen(v=>!v); setChartBuilt(false) }} style={{gap:4,color:'#fb923c'}}>
            <BarChart2 size={14}/> خريطة بيانية <ChevronDown size={12}/>
          </button>
        </div>

        <div className="dzt-xl-toolbar-right">
          <div className="dzt-xl-filename">
            <input className="dzt-xl-filename-input" value={fileName} onChange={e=>setFileName(e.target.value)} />
          </div>
          <button className={`dzt-xl-ai-btn${aiOpen?' active':''}`} onClick={()=>setAiOpen(v=>!v)}>
            <Sparkles size={14}/> مساعد AI <ChevronDown size={12}/>
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
          placeholder={editing === selected ? '' : 'أدخل قيمة أو دالة (=SUM(A1:A10))...'}
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
            <span><Sparkles size={14}/> مساعد الدوال بالذكاء الاصطناعي — اكتب ما تريد بالعربية</span>
            <button onClick={()=>setAiOpen(false)}><X size={14}/></button>
          </div>
          <div className="dzt-xl-ai-body">
            <div className="dzt-xl-ai-quick">
              {AI_QUICK.map(({label, q})=>(
                <button key={q} className="dzt-xl-ai-quick-btn" onClick={()=>setAiQuery(q)}>{label}</button>
              ))}
            </div>
            <div className="dzt-xl-ai-input-row">
              <input
                className="dzt-xl-ai-input"
                placeholder="مثال: احسب قسط قرض 500000 دج بفائدة 7% لمدة 3 سنوات..."
                value={aiQuery}
                onChange={e=>setAiQuery(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&askAI()}
              />
              <button className="dzt-btn" style={{padding:'10px 18px',fontSize:13,whiteSpace:'nowrap'}} onClick={askAI} disabled={aiLoading}>
                {aiLoading ? <><span className="dzt-spinner" style={{width:14,height:14}}/> جاري...</> : '✨ اسأل AI'}
              </button>
            </div>
            {aiResult && (
              <div className="dzt-xl-ai-result">
                <ReactMarkdown>{aiResult}</ReactMarkdown>
                {aiResult.match(/=[\w\(\)\:,\+\-\*\/\.\s"'A-Z0-9]+/i) && (
                  <button className="dzt-xl-ai-insert-btn" onClick={()=>insertFormula(aiResult)}>
                    ⬆️ أدخل الدالة في الخلية {selected}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Function Reference Panel ──────────────────────────────────────────── */}
      {fnRefOpen && (
        <div className="dzt-xl-fnref-panel">
          <div className="dzt-xl-fnref-header">
            <span>📚 دليل الدوال الكاملة — {FN_CATEGORIES.flatMap(c=>c.fns).length} دالة</span>
            <button onClick={()=>setFnRefOpen(false)}><X size={14}/></button>
          </div>
          <div className="dzt-xl-fnref-cats">
            {FN_CATEGORIES.map(cat=>(
              <button
                key={cat.id}
                className={`dzt-xl-fnref-cat-btn${activeCat===cat.id?' active':''}`}
                style={activeCat===cat.id?{borderColor:cat.color,color:cat.color}:{}}
                onClick={()=>setActiveCat(activeCat===cat.id?null:cat.id)}
              >
                {cat.label} <ChevronRight size={11} style={{transform:activeCat===cat.id?'rotate(90deg)':'none',transition:'transform .2s'}}/>
              </button>
            ))}
          </div>
          {activeCat && (() => {
            const cat = FN_CATEGORIES.find(c=>c.id===activeCat)!
            return (
              <div className="dzt-xl-fnref-list">
                {cat.fns.map(fn=>(
                  <button key={fn.name} className="dzt-xl-fnref-item" onClick={()=>{ clickFn(fn.name); setFnRefOpen(false) }}>
                    <span className="dzt-xl-fnref-name" style={{color:cat.color}}>{fn.name}</span>
                    <span className="dzt-xl-fnref-sig">{fn.sig}</span>
                    <span className="dzt-xl-fnref-desc">{fn.desc}</span>
                  </button>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Chart Panel ──────────────────────────────────────────────────────── */}
      {chartOpen && (() => {
        const colors = COLOR_SCHEMES[chartScheme] ?? COLOR_SCHEMES.dz
        const { data, keys, headers } = chartBuilt ? buildChartData() : { data: [], keys: [], headers: [] }
        const nameKey = headers[0] ?? 'name'
        const CHART_TYPES = [
          { id: 'bar',   label: '📊 عمودي' },
          { id: 'line',  label: '📈 خطي' },
          { id: 'area',  label: '🌊 مساحة' },
          { id: 'pie',   label: '🥧 دائري' },
          { id: 'radar', label: '🕸️ رادار' },
        ] as const
        const SCHEMES = [
          { id: 'dz',     label: '🇩🇿 DZ' },
          { id: 'blue',   label: '🔵 أزرق' },
          { id: 'warm',   label: '🔴 دافئ' },
          { id: 'purple', label: '🟣 بنفسجي' },
        ] as const

        const renderChart = () => {
          if (!data.length) return null
          const common = {
            style: { fontFamily: 'Cairo, sans-serif', fontSize: 11 },
            margin: { top: 16, right: 24, left: 0, bottom: 8 },
          }
          const tooltipStyle = { background:'#111', border:'1px solid #333', borderRadius:8, fontFamily:'Cairo,sans-serif', fontSize:12 }

          if (chartType === 'pie') {
            const pieData = data.map(d => ({ name: String(d[nameKey] ?? ''), value: Number(d[keys[0] ?? ''] ?? 0) }))
            return (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={120} label={({name,percent})=>`${name} ${(percent*100).toFixed(1)}%`}
                    labelLine={false}>
                    {pieData.map((_,i) => <Cell key={i} fill={colors[i % colors.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle}/>
                  <Legend wrapperStyle={{fontFamily:'Cairo,sans-serif',fontSize:12}}/>
                </PieChart>
              </ResponsiveContainer>
            )
          }

          if (chartType === 'radar') {
            return (
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={data} {...common}>
                  <PolarGrid stroke="#222"/>
                  <PolarAngleAxis dataKey={nameKey} tick={{fill:'#888',fontSize:11}}/>
                  {keys.map((k,i) => <Radar key={k} name={k} dataKey={k} stroke={colors[i%colors.length]} fill={colors[i%colors.length]} fillOpacity={0.25}/>)}
                  <Tooltip contentStyle={tooltipStyle}/>
                  <Legend wrapperStyle={{fontFamily:'Cairo,sans-serif',fontSize:12}}/>
                </RadarChart>
              </ResponsiveContainer>
            )
          }

          if (chartType === 'line') {
            return (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data} {...common}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e"/>
                  <XAxis dataKey={nameKey} tick={{fill:'#888',fontSize:11}}/>
                  <YAxis tick={{fill:'#888',fontSize:11}}/>
                  <Tooltip contentStyle={tooltipStyle}/>
                  <Legend wrapperStyle={{fontFamily:'Cairo,sans-serif',fontSize:12}}/>
                  {keys.map((k,i) => <Line key={k} type="monotone" dataKey={k} stroke={colors[i%colors.length]} strokeWidth={2.5} dot={{r:4,fill:colors[i%colors.length]}}/>)}
                </LineChart>
              </ResponsiveContainer>
            )
          }

          if (chartType === 'area') {
            return (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={data} {...common}>
                  <defs>
                    {keys.map((k,i) => (
                      <linearGradient key={k} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={colors[i%colors.length]} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={colors[i%colors.length]} stopOpacity={0.02}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e"/>
                  <XAxis dataKey={nameKey} tick={{fill:'#888',fontSize:11}}/>
                  <YAxis tick={{fill:'#888',fontSize:11}}/>
                  <Tooltip contentStyle={tooltipStyle}/>
                  <Legend wrapperStyle={{fontFamily:'Cairo,sans-serif',fontSize:12}}/>
                  {keys.map((k,i) => <Area key={k} type="monotone" dataKey={k} stroke={colors[i%colors.length]} fill={`url(#grad-${i})`} strokeWidth={2.5}/>)}
                </AreaChart>
              </ResponsiveContainer>
            )
          }

          return (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data} {...common}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e"/>
                <XAxis dataKey={nameKey} tick={{fill:'#888',fontSize:11}}/>
                <YAxis tick={{fill:'#888',fontSize:11}}/>
                <Tooltip contentStyle={tooltipStyle}/>
                <Legend wrapperStyle={{fontFamily:'Cairo,sans-serif',fontSize:12}}/>
                {keys.map((k,i) => <Bar key={k} dataKey={k} fill={colors[i%colors.length]} radius={[4,4,0,0]}/>)}
              </BarChart>
            </ResponsiveContainer>
          )
        }

        return (
          <div className="dzt-xl-chart-panel">
            <div className="dzt-xl-chart-header">
              <span><BarChart2 size={14}/> منشئ الخرائط البيانية</span>
              <button onClick={()=>setChartOpen(false)}><X size={14}/></button>
            </div>
            <div className="dzt-xl-chart-controls">
              <div className="dzt-xl-chart-ctrl-group">
                <label>النطاق</label>
                <input className="dzt-xl-chart-range-input"
                  value={chartRange} onChange={e=>{ setChartRange(e.target.value); setChartBuilt(false) }}
                  placeholder="مثال: A1:C10"
                  onKeyDown={e=>e.key==='Enter'&&setChartBuilt(true)}/>
              </div>
              <div className="dzt-xl-chart-ctrl-group">
                <label>نوع الخريطة</label>
                <div className="dzt-xl-chart-type-group">
                  {CHART_TYPES.map(t=>(
                    <button key={t.id} className={`dzt-xl-chart-type-btn${chartType===t.id?' active':''}`}
                      onClick={()=>{ setChartType(t.id); setChartBuilt(false) }}>{t.label}</button>
                  ))}
                </div>
              </div>
              <div className="dzt-xl-chart-ctrl-group">
                <label>لوحة الألوان</label>
                <div className="dzt-xl-chart-type-group">
                  {SCHEMES.map(s=>(
                    <button key={s.id} className={`dzt-xl-chart-type-btn${chartScheme===s.id?' active':''}`}
                      onClick={()=>{ setChartScheme(s.id); setChartBuilt(false) }}>{s.label}</button>
                  ))}
                </div>
              </div>
              <div className="dzt-xl-chart-ctrl-group">
                <label>عنوان الخريطة</label>
                <input className="dzt-xl-chart-range-input" value={chartTitle}
                  onChange={e=>setChartTitle(e.target.value)} placeholder="اختياري"/>
              </div>
              <div className="dzt-xl-chart-ctrl-group" style={{alignSelf:'flex-end'}}>
                <button className="dzt-btn" style={{padding:'9px 20px',fontSize:13,background:'rgba(251,146,60,.15)',borderColor:'rgba(251,146,60,.4)',color:'#fb923c'}}
                  onClick={()=>setChartBuilt(true)}>
                  📊 رسم الخريطة
                </button>
              </div>
            </div>

            {chartBuilt && data.length > 0 && (
              <div className="dzt-xl-chart-output">
                {chartTitle && <div className="dzt-xl-chart-title">{chartTitle}</div>}
                <div className="dzt-xl-chart-canvas" ref={chartRef}>
                  {renderChart()}
                </div>
                <div className="dzt-xl-chart-actions">
                  <span style={{fontSize:12,color:'#555'}}>{data.length} صف × {keys.length} عمود بيانات</span>
                  <button className="dzt-xl-tool-btn" onClick={downloadChart} style={{gap:4}}>
                    <Download size={13}/> تحميل PNG
                  </button>
                </div>
              </div>
            )}
            {chartBuilt && data.length === 0 && (
              <div style={{padding:'20px 16px',textAlign:'center',color:'#555',fontSize:13,direction:'rtl'}}>
                ⚠️ لم يُعثر على بيانات في النطاق "{chartRange}" — تأكد من وجود بيانات في الخلايا
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Function Chips by Category (FX panel) ────────────────────────────── */}
      {fxOpen && (
        <div className="dzt-xl-fx-panel">
          <div className="dzt-xl-fx-panel-header">
            <span style={{color:'#c8ff00',fontWeight:700,fontStyle:'italic',fontFamily:'monospace'}}>FX</span>
            <span style={{color:'#888',fontSize:12,marginRight:6}}>اختر دالة لإدراجها في الخلية المحددة</span>
            <button className="dzt-xl-fx-close" onClick={()=>setFxOpen(false)}><X size={13}/></button>
          </div>
          <div className="dzt-xl-fn-chips">
            {FN_CATEGORIES.map(cat=>
              cat.fns.slice(0,4).map(fn=>(
                <button key={`${cat.id}-${fn.name}`} className="dzt-xl-fn-chip"
                  style={{borderColor:`${cat.color}44`,color:cat.color}}
                  title={fn.desc}
                  onClick={()=>clickFn(fn.name)}>
                  {fn.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}

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
        {statusNums.length > 0 && <>
          <span>المجموع: <strong style={{color:'#4ade80'}}>{statusNums.reduce((a,b)=>a+b,0).toLocaleString('fr-DZ',{maximumFractionDigits:2})}</strong></span>
          <span>المتوسط: <strong style={{color:'#60a5fa'}}>{(statusNums.reduce((a,b)=>a+b,0)/statusNums.length).toLocaleString('fr-DZ',{maximumFractionDigits:2})}</strong></span>
          <span>العدد: <strong style={{color:'#fb923c'}}>{statusNums.length}</strong></span>
        </>}
        <span style={{marginRight:'auto'}}>{Object.keys(cells).filter(k=>cells[k]?.raw).length} خلية مملوءة</span>
        <span style={{opacity:.5,fontSize:11}}>Enter/F2: تعديل | Arrows: تنقل | Delete: حذف</span>
      </div>
    </div>
  )
}

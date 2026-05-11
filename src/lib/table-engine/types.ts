export interface TableColumn {
  key: string
  label: string
  dataType: 'text' | 'number' | 'date' | 'url'
  align: 'left' | 'right' | 'center'
  minWidth?: number
  priority: number
}

export interface TableRow {
  _id: string
  [key: string]: string
}

export interface ParsedTable {
  columns: TableColumn[]
  rows: TableRow[]
  rowCount: number
  renderMode: 'simple' | 'paginated' | 'virtualized'
}

export interface TableEngineConfig {
  pageSize: number
  virtualThreshold: number
  simpleThreshold: number
  enableSorting: boolean
  enableFiltering: boolean
  enableExport: boolean
  enablePagination: boolean
}

export const DEFAULT_CONFIG: TableEngineConfig = {
  pageSize: 20,
  virtualThreshold: 500,
  simpleThreshold: 50,
  enableSorting: true,
  enableFiltering: true,
  enableExport: true,
  enablePagination: true,
}

export function inferDataType(values: string[]): TableColumn['dataType'] {
  const nonEmpty = values.filter(v => v.trim() !== '')
  if (nonEmpty.length === 0) return 'text'
  const numberRe = /^[\d,. +-]+$/
  if (nonEmpty.every(v => numberRe.test(v.trim()))) return 'number'
  const dateRe = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/
  if (nonEmpty.every(v => dateRe.test(v.trim()))) return 'date'
  const urlRe = /^https?:\/\//
  if (nonEmpty.some(v => urlRe.test(v.trim()))) return 'url'
  return 'text'
}

export function inferAlignment(type: TableColumn['dataType'], label: string): TableColumn['align'] {
  if (type === 'number') return 'right'
  const rtlRe = /[\u0600-\u06FF\u0750-\u077F]/
  if (rtlRe.test(label)) return 'right'
  return 'left'
}

export function inferPriority(index: number, total: number): number {
  if (index === 0) return 1
  if (index === total - 1) return 2
  return 3 + index
}

export function buildColumns(headers: string[], rows: string[][]): TableColumn[] {
  return headers.map((label, i) => {
    const colValues = rows.map(r => r[i] ?? '')
    const dataType = inferDataType(colValues)
    const align = inferAlignment(dataType, label)
    return {
      key: `col_${i}`,
      label,
      dataType,
      align,
      priority: inferPriority(i, headers.length),
    }
  })
}

export function buildRows(headers: string[], rawRows: string[][]): TableRow[] {
  return rawRows.map((row, ri) => {
    const obj: TableRow = { _id: String(ri) }
    headers.forEach((_, ci) => {
      obj[`col_${ci}`] = row[ci] ?? ''
    })
    return obj
  })
}

export function getRenderMode(rowCount: number, config: TableEngineConfig): ParsedTable['renderMode'] {
  if (rowCount >= config.virtualThreshold) return 'virtualized'
  if (rowCount > config.simpleThreshold) return 'paginated'
  return 'simple'
}

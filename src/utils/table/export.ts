import type { TableColumn, TableRow } from '../../lib/table-engine/types'

function toMatrix(columns: TableColumn[], rows: TableRow[]): string[][] {
  const header = columns.map(c => c.label)
  const body = rows.map(row => columns.map(c => row[c.key] ?? ''))
  return [header, ...body]
}

export async function exportCSV(columns: TableColumn[], rows: TableRow[], filename = 'dz-table'): Promise<void> {
  const matrix = toMatrix(columns, rows)
  const csvLines = matrix.map(row =>
    row.map(cell => {
      const s = String(cell).replace(/"/g, '""')
      return /[,"\n\r]/.test(s) ? `"${s}"` : s
    }).join(',')
  )
  const csvContent = '\uFEFF' + csvLines.join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${filename}.csv`)
}

export async function exportXLSX(columns: TableColumn[], rows: TableRow[], filename = 'dz-table'): Promise<void> {
  const { utils, writeFile } = await import('xlsx')
  const matrix = toMatrix(columns, rows)
  const ws = utils.aoa_to_sheet(matrix)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Data')
  writeFile(wb, `${filename}.xlsx`)
}

export function parseCSVText(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }
  const parseLine = (line: string): string[] => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    cells.push(current.trim())
    return cells
  }
  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

import { useMemo } from 'react'
import {
  buildColumns,
  buildRows,
  getRenderMode,
  DEFAULT_CONFIG,
} from '../lib/table-engine/types'
import type { ParsedTable, TableEngineConfig } from '../lib/table-engine/types'

interface UseTableEngineOptions {
  headers: string[]
  rows: string[][]
  config?: Partial<TableEngineConfig>
}

export function useTableEngine({ headers, rows, config = {} }: UseTableEngineOptions): ParsedTable {
  const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config])

  return useMemo(() => {
    if (!headers.length || !rows.length) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        renderMode: 'simple' as const,
      }
    }
    const columns = buildColumns(headers, rows)
    const parsedRows = buildRows(headers, rows)
    const rowCount = parsedRows.length
    const renderMode = getRenderMode(rowCount, mergedConfig)
    return { columns, rows: parsedRows, rowCount, renderMode }
  }, [headers, rows, mergedConfig])
}

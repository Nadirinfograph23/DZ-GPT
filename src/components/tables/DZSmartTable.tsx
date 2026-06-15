import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTableEngine } from '../../hooks/useTableEngine'
import { exportCSV, exportXLSX } from '../../utils/table/export'
import type { TableRow } from '../../lib/table-engine/types'

interface DZSmartTableProps {
  headers: string[]
  rows: string[][]
  title?: string
  compact?: boolean
}

const PAGE_SIZE = 20

// Module-level map: persists table scroll positions across React re-mounts.
const _tableScrollPositions = new Map<string, number>()

export default function DZSmartTable({ headers, rows, title, compact }: DZSmartTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE })
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const _scrollKey = useRef<string>('')

  // RTL scroll: start at rightmost position so first RTL column is visible
  useEffect(() => {
    const el = tableContainerRef.current
    if (!el) return
    const key = (el.querySelector('thead')?.textContent ?? '').slice(0, 80).trim()
    _scrollKey.current = key
    const saved = _tableScrollPositions.get(key)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!el) return
      el.scrollLeft = saved !== undefined ? saved : el.scrollWidth - el.clientWidth
    }))
    const onScroll = () => { _tableScrollPositions.set(_scrollKey.current, el.scrollLeft) }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const { columns: engineColumns, rows: engineRows, renderMode } = useTableEngine({ headers, rows })

  const columns = useMemo<ColumnDef<TableRow>[]>(
    () =>
      engineColumns.map(col => ({
        id: col.key,
        accessorKey: col.key,
        header: col.label,
        meta: { align: col.align, dataType: col.dataType },
      })),
    [engineColumns]
  )

  const table = useReactTable<TableRow>({
    data: engineRows,
    columns,
    state: {
      sorting,
      globalFilter,
      pagination: renderMode === 'paginated' ? pagination : { pageIndex: 0, pageSize: 9999 },
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: renderMode === 'paginated' ? setPagination : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: renderMode === 'paginated' ? getPaginationRowModel() : getCoreRowModel(),
    manualPagination: false,
  })

  const { rows: tableRows } = table.getRowModel()

  const rowVirtualizer = useVirtualizer({
    count: renderMode === 'virtualized' ? tableRows.length : 0,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 40,
    overscan: 10,
  })

  const handleExportCSV = useCallback(async () => {
    setExporting('csv')
    try {
      await exportCSV(engineColumns, engineRows, title ?? 'dz-table')
    } finally {
      setExporting(null)
    }
  }, [engineColumns, engineRows, title])

  const handleExportXLSX = useCallback(async () => {
    setExporting('xlsx')
    try {
      await exportXLSX(engineColumns, engineRows, title ?? 'dz-table')
    } finally {
      setExporting(null)
    }
  }, [engineColumns, engineRows, title])

  if (!headers.length || !rows.length) return null

  const totalRows = engineRows.length
  const filteredRows = table.getFilteredRowModel().rows.length
  const showPagination = renderMode === 'paginated'
  const showVirtual = renderMode === 'virtualized'

  return (
    <div className={`dzt-wrapper${compact ? ' dzt-wrapper--compact' : ''}`}>
      <div className="dzt-toolbar">
        <div className="dzt-toolbar-left">
          {title && <span className="dzt-title">{title}</span>}
          <span className="dzt-count">
            {globalFilter && filteredRows !== totalRows
              ? `${filteredRows} / ${totalRows}`
              : `${totalRows}`} صف
          </span>
          {renderMode === 'virtualized' && (
            <span className="dzt-badge dzt-badge--virtual">⚡ Virtual Scroll</span>
          )}
        </div>
        <div className="dzt-toolbar-right">
          <div className="dzt-search-wrap">
            <span className="dzt-search-icon">🔍</span>
            <input
              className="dzt-search"
              placeholder="بحث في الجدول..."
              value={globalFilter}
              onChange={e => { setGlobalFilter(e.target.value); setPagination(p => ({ ...p, pageIndex: 0 })) }}
              aria-label="بحث في الجدول"
            />
            {globalFilter && (
              <button className="dzt-search-clear" onClick={() => setGlobalFilter('')} aria-label="مسح البحث">✕</button>
            )}
          </div>
          <button
            className="dzt-export-btn"
            onClick={handleExportCSV}
            disabled={exporting !== null}
            title="تصدير CSV"
            aria-label="تصدير CSV"
          >
            {exporting === 'csv' ? '⏳' : '⬇ CSV'}
          </button>
          <button
            className="dzt-export-btn dzt-export-btn--xlsx"
            onClick={handleExportXLSX}
            disabled={exporting !== null}
            title="تصدير Excel"
            aria-label="تصدير Excel"
          >
            {exporting === 'xlsx' ? '⏳' : '📊 XLSX'}
          </button>
        </div>
      </div>

      <div
        className={`dzt-scroll-container${showVirtual ? ' dzt-scroll-container--virtual' : ''}`}
        ref={tableContainerRef}
        role="region"
        aria-label={title ?? 'جدول البيانات'}
      >
        <table className="dzt-table" aria-label={title ?? 'جدول البيانات'}>
          <thead className="dzt-thead">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => {
                  const col = engineColumns.find(c => c.key === header.id)
                  const isSorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className={`dzt-th dzt-th--${col?.align ?? 'left'}${header.column.getCanSort() ? ' dzt-th--sortable' : ''}${isSorted ? ' dzt-th--sorted' : ''}`}
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ minWidth: col?.minWidth ?? 80 }}
                      aria-sort={isSorted === 'asc' ? 'ascending' : isSorted === 'desc' ? 'descending' : 'none'}
                      tabIndex={header.column.getCanSort() ? 0 : undefined}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') header.column.getToggleSortingHandler()?.(e) }}
                    >
                      <span className="dzt-th-inner">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span className="dzt-sort-icon" aria-hidden="true">
                            {isSorted === 'asc' ? ' ↑' : isSorted === 'desc' ? ' ↓' : ' ⇅'}
                          </span>
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          {showVirtual ? (
            <tbody className="dzt-tbody" style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const row = tableRows[virtualRow.index]
                return (
                  <tr
                    key={row.id}
                    className="dzt-tr"
                    style={{ position: 'absolute', top: 0, transform: `translateY(${virtualRow.start}px)`, width: '100%' }}
                  >
                    {row.getVisibleCells().map(cell => {
                      const col = engineColumns.find(c => c.key === cell.column.id)
                      return (
                        <td key={cell.id} className={`dzt-td dzt-td--${col?.align ?? 'left'}`}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          ) : (
            <tbody className="dzt-tbody">
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="dzt-empty">
                    لا توجد نتائج للبحث الحالي
                  </td>
                </tr>
              ) : (
                tableRows.map(row => (
                  <tr key={row.id} className="dzt-tr">
                    {row.getVisibleCells().map(cell => {
                      const col = engineColumns.find(c => c.key === cell.column.id)
                      const val = String(cell.getValue() ?? '')
                      const isUrl = col?.dataType === 'url' && /^https?:\/\//.test(val)
                      return (
                        <td key={cell.id} className={`dzt-td dzt-td--${col?.align ?? 'left'}`}>
                          {isUrl ? (
                            <a href={val} target="_blank" rel="noopener noreferrer" className="dzt-link">
                              {val.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                            </a>
                          ) : (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>
      </div>

      {showPagination && table.getPageCount() > 1 && (
        <div className="dzt-pagination" role="navigation" aria-label="تنقل الصفحات">
          <button
            className="dzt-page-btn"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="الصفحة الأولى"
          >«</button>
          <button
            className="dzt-page-btn"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="الصفحة السابقة"
          >‹</button>
          <span className="dzt-page-info">
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <button
            className="dzt-page-btn"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="الصفحة التالية"
          >›</button>
          <button
            className="dzt-page-btn"
            onClick={() => table.lastPage()}
            disabled={!table.getCanNextPage()}
            aria-label="الصفحة الأخيرة"
          >»</button>
        </div>
      )}
    </div>
  )
}

interface DZMDTableProps {
  children?: React.ReactNode
}

function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in (node as object)) {
    const el = node as React.ReactElement
    return extractText(el.props?.children)
  }
  return ''
}

function extractTableData(children: React.ReactNode): { headers: string[]; rows: string[][] } {
  const headers: string[] = []
  const rows: string[][] = []

  const childArr = Array.isArray(children) ? children : [children]
  for (const section of childArr) {
    if (!section || typeof section !== 'object') continue
    const el = section as React.ReactElement
    const sectionChildren = Array.isArray(el.props?.children) ? el.props.children : [el.props?.children]
    const type = el.type as string

    for (const row of sectionChildren) {
      if (!row || typeof row !== 'object') continue
      const rowEl = row as React.ReactElement
      const cellChildren = Array.isArray(rowEl.props?.children) ? rowEl.props.children : [rowEl.props?.children]
      const cells = cellChildren.map(extractText).map((s: string) => s.trim())

      if (type === 'thead') {
        headers.push(...cells)
      } else {
        if (cells.some((c: string) => c !== '')) rows.push(cells)
      }
    }
  }

  return { headers, rows }
}

// Key based on <thead> text only — stable, not affected by streaming row additions.
// Falls back to first 80 chars of full content if no thead is present.
function _tableKey(el: HTMLDivElement): string {
  const thead = el.querySelector('thead')
  if (thead) return (thead.textContent ?? '').slice(0, 80).trim()
  return (el.textContent ?? '').slice(0, 80).trim()
}

// Scroll wrapper: forces LTR scroll origin so scrollLeft=0 is always the left
// edge, then positions the view at the rightmost side so the first RTL column
// is immediately visible.
//
// SCROLL STRATEGY — Native browser scroll (touch-action: pan-x):
//   The previous approach used touch-action:none + manual Pointer Events.
//   That caused the "spring-back" bug: setPointerCapture does NOT intercept
//   native scrollbar-thumb drag gestures. The browser applies the scroll
//   momentarily, then the manual JS handler has no control over the thumb,
//   so the position reverts.
//
//   Fix: touch-action:pan-x lets the browser handle all horizontal swipes
//   and scrollbar-thumb drags natively — no JS scroll manipulation needed.
//   overscroll-behavior-x:contain prevents the parent from stealing the swipe.
//
//   Additional bug fixes:
//   * Key now uses <thead> text only — stable across streaming updates.
//   * saved !== undefined (not saved > 0) — correctly restores scrollLeft=0
//     when the user has scrolled all the way to the left (valid position).
//   * Double rAF — ensures layout is complete before measuring scrollWidth.
function TableScrollWrapper({ className, children }: { className: string; children: React.ReactNode }) {
  const ref    = useRef<HTMLDivElement>(null)
  const [canL, setCanL] = useState(false)
  const [canR, setCanR] = useState(false)
  const [over, setOver] = useState(false)

  const sync = useCallback(() => {
    const el = ref.current
    if (!el) return
    const l   = el.scrollLeft
    const max = el.scrollWidth - el.clientWidth
    setCanL(l > 2)
    setCanR(l < max - 2)
    setOver(max > 4)
    el.dataset.scrollLeft  = l > 1 ? 'true' : 'false'
    el.dataset.scrollRight = l < max - 1 ? 'true' : 'false'
  }, [])

  const nudge = useCallback((dir: 'l' | 'r') => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir === 'l' ? -140 : 140, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const key = _tableKey(el)
      const saved = _tableScrollPositions.get(key)
      el.scrollLeft = saved !== undefined ? saved : el.scrollWidth - el.clientWidth
      sync()
    }))

    const onScroll = () => {
      _tableScrollPositions.set(_tableKey(el), el.scrollLeft)
      sync()
    }
    el.addEventListener('scroll', onScroll, { passive: true })

    const ro = new ResizeObserver(sync)
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [sync])

  return (
    <div className="dz-table-outer">
      {over && (
        <div className="dz-tnav-bar">
          <button className="dz-tnav" disabled={!canL} onClick={() => nudge('l')} aria-label="يسار">‹</button>
          <span className="dz-tnav-label">تمرير الجدول</span>
          <button className="dz-tnav" disabled={!canR} onClick={() => nudge('r')} aria-label="يمين">›</button>
        </div>
      )}
      <div ref={ref} className={`dzt-simple-scroll ${className}`} dir="ltr">
        {children}
      </div>
    </div>
  )
}

export function DZMDTable({ children }: DZMDTableProps) {
  const { headers, rows } = useMemo(() => extractTableData(children), [children])

  if (!headers.length || !rows.length) {
    return (
      <TableScrollWrapper className="dzt-wrap--fallback">
        <table className="dzt-fallback-table" dir="rtl">{children}</table>
      </TableScrollWrapper>
    )
  }
  if (rows.length <= 20) {
    return (
      <TableScrollWrapper className="dzt-wrap--simple">
        <table className="dzt-simple-table" dir="rtl">{children}</table>
      </TableScrollWrapper>
    )
  }
  return <DZSmartTable headers={headers} rows={rows} />
}

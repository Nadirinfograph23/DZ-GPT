import { useMemo, useState } from 'react'
import { flexRender, getCoreRowModel, getSortedRowModel, type ColumnDef, type SortingState, useReactTable } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, MapPin, Phone } from 'lucide-react'
import { useTableEngine } from '../hooks/useTableEngine'
import type { TableRow } from '../lib/table-engine/types'
import type { DoctorResult } from './DoctorResultsPanel'

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return d.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4')
  return phone
}

function telUrl(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (!d) return '#'
  if (d.length === 10 && d.startsWith('0')) return `tel:+213${d.slice(1)}`
  if (d.length === 9 && !d.startsWith('0')) return `tel:+213${d}`
  if (d.startsWith('00')) return `tel:+${d.slice(2)}`
  return `tel:${d}`
}

function mapsUrl(doc: DoctorResult) {
  if (typeof doc.lat === 'number' && typeof doc.lng === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${doc.lat},${doc.lng}`
  }
  const q = [doc.name, doc.addressAr || doc.address, doc.cityAr || doc.city, 'Algérie'].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

function cleanName(name: string) {
  return name.replace(/^(Dr\.?|Docteur|د\.?|الدكتور)\s*/i, '').trim()
}

interface Props {
  doctors: DoctorResult[]
  specialityLabel: string
}

export default function DoctorResultsTable({ doctors, specialityLabel }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])
  const headers = ['اسم الطبيب', 'الاختصاص', 'رقم الهاتف', 'العنوان']
  const rows = useMemo(() => doctors.map(d => [
    cleanName(d.name),
    d.specialityAr || specialityLabel || '—',
    d.phone || '',
    d.addressAr || d.address || d.cityAr || d.city || '',
  ]), [doctors, specialityLabel])

  const { columns: engineColumns, rows: engineRows } = useTableEngine({
    headers,
    rows,
    config: { enableExport: false, enableFiltering: false, enablePagination: false },
  })

  const columns = useMemo<ColumnDef<TableRow>[]>(() => engineColumns.map((col, ci) => ({
    id: col.key,
    accessorKey: col.key,
    header: col.label,
    cell: ({ row }) => {
      const doc = doctors[Number(row.original._id)]
      if (!doc) return '—'
      if (ci === 0) return <span className="dr-name-text">{cleanName(doc.name)}</span>
      if (ci === 1) {
        const value = doc.specialityAr || specialityLabel
        return value ? <span className="dr-spec-cell">{value}</span> : '—'
      }
      if (ci === 2) {
        return doc.phone ? (
          <a className="dr-phone-link" href={telUrl(doc.phone)} title="فتح تطبيق الهاتف للاتصال" aria-label={`الاتصال بالطبيب ${cleanName(doc.name)}`}>
            <Phone size={13} />
            <span>{formatPhone(doc.phone)}</span>
          </a>
        ) : <span className="dr-cell-muted">غير متوفر</span>
      }
      const address = doc.addressAr || doc.address || doc.cityAr || doc.city || ''
      return address ? (
        <a className="dr-address-link" href={mapsUrl(doc)} target="_blank" rel="noopener noreferrer" title="فتح عنوان الطبيب في Google Maps" aria-label={`فتح عنوان ${cleanName(doc.name)} في Google Maps`}>
          <MapPin size={13} />
          <span>{address}</span>
        </a>
      ) : <span className="dr-cell-muted">غير متوفر</span>
    },
  })), [doctors, engineColumns, specialityLabel])

  const table = useReactTable<TableRow>({
    data: engineRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="dr-table-wrap">
      <table className="dr-table" dir="rtl" aria-label="نتائج الأطباء">
        <thead>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(header => {
                const sorted = header.column.getIsSorted()
                const cls = header.column.id === 'col_0' ? 'name' : header.column.id === 'col_1' ? 'spec' : header.column.id === 'col_2' ? 'phone' : 'address'
                return (
                  <th key={header.id} className={`dr-th dr-th--${cls}`} onClick={header.column.getToggleSortingHandler()} tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.column.getToggleSortingHandler()?.(e) } }}
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'} title="اضغط لترتيب النتائج">
                    <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                    {sorted === 'asc' ? <ArrowUp size={13} /> : sorted === 'desc' ? <ArrowDown size={13} /> : <ArrowUpDown size={13} />}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="dr-tr">
              {row.getVisibleCells().map(cell => {
                const cls = cell.column.id === 'col_0' ? 'name' : cell.column.id === 'col_1' ? 'spec' : cell.column.id === 'col_2' ? 'phone' : 'address'
                return <td key={cell.id} className={`dr-td dr-td--${cls}`}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

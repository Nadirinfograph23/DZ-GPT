import type { CSSProperties } from 'react'

type NewsCardItem = {
  title: string
  url: string
  date?: string | null
  source?: string
  snippet?: string
}

function formatNewsDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function NewsResultsCard({ items }: { items: NewsCardItem[] }) {
  const visibleItems = (Array.isArray(items) ? items : []).slice(0, 10).filter(item => {
    try {
      const url = new URL(item.url)
      return url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
      return false
    }
  })
  if (!visibleItems.length) return null

  const panelStyle: CSSProperties = {
    marginTop: 12,
    padding: 12,
    border: '1px solid rgba(34, 197, 94, 0.28)',
    borderRadius: 14,
    background: 'rgba(34, 197, 94, 0.045)',
  }
  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 9,
    marginTop: 10,
  }

  return (
    <section style={panelStyle} dir="rtl" aria-label="أحدث الأخبار الجزائرية">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>📰 عناوين الأخبار الجزائرية</strong>
        <span style={{ fontSize: 11, opacity: 0.7 }}>{visibleItems.length} عناوين</span>
      </div>
      <div style={gridStyle}>
        {visibleItems.map((item, index) => {
          const dateLabel = formatNewsDate(item.date)
          return (
            <a
              key={item.url + index}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
                minWidth: 0,
                padding: '11px 12px',
                border: '1px solid rgba(127, 127, 127, 0.22)',
                borderRadius: 11,
                background: 'rgba(127, 127, 127, 0.045)',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <strong style={{ fontSize: 13, lineHeight: 1.65 }}>{item.title}</strong>
              {item.snippet && <span style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.8 }}>{item.snippet}</span>}
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11, opacity: 0.72 }}>
                {item.source && <span>{item.source}</span>}
                {dateLabel && <span>· {dateLabel}</span>}
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

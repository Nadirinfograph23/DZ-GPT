/**
 * CurrencyWidget — بطاقة أسعار الصرف مقابل الدينار الجزائري
 * تُعرض تلقائياً عند سؤال "سعر الدولار / اليورو / أسعار الصرف"
 */

interface CurrencyRate {
  code: string
  nameAr: string
  flag: string
  dzd: number      // كم دينار يساوي 1 وحدة
}

export interface CurrencyWidgetData {
  rates: Record<string, number>   // raw rates from API (1 DZD = X currency)
  status: 'live' | 'stale' | 'unavailable'
  provider: string
  last_update: string
}

const CURRENCY_META: { code: string; nameAr: string; flag: string }[] = [
  { code: 'USD', nameAr: 'دولار أمريكي',     flag: '🇺🇸' },
  { code: 'EUR', nameAr: 'يورو',              flag: '🇪🇺' },
  { code: 'GBP', nameAr: 'جنيه إسترليني',   flag: '🇬🇧' },
  { code: 'SAR', nameAr: 'ريال سعودي',       flag: '🇸🇦' },
  { code: 'AED', nameAr: 'درهم إماراتي',     flag: '🇦🇪' },
  { code: 'TND', nameAr: 'دينار تونسي',      flag: '🇹🇳' },
  { code: 'MAD', nameAr: 'درهم مغربي',       flag: '🇲🇦' },
  { code: 'EGP', nameAr: 'جنيه مصري',        flag: '🇪🇬' },
  { code: 'QAR', nameAr: 'ريال قطري',        flag: '🇶🇦' },
  { code: 'KWD', nameAr: 'دينار كويتي',      flag: '🇰🇼' },
  { code: 'CAD', nameAr: 'دولار كندي',       flag: '🇨🇦' },
  { code: 'CHF', nameAr: 'فرنك سويسري',      flag: '🇨🇭' },
  { code: 'CNY', nameAr: 'يوان صيني',        flag: '🇨🇳' },
  { code: 'TRY', nameAr: 'ليرة تركية',       flag: '🇹🇷' },
  { code: 'JPY', nameAr: 'ين ياباني',        flag: '🇯🇵' },
]

// أعلى العملات بريموم — تُعرَض بارزة في الأعلى
const FEATURED = ['USD', 'EUR', 'GBP']

export function CurrencyWidget({ data }: { data: CurrencyWidgetData }) {
  if (!data?.rates) return null

  // تحويل الـ rates (1 DZD = X) → (1 X = Y DZD)
  const rows: CurrencyRate[] = CURRENCY_META.flatMap(m => {
    const raw = data.rates[m.code]
    if (!raw || raw <= 0) return []
    return [{ ...m, dzd: parseFloat((1 / raw).toFixed(2)) }]
  })

  const featuredRows = rows.filter(r => FEATURED.includes(r.code))
  const otherRows    = rows.filter(r => !FEATURED.includes(r.code))

  const isLive   = data.status === 'live'
  const isStale  = data.status === 'stale'
  const dateStr  = data.last_update
    ? new Date(data.last_update).toLocaleDateString('ar-DZ', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : ''
  const timeStr  = data.last_update
    ? new Date(data.last_update).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className="dzc-currency-widget" dir="rtl">
      {/* ── رأس البطاقة ── */}
      <div className="dzc-currency-header">
        <div className="dzc-currency-title">
          <span className="dzc-currency-icon">💱</span>
          <div>
            <div className="dzc-currency-title-text">أسعار الصرف</div>
            <div className="dzc-currency-subtitle">مقابل الدينار الجزائري (DZD)</div>
          </div>
        </div>
        <div className="dzc-currency-meta">
          <span className={`dzc-currency-badge ${isLive ? 'dzc-currency-badge--live' : isStale ? 'dzc-currency-badge--stale' : ''}`}>
            {isLive ? '🟢 مباشر' : isStale ? '🟡 مؤقت' : '⚪ غير متاح'}
          </span>
          {dateStr && <span className="dzc-currency-date">{dateStr}{timeStr ? ` · ${timeStr}` : ''}</span>}
        </div>
      </div>

      {/* ── العملات الرئيسية ── */}
      {featuredRows.length > 0 && (
        <div className="dzc-currency-featured">
          {featuredRows.map(r => (
            <div key={r.code} className="dzc-currency-featured-item">
              <span className="dzc-currency-featured-flag">{r.flag}</span>
              <div className="dzc-currency-featured-info">
                <span className="dzc-currency-featured-code">{r.code}</span>
                <span className="dzc-currency-featured-name">{r.nameAr}</span>
              </div>
              <div className="dzc-currency-featured-rate">
                <span className="dzc-currency-featured-dzd">{r.dzd.toLocaleString('ar-DZ')}</span>
                <span className="dzc-currency-featured-unit">دج</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── جدول باقي العملات ── */}
      {otherRows.length > 0 && (
        <div className="dzc-currency-table-wrap">
          <table className="dzc-currency-table">
            <thead>
              <tr>
                <th>العملة</th>
                <th>الاسم</th>
                <th className="dzc-currency-th-rate">1 وحدة = كم دج؟</th>
              </tr>
            </thead>
            <tbody>
              {otherRows.map(r => (
                <tr key={r.code}>
                  <td className="dzc-currency-td-code">
                    <span className="dzc-currency-flag">{r.flag}</span>
                    <span className="dzc-currency-code">{r.code}</span>
                  </td>
                  <td className="dzc-currency-td-name">{r.nameAr}</td>
                  <td className="dzc-currency-td-rate">
                    <strong>{r.dzd.toLocaleString('ar-DZ')}</strong>
                    <span className="dzc-currency-dzd-label"> دج</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── تذييل: مصدر + تنبيه ── */}
      <div className="dzc-currency-footer">
        <span className="dzc-currency-provider">
          📡 {data.provider || 'fawazahmed0/currency-api'}
        </span>
        <span className="dzc-currency-disclaimer">
          ⚠️ الأسعار تقريبية — راجع الصراف للسوق الموازية
        </span>
      </div>
    </div>
  )
}

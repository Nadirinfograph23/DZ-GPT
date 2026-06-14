/**
 * routes/flights.js
 * Air Algérie flight search — domestic & international
 * GET/POST /api/flights/air-algerie/search
 * GET      /api/flights/air-algerie/airports
 */
import { Router } from 'express'

export function createFlightsRouter() {
  const router = Router()

  // ── Domestic airports ──────────────────────────────────────────────────────
  const DOMESTIC_AIRPORTS = [
    { code: 'ALG', name: 'الجزائر العاصمة',    iata: 'ALG', city: 'الجزائر',      wilaya: '16', fullName: 'مطار هواري بومدين الدولي' },
    { code: 'ORN', name: 'وهران',               iata: 'ORN', city: 'وهران',         wilaya: '31', fullName: 'مطار أحمد بن بلة الدولي' },
    { code: 'CZL', name: 'قسنطينة',             iata: 'CZL', city: 'قسنطينة',       wilaya: '25', fullName: 'مطار محمد بوضياف الدولي' },
    { code: 'AAE', name: 'عنابة',               iata: 'AAE', city: 'عنابة',          wilaya: '23', fullName: 'مطار رابح بيطاط الدولي' },
    { code: 'TMR', name: 'تمنراست',             iata: 'TMR', city: 'تمنراست',        wilaya: '11', fullName: 'مطار أقنار' },
    { code: 'GHA', name: 'غرداية',              iata: 'GHA', city: 'غرداية',         wilaya: '47', fullName: 'مطار نومرات' },
    { code: 'OGX', name: 'ورقلة',               iata: 'OGX', city: 'ورقلة',          wilaya: '30', fullName: 'مطار عين البيضاء' },
    { code: 'BJA', name: 'بجاية',               iata: 'BJA', city: 'بجاية',          wilaya: '06', fullName: 'مطار سعيد محمدي' },
    { code: 'QSF', name: 'سطيف',               iata: 'QSF', city: 'سطيف',           wilaya: '19', fullName: 'مطار العين أرناط' },
    { code: 'TLM', name: 'تلمسان',              iata: 'TLM', city: 'تلمسان',         wilaya: '13', fullName: 'مطار زناتة' },
    { code: 'BLJ', name: 'باتنة',               iata: 'BLJ', city: 'باتنة',          wilaya: '05', fullName: 'مطار مصطفى بن بولعيد' },
    { code: 'BSK', name: 'بسكرة',               iata: 'BSK', city: 'بسكرة',          wilaya: '07', fullName: 'مطار محمد خيضر' },
    { code: 'TID', name: 'تيارت',               iata: 'TID', city: 'تيارت',          wilaya: '14', fullName: 'مطار بوشقيف' },
    { code: 'ELU', name: 'الوادي',              iata: 'ELU', city: 'الوادي',         wilaya: '39', fullName: 'مطار قمار' },
    { code: 'ADB', name: 'أدرار',               iata: 'ADB', city: 'أدرار',          wilaya: '01', fullName: 'مطار أدرار' },
    { code: 'CBH', name: 'بشار',                iata: 'CBH', city: 'بشار',           wilaya: '08', fullName: 'مطار بودغن بن علي لطفي' },
    { code: 'DJG', name: 'جانت',                iata: 'DJG', city: 'جانت',           wilaya: '33', fullName: 'مطار تيسكة' },
    { code: 'INZ', name: 'عين صالح',            iata: 'INZ', city: 'عين صالح',       wilaya: '03', fullName: 'مطار عين صالح' },
    { code: 'VVZ', name: 'إيليزي',              iata: 'VVZ', city: 'إيليزي',         wilaya: '33', fullName: 'مطار تاخمالت' },
    { code: 'HME', name: 'حاسي مسعود',          iata: 'HME', city: 'حاسي مسعود',     wilaya: '30', fullName: 'مطار وادي إيراو' },
    { code: 'IAM', name: 'عين أميناس',          iata: 'IAM', city: 'عين أميناس',     wilaya: '30', fullName: 'مطار زرزايتين' },
    { code: 'GJL', name: 'جيجل',                iata: 'GJL', city: 'جيجل',           wilaya: '18', fullName: 'مطار فرحات عباس' },
    { code: 'TEE', name: 'تبسة',                iata: 'TEE', city: 'تبسة',           wilaya: '12', fullName: 'مطار تبسة' },
    { code: 'EBH', name: 'البيض',               iata: 'EBH', city: 'البيض',          wilaya: '45', fullName: 'مطار البيض' },
    { code: 'MZW', name: 'المشرية',             iata: 'MZW', city: 'المشرية',        wilaya: '45', fullName: 'مطار مشرية' },
    { code: 'TFR', name: 'تيندوف',              iata: 'TFR', city: 'تيندوف',         wilaya: '37', fullName: 'مطار تيندوف' },
    { code: 'BMW', name: 'بوردج باجي مختار',    iata: 'BMW', city: 'بوردج باجي مختار', wilaya: '01', fullName: 'مطار بوردج باجي مختار' },
  ]

  // ── International airports ──────────────────────────────────────────────────
  const INTL_AIRPORTS = [
    // Europe
    { code: 'CDG', name: 'باريس شارل ديغول',   country: 'فرنسا 🇫🇷',   region: 'أوروبا' },
    { code: 'ORY', name: 'باريس أورلي',         country: 'فرنسا 🇫🇷',   region: 'أوروبا' },
    { code: 'LYS', name: 'ليون',                country: 'فرنسا 🇫🇷',   region: 'أوروبا' },
    { code: 'MRS', name: 'مرسيليا',             country: 'فرنسا 🇫🇷',   region: 'أوروبا' },
    { code: 'NCE', name: 'نيس',                 country: 'فرنسا 🇫🇷',   region: 'أوروبا' },
    { code: 'BOD', name: 'بوردو',               country: 'فرنسا 🇫🇷',   region: 'أوروبا' },
    { code: 'TLS', name: 'تولوز',               country: 'فرنسا 🇫🇷',   region: 'أوروبا' },
    { code: 'NTE', name: 'نانت',                country: 'فرنسا 🇫🇷',   region: 'أوروبا' },
    { code: 'SXB', name: 'ستراسبورغ',           country: 'فرنسا 🇫🇷',   region: 'أوروبا' },
    { code: 'BRU', name: 'بروكسل',              country: 'بلجيكا 🇧🇪',  region: 'أوروبا' },
    { code: 'AMS', name: 'أمستردام',            country: 'هولندا 🇳🇱',  region: 'أوروبا' },
    { code: 'LHR', name: 'لندن هيثرو',          country: 'بريطانيا 🇬🇧', region: 'أوروبا' },
    { code: 'LGW', name: 'لندن غاتويك',         country: 'بريطانيا 🇬🇧', region: 'أوروبا' },
    { code: 'BCN', name: 'برشلونة',             country: 'إسبانيا 🇪🇸',  region: 'أوروبا' },
    { code: 'MAD', name: 'مدريد',               country: 'إسبانيا 🇪🇸',  region: 'أوروبا' },
    { code: 'FCO', name: 'روما فيوميتشينو',     country: 'إيطاليا 🇮🇹',  region: 'أوروبا' },
    { code: 'MXP', name: 'ميلانو مالبنسا',      country: 'إيطاليا 🇮🇹',  region: 'أوروبا' },
    { code: 'FRA', name: 'فرانكفورت',           country: 'ألمانيا 🇩🇪',  region: 'أوروبا' },
    { code: 'GVA', name: 'جنيف',                country: 'سويسرا 🇨🇭',  region: 'أوروبا' },
    { code: 'ZRH', name: 'زيوريخ',              country: 'سويسرا 🇨🇭',  region: 'أوروبا' },
    { code: 'VIE', name: 'فيينا',               country: 'النمسا 🇦🇹',  region: 'أوروبا' },
    { code: 'IST', name: 'إسطنبول',             country: 'تركيا 🇹🇷',   region: 'أوروبا' },
    { code: 'SVO', name: 'موسكو شيريميتيفو',    country: 'روسيا 🇷🇺',   region: 'أوروبا' },
    // Africa
    { code: 'TUN', name: 'تونس قرطاج',         country: 'تونس 🇹🇳',    region: 'إفريقيا' },
    { code: 'CMN', name: 'الدار البيضاء',       country: 'المغرب 🇲🇦',  region: 'إفريقيا' },
    { code: 'CAI', name: 'القاهرة',             country: 'مصر 🇪🇬',     region: 'إفريقيا' },
    { code: 'TIP', name: 'طرابلس',              country: 'ليبيا 🇱🇾',   region: 'إفريقيا' },
    { code: 'DKR', name: 'داكار',               country: 'السنغال 🇸🇳', region: 'إفريقيا' },
    { code: 'NKC', name: 'نواكشوط',             country: 'موريتانيا 🇲🇷', region: 'إفريقيا' },
    { code: 'BKO', name: 'باماكو',              country: 'مالي 🇲🇱',    region: 'إفريقيا' },
    { code: 'NIM', name: 'نيامي',               country: 'النيجر 🇳🇪',  region: 'إفريقيا' },
    { code: 'NDJ', name: 'نجامينا',             country: 'تشاد 🇹🇩',    region: 'إفريقيا' },
    { code: 'COO', name: 'كوتونو',              country: 'بنين 🇧🇯',    region: 'إفريقيا' },
    { code: 'ABJ', name: 'أبيدجان',             country: 'كوت ديفوار 🇨🇮', region: 'إفريقيا' },
    { code: 'LOS', name: 'لاغوس',              country: 'نيجيريا 🇳🇬', region: 'إفريقيا' },
    { code: 'ADD', name: 'أديس أبابا',          country: 'إثيوبيا 🇪🇹', region: 'إفريقيا' },
    { code: 'NBO', name: 'نيروبي',              country: 'كينيا 🇰🇪',   region: 'إفريقيا' },
    { code: 'JNB', name: 'جوهانسبرغ',          country: 'جنوب أفريقيا 🇿🇦', region: 'إفريقيا' },
    // Middle East
    { code: 'JED', name: 'جدة',                 country: 'السعودية 🇸🇦', region: 'الشرق الأوسط' },
    { code: 'RUH', name: 'الرياض',              country: 'السعودية 🇸🇦', region: 'الشرق الأوسط' },
    { code: 'DXB', name: 'دبي',                 country: 'الإمارات 🇦🇪', region: 'الشرق الأوسط' },
    { code: 'AUH', name: 'أبوظبي',              country: 'الإمارات 🇦🇪', region: 'الشرق الأوسط' },
    { code: 'DOH', name: 'الدوحة',              country: 'قطر 🇶🇦',     region: 'الشرق الأوسط' },
    { code: 'BEY', name: 'بيروت',               country: 'لبنان 🇱🇧',   region: 'الشرق الأوسط' },
    { code: 'AMM', name: 'عمّان',               country: 'الأردن 🇯🇴',  region: 'الشرق الأوسط' },
    { code: 'KWI', name: 'الكويت',              country: 'الكويت 🇰🇼',  region: 'الشرق الأوسط' },
    { code: 'MCT', name: 'مسقط',                country: 'عُمان 🇴🇲',   region: 'الشرق الأوسط' },
    // Americas
    { code: 'YUL', name: 'مونتريال',            country: 'كندا 🇨🇦',    region: 'الأمريكتان' },
    { code: 'JFK', name: 'نيويورك JFK',         country: 'الولايات المتحدة 🇺🇸', region: 'الأمريكتان' },
  ]

  // ── Days helpers ───────────────────────────────────────────────────────────
  const DAYS_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
  const ALL_DAYS = [0,1,2,3,4,5,6]
  const MON_WED_FRI = [1,3,5]
  const MON_WED_FRI_SUN = [0,1,3,5]
  const MON_THU = [1,4]
  const MON_THU_SAT = [1,4,6]
  const MON_WED_FRI_SAT_SUN = [0,1,3,5,6]

  function daysLabel(days) {
    if (days.length === 7) return 'يومياً'
    if (JSON.stringify(days) === JSON.stringify(MON_WED_FRI_SUN)) return 'الاثنين · الأربعاء · الجمعة · الأحد'
    if (JSON.stringify(days) === JSON.stringify(MON_WED_FRI)) return 'الاثنين · الأربعاء · الجمعة'
    if (JSON.stringify(days) === JSON.stringify(MON_THU)) return 'الاثنين · الخميس'
    if (JSON.stringify(days) === JSON.stringify(MON_THU_SAT)) return 'الاثنين · الخميس · السبت'
    return days.map(d => DAYS_AR[d]).join(' · ')
  }

  function addMinutes(time, mins) {
    const [h, m] = time.split(':').map(Number)
    const total = h * 60 + m + mins
    return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
  }

  function minutesBetween(dep, arr) {
    const [dh, dm] = dep.split(':').map(Number)
    const [ah, am] = arr.split(':').map(Number)
    let diff = (ah * 60 + am) - (dh * 60 + dm)
    if (diff < 0) diff += 1440
    return diff
  }

  function formatDuration(mins) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m === 0 ? `${h}س` : `${h}س ${m}د`
  }

  // ── Static domestic schedule ────────────────────────────────────────────────
  const DOMESTIC_SCHEDULE = [
    // Alger ↔ Oran
    { from:'ALG',to:'ORN', fn:'AH 1001', dep:'07:00', arr:'08:00', days:ALL_DAYS },
    { from:'ALG',to:'ORN', fn:'AH 1003', dep:'12:30', arr:'13:30', days:ALL_DAYS },
    { from:'ALG',to:'ORN', fn:'AH 1005', dep:'17:30', arr:'18:30', days:ALL_DAYS },
    { from:'ORN',to:'ALG', fn:'AH 1002', dep:'09:30', arr:'10:30', days:ALL_DAYS },
    { from:'ORN',to:'ALG', fn:'AH 1004', dep:'15:00', arr:'16:00', days:ALL_DAYS },
    { from:'ORN',to:'ALG', fn:'AH 1006', dep:'20:00', arr:'21:00', days:ALL_DAYS },
    // Alger ↔ Constantine
    { from:'ALG',to:'CZL', fn:'AH 1101', dep:'07:30', arr:'08:30', days:ALL_DAYS },
    { from:'ALG',to:'CZL', fn:'AH 1103', dep:'13:00', arr:'14:00', days:ALL_DAYS },
    { from:'ALG',to:'CZL', fn:'AH 1105', dep:'18:00', arr:'19:00', days:ALL_DAYS },
    { from:'CZL',to:'ALG', fn:'AH 1102', dep:'10:00', arr:'11:00', days:ALL_DAYS },
    { from:'CZL',to:'ALG', fn:'AH 1104', dep:'15:30', arr:'16:30', days:ALL_DAYS },
    { from:'CZL',to:'ALG', fn:'AH 1106', dep:'20:30', arr:'21:30', days:ALL_DAYS },
    // Alger ↔ Annaba
    { from:'ALG',to:'AAE', fn:'AH 1201', dep:'08:00', arr:'09:10', days:MON_WED_FRI_SUN },
    { from:'ALG',to:'AAE', fn:'AH 1203', dep:'15:00', arr:'16:10', days:MON_WED_FRI_SUN },
    { from:'AAE',to:'ALG', fn:'AH 1202', dep:'11:00', arr:'12:10', days:MON_WED_FRI_SUN },
    { from:'AAE',to:'ALG', fn:'AH 1204', dep:'17:30', arr:'18:40', days:MON_WED_FRI_SUN },
    // Alger ↔ Tamanrasset
    { from:'ALG',to:'TMR', fn:'AH 1401', dep:'07:00', arr:'09:15', days:MON_WED_FRI },
    { from:'ALG',to:'TMR', fn:'AH 1403', dep:'15:00', arr:'17:15', days:[0,4] },
    { from:'TMR',to:'ALG', fn:'AH 1402', dep:'10:30', arr:'12:45', days:MON_WED_FRI },
    { from:'TMR',to:'ALG', fn:'AH 1404', dep:'18:30', arr:'20:45', days:[0,4] },
    // Alger ↔ Ghardaia
    { from:'ALG',to:'GHA', fn:'AH 1301', dep:'08:30', arr:'09:45', days:ALL_DAYS },
    { from:'ALG',to:'GHA', fn:'AH 1303', dep:'16:00', arr:'17:15', days:MON_WED_FRI_SUN },
    { from:'GHA',to:'ALG', fn:'AH 1302', dep:'11:00', arr:'12:15', days:ALL_DAYS },
    { from:'GHA',to:'ALG', fn:'AH 1304', dep:'18:30', arr:'19:45', days:MON_WED_FRI_SUN },
    // Alger ↔ Ouargla
    { from:'ALG',to:'OGX', fn:'AH 1501', dep:'09:00', arr:'10:30', days:MON_WED_FRI_SUN },
    { from:'OGX',to:'ALG', fn:'AH 1502', dep:'12:00', arr:'13:30', days:MON_WED_FRI_SUN },
    // Alger ↔ Bejaia
    { from:'ALG',to:'BJA', fn:'AH 1601', dep:'08:00', arr:'09:00', days:[1,3,6] },
    { from:'BJA',to:'ALG', fn:'AH 1602', dep:'10:30', arr:'11:30', days:[1,3,6] },
    // Alger ↔ Setif
    { from:'ALG',to:'QSF', fn:'AH 1701', dep:'09:00', arr:'10:10', days:ALL_DAYS },
    { from:'QSF',to:'ALG', fn:'AH 1702', dep:'11:30', arr:'12:40', days:ALL_DAYS },
    // Alger ↔ Tlemcen
    { from:'ALG',to:'TLM', fn:'AH 1801', dep:'08:30', arr:'09:30', days:MON_WED_FRI_SUN },
    { from:'TLM',to:'ALG', fn:'AH 1802', dep:'11:00', arr:'12:00', days:MON_WED_FRI_SUN },
    // Alger ↔ Batna
    { from:'ALG',to:'BLJ', fn:'AH 1901', dep:'10:00', arr:'11:00', days:MON_WED_FRI },
    { from:'BLJ',to:'ALG', fn:'AH 1902', dep:'12:30', arr:'13:30', days:MON_WED_FRI },
    // Alger ↔ Biskra
    { from:'ALG',to:'BSK', fn:'AH 2001', dep:'09:30', arr:'10:45', days:ALL_DAYS },
    { from:'BSK',to:'ALG', fn:'AH 2002', dep:'12:00', arr:'13:15', days:ALL_DAYS },
    // Alger ↔ Tiaret
    { from:'ALG',to:'TID', fn:'AH 2101', dep:'10:00', arr:'11:00', days:MON_WED_FRI },
    { from:'TID',to:'ALG', fn:'AH 2102', dep:'12:30', arr:'13:30', days:MON_WED_FRI },
    // Alger ↔ El Oued
    { from:'ALG',to:'ELU', fn:'AH 2201', dep:'10:30', arr:'12:00', days:MON_WED_FRI_SUN },
    { from:'ELU',to:'ALG', fn:'AH 2202', dep:'13:30', arr:'15:00', days:MON_WED_FRI_SUN },
    // Alger ↔ Hassi Messaoud
    { from:'ALG',to:'HME', fn:'AH 2301', dep:'07:30', arr:'09:00', days:ALL_DAYS },
    { from:'ALG',to:'HME', fn:'AH 2303', dep:'15:30', arr:'17:00', days:MON_WED_FRI_SUN },
    { from:'HME',to:'ALG', fn:'AH 2302', dep:'10:30', arr:'12:00', days:ALL_DAYS },
    { from:'HME',to:'ALG', fn:'AH 2304', dep:'18:30', arr:'20:00', days:MON_WED_FRI_SUN },
    // Alger ↔ Djanet
    { from:'ALG',to:'DJG', fn:'AH 2401', dep:'08:00', arr:'10:30', days:MON_THU_SAT },
    { from:'DJG',to:'ALG', fn:'AH 2402', dep:'12:00', arr:'14:30', days:MON_THU_SAT },
    // Alger ↔ Bechar
    { from:'ALG',to:'CBH', fn:'AH 2501', dep:'09:00', arr:'10:30', days:MON_WED_FRI },
    { from:'CBH',to:'ALG', fn:'AH 2502', dep:'12:00', arr:'13:30', days:MON_WED_FRI },
    // Alger ↔ Adrar
    { from:'ALG',to:'ADB', fn:'AH 2601', dep:'08:30', arr:'10:30', days:[1,4,6] },
    { from:'ADB',to:'ALG', fn:'AH 2602', dep:'12:00', arr:'14:00', days:[1,4,6] },
    // Alger ↔ In Aménas
    { from:'ALG',to:'IAM', fn:'AH 2701', dep:'09:00', arr:'11:00', days:MON_THU },
    { from:'IAM',to:'ALG', fn:'AH 2702', dep:'12:30', arr:'14:30', days:MON_THU },
    // Alger ↔ In Salah
    { from:'ALG',to:'INZ', fn:'AH 2801', dep:'09:00', arr:'11:00', days:[1,4] },
    { from:'INZ',to:'ALG', fn:'AH 2802', dep:'12:30', arr:'14:30', days:[1,4] },
    // Alger ↔ Jijel
    { from:'ALG',to:'GJL', fn:'AH 2901', dep:'09:30', arr:'10:40', days:MON_WED_FRI },
    { from:'GJL',to:'ALG', fn:'AH 2902', dep:'12:00', arr:'13:10', days:MON_WED_FRI },
    // Alger ↔ Tebessa
    { from:'ALG',to:'TEE', fn:'AH 3001', dep:'10:00', arr:'11:20', days:MON_WED_FRI },
    { from:'TEE',to:'ALG', fn:'AH 3002', dep:'13:00', arr:'14:20', days:MON_WED_FRI },
    // Alger ↔ Illizi
    { from:'ALG',to:'VVZ', fn:'AH 3101', dep:'09:00', arr:'11:30', days:MON_THU },
    { from:'VVZ',to:'ALG', fn:'AH 3102', dep:'13:00', arr:'15:30', days:MON_THU },
    // Alger ↔ Tindouf
    { from:'ALG',to:'TFR', fn:'AH 3201', dep:'09:00', arr:'11:30', days:[1,5] },
    { from:'TFR',to:'ALG', fn:'AH 3202', dep:'13:00', arr:'15:30', days:[1,5] },
    // Oran ↔ Constantine
    { from:'ORN',to:'CZL', fn:'AH 4001', dep:'09:30', arr:'10:40', days:MON_WED_FRI },
    { from:'CZL',to:'ORN', fn:'AH 4002', dep:'12:00', arr:'13:10', days:MON_WED_FRI },
    // Oran ↔ Annaba
    { from:'ORN',to:'AAE', fn:'AH 4101', dep:'10:00', arr:'11:30', days:[1,4] },
    { from:'AAE',to:'ORN', fn:'AH 4102', dep:'13:00', arr:'14:30', days:[1,4] },
  ]

  // ── International schedule ──────────────────────────────────────────────────
  const INTL_SCHEDULE = [
    // ALG → Europe
    { from:'ALG',to:'CDG', fn:'AH 1000', dep:'09:00', arr:'13:00', days:ALL_DAYS },
    { from:'ALG',to:'CDG', fn:'AH 1002', dep:'17:00', arr:'21:00', days:ALL_DAYS },
    { from:'CDG',to:'ALG', fn:'AH 1001', dep:'14:00', arr:'18:00', days:ALL_DAYS },
    { from:'CDG',to:'ALG', fn:'AH 1003', dep:'22:00', arr:'02:00', days:ALL_DAYS },
    { from:'ALG',to:'ORY', fn:'AH 1010', dep:'08:00', arr:'12:00', days:MON_WED_FRI_SAT_SUN },
    { from:'ORY',to:'ALG', fn:'AH 1011', dep:'13:30', arr:'17:30', days:MON_WED_FRI_SAT_SUN },
    { from:'ALG',to:'LYS', fn:'AH 1020', dep:'09:30', arr:'13:30', days:MON_WED_FRI_SUN },
    { from:'LYS',to:'ALG', fn:'AH 1021', dep:'15:00', arr:'19:00', days:MON_WED_FRI_SUN },
    { from:'ALG',to:'MRS', fn:'AH 1030', dep:'09:00', arr:'13:00', days:ALL_DAYS },
    { from:'MRS',to:'ALG', fn:'AH 1031', dep:'14:30', arr:'18:30', days:ALL_DAYS },
    { from:'ALG',to:'NCE', fn:'AH 1040', dep:'10:00', arr:'14:00', days:MON_WED_FRI_SUN },
    { from:'NCE',to:'ALG', fn:'AH 1041', dep:'15:30', arr:'19:30', days:MON_WED_FRI_SUN },
    { from:'ALG',to:'BOD', fn:'AH 1050', dep:'10:30', arr:'14:30', days:[1,4,6] },
    { from:'BOD',to:'ALG', fn:'AH 1051', dep:'16:00', arr:'20:00', days:[1,4,6] },
    { from:'ALG',to:'TLS', fn:'AH 1060', dep:'10:00', arr:'14:00', days:[1,4,6] },
    { from:'TLS',to:'ALG', fn:'AH 1061', dep:'15:30', arr:'19:30', days:[1,4,6] },
    { from:'ALG',to:'NTE', fn:'AH 1070', dep:'10:30', arr:'14:30', days:[1,5] },
    { from:'NTE',to:'ALG', fn:'AH 1071', dep:'16:00', arr:'20:00', days:[1,5] },
    { from:'ALG',to:'SXB', fn:'AH 1080', dep:'10:00', arr:'14:00', days:[1,4] },
    { from:'SXB',to:'ALG', fn:'AH 1081', dep:'15:30', arr:'19:30', days:[1,4] },
    { from:'ALG',to:'BRU', fn:'AH 1090', dep:'08:00', arr:'12:00', days:MON_WED_FRI_SUN },
    { from:'BRU',to:'ALG', fn:'AH 1091', dep:'13:30', arr:'17:30', days:MON_WED_FRI_SUN },
    { from:'ALG',to:'AMS', fn:'AH 1100', dep:'09:00', arr:'13:00', days:MON_THU_SAT },
    { from:'AMS',to:'ALG', fn:'AH 1101', dep:'14:30', arr:'18:30', days:MON_THU_SAT },
    { from:'ALG',to:'LHR', fn:'AH 1110', dep:'09:00', arr:'13:30', days:MON_WED_FRI_SUN },
    { from:'LHR',to:'ALG', fn:'AH 1111', dep:'15:00', arr:'19:30', days:MON_WED_FRI_SUN },
    { from:'ALG',to:'LGW', fn:'AH 1120', dep:'10:00', arr:'14:30', days:[1,5] },
    { from:'LGW',to:'ALG', fn:'AH 1121', dep:'16:00', arr:'20:30', days:[1,5] },
    { from:'ALG',to:'BCN', fn:'AH 1130', dep:'09:00', arr:'12:30', days:MON_WED_FRI },
    { from:'BCN',to:'ALG', fn:'AH 1131', dep:'14:00', arr:'17:30', days:MON_WED_FRI },
    { from:'ALG',to:'MAD', fn:'AH 1140', dep:'09:30', arr:'13:00', days:[1,4,6] },
    { from:'MAD',to:'ALG', fn:'AH 1141', dep:'14:30', arr:'18:00', days:[1,4,6] },
    { from:'ALG',to:'FCO', fn:'AH 1150', dep:'10:00', arr:'14:00', days:MON_WED_FRI_SUN },
    { from:'FCO',to:'ALG', fn:'AH 1151', dep:'15:30', arr:'19:30', days:MON_WED_FRI_SUN },
    { from:'ALG',to:'MXP', fn:'AH 1160', dep:'10:30', arr:'14:30', days:[1,4,6] },
    { from:'MXP',to:'ALG', fn:'AH 1161', dep:'16:00', arr:'20:00', days:[1,4,6] },
    { from:'ALG',to:'FRA', fn:'AH 1170', dep:'09:00', arr:'13:30', days:[1,4,6] },
    { from:'FRA',to:'ALG', fn:'AH 1171', dep:'15:00', arr:'19:30', days:[1,4,6] },
    { from:'ALG',to:'GVA', fn:'AH 1180', dep:'09:30', arr:'13:30', days:MON_WED_FRI_SUN },
    { from:'GVA',to:'ALG', fn:'AH 1181', dep:'15:00', arr:'19:00', days:MON_WED_FRI_SUN },
    { from:'ALG',to:'ZRH', fn:'AH 1190', dep:'09:30', arr:'13:30', days:[1,4] },
    { from:'ZRH',to:'ALG', fn:'AH 1191', dep:'15:00', arr:'19:00', days:[1,4] },
    { from:'ALG',to:'IST', fn:'AH 1200', dep:'10:30', arr:'14:30', days:MON_WED_FRI_SUN },
    { from:'IST',to:'ALG', fn:'AH 1201', dep:'16:00', arr:'20:00', days:MON_WED_FRI_SUN },
    { from:'ALG',to:'SVO', fn:'AH 1210', dep:'09:00', arr:'15:00', days:[1,5] },
    { from:'SVO',to:'ALG', fn:'AH 1211', dep:'17:00', arr:'23:00', days:[1,5] },
    // Africa
    { from:'ALG',to:'TUN', fn:'AH 2000', dep:'09:00', arr:'10:30', days:ALL_DAYS },
    { from:'TUN',to:'ALG', fn:'AH 2001', dep:'12:00', arr:'13:30', days:ALL_DAYS },
    { from:'ALG',to:'CMN', fn:'AH 2010', dep:'10:00', arr:'12:00', days:MON_WED_FRI_SUN },
    { from:'CMN',to:'ALG', fn:'AH 2011', dep:'13:30', arr:'15:30', days:MON_WED_FRI_SUN },
    { from:'ALG',to:'CAI', fn:'AH 2020', dep:'10:00', arr:'13:00', days:MON_WED_FRI },
    { from:'CAI',to:'ALG', fn:'AH 2021', dep:'14:30', arr:'17:30', days:MON_WED_FRI },
    { from:'ALG',to:'TIP', fn:'AH 2030', dep:'10:00', arr:'12:00', days:MON_WED_FRI },
    { from:'TIP',to:'ALG', fn:'AH 2031', dep:'13:30', arr:'15:30', days:MON_WED_FRI },
    { from:'ALG',to:'DKR', fn:'AH 2040', dep:'10:00', arr:'15:00', days:MON_THU },
    { from:'DKR',to:'ALG', fn:'AH 2041', dep:'17:00', arr:'22:00', days:MON_THU },
    { from:'ALG',to:'NKC', fn:'AH 2050', dep:'10:30', arr:'14:30', days:[1,4] },
    { from:'NKC',to:'ALG', fn:'AH 2051', dep:'16:00', arr:'20:00', days:[1,4] },
    { from:'ALG',to:'BKO', fn:'AH 2060', dep:'10:00', arr:'15:00', days:[1,5] },
    { from:'BKO',to:'ALG', fn:'AH 2061', dep:'17:00', arr:'22:00', days:[1,5] },
    { from:'ALG',to:'NIM', fn:'AH 2070', dep:'10:00', arr:'15:30', days:[4] },
    { from:'NIM',to:'ALG', fn:'AH 2071', dep:'17:30', arr:'23:00', days:[4] },
    { from:'ALG',to:'NDJ', fn:'AH 2080', dep:'10:30', arr:'15:30', days:[4] },
    { from:'NDJ',to:'ALG', fn:'AH 2081', dep:'17:30', arr:'22:30', days:[4] },
    { from:'ALG',to:'ABJ', fn:'AH 2090', dep:'10:00', arr:'15:30', days:[1,5] },
    { from:'ABJ',to:'ALG', fn:'AH 2091', dep:'17:30', arr:'23:00', days:[1,5] },
    { from:'ALG',to:'LOS', fn:'AH 2100', dep:'10:30', arr:'16:30', days:[1,4] },
    { from:'LOS',to:'ALG', fn:'AH 2101', dep:'19:00', arr:'01:00', days:[1,4] },
    { from:'ALG',to:'ADD', fn:'AH 2110', dep:'10:00', arr:'17:00', days:[1,5] },
    { from:'ADD',to:'ALG', fn:'AH 2111', dep:'19:00', arr:'02:00', days:[1,5] },
    { from:'ALG',to:'NBO', fn:'AH 2120', dep:'10:00', arr:'17:00', days:[1,4] },
    { from:'NBO',to:'ALG', fn:'AH 2121', dep:'19:00', arr:'02:00', days:[1,4] },
    // Middle East
    { from:'ALG',to:'JED', fn:'AH 3000', dep:'09:00', arr:'13:00', days:MON_WED_FRI_SUN },
    { from:'JED',to:'ALG', fn:'AH 3001', dep:'14:30', arr:'18:30', days:MON_WED_FRI_SUN },
    { from:'ALG',to:'RUH', fn:'AH 3010', dep:'09:30', arr:'14:30', days:[1,3] },
    { from:'RUH',to:'ALG', fn:'AH 3011', dep:'16:00', arr:'21:00', days:[1,3] },
    { from:'ALG',to:'DXB', fn:'AH 3020', dep:'10:00', arr:'17:00', days:MON_WED_FRI },
    { from:'DXB',to:'ALG', fn:'AH 3021', dep:'19:00', arr:'02:00', days:MON_WED_FRI },
    { from:'ALG',to:'DOH', fn:'AH 3030', dep:'09:00', arr:'14:00', days:MON_THU },
    { from:'DOH',to:'ALG', fn:'AH 3031', dep:'16:00', arr:'21:00', days:MON_THU },
    { from:'ALG',to:'BEY', fn:'AH 3040', dep:'10:00', arr:'13:30', days:[1,4] },
    { from:'BEY',to:'ALG', fn:'AH 3041', dep:'15:00', arr:'18:30', days:[1,4] },
    { from:'ALG',to:'AMM', fn:'AH 3050', dep:'10:00', arr:'13:30', days:[1,4] },
    { from:'AMM',to:'ALG', fn:'AH 3051', dep:'15:00', arr:'18:30', days:[1,4] },
    { from:'ALG',to:'KWI', fn:'AH 3060', dep:'09:30', arr:'14:30', days:[1,5] },
    { from:'KWI',to:'ALG', fn:'AH 3061', dep:'16:00', arr:'21:00', days:[1,5] },
    { from:'ALG',to:'MCT', fn:'AH 3070', dep:'10:00', arr:'16:00', days:[1,4] },
    { from:'MCT',to:'ALG', fn:'AH 3071', dep:'18:00', arr:'00:00', days:[1,4] },
    // Americas (seasonal)
    { from:'ALG',to:'YUL', fn:'AH 5000', dep:'10:00', arr:'15:00', days:[5,0], note:'موسمي — يونيو/سبتمبر' },
    { from:'YUL',to:'ALG', fn:'AH 5001', dep:'17:30', arr:'08:00', days:[5,0], note:'موسمي — يونيو/سبتمبر' },
    // From Oran international
    { from:'ORN',to:'CDG', fn:'AH 3001', dep:'08:00', arr:'12:00', days:MON_WED_FRI_SUN },
    { from:'CDG',to:'ORN', fn:'AH 3002', dep:'14:00', arr:'18:00', days:MON_WED_FRI_SUN },
    { from:'ORN',to:'MRS', fn:'AH 3011', dep:'09:00', arr:'13:00', days:[1,4,6] },
    { from:'MRS',to:'ORN', fn:'AH 3012', dep:'14:30', arr:'18:30', days:[1,4,6] },
    { from:'ORN',to:'LYS', fn:'AH 3021', dep:'09:30', arr:'13:30', days:[1,5] },
    { from:'LYS',to:'ORN', fn:'AH 3022', dep:'15:00', arr:'19:00', days:[1,5] },
    // From Constantine international
    { from:'CZL',to:'CDG', fn:'AH 4001', dep:'08:30', arr:'12:30', days:MON_WED_FRI_SUN },
    { from:'CDG',to:'CZL', fn:'AH 4002', dep:'14:00', arr:'18:00', days:MON_WED_FRI_SUN },
    { from:'CZL',to:'MRS', fn:'AH 4011', dep:'09:00', arr:'13:00', days:[1,4] },
    { from:'MRS',to:'CZL', fn:'AH 4012', dep:'14:30', arr:'18:30', days:[1,4] },
    // From Annaba international
    { from:'AAE',to:'CDG', fn:'AH 5001', dep:'09:00', arr:'13:00', days:MON_WED_FRI },
    { from:'CDG',to:'AAE', fn:'AH 5002', dep:'14:30', arr:'18:30', days:MON_WED_FRI },
  ]

  // ── Search endpoint ──────────────────────────────────────────────────────────
  router.post('/search', (req, res) => {
    try {
      const { from = '', to = '', type = 'domestic', date = '' } = req.body

      const schedule = type === 'domestic' ? DOMESTIC_SCHEDULE : INTL_SCHEDULE
      const fromUp = from.toUpperCase()
      const toUp = to.toUpperCase()

      let results = schedule.filter(f => {
        const matchFrom = !fromUp || f.from === fromUp
        const matchTo = !toUp || f.to === toUp
        return matchFrom && matchTo
      })

      // Filter by day of week if date provided
      if (date) {
        const d = new Date(date)
        if (!isNaN(d.getTime())) {
          const dow = d.getDay() // 0=Sun,1=Mon,...6=Sat
          results = results.filter(f => f.days.includes(dow))
        }
      }

      // Enrich with duration and readable days
      const enriched = results.map(f => ({
        ...f,
        duration: formatDuration(minutesBetween(f.dep, f.arr)),
        daysLabel: daysLabel(f.days),
        status: 'في الموعد',
        class: 'اقتصادي + أعمال',
      }))

      // Get airport info
      const allAirports = [...DOMESTIC_AIRPORTS, ...INTL_AIRPORTS]
      const fromAirport = allAirports.find(a => a.code === fromUp)
      const toAirport   = allAirports.find(a => a.code === toUp)

      res.json({
        ok: true,
        count: enriched.length,
        from: fromAirport || null,
        to: toAirport || null,
        date: date || null,
        type,
        flights: enriched,
        source: 'Air Algérie — جداول رسمية 2024/2025',
        bookingUrl: `https://www.airalgerie.dz`,
      })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── Airports list endpoint ───────────────────────────────────────────────────
  router.get('/airports', (req, res) => {
    res.json({
      domestic: DOMESTIC_AIRPORTS,
      international: INTL_AIRPORTS,
    })
  })

  return router
}

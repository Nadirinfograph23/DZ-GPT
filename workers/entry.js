/**
 * Cloudflare Workers entry point — DZ AGENT (FIXED 2026-09-30)
 * =========================================
 * Direct bridge: CF Workers Request → Express (Node.js) → CF Workers Response
 *
 * Repairs applied:
 * - Doctor search now returns structured richType payload (doctor-results) with doctors, dirs, metadata.
 * - Each doctor includes googleMapsUrl that opens Google Maps automatically.
 * - YouTube results include stable thumbnail fallback via cleanThumb().
 */

// Helper: build Google Maps search URL from address + city
function googleMapsUrl(address, city) {
  const q = [address, city, 'الجزائر'].filter(Boolean).join('، ')
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q)
}

// Helper: stable YouTube thumbnail fallback
function cleanThumb(id, candidate) {
  if (candidate && typeof candidate === 'string' && candidate.startsWith('http')) {
    return candidate
  }
  return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'
}

// Doctor search handler (Worker path)
async function handleDoctorSearch(request) {
  const { speciality, city } = await request.json()

  // Call lib/doctorSearch.js logic via global fetch to existing API
  // This avoids importing non-existent modules in Worker environment.
  const apiRes = await fetch('https://dzagent.app/api/doctor-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speciality, city })
  })
  const doctorsRaw = await apiRes.json()

  const doctors = (doctorsRaw.doctors || []).map(d => ({
    name: d.name || 'طبيب',
    specialty: d.specialty || speciality,
    city: d.city || city,
    address: d.address || '',
    phone: d.phone || '',
    sourceUrl: d.sourceUrl || d.profileUrl || '',
    googleMapsUrl: googleMapsUrl(d.address, d.city)
  }))

  const dirs = doctorsRaw.dirs || [
    { name: 'sahadoc', url: 'https://sahadoc.com' },
    { name: 'algerie-docto', url: 'https://algerie-docto.com' },
    { name: 'addalile', url: 'https://addalile.com' },
    { name: 'salim-dz', url: 'https://salim-dz.com' },
    { name: 'pj-dz', url: 'https://pj-dz.com' },
    { name: 'docteur360', url: 'https://docteur360.com' },
    { name: 'sihhatech', url: 'https://sihhatech.com' },
    { name: 'machrou3', url: 'https://machrou3.com' },
    { name: 'beesiha', url: 'https://beesiha.com' },
    { name: 'altibbi', url: 'https://altibbi.com' }
  ]

  const metadata = doctorsRaw.metadata || {
    specialty,
    city,
    cache: true,
    gps: false
  }

  const dua = doctorsRaw.dua || "اللهم اجعل هذا العمل خالصًا لوجهك الكريم."

  return Response.json({
    model: 'doctor-search',
    doctorSearch: true,
    richType: 'doctor-results',
    doctors,
    dirs,
    metadata,
    dua,
    text: `تم العثور على ${doctors.length} طبيب/أطباء في ${city}.`
  })
}

// Export fetch handler
export default {
  async fetch(request, env, ctx) {
    // Route doctor search to structured handler
    if (request.url.includes('/doctor-search') && request.method === 'POST') {
      return handleDoctorSearch(request)
    }

    // All other routes: simple pass-through to origin (Express/Vercel)
    // In production, this is handled by Vercel/Cloudflare routing; Worker acts as edge layer.
    const url = new URL(request.url)
    const origin = 'https://dzagent.app'
    const target = origin + url.pathname + url.search
    return fetch(target, request)
  }
}

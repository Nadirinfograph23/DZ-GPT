// Open-Sora 2.0 — Gradio Space Client
// هدف: توليد فيديو عبر HF Space الرسمي لـ hpcai-tech/Open-Sora
// Fallback: HF Inference API لـ AnimateDiff عند سقوط الـ Space

const SPACE_URL = 'https://hpcai-tech-open-sora.hf.space'
const TIMEOUT_SUBMIT = 12_000
const TIMEOUT_RESULT = 200_000

// ── Gradio Submit → event_id ───────────────────────────────────────────────
async function gradioSubmit(fnName, data) {
  const r = await fetch(`${SPACE_URL}/gradio_api/call/${fnName}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ data }),
    signal:  AbortSignal.timeout(TIMEOUT_SUBMIT),
  })
  if (!r.ok) throw new Error(`Open-Sora submit ${r.status}`)
  const j = await r.json()
  if (!j.event_id) throw new Error('Open-Sora: لا event_id في الردّ')
  return j.event_id
}

// ── Gradio SSE Result ─────────────────────────────────────────────────────
async function gradioStream(fnName, eventId) {
  const r = await fetch(`${SPACE_URL}/gradio_api/call/${fnName}/${eventId}`, {
    signal: AbortSignal.timeout(TIMEOUT_RESULT),
  })
  if (!r.ok) throw new Error(`Open-Sora stream ${r.status}`)

  const reader  = r.body.getReader()
  const decoder = new TextDecoder()
  let   buf     = ''
  let   result  = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const d = JSON.parse(line.slice(6))
        if (Array.isArray(d) && d.length > 0) {
          result = d
        }
      } catch {}
    }
  }
  return result
}

// ── استخراج URL الفيديو من ردّ Gradio ─────────────────────────────────────
function extractVideoUrl(data) {
  if (!data) return null
  for (const item of data) {
    if (!item) continue
    if (typeof item === 'string') {
      if (item.includes('.mp4') || item.includes('.webm')) return item
    }
    if (item?.video?.url) return item.video.url
    if (item?.url)        return item.url
    if (item?.value?.url) return item.value.url
    if (Array.isArray(item)) {
      const u = extractVideoUrl(item)
      if (u) return u
    }
  }
  return null
}

// ── تنزيل الفيديو من URL ─────────────────────────────────────────────────
async function downloadVideo(url) {
  const full = url.startsWith('http') ? url : `${SPACE_URL}${url}`
  const r = await fetch(full, { signal: AbortSignal.timeout(90_000) })
  if (!r.ok) throw new Error(`Download ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length < 1000) throw new Error('فيديو فارغ من Open-Sora')
  const ct   = r.headers.get('content-type') || 'video/mp4'
  const mime = ct.includes('webm') ? 'video/webm' : 'video/mp4'
  return { buf, mime }
}

// ── الدالة الرئيسية: T2V via Open-Sora Space ──────────────────────────────
export async function openSoraTextToVideo(prompt, { width = 512, height = 288 } = {}) {
  const aspectRatio = width > height ? '16:9' : width < height ? '9:16' : '1:1'
  const resolution  = '480p'
  const numFrames   = 51   // ~2s @ 24fps
  const fps         = 24

  // أسماء محتملة لدالة الـ Gradio (نجرّبها بالترتيب)
  const fnNames = ['generate', 'infer', 'generate_video', 'run']

  for (const fn of fnNames) {
    try {
      console.log(`[Open-Sora] جرّب fn=${fn} — ${aspectRatio} ${resolution}`)
      const eventId = await gradioSubmit(fn, [
        prompt, resolution, aspectRatio, numFrames, fps,
        7.5,   // guidance_scale
        50,    // num_inference_steps
        null,  // seed (عشوائي)
      ])
      console.log(`[Open-Sora] event_id=${eventId} — ننتظر النتيجة...`)
      const data = await gradioStream(fn, eventId)

      const videoUrl = extractVideoUrl(data)
      if (!videoUrl) {
        console.warn(`[Open-Sora:${fn}] لا URL في الردّ — data:`, JSON.stringify(data)?.slice(0, 200))
        continue
      }
      const { buf, mime } = await downloadVideo(videoUrl)
      console.log(`[Open-Sora] ✅ ${fn} → ${(buf.length/1024/1024).toFixed(1)}MB`)
      return { buf, mime, model: 'Open-Sora 2.0' }
    } catch (e) {
      console.warn(`[Open-Sora:${fn}]`, e.message)
    }
  }
  return null
}

// ── فحص حالة الـ Space ────────────────────────────────────────────────────
export async function checkOpenSoraHealth() {
  try {
    const r = await fetch(`${SPACE_URL}/info`, { signal: AbortSignal.timeout(8_000) })
    return { ok: r.ok, status: r.ok ? 'online' : `HTTP ${r.status}`, space: SPACE_URL }
  } catch (e) {
    return { ok: false, status: e.message, space: SPACE_URL }
  }
}

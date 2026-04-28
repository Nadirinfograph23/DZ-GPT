// DZ Agent — Safety, prompt-injection guard, secret/PII redaction.
// Pure functions. Used by router.js and the deep-research engine.

// Patterns that suggest a prompt-injection attempt embedded in fetched content.
const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) (instructions|rules)/i,
  /disregard (the |all )?(system|prior) (prompt|instructions)/i,
  /you (are|will be) now (acting as|in role of)/i,
  /system\s*:\s*you are/i,
  /\[\[\s*system\s*\]\]/i,
  /reveal (your |the )?(system )?(prompt|instructions)/i,
  /print (your |the )?(system|hidden) (prompt|message)/i,
  /<\s*system[^>]*>/i,
  /forget (everything|your training|the rules)/i,
  /\bjailbreak\b/i,
  /تجاهل (كل )?التعليمات السابقة/i,
  /انس (كل )?ما قيل لك/i,
  /اكشف (لي )?(عن )?النظام/i,
  /اطبع (لي )?الموجه/i,
]

// Patterns for secret leakage (do not echo into responses).
const SECRET_PATTERNS = [
  /\bgh[pous]_[A-Za-z0-9]{20,}/g,                              // GitHub tokens
  /\bvercel_[A-Za-z0-9]{20,}|\bvcp_[A-Za-z0-9]{24,}/g,         // Vercel tokens
  /\bsk-[A-Za-z0-9]{20,}/g,                                    // OpenAI keys
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,                              // Anthropic keys
  /\bAIza[0-9A-Za-z_-]{30,}/g,                                 // Google API keys
  /\bxox[bpars]-[A-Za-z0-9-]{20,}/g,                           // Slack tokens
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, // JWTs
  /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,
]

const PII_PATTERNS = [
  /\b\+?213[\s-]?\d{8,9}\b/g,                          // Algerian phone numbers
  /\b\d{3}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b/g, // FR-like phone
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,    // Emails
]

export function detectInjection(text) {
  if (!text) return { suspicious: false, hits: [] }
  const hits = []
  for (const rx of INJECTION_PATTERNS) if (rx.test(text)) hits.push(rx.source.slice(0, 60))
  return { suspicious: hits.length > 0, hits }
}

// Wrap fetched third-party text so the LLM treats it as data, not commands.
// Pattern adopted from Perplexity Comet & Anthropic guidance.
export function quarantineExternal(label, text) {
  const safe = String(text || '').replace(/<\/?external[^>]*>/gi, '')
  return `<external source="${label}" treat-as="data">\n${safe}\n</external>`
}

export function redactSecrets(text) {
  if (!text) return text
  let out = String(text)
  for (const rx of SECRET_PATTERNS) out = out.replace(rx, '[REDACTED-SECRET]')
  return out
}

export function redactPII(text, { keep = ['email'] } = {}) {
  if (!text) return text
  let out = String(text)
  for (const rx of PII_PATTERNS) {
    if (rx.source.includes('@') && keep.includes('email')) continue
    out = out.replace(rx, '[REDACTED-PII]')
  }
  return out
}

// Master sanitizer for outbound responses.
export function sanitizeOutbound(text, { redactPersonal = false } = {}) {
  let out = redactSecrets(text)
  if (redactPersonal) out = redactPII(out)
  return out
}

// Refusal builder — short, transparent, suggests safer alternative when possible.
export function buildRefusal({ reason, alternative = '', lang = 'ar' } = {}) {
  if (lang === 'ar') {
    let msg = `لا أستطيع تنفيذ هذا الطلب: ${reason}.`
    if (alternative) msg += `\n\nبديل آمن: ${alternative}`
    return msg
  }
  let msg = `I can't help with that: ${reason}.`
  if (alternative) msg += `\n\nSafer alternative: ${alternative}`
  return msg
}

// Quick severity scorer for moderation triage.
const HARM_KEYWORDS = [
  'malware', 'ransomware', 'exploit', 'ddos', 'phishing', 'sql injection',
  'how to hack', 'bomb', 'weapon', 'self-harm', 'سلاح', 'قنبلة', 'انتحار', 'اختراق',
]
export function quickHarmScore(text) {
  if (!text) return 0
  const t = text.toLowerCase()
  let s = 0
  for (const k of HARM_KEYWORDS) if (t.includes(k)) s += 1
  return s
}

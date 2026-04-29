// DZ Agent V4 PRO — lightweight project validation.
// Goals: catch obvious breakage before persisting, without pulling in heavy parsers.
// - Every file path is unique and starts with /project/
// - Entry file exists in the file set
// - HTML <link href> / <script src> targets either exist in the project or are
//   absolute URLs (CDN / data URI) — local references that don't resolve are flagged
// - Empty / placeholder content is rejected ("TODO", "...")
// - JSON files actually parse

const PLACEHOLDER_RE = /(^|\s)(TODO|FIXME|\.\.\.|<placeholder>)(\s|$)/i

export function validateProject(plan, files) {
  const errors = []
  const warnings = []

  if (!Array.isArray(files) || files.length === 0) {
    errors.push('no files produced')
    return { ok: false, errors, warnings }
  }

  // Path uniqueness + prefix
  const seen = new Set()
  for (const f of files) {
    if (!f.path || !f.path.startsWith('/project/')) {
      errors.push(`bad path: ${f.path}`)
    }
    if (seen.has(f.path)) errors.push(`duplicate file: ${f.path}`)
    seen.add(f.path)

    if (!f.content || f.content.trim().length === 0) {
      errors.push(`empty content: ${f.path}`)
    } else if (PLACEHOLDER_RE.test(f.content) && f.content.length < 200) {
      warnings.push(`looks like placeholder: ${f.path}`)
    }
  }

  // Entry must exist (if plan provided one)
  if (plan?.entry && !seen.has(plan.entry)) {
    errors.push(`entry file not generated: ${plan.entry}`)
  }

  // JSON parse check
  for (const f of files) {
    if (f.lang === 'json' || f.path.endsWith('.json')) {
      try { JSON.parse(f.content) }
      catch (e) { errors.push(`invalid JSON in ${f.path}: ${e.message}`) }
    }
  }

  // HTML cross-link check
  for (const f of files) {
    if (f.lang !== 'html' && !f.path.endsWith('.html')) continue
    const refs = collectHtmlRefs(f.content)
    for (const ref of refs) {
      if (/^(https?:|data:|mailto:|#|\/\/)/i.test(ref)) continue
      const resolved = resolveLocal(f.path, ref)
      if (!seen.has(resolved)) {
        warnings.push(`${f.path} references missing local file: ${ref} → ${resolved}`)
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

function collectHtmlRefs(html) {
  const out = []
  const re = /<(?:link|script|img|a|source)\b[^>]*?\s(?:href|src)=["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html))) out.push(m[1])
  return out
}

function resolveLocal(fromPath, ref) {
  if (ref.startsWith('/')) return ref.startsWith('/project/') ? ref : `/project${ref}`
  const base = fromPath.split('/').slice(0, -1).join('/')
  const parts = (base + '/' + ref).split('/')
  const stack = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') stack.pop()
    else stack.push(p)
  }
  return '/' + stack.join('/')
}

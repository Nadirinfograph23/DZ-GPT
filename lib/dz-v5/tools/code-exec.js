/**
 * DZ Agent V5 — Code Execution Tool
 * Sandboxed code execution with strict security filtering.
 * Supports: JavaScript (Node.js), Python (via child_process), shell (filtered).
 */

import { execSync, spawn } from 'child_process'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const EXEC_TIMEOUT_MS = 15000
const MAX_OUTPUT_CHARS = 10000

// Blocklist of dangerous patterns
const DANGEROUS_PATTERNS = [
  /rm\s+-rf?\s+\//i,
  /mkfs/i,
  /format\s+c:/i,
  /:\(\)\s*\{.*\}.*:/,  // fork bomb
  /shutdown|reboot|halt/i,
  /iptables/i,
  /\bdd\s+if=/i,
  /curl.*\|\s*(bash|sh)/i,
  /wget.*\|\s*(bash|sh)/i,
  /\beval\s*\(\s*fetch/i,
  /process\.env\.(GITHUB_TOKEN|GROQ|DEEPSEEK|VERCEL_TOKEN)/i,
  /require\s*\(\s*['"]child_process['"]\s*\)/,
]

const ALLOWED_LANGUAGES = ['javascript', 'js', 'python', 'python3', 'shell', 'bash', 'sh']

function sanitize(code) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(`Blocked: dangerous pattern detected in code`)
    }
  }
  return code
}

function truncate(str, max = MAX_OUTPUT_CHARS) {
  if (!str) return ''
  if (str.length <= max) return str
  return str.slice(0, max) + `\n...[truncated, ${str.length - max} chars omitted]`
}

export class CodeExecTool {
  async execute(input, _ctx) {
    const code = typeof input === 'string' ? input : input.code
    const lang = (typeof input === 'object' ? input.language : null) || this._detectLang(code)

    if (!code?.trim()) return { error: 'No code provided' }
    if (!ALLOWED_LANGUAGES.includes(lang)) return { error: `Language not supported: ${lang}` }

    try {
      sanitize(code)
    } catch (err) {
      return { error: err.message, blocked: true }
    }

    if (lang === 'javascript' || lang === 'js') {
      return this._execJS(code)
    }
    if (lang === 'python' || lang === 'python3') {
      return this._execPython(code)
    }
    if (lang === 'shell' || lang === 'bash' || lang === 'sh') {
      return this._execShell(code)
    }

    return { error: `Unsupported language: ${lang}` }
  }

  _detectLang(code) {
    if (!code) return 'javascript'
    if (/^(import|from)\s+\w+|def\s+\w+\(|print\(/.test(code)) return 'python'
    if (/^#!/.test(code) || /^\s*(echo|ls|cd|mkdir|cat)\s/.test(code)) return 'shell'
    return 'javascript'
  }

  _execJS(code) {
    const tmpFile = join(tmpdir(), `dz-v5-exec-${Date.now()}.mjs`)
    try {
      // Wrap in a safe context
      const wrapped = `
const __output = [];
const console = {
  log: (...a) => __output.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')),
  error: (...a) => __output.push('[ERR] ' + a.join(' ')),
  warn: (...a) => __output.push('[WARN] ' + a.join(' ')),
};

try {
  ${code}
} catch(e) {
  console.error(e.message);
}

if (typeof result !== 'undefined') __output.push(String(result));
process.stdout.write(__output.join('\\n'));
`
      writeFileSync(tmpFile, wrapped, 'utf8')
      const stdout = execSync(`node "${tmpFile}"`, {
        timeout: EXEC_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH },
      }).toString()
      return { output: truncate(stdout), language: 'javascript' }
    } catch (err) {
      const msg = err.stderr?.toString() || err.stdout?.toString() || err.message
      return { output: truncate(msg), error: 'Execution error', language: 'javascript' }
    } finally {
      try { if (existsSync(tmpFile)) unlinkSync(tmpFile) } catch {}
    }
  }

  _execPython(code) {
    const tmpFile = join(tmpdir(), `dz-v5-exec-${Date.now()}.py`)
    try {
      writeFileSync(tmpFile, code, 'utf8')
      const stdout = execSync(`python3 "${tmpFile}"`, {
        timeout: EXEC_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      }).toString()
      return { output: truncate(stdout), language: 'python' }
    } catch (err) {
      const msg = err.stderr?.toString() || err.stdout?.toString() || err.message
      return { output: truncate(msg), error: 'Execution error', language: 'python' }
    } finally {
      try { if (existsSync(tmpFile)) unlinkSync(tmpFile) } catch {}
    }
  }

  _execShell(code) {
    // Extra security: only allow safe shell commands
    const lines = code.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
    const SAFE_CMDS = /^(echo|ls|cat|pwd|date|whoami|which|uname|node|python|npm|pip|curl -s|wget -q|grep|awk|sed|sort|uniq|wc|head|tail|mkdir -p|touch|cp|mv|find\s)/
    for (const line of lines) {
      const trimmed = line.trim()
      if (!SAFE_CMDS.test(trimmed)) {
        return { error: `Shell command not allowed: ${trimmed}`, blocked: true }
      }
    }
    try {
      const stdout = execSync(code, {
        timeout: EXEC_TIMEOUT_MS,
        maxBuffer: 512 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      }).toString()
      return { output: truncate(stdout), language: 'shell' }
    } catch (err) {
      return { output: truncate(err.stderr?.toString() || err.message), error: 'Shell error', language: 'shell' }
    }
  }
}

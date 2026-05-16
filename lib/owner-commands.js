/**
 * DZ Agent — Owner Command Processing System
 * Allows the verified project owner to train/configure the agent at runtime.
 * Verification is done via GitHub API (token must belong to the repo owner).
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = join(__dirname, '../data/owner_config.json')
const REPO_OWNER = (process.env.GITHUB_REPO_OWNER || 'Nadirinfograph23').toLowerCase()

// ── Load / Save ────────────────────────────────────────────────────────────────
export function loadOwnerConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    return { feeds: [], commands_log: [], version: 1 }
  }
}

export function saveOwnerConfig(config) {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  } catch (e) {
    console.error('[OwnerCmd] Failed to save config:', e.message)
  }
}

// ── Verify Owner via GitHub API ────────────────────────────────────────────────
const _ownerCache = new Map()
export async function verifyOwnerToken(token) {
  if (!token) return false
  if (_ownerCache.has(token)) return _ownerCache.get(token)
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        'User-Agent': 'DZ-Agent/2.0',
        Accept: 'application/vnd.github.v3+json',
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) {
      _ownerCache.set(token, false)
      return false
    }
    const user = await res.json()
    const isOwner = user.login?.toLowerCase() === REPO_OWNER
    _ownerCache.set(token, isOwner)
    // Clear cache after 10 minutes
    setTimeout(() => _ownerCache.delete(token), 10 * 60 * 1000)
    return isOwner
  } catch {
    return false
  }
}

// ── Detect Owner Command ───────────────────────────────────────────────────────
const ADD_FEED_PATTERNS = [
  /(?:أضف|اضف)\s+(?:لـ?)?(?:مصادر|مصدر)\s+(?:الأخبار[^:]*|الأخبار)\s*[:\-–]?\s*(https?:\/\/\S+)/i,
  /(?:أضف|اضف)\s+(?:لـ?)?(?:مصادر|مصدر)\s+(?:الأخبار[^،]*)\s*،?\s*هذا\s+الموقع\s*[:\-–]?\s*(https?:\/\/\S+)/i,
  /(?:أضف|اضف)\s+(?:هذا\s+)?(?:الموقع|المصدر|موقع)\s*[:\-–]?\s*(https?:\/\/\S+)/i,
  /add\s+(?:news\s+)?source\s*[:\-]?\s*(https?:\/\/\S+)/i,
]

const REMOVE_FEED_PATTERNS = [
  /(?:احذف|حذف|ازل|أزل|امسح|مسح)\s+(?:مصدر\s+)?(?:أخبار\s+)?(?:الأخبار\s+)?[:\-–]?\s*(https?:\/\/\S+)/i,
  /remove\s+(?:news\s+)?source\s*[:\-]?\s*(https?:\/\/\S+)/i,
]

const LIST_FEEDS_PATTERNS = [
  /(?:اعرض|عرض|قائمة|list|اظهر|أظهر)\s+(?:مصادر|مصدر)\s+(?:الأخبار|الأخبار الجزائرية|المضافة)/i,
  /(?:ما|ماهي|ما هي)\s+(?:مصادر|مصدر)\s+(?:الأخبار|الأخبار المضافة)/i,
]

export function detectOwnerCommand(msg) {
  for (const p of ADD_FEED_PATTERNS)    if (p.test(msg)) return 'add_feed'
  for (const p of REMOVE_FEED_PATTERNS)  if (p.test(msg)) return 'remove_feed'
  for (const p of LIST_FEEDS_PATTERNS)   if (p.test(msg)) return 'list_feeds'
  return null
}

// ── Extract URL from message ───────────────────────────────────────────────────
function extractUrl(msg) {
  const match = msg.match(/https?:\/\/[^\s<>"،,]+/)
  return match ? match[0].replace(/[.,;!?،]+$/, '') : null
}

// ── Guess source name from URL ─────────────────────────────────────────────────
function guessSourceName(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    const parts = hostname.split('.')
    return parts.length >= 2 ? parts[0] : hostname
  } catch {
    return url
  }
}

// ── Build RSS URL from site URL ────────────────────────────────────────────────
function buildRssUrl(url) {
  const base = url.replace(/\/+$/, '')
  const isLikelyRss = /feed|rss|atom|\.xml/i.test(url)
  if (isLikelyRss) return url
  return `${base}/feed`
}

// ── Process Owner Command ──────────────────────────────────────────────────────
export function processOwnerCommand(msg, config) {
  const cmd = detectOwnerCommand(msg)
  const cfg = { ...config, feeds: [...(config.feeds || [])], commands_log: [...(config.commands_log || [])] }
  const timestamp = new Date().toISOString()

  // ── ADD FEED ──
  if (cmd === 'add_feed') {
    const url = extractUrl(msg)
    if (!url) {
      return { success: false, message: '⚠️ لم أجد رابطاً صحيحاً في الأمر.\n\nمثال: أضف لمصادر الأخبار الجزائرية هذا الموقع: https://www.elbilad.net/' }
    }

    if (cfg.feeds.some(f => f.url === url || f.siteUrl === url || f.url.includes(new URL(url).hostname))) {
      return { success: false, message: `ℹ️ هذا المصدر موجود بالفعل في القائمة.\n\n🔗 ${url}` }
    }

    const rssUrl = buildRssUrl(url)
    const name   = guessSourceName(url)

    const newFeed = {
      name,
      url:      rssUrl,
      siteUrl:  url,
      tier:     1,
      type:     'news',
      lang:     'ar',
      trust:    0.80,
      addedBy:  'owner',
      addedAt:  timestamp,
    }

    cfg.feeds.push(newFeed)
    cfg.commands_log.push({ cmd: 'add_feed', url, rssUrl, name, timestamp })

    return {
      success: true,
      config:  cfg,
      feed:    newFeed,
      message: `✅ **تم إضافة المصدر بنجاح!**\n\n📰 **الاسم:** ${name}\n🔗 **RSS:** ${rssUrl}\n🌐 **الموقع:** ${url}\n\n> سيظهر هذا المصدر في نتائج الأخبار لجميع المستخدمين ابتداءً من الآن. ✅`,
    }
  }

  // ── REMOVE FEED ──
  if (cmd === 'remove_feed') {
    const url = extractUrl(msg)
    if (!url) {
      return { success: false, message: '⚠️ لم أجد رابطاً صحيحاً.\n\nمثال: احذف مصدر أخبار: https://www.example.com/feed' }
    }

    let hostname = ''
    try { hostname = new URL(url).hostname } catch {}

    const before = cfg.feeds.length
    cfg.feeds = cfg.feeds.filter(f => {
      const fHost = (() => { try { return new URL(f.url).hostname } catch { return '' } })()
      return fHost !== hostname && !f.url.includes(url) && !f.siteUrl?.includes(url)
    })

    if (cfg.feeds.length === before) {
      return { success: false, message: `ℹ️ لم أجد هذا المصدر في قائمة المصادر المضافة.\n\n🔗 ${url}` }
    }

    cfg.commands_log.push({ cmd: 'remove_feed', url, timestamp })

    return {
      success: true,
      config:  cfg,
      message: `✅ **تم حذف المصدر بنجاح!**\n\n🗑️ تم إزالة المصدر من قائمة مصادر الأخبار لجميع المستخدمين.`,
    }
  }

  // ── LIST FEEDS ──
  if (cmd === 'list_feeds') {
    if (!cfg.feeds.length) {
      return { success: true, config: cfg, message: 'ℹ️ لا توجد مصادر أخبار مضافة من قِبَلك حتى الآن.\n\nيمكنك إضافة مصدر بقول:\n> أضف لمصادر الأخبار الجزائرية هذا الموقع: https://example.com' }
    }
    const list = cfg.feeds.map((f, i) =>
      `${i + 1}. **${f.name}** — ${f.url}${f.addedAt ? ` *(${new Date(f.addedAt).toLocaleDateString('ar-DZ')})*` : ''}`
    ).join('\n')
    return {
      success: true,
      config:  cfg,
      message: `📋 **مصادر الأخبار المضافة (${cfg.feeds.length}):**\n\n${list}`,
    }
  }

  return { success: false, message: '⚠️ أمر غير معروف.' }
}

// ── Get Extra RSS Feeds for injection ─────────────────────────────────────────
export function getExtraFeeds(config) {
  return (config.feeds || []).map(f => ({
    name:   f.name,
    url:    f.url,
    _owner: true,
  }))
}

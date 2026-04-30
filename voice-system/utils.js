// dz Voice Intelligence System — utilities
// Tiny helpers shared across STT, TTS, wake-word.

import { LANGUAGES, STORAGE_KEY, DEFAULTS } from './config.js'

// ----- env detection -----
export function isBrowser() { return typeof window !== 'undefined' }

export function hasSTT() {
  if (!isBrowser()) return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function hasTTS() {
  return isBrowser() && typeof window.speechSynthesis !== 'undefined'
}

// Some browsers require user-gesture before allowing SpeechSynthesis.
export function ttsCanSpeakNow() {
  if (!hasTTS()) return false
  try { return window.speechSynthesis.speaking !== undefined } catch { return false }
}

// ----- language detection (matches translate.js heuristics) -----
const RE_AR = /[\u0600-\u06FF\u0750-\u077F]/
const RE_FR_HINT = /[àâäéèêëïîôöùûüÿçœæ]/i
const RE_FR_WORDS = /\b(le|la|les|une?|des?|du|au|aux|et|est|dans|avec|pour|sur|sous|merci|bonjour|salut)\b/i

export function detectLang(text) {
  if (!text) return 'en'
  if (RE_AR.test(text)) return 'ar'
  if (RE_FR_HINT.test(text) || RE_FR_WORDS.test(text.toLowerCase())) return 'fr'
  return 'en'
}

export function langTag(code) {
  return LANGUAGES[code]?.tag || LANGUAGES.en.tag
}

// ----- prefs persistence -----
export function loadPrefs() {
  if (!isBrowser()) return { ...DEFAULTS }
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { return { ...DEFAULTS } }
}

export function savePrefs(prefs) {
  if (!isBrowser()) return
  try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch {}
}

// ----- timing -----
export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// Tiny event emitter — keeps DVIS framework-agnostic.
export class Emitter {
  constructor() { this._h = new Map() }
  on(ev, fn) {
    if (!this._h.has(ev)) this._h.set(ev, new Set())
    this._h.get(ev).add(fn)
    return () => this.off(ev, fn)
  }
  off(ev, fn) { this._h.get(ev)?.delete(fn) }
  emit(ev, ...args) {
    for (const fn of this._h.get(ev) || []) {
      try { fn(...args) } catch (e) { console.warn('[dvis] handler error', e) }
    }
  }
}

// Normalised string for wake-word matching (lowercase, no diacritics).
export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

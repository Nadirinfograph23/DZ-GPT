// dz Voice Intelligence System (DVIS) — central config
// All settings live here so other modules stay declarative.
// Pure ES module, zero deps, runs in any modern browser.

export const DVIS_VERSION = '2.1.0'

// Languages we actively support (Web Speech API tags).
export const LANGUAGES = {
  ar: { tag: 'ar-DZ', label: 'العربية الجزائرية', altTags: ['ar-SA', 'ar-EG', 'ar-MA'] },
  fr: { tag: 'fr-DZ', label: 'Français (DZ)', altTags: ['fr-FR', 'fr-CA'] },
  en: { tag: 'en-US', label: 'English', altTags: ['en-GB'] },
}

// Wake-word phrases — match is case-insensitive, accent-tolerant.
export const WAKE_WORDS = ['hey dz', 'hi dz', 'dz agent', 'يا دي زي', 'دي زي', 'أدي زي']

// Conversation behaviour.
export const TIMINGS = {
  followUpSilenceMs: 15_000,
  sttSilenceMs: 1_600,
  sttMaxRetries: 3,
  responseTargetMs: 3_000,
  ttsMaxChunkChars: 200,
  ttsKeepAliveMs: 10_000,
}

// Default voice prefs — user can override via UI / localStorage.
export const DEFAULTS = {
  gender: 'female',
  fastMode: true,
  muted: false,
  wakeWord: false,
  continuous: true,
  language: 'ar',
  // 'edge' = Microsoft Edge TTS (server, natural) | 'browser' = SpeechSynthesis fallback
  ttsEngine: 'edge',
}

export const STORAGE_KEY = 'dvis.prefs.v2'

// Heuristic gender hints for browser SpeechSynthesis fallback
export const VOICE_NAME_HINTS = {
  male:   ['male', 'homme', 'masculin', 'david', 'mark', 'thomas', 'fred', 'daniel', 'paul', 'alex', 'aaron', 'rishi', 'مذكر', 'hamed', 'ismael'],
  female: ['female', 'femme', 'féminin', 'zira', 'samantha', 'amelie', 'amélie', 'anna', 'lina', 'reem', 'salma', 'amina', 'zariyah', 'victoria', 'hazel', 'مؤنث'],
}

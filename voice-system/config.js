// dz Voice Intelligence System (DVIS) — central config
// All settings live here so other modules stay declarative.
// Pure ES module, zero deps, runs in any modern browser.

export const DVIS_VERSION = '2.0.0'

// Languages we actively support (Web Speech API tags).
export const LANGUAGES = {
  ar: { tag: 'ar-SA', label: 'العربية', altTags: ['ar-EG', 'ar-DZ', 'ar-MA'] },
  fr: { tag: 'fr-FR', label: 'Français', altTags: ['fr-CA'] },
  en: { tag: 'en-US', label: 'English', altTags: ['en-GB'] },
}

// Wake-word phrases — match is case-insensitive, accent-tolerant.
export const WAKE_WORDS = ['hey dz', 'hi dz', 'dz agent', 'يا دي زي', 'دي زي']

// Conversation behaviour.
export const TIMINGS = {
  // After AI finishes speaking, we restart STT for follow-ups.
  // Goes to sleep after this much silence (V2 spec: 10–20 s).
  followUpSilenceMs: 15_000,
  // Max retries for transient STT errors (no-speech, network).
  sttMaxRetries: 2,
  // Latency budget — we warn in console if exceeded.
  responseTargetMs: 3_000,
}

// Default voice prefs — user can override via UI / localStorage.
export const DEFAULTS = {
  gender: 'female', // 'male' | 'female'
  fastMode: true,   // skip warmup tone, prefer shortest TTS path
  muted: false,
  wakeWord: false,  // V2: opt-in
  continuous: true, // V2: auto-listen after AI reply
  language: 'auto', // 'auto' | 'ar' | 'fr' | 'en'
}

// Storage key for persisted user prefs.
export const STORAGE_KEY = 'dvis.prefs.v1'

// Heuristic gender hints — SpeechSynthesis voices don't expose gender directly,
// so we match on common voice-name fragments. Falls back to first available voice.
export const VOICE_NAME_HINTS = {
  male:   ['male', 'homme', 'masculin', 'david', 'mark', 'thomas', 'fred', 'daniel', 'paul', 'alex', 'aaron', 'rishi', 'مذكر'],
  female: ['female', 'femme', 'féminin', 'zira', 'samantha', 'amelie', 'amélie', 'anna', 'lina', 'reem', 'salma', 'victoria', 'hazel', 'مؤنث'],
}

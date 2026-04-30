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
  // Silence window after a final transcript before we send it to the agent.
  // Web Speech emits `isFinal` after every short pause inside a sentence, so
  // we buffer fragments and only send when the user has actually been quiet
  // for this long. Long enough to capture full Arabic sentences, short
  // enough to feel responsive.
  sttSilenceMs: 1_800,
  // Max retries for transient STT errors (no-speech, network).
  sttMaxRetries: 3,
  // Latency budget — we warn in console if exceeded.
  responseTargetMs: 3_000,
  // TTS chunking: Chrome's SpeechSynthesis cuts off long utterances around
  // ~200–250 chars / 15 s, so we split the reply into smaller chunks and
  // speak them sequentially. Keep below the limit but big enough to flow.
  ttsMaxChunkChars: 180,
  // Keep-alive ping interval for SpeechSynthesis (Chrome bug workaround:
  // the synth pauses itself after ~14 s on long replies).
  ttsKeepAliveMs: 10_000,
}

// Default voice prefs — user can override via UI / localStorage.
export const DEFAULTS = {
  gender: 'female', // 'male' | 'female'
  fastMode: true,   // skip warmup tone, prefer shortest TTS path
  muted: false,
  wakeWord: false,  // V2: opt-in
  continuous: true, // V2: auto-listen after AI reply
  // Arabic is the primary voice language for dz Agent. Users can still pick
  // 'auto' / 'fr' / 'en' from the settings.
  language: 'ar',
}

// Storage key for persisted user prefs.
export const STORAGE_KEY = 'dvis.prefs.v1'

// Heuristic gender hints — SpeechSynthesis voices don't expose gender directly,
// so we match on common voice-name fragments. Falls back to first available voice.
export const VOICE_NAME_HINTS = {
  male:   ['male', 'homme', 'masculin', 'david', 'mark', 'thomas', 'fred', 'daniel', 'paul', 'alex', 'aaron', 'rishi', 'مذكر'],
  female: ['female', 'femme', 'féminin', 'zira', 'samantha', 'amelie', 'amélie', 'anna', 'lina', 'reem', 'salma', 'victoria', 'hazel', 'مؤنث'],
}

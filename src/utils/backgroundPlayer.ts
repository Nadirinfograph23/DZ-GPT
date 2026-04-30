// ── Background Audio Engine ──────────────────────────────────────────────
// Persistent HTML5 <audio> singleton that survives mobile screen-lock and
// app-minimised states. Decoupled from any UI element so audio playback is
// never tied to a DOM mount lifecycle.
//
// Usage from any module:
//   import { backgroundPlayer } from '@/utils/backgroundPlayer'
//   backgroundPlayer.init()                        // once, on first user gesture
//   backgroundPlayer.play(streamUrl, { title, artist, artwork })
//   backgroundPlayer.pause()
//   backgroundPlayer.seek(sec)
//   backgroundPlayer.on('timeupdate', cb)
//
// Why this exists: the YouTube IFrame player is suspended by mobile browsers
// when the screen turns off, killing audio. A vanilla <audio> element with
// MediaSession metadata keeps playing on the lockscreen on every engine.

export interface BgMetadata {
  title?: string
  artist?: string
  album?: string
  artwork?: string
}

export interface BgListeners {
  play?: () => void
  pause?: () => void
  ended?: () => void
  timeupdate?: (currentTime: number, duration: number) => void
  loadedmetadata?: (duration: number) => void
  loading?: (isLoading: boolean) => void
  error?: (err: any) => void
}

class BackgroundPlayer {
  private audio: HTMLAudioElement | null = null
  private isInitialized = false
  private listeners: BgListeners = {}
  private currentUrl: string | null = null
  // When true, the engine treats stalls/suspends as recoverable and tries
  // exactly one resume. Disabled while the user has explicitly paused so we
  // don't fight a real pause.
  private wantPlaying = false
  private lastResumeAt = 0

  constructor() {
    if (typeof window === 'undefined') return
    this.createAudioElement()
  }

  private createAudioElement() {
    if (this.audio) return
    const a = new Audio()
    a.crossOrigin = 'anonymous'
    a.preload = 'auto'
    a.loop = false
    // Hint to the browser that this is "music" — Android uses this to keep
    // audio focus and show the right lockscreen UI.
    try { (a as any).mozAudioChannelType = 'content' } catch {}

    a.addEventListener('play', () => {
      this.wantPlaying = true
      this.listeners.play?.()
      this.updateMediaSessionState('playing')
    })
    a.addEventListener('pause', () => {
      this.listeners.pause?.()
      // Don't flip wantPlaying here — pause() may be browser-issued
      // (audio focus loss on a phone call); the user-pause path resets it.
      this.updateMediaSessionState('paused')
    })
    a.addEventListener('ended', () => {
      this.wantPlaying = false
      this.listeners.ended?.()
      this.updateMediaSessionState('none')
    })
    a.addEventListener('timeupdate', () => {
      this.listeners.timeupdate?.(a.currentTime || 0, a.duration || 0)
    })
    a.addEventListener('loadedmetadata', () => {
      this.listeners.loadedmetadata?.(a.duration || 0)
    })
    a.addEventListener('waiting', () => { this.listeners.loading?.(true) })
    a.addEventListener('canplay',  () => { this.listeners.loading?.(false) })
    a.addEventListener('playing',  () => { this.listeners.loading?.(false) })

    // Anti-break protection — when the network briefly stalls (mobile data
    // hiccup, brief offline) the browser fires `stalled` / `suspend`. We
    // try one play() to nudge it back. Bounded so we don't spin in a tight
    // loop if the URL is genuinely dead.
    const tryRecover = () => {
      if (!this.wantPlaying) return
      if (Date.now() - this.lastResumeAt < 3000) return
      this.lastResumeAt = Date.now()
      a.play().catch(() => {})
    }
    a.addEventListener('stalled', tryRecover)
    a.addEventListener('suspend', tryRecover)
    a.addEventListener('error', (e) => {
      this.listeners.error?.(e)
      // Browsers fire MEDIA_ERR_NETWORK as code 2 — recoverable.
      const code = (a.error && a.error.code) || 0
      if (code === 2 && this.wantPlaying) tryRecover()
    })

    this.audio = a
  }

  /** Wire up a one-shot user-gesture unlock so iOS/Safari grants playback. */
  init() {
    if (this.isInitialized) return
    if (typeof document === 'undefined') return
    this.createAudioElement()
    if (!this.audio) return
    this.audio.volume = 1

    const unlock = () => {
      if (this.isInitialized || !this.audio) return
      this.isInitialized = true
      // Touch the engine inside the user-gesture frame so a later
      // programmatic .play() (e.g. from MediaSession) is allowed.
      const a = this.audio
      const wasSrc = a.src
      a.muted = true
      a.play().then(() => {
        a.pause()
        a.muted = false
        if (wasSrc && a.src !== wasSrc) a.src = wasSrc
      }).catch(() => {
        a.muted = false
      })
    }
    document.addEventListener('click',     unlock, { once: true, passive: true })
    document.addEventListener('touchend',  unlock, { once: true, passive: true })
    document.addEventListener('keydown',   unlock, { once: true })
  }

  /** Subscribe to engine events. Replace any prior listener for the same key. */
  on<K extends keyof BgListeners>(event: K, cb: BgListeners[K]) {
    this.listeners[event] = cb
  }

  off<K extends keyof BgListeners>(event: K) {
    delete this.listeners[event]
  }

  /** Replace the source and start playback. No-op if `url` is empty. */
  play(url?: string, metadata: BgMetadata = {}) {
    this.createAudioElement()
    if (!this.audio) return
    if (url) {
      // Skip a redundant src reset — just resume — because reassigning .src
      // forces the browser to re-buffer from byte 0 and breaks the user's
      // current playback position.
      if (this.audio.src !== url) {
        this.audio.src = url
        this.currentUrl = url
        try { this.audio.load() } catch {}
      }
    }
    this.wantPlaying = true
    const p = this.audio.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
    if (metadata && (metadata.title || metadata.artist || metadata.artwork)) {
      this.setMediaSession(metadata)
    }
  }

  /** Pause playback. Marks the user-paused intent so auto-recover stops. */
  pause() {
    this.wantPlaying = false
    if (!this.audio) return
    try { this.audio.pause() } catch {}
  }

  /** Toggle play/pause based on current state. */
  toggle() {
    if (!this.audio) return
    if (this.audio.paused) this.play()
    else this.pause()
  }

  seek(sec: number) {
    if (!this.audio) return
    const target = Math.max(0, sec || 0)
    try { this.audio.currentTime = target } catch {}
  }

  stop() {
    this.wantPlaying = false
    if (!this.audio) return
    try {
      this.audio.pause()
      // Drop the source so the browser releases the network connection.
      this.audio.removeAttribute('src')
      this.audio.load()
    } catch {}
    this.currentUrl = null
    this.updateMediaSessionState('none')
  }

  setVolume(v: number) {
    if (!this.audio) return
    this.audio.volume = Math.max(0, Math.min(1, v))
  }

  setMuted(m: boolean) {
    if (!this.audio) return
    this.audio.muted = !!m
  }

  setPlaybackRate(r: number) {
    if (!this.audio) return
    try { this.audio.playbackRate = Math.max(0.25, Math.min(4, r)) } catch {}
  }

  isPaused(): boolean {
    return this.audio ? this.audio.paused : true
  }

  getCurrentTime(): number {
    return this.audio ? (this.audio.currentTime || 0) : 0
  }

  getDuration(): number {
    return this.audio ? (this.audio.duration || 0) : 0
  }

  getCurrentUrl(): string | null {
    return this.currentUrl
  }

  /** Build & assign MediaMetadata so the OS shows lockscreen track info. */
  setMediaSession(meta: BgMetadata) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      const artwork = meta.artwork
        ? [
            { src: meta.artwork, sizes: '96x96',  type: 'image/jpeg' },
            { src: meta.artwork, sizes: '256x256', type: 'image/jpeg' },
            { src: meta.artwork, sizes: '512x512', type: 'image/jpeg' },
          ]
        : []
      ;(navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
        title:  meta.title  || 'dz tube',
        artist: meta.artist || '',
        album:  meta.album  || 'dz tube',
        artwork,
      })
    } catch {}
  }

  /** Wire OS-level transport controls to engine actions. Idempotent. */
  registerMediaSessionHandlers(handlers: {
    play?: () => void
    pause?: () => void
    nexttrack?: () => void
    previoustrack?: () => void
    seekbackward?: (offset: number) => void
    seekforward?:  (offset: number) => void
    seekto?: (time: number) => void
  } = {}) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms = (navigator as any).mediaSession
    const safeSet = (action: string, cb: any) => {
      try { ms.setActionHandler(action, cb) } catch {}
    }
    safeSet('play',           handlers.play          || (() => this.play()))
    safeSet('pause',          handlers.pause         || (() => this.pause()))
    safeSet('nexttrack',      handlers.nexttrack     || null)
    safeSet('previoustrack',  handlers.previoustrack || null)
    safeSet('seekbackward', (d: any) => {
      const off = (d && d.seekOffset) || 10
      if (handlers.seekbackward) handlers.seekbackward(off)
      else this.seek(this.getCurrentTime() - off)
    })
    safeSet('seekforward', (d: any) => {
      const off = (d && d.seekOffset) || 10
      if (handlers.seekforward) handlers.seekforward(off)
      else this.seek(this.getCurrentTime() + off)
    })
    safeSet('seekto', (d: any) => {
      const t = d && typeof d.seekTime === 'number' ? d.seekTime : null
      if (t == null) return
      if (handlers.seekto) handlers.seekto(t)
      else this.seek(t)
    })
  }

  /** Push playback position to the lockscreen scrubber. */
  updatePositionState(position: number, duration: number, rate = 1) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms: any = (navigator as any).mediaSession
    if (!ms || typeof ms.setPositionState !== 'function') return
    if (!Number.isFinite(duration) || duration <= 0) return
    try {
      ms.setPositionState({
        duration,
        playbackRate: rate || 1,
        position: Math.max(0, Math.min(position || 0, duration)),
      })
    } catch {}
  }

  private updateMediaSessionState(state: 'playing' | 'paused' | 'none') {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try { (navigator as any).mediaSession.playbackState = state } catch {}
  }
}

// Module-level singleton — `new Audio()` once for the whole app, never
// destroyed, so playback survives any UI re-render or component unmount.
export const backgroundPlayer = new BackgroundPlayer()

if (typeof window !== 'undefined') {
  // Surface for cross-module debugging (e.g. from the dev console). Not used
  // by the app at runtime.
  ;(window as any).__dzBgPlayer = backgroundPlayer
}

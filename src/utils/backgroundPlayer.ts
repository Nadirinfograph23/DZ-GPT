// ── Background Audio Engine ──────────────────────────────────────────────
// Persistent HTML5 <audio> singleton that survives mobile screen-lock and
// app-minimised states. Decoupled from any UI element so audio playback is
// never tied to a DOM mount lifecycle.
//
// HLS-first playback (May 2026):
//   Primary source → /api/dz-tube/audio-stream (M3U8 playlist, segments proxied)
//   Each segment is 3-10 s → far under Vercel's 60s function timeout.
//   Safari: native HLS via <audio src>
//   Chrome/Firefox/Android: HLS.js attached to the <audio> element
//   Fallback → /api/dz-tube/audio-proxy (direct stream) if HLS fails
//
// Usage:
//   import { backgroundPlayer } from '@/utils/backgroundPlayer'
//   backgroundPlayer.init()
//   backgroundPlayer.play(streamUrl, { title, artist, artwork })
//   backgroundPlayer.pause()
//   backgroundPlayer.seek(sec)
//   backgroundPlayer.on('timeupdate', cb)

import type Hls from 'hls.js'

// Lazy-load HLS.js only in browser, only once, only when needed.
let _hlsModule: typeof Hls | null = null
let _hlsLoading = false
let _hlsLoadCallbacks: Array<(Ctor: typeof Hls | null) => void> = []
function loadHlsJs(): Promise<typeof Hls | null> {
  if (_hlsModule !== null) return Promise.resolve(_hlsModule)
  return new Promise(resolve => {
    _hlsLoadCallbacks.push(resolve)
    if (_hlsLoading) return
    _hlsLoading = true
    import('hls.js')
      .then(m => {
        _hlsModule = m.default as unknown as typeof Hls
        const cbs = _hlsLoadCallbacks.splice(0)
        cbs.forEach(cb => cb(_hlsModule))
      })
      .catch(() => {
        const cbs = _hlsLoadCallbacks.splice(0)
        cbs.forEach(cb => cb(null))
      })
  })
}

// Detect Safari (which supports native HLS in <audio>).
function isSafariNativeHls(): boolean {
  if (typeof window === 'undefined') return false
  const a = document.createElement('audio')
  return a.canPlayType('application/vnd.apple.mpegurl') !== ''
}

// Detect if a URL is an HLS playlist
function isHlsUrl(url: string): boolean {
  return /\.m3u8($|\?)/i.test(url) || url.includes('/audio-stream')
}

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
  private hlsInstance: any = null  // HLS.js instance when active
  private isInitialized = false
  private listeners: BgListeners = {}
  private currentUrl: string | null = null
  private wantPlaying = false
  private lastResumeAt = 0
  private visibilityHandler: (() => void) | null = null

  constructor() {
    if (typeof window === 'undefined') return
    this.createAudioElement()
    // Pre-warm HLS.js so it's ready before the first play() call.
    if (!isSafariNativeHls()) {
      void loadHlsJs()
    }
  }

  private createAudioElement() {
    if (this.audio) return
    const a = new Audio()
    a.crossOrigin = 'anonymous'
    a.preload = 'auto'
    a.loop = false
    try { (a as any).mozAudioChannelType = 'content' } catch {}
    try { a.setAttribute('playsinline', '') } catch {}
    try { a.setAttribute('webkit-playsinline', '') } catch {}
    try { a.setAttribute('x-webkit-airplay', 'allow') } catch {}

    a.addEventListener('play', () => {
      this.wantPlaying = true
      this.listeners.play?.()
      this.updateMediaSessionState('playing')
    })
    a.addEventListener('pause', () => {
      this.listeners.pause?.()
      this.updateMediaSessionState('paused')
    })
    a.addEventListener('ended', () => {
      const ct = a.currentTime || 0
      const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0
      const looksGenuine = ct > 10 && (dur <= 0 || ct >= dur * 0.85)
      if (!looksGenuine && this.wantPlaying) {
        this.listeners.error?.(new Event('ended-premature'))
        return
      }
      this.wantPlaying = false
      this.listeners.ended?.()
      this.updateMediaSessionState('none')
    })
    a.addEventListener('timeupdate', () => {
      this.listeners.timeupdate?.(a.currentTime || 0, a.duration || 0)
      this.updatePositionState(a.currentTime || 0, a.duration || 0, a.playbackRate || 1)
    })
    a.addEventListener('loadedmetadata', () => {
      this.listeners.loadedmetadata?.(a.duration || 0)
    })
    a.addEventListener('waiting', () => { this.listeners.loading?.(true) })
    a.addEventListener('canplay',  () => { this.listeners.loading?.(false) })
    a.addEventListener('playing',  () => { this.listeners.loading?.(false) })

    const tryRecover = () => {
      if (!this.wantPlaying) return
      if (Date.now() - this.lastResumeAt < 2000) return
      this.lastResumeAt = Date.now()
      a.play().catch(() => {})
    }
    a.addEventListener('stalled',  tryRecover)
    a.addEventListener('suspend',  tryRecover)
    a.addEventListener('emptied', () => {
      if (!this.wantPlaying || !this.currentUrl) return
      if (Date.now() - this.lastResumeAt < 2000) return
      this.lastResumeAt = Date.now()
      // For HLS, HLS.js handles recovery automatically.
      // For direct URLs, reload is needed.
      if (!this.hlsInstance) {
        a.load()
        a.play().catch(() => {})
      }
    })
    a.addEventListener('error', (e) => {
      // HLS.js fatal errors are forwarded separately in _attachHls.
      // Only propagate non-HLS errors here.
      if (!this.hlsInstance) {
        this.listeners.error?.(e)
        const code = (a.error && a.error.code) || 0
        if (code === 2 && this.wantPlaying) tryRecover()
      }
    })

    this.audio = a

    // Keep-alive: nudge currentTime every 20 s to prevent Chrome/Android
    // from throttling the background audio thread.
    const keepAlive = setInterval(() => {
      if (!this.audio || !this.wantPlaying || this.audio.paused) return
      // HLS.js manages its own buffer; only nudge for direct streams.
      if (!this.hlsInstance) {
        try { this.audio.currentTime += 0.00001 } catch {}
      }
    }, 20000)
    void keepAlive

    // Visibility nudge: call play() the moment a tab goes hidden so the
    // audio thread stays warm before the OS can suspend it.
    if (typeof document !== 'undefined') {
      this.visibilityHandler = () => {
        if (!this.wantPlaying || !this.audio) return
        if (this.audio.paused) {
          this.audio.play().catch(() => {})
        }
      }
      document.addEventListener('visibilitychange', this.visibilityHandler, { passive: true })
    }
  }

  /** Tear down any active HLS.js instance without destroying the <audio>. */
  private destroyHls() {
    if (this.hlsInstance) {
      try { this.hlsInstance.destroy() } catch {}
      this.hlsInstance = null
    }
  }

  /**
   * Attach HLS.js to the audio element for an M3U8 URL.
   * Forwards fatal HLS errors to the `error` listener so MiniPlayerContext
   * can fall back to the audio-proxy endpoint.
   */
  private async _attachHls(url: string) {
    if (!this.audio) return false
    const HlsCtor = await loadHlsJs()
    if (!HlsCtor) return false
    if (!(HlsCtor as any).isSupported()) return false

    this.destroyHls()
    try {
      const hls = new (HlsCtor as any)({
        enableWorker: true,
        lowLatencyMode: false,
        // Buffer 90 s ahead so a brief foreground→background transition
        // doesn't cause a gap while the OS suspends JS.
        maxBufferLength: 90,
        backBufferLength: 30,
        // Aggressive retry so transient Piped/Invidious hiccups self-heal.
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 1000,
        xhrSetup: (xhr: XMLHttpRequest) => {
          // 30s timeout per segment — well under Vercel's 60s limit.
          xhr.timeout = 30000
        },
      })

      hls.on((HlsCtor as any).Events.ERROR, (_ev: string, data: any) => {
        if (data.fatal) {
          console.warn('[bg-player] HLS fatal error:', data.type, data.details)
          this.destroyHls()
          // Signal upstream to fall back to audio-proxy.
          this.listeners.error?.(new Error(`HLS fatal: ${data.details}`))
        } else {
          console.debug('[bg-player] HLS non-fatal:', data.details)
        }
      })

      hls.on((HlsCtor as any).Events.MANIFEST_PARSED, () => {
        if (this.wantPlaying && this.audio) {
          this.audio.play().catch(() => {})
        }
      })

      hls.loadSource(url)
      hls.attachMedia(this.audio)
      this.hlsInstance = hls
      return true
    } catch (err) {
      console.warn('[bg-player] HLS attach failed:', err)
      return false
    }
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

  on<K extends keyof BgListeners>(event: K, cb: BgListeners[K]) {
    this.listeners[event] = cb
  }

  off<K extends keyof BgListeners>(event: K) {
    delete this.listeners[event]
  }

  /**
   * Replace the source and start playback.
   * If `url` is an HLS/M3U8 URL: Safari uses native HLS, others use HLS.js.
   * Direct URLs (audio-proxy) are loaded as before.
   */
  play(url?: string, metadata: BgMetadata = {}) {
    this.createAudioElement()
    if (!this.audio) return

    if (url && url !== this.currentUrl) {
      const isHls = isHlsUrl(url)
      this.currentUrl = url
      this.destroyHls()

      if (isHls) {
        if (isSafariNativeHls()) {
          // Safari: set src directly — browser handles HLS natively.
          this.audio.src = url
          try { this.audio.load() } catch {}
          // Playback starts once wantPlaying = true (below).
        } else {
          // Chrome/Firefox/Android: async HLS.js attach.
          // We set wantPlaying = true first so the MANIFEST_PARSED handler
          // (above) calls play() when the playlist arrives.
          this.wantPlaying = true
          void this._attachHls(url).then(ok => {
            if (!ok) {
              // HLS.js unavailable — fall back to setting src directly.
              if (this.audio && this.currentUrl === url) {
                this.audio.src = url
                try { this.audio.load() } catch {}
                if (this.wantPlaying) {
                  this.audio.play().catch(() => {})
                }
              }
            }
            // On success, MANIFEST_PARSED calls play() automatically.
          })
          if (metadata && (metadata.title || metadata.artist || metadata.artwork)) {
            this.setMediaSession(metadata)
          }
          // Return early — HLS.js will trigger play() asynchronously.
          return
        }
      } else {
        // Non-HLS direct URL (audio-proxy fallback).
        this.audio.src = url
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

  /** Pause playback. Marks user-paused intent so auto-recover stops. */
  pause() {
    this.wantPlaying = false
    if (!this.audio) return
    try { this.audio.pause() } catch {}
  }

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
    this.destroyHls()
    if (!this.audio) return
    try {
      this.audio.pause()
      this.audio.removeAttribute('src')
      try { this.audio.load() } catch {}
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

// Module-level singleton — created once for the whole app, never destroyed,
// so playback survives any UI re-render or component unmount.
export const backgroundPlayer = new BackgroundPlayer()

if (typeof window !== 'undefined') {
  ;(window as any).__dzBgPlayer = backgroundPlayer
}

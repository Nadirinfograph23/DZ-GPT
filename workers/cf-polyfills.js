/**
 * CF Workers Compatibility Polyfills
 * ====================================
 * Injected via wrangler `inject` — runs BEFORE any module code.
 * Provides browser/Node globals that some npm packages reference
 * at module level without typeof guards.
 */

// ── MessagePort ──────────────────────────────────────────────────────────────
if (typeof globalThis.MessagePort === 'undefined') {
  globalThis.MessagePort = class MessagePort {
    postMessage() {}
    start() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true }
  }
}

// ── MessageChannel ────────────────────────────────────────────────────────────
if (typeof globalThis.MessageChannel === 'undefined') {
  globalThis.MessageChannel = class MessageChannel {
    constructor() {
      this.port1 = new globalThis.MessagePort()
      this.port2 = new globalThis.MessagePort()
    }
  }
}

// ── FinalizationRegistry ──────────────────────────────────────────────────────
if (typeof globalThis.FinalizationRegistry === 'undefined') {
  globalThis.FinalizationRegistry = class FinalizationRegistry {
    constructor(_callback) {}
    register() {}
    unregister() {}
  }
}

// ── WeakRef ───────────────────────────────────────────────────────────────────
if (typeof globalThis.WeakRef === 'undefined') {
  globalThis.WeakRef = class WeakRef {
    constructor(target) { this._t = target }
    deref() { return this._t }
  }
}

// ── BroadcastChannel ─────────────────────────────────────────────────────────
if (typeof globalThis.BroadcastChannel === 'undefined') {
  globalThis.BroadcastChannel = class BroadcastChannel {
    constructor() {}
    postMessage() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
}

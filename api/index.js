// Vercel serverless entry point
// Uses top-level await (ESM) to catch any import errors and expose them.

let app

try {
  const mod = await import('../server.js')
  app = mod.app
} catch (err) {
  console.error('[Vercel] server.js import FAILED:', err?.message)
  console.error(err?.stack)
  app = (_req, res) => {
    res.status(500).json({
      error: 'Server startup failed',
      message: err?.message,
      stack: err?.stack?.split('\n').slice(0, 20),
    })
  }
}

export default app

// deploy-trigger: 20260615-squad-fix
// Vercel serverless entry point — imports server.js directly (fix: server-bundle.js was stale)
let app

try {
  const { app: importedApp } = await import('../server.js')
  app = importedApp
} catch (err) {
  console.error('[Vercel] server.js import FAILED:', err?.message)
  console.error(err?.stack)
  app = (_req, res) => {
    res.status(500).json({
      error: 'Server startup failed',
      message: err?.message,
      stack: err?.stack?.split('\n').slice(0, 15),
    })
  }
}

export default app

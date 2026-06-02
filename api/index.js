// deploy-trigger: 20260602-0015
// Vercel serverless entry point — uses esbuild bundle
let app

try {
  const { app: importedApp } = await import('./server-bundle.js')
  app = importedApp
} catch (err) {
  console.error('[Vercel] server-bundle import FAILED:', err?.message)
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

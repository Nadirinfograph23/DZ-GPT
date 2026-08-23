import { Router } from 'express'
const router = Router()

router.get('/health', (req, res) => {
  res.json({ ok: false, error: 'MCP Video Analyzer module is not available in this environment.' })
})

export default router

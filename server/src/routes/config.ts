import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/timing', requireAuth, async (_req, res) => {
  const result = await pool.query("SELECT value FROM config WHERE key = 'timing'")
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Timing config not found' })
    return
  }
  res.json(result.rows[0].value)
})

router.get('/input', requireAuth, async (_req, res) => {
  const result = await pool.query("SELECT value FROM config WHERE key = 'input'")
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Input config not found' })
    return
  }
  res.json(result.rows[0].value)
})

export default router

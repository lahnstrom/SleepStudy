import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

const router = Router()

const timingConfigSchema = z.object({
  fixationVisible: z.number().positive(),
  fixationBlank: z.number().positive(),
  imageDisplay: z.number().positive(),
  memoryTimeout: z.number().positive(),
  postMemoryGap: z.number().positive(),
  ratingTimeout: z.number().positive(),
  interRatingGap: z.number().positive(),
  pauseDuration: z.number().positive(),
  pauseTrialIndex: z.number().int().nonnegative(),
})

router.get('/timing', requireAuth, async (_req, res) => {
  const result = await pool.query("SELECT value FROM config WHERE key = 'timing'")
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Timing config not found' })
    return
  }
  res.json(result.rows[0].value)
})

router.get('/timing-practice', requireAuth, async (_req, res) => {
  const result = await pool.query("SELECT value FROM config WHERE key = 'timing_practice'")
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Practice timing config not found' })
    return
  }
  res.json(result.rows[0].value)
})

router.put('/timing', requireAdmin, async (req, res) => {
  const parsed = timingConfigSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid timing config', details: parsed.error.issues })
    return
  }
  const result = await pool.query(
    "UPDATE config SET value = $1 WHERE key = 'timing' RETURNING value",
    [parsed.data]
  )
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Timing config not found' })
    return
  }
  res.json(result.rows[0].value)
})

router.put('/timing-practice', requireAdmin, async (req, res) => {
  const parsed = timingConfigSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid timing config', details: parsed.error.issues })
    return
  }
  const result = await pool.query(
    "UPDATE config SET value = $1 WHERE key = 'timing_practice' RETURNING value",
    [parsed.data]
  )
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Practice timing config not found' })
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

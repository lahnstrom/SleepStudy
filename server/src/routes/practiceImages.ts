import { Router } from 'express'
import path from 'node:path'
import { pool } from '../db.js'
import { config } from '../config.js'

const router = Router()

export const PRACTICE_IMAGE_COUNT = 6

// Returns the reserved practice image records (lowest-ID neutral images)
router.get('/', async (_req, res) => {
  const result = await pool.query(
    `SELECT id, filename, emotion FROM images
     WHERE emotion = 'neutral'
     ORDER BY id ASC
     LIMIT $1`,
    [PRACTICE_IMAGE_COUNT]
  )
  res.json(result.rows)
})

// Serves practice image files publicly (no auth — needed for pilot mode)
router.get('/:filename', (req, res) => {
  const filename = String(req.params.filename)
  if (!filename || filename.includes('..') || filename.includes('/')) {
    res.status(400).json({ error: 'Invalid filename' })
    return
  }
  const fullPath = path.resolve(config.imageDir, filename)
  res.sendFile(fullPath, {
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Image not found' })
  })
})

export default router

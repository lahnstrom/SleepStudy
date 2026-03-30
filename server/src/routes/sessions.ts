import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getParticipantLabId, getSessionLabId, checkLabAccess } from '../utils/labAccess.js'

const router = Router()

const createSessionSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.number().int().positive(),
  labDay: z.union([z.literal(1), z.literal(2)]),
  sessionType: z.enum(['encoding', 'test1', 'test2']),
})

const completeSessionSchema = z.object({
  timingMetadata: z.record(z.unknown()).optional(),
})

router.post('/', requireAuth, async (req, res) => {
  const parsed = createSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const { sessionId, participantId, labDay, sessionType } = parsed.data

  const labId = await getParticipantLabId(participantId)
  if (!await checkLabAccess(req, res, labId)) return

  try {
    const result = await pool.query(
      'SELECT * FROM create_session($1, $2, $3, $4)',
      [sessionId, participantId, labDay, sessionType]
    )
    res.status(201).json(result.rows[0])
  } catch (err: any) {
    if (err.code === 'P0001') {
      res.status(400).json({ error: err.message })
      return
    }
    throw err
  }
})

router.get('/:id', requireAuth, async (req, res) => {
  const id = String(req.params.id)

  const labId = await getSessionLabId(id)
  if (!await checkLabAccess(req, res, labId)) return

  const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [id])
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  res.json(result.rows[0])
})

router.patch('/:id/complete', requireAuth, async (req, res) => {
  const id = String(req.params.id)

  const labId = await getSessionLabId(id)
  if (!await checkLabAccess(req, res, labId)) return

  const parsed = completeSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const result = await pool.query(
    `UPDATE sessions
     SET completed_at = now(), timing_metadata = $2
     WHERE id = $1 AND completed_at IS NULL
     RETURNING *`,
    [id, parsed.data.timingMetadata ? JSON.stringify(parsed.data.timingMetadata) : null]
  )

  if (result.rows.length === 0) {
    const exists = await pool.query('SELECT id FROM sessions WHERE id = $1', [id])
    if (exists.rows.length === 0) {
      res.status(404).json({ error: 'Session not found' })
    } else {
      res.status(409).json({ error: 'Session already completed' })
    }
    return
  }

  res.json(result.rows[0])
})

export default router

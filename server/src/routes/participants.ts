import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireLabAccess } from '../middleware/auth.js'

const router = Router()

const createParticipantSchema = z.object({
  participantCode: z.string().min(1).max(100),
  conditionOrder: z.union([z.literal(0), z.literal(1)]),
  age: z.number().int().positive().optional(),
  gender: z.string().optional(),
  language: z.string().default('en'),
})

router.get('/:labId/participants', requireLabAccess('labId'), async (req, res) => {
  const labId = parseInt(String(req.params.labId), 10)

  const result = await pool.query(
    'SELECT * FROM participants WHERE lab_id = $1 ORDER BY created_at DESC',
    [labId]
  )
  res.json(result.rows)
})

router.post('/:labId/participants', requireLabAccess('labId'), async (req, res) => {
  const labId = parseInt(String(req.params.labId), 10)
  const parsed = createParticipantSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const { participantCode, conditionOrder, age, gender, language } = parsed.data

  try {
    const result = await pool.query(
      'SELECT * FROM create_participant($1, $2, $3, $4, $5, $6)',
      [labId, participantCode, conditionOrder, age ?? null, gender ?? null, language]
    )
    res.status(201).json(result.rows[0])
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'A participant with this code already exists in this lab' })
      return
    }
    if (err.code === 'P0001') {
      res.status(400).json({ error: err.message })
      return
    }
    throw err
  }
})

router.get('/:labId/participants/:id', requireLabAccess('labId'), async (req, res) => {
  const labId = parseInt(String(req.params.labId), 10)
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid participant ID' })
    return
  }

  const result = await pool.query(
    `SELECT p.*,
       COALESCE(json_agg(json_build_object(
         'id', s.id, 'labDay', s.lab_day, 'sessionType', s.session_type,
         'condition', s.condition, 'startedAt', s.started_at, 'completedAt', s.completed_at
       ) ORDER BY s.lab_day, s.session_type) FILTER (WHERE s.id IS NOT NULL), '[]') AS sessions
     FROM participants p
     LEFT JOIN sessions s ON s.participant_id = p.id
     WHERE p.id = $1 AND p.lab_id = $2
     GROUP BY p.id`,
    [id, labId]
  )

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Participant not found' })
    return
  }

  res.json(result.rows[0])
})

export default router

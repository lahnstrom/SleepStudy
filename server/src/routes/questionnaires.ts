import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireLabAccess } from '../middleware/auth.js'

const router = Router()

const questionnaireSchema = z.object({
  questionnaireType: z.string().min(1),
  labDay: z.union([z.literal(1), z.literal(2)]).nullable().optional(),
  responses: z.record(z.unknown()),
})

router.get('/:labId/participants/:participantId/questionnaires', requireLabAccess('labId'), async (req, res) => {
  const participantId = parseInt(String(req.params.participantId), 10)
  const result = await pool.query(
    'SELECT * FROM questionnaire_responses WHERE participant_id = $1 ORDER BY completed_at DESC',
    [participantId]
  )
  res.json(result.rows)
})

router.post('/:labId/participants/:participantId/questionnaires', requireLabAccess('labId'), async (req, res) => {
  const participantId = parseInt(String(req.params.participantId), 10)
  const parsed = questionnaireSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const { questionnaireType, labDay, responses } = parsed.data

  try {
    const result = await pool.query(
      `INSERT INTO questionnaire_responses (participant_id, questionnaire_type, lab_day, responses)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (participant_id, questionnaire_type, lab_day) DO UPDATE SET
         responses = EXCLUDED.responses,
         completed_at = now()
       RETURNING *`,
      [participantId, questionnaireType, labDay ?? null, JSON.stringify(responses)]
    )
    res.status(201).json(result.rows[0])
  } catch (err: any) {
    throw err
  }
})

export default router

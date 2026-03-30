import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getSessionLabId, checkLabAccess } from '../utils/labAccess.js'

const router = Router()

const trialSchema = z.object({
  trialNumber: z.number().int().min(1).max(80),
  imageId: z.number().int().positive(),
  valenceRating: z.number().int().min(1).max(9).nullable().optional(),
  arousalRating: z.number().int().min(1).max(9).nullable().optional(),
  targetFoil: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
  memoryResponse: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
  correct: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
  valenceRtMs: z.number().int().nonnegative().nullable().optional(),
  arousalRtMs: z.number().int().nonnegative().nullable().optional(),
  memoryRtMs: z.number().int().nonnegative().nullable().optional(),
  presentedAt: z.string().datetime().optional(),
  imageActualMs: z.number().nonnegative().nullable().optional(),
  imageFrameCount: z.number().int().nonnegative().nullable().optional(),
  droppedFrames: z.number().int().nonnegative().default(0),
})

const bulkTrialsSchema = z.object({
  trials: z.array(trialSchema).min(1).max(80),
})

router.post('/:sessionId/trials', requireAuth, async (req, res) => {
  const sessionId = String(req.params.sessionId)

  const labId = await getSessionLabId(sessionId)
  if (!await checkLabAccess(req, res, labId)) return

  const parsed = bulkTrialsSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const trial of parsed.data.trials) {
      await client.query(
        `INSERT INTO trials (
          session_id, trial_number, image_id,
          valence_rating, arousal_rating,
          target_foil, memory_response, correct,
          valence_rt_ms, arousal_rt_ms, memory_rt_ms,
          presented_at, image_actual_ms, image_frame_count, dropped_frames
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          sessionId,
          trial.trialNumber,
          trial.imageId,
          trial.valenceRating ?? null,
          trial.arousalRating ?? null,
          trial.targetFoil ?? null,
          trial.memoryResponse ?? null,
          trial.correct ?? null,
          trial.valenceRtMs ?? null,
          trial.arousalRtMs ?? null,
          trial.memoryRtMs ?? null,
          trial.presentedAt ?? null,
          trial.imageActualMs ?? null,
          trial.imageFrameCount ?? null,
          trial.droppedFrames,
        ]
      )
    }

    await client.query('COMMIT')
    res.status(201).json({ inserted: parsed.data.trials.length })
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23505') {
      res.status(409).json({ error: 'Duplicate trial numbers in this session' })
      return
    }
    throw err
  } finally {
    client.release()
  }
})

router.get('/:sessionId/trials', requireAuth, async (req, res) => {
  const sessionId = String(req.params.sessionId)

  const labId = await getSessionLabId(sessionId)
  if (!await checkLabAccess(req, res, labId)) return

  const result = await pool.query(
    `SELECT t.*, i.filename, i.emotion
     FROM trials t
     JOIN images i ON i.id = t.image_id
     WHERE t.session_id = $1
     ORDER BY t.trial_number`,
    [sessionId]
  )
  res.json(result.rows)
})

export default router

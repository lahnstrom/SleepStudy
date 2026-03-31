import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireLabAccess } from '../middleware/auth.js'

const router = Router()

const sleepDataSchema = z.object({
  labDay: z.union([z.literal(1), z.literal(2)]),
  totalSleepMin: z.number().nonnegative().nullable().optional(),
  n1Min: z.number().nonnegative().nullable().optional(),
  n2Min: z.number().nonnegative().nullable().optional(),
  n3Min: z.number().nonnegative().nullable().optional(),
  remMin: z.number().nonnegative().nullable().optional(),
  wakeAfterSleepOnsetMin: z.number().nonnegative().nullable().optional(),
  sleepOnsetLatencyMin: z.number().nonnegative().nullable().optional(),
  notes: z.string().optional(),
})

router.get('/:labId/participants/:participantId/sleep-data', requireLabAccess('labId'), async (req, res) => {
  const participantId = parseInt(String(req.params.participantId), 10)
  const result = await pool.query(
    'SELECT * FROM sleep_data WHERE participant_id = $1 ORDER BY lab_day',
    [participantId]
  )
  res.json(result.rows)
})

router.post('/:labId/participants/:participantId/sleep-data', requireLabAccess('labId'), async (req, res) => {
  const participantId = parseInt(String(req.params.participantId), 10)
  const parsed = sleepDataSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const d = parsed.data
  try {
    const result = await pool.query(
      `INSERT INTO sleep_data (participant_id, lab_day, total_sleep_min, n1_min, n2_min, n3_min, rem_min, wake_after_sleep_onset_min, sleep_onset_latency_min, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (participant_id, lab_day) DO UPDATE SET
         total_sleep_min = EXCLUDED.total_sleep_min,
         n1_min = EXCLUDED.n1_min,
         n2_min = EXCLUDED.n2_min,
         n3_min = EXCLUDED.n3_min,
         rem_min = EXCLUDED.rem_min,
         wake_after_sleep_onset_min = EXCLUDED.wake_after_sleep_onset_min,
         sleep_onset_latency_min = EXCLUDED.sleep_onset_latency_min,
         notes = EXCLUDED.notes
       RETURNING *`,
      [participantId, d.labDay, d.totalSleepMin ?? null, d.n1Min ?? null, d.n2Min ?? null,
       d.n3Min ?? null, d.remMin ?? null, d.wakeAfterSleepOnsetMin ?? null,
       d.sleepOnsetLatencyMin ?? null, d.notes ?? null]
    )
    res.status(201).json(result.rows[0])
  } catch (err: any) {
    throw err
  }
})

export default router

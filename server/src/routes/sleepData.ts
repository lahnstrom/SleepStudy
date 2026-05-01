import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import multer from 'multer'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { pool } from '../db.js'
import { requireLabAccess } from '../middleware/auth.js'
import { config } from '../config.js'

const sleepDataDir = path.join(config.imageDir, '..', 'sleep_data')
mkdirSync(sleepDataDir, { recursive: true })

const uploadEdf = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, sleepDataDir),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}_${file.originalname}`),
  }),
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.edf') cb(null, true)
    else cb(new Error('Only .edf files are allowed'))
  },
})

function handleEdfUpload(req: Request, res: Response, next: NextFunction) {
  uploadEdf.single('edf')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message })
      return
    }
    next()
  })
}

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

async function verifyParticipantOwnership(participantId: number, labId: number): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM participants WHERE id = $1 AND lab_id = $2',
    [participantId, labId]
  )
  return result.rows.length > 0
}

router.get('/:labId/participants/:participantId/sleep-data', requireLabAccess('labId'), async (req, res) => {
  const participantId = parseInt(String(req.params.participantId), 10)
  const labId = parseInt(String(req.params.labId), 10)

  if (!await verifyParticipantOwnership(participantId, labId)) {
    res.status(404).json({ error: 'Participant not found in this lab' })
    return
  }

  const result = await pool.query(
    'SELECT * FROM sleep_data WHERE participant_id = $1 ORDER BY lab_day',
    [participantId]
  )
  res.json(result.rows)
})

router.post('/:labId/participants/:participantId/sleep-data', requireLabAccess('labId'), async (req, res) => {
  const participantId = parseInt(String(req.params.participantId), 10)
  const labId = parseInt(String(req.params.labId), 10)

  if (!await verifyParticipantOwnership(participantId, labId)) {
    res.status(404).json({ error: 'Participant not found in this lab' })
    return
  }

  const parsed = sleepDataSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const d = parsed.data
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
})

async function checkOwnership(req: Request, res: Response, next: NextFunction) {
  const participantId = parseInt(String(req.params.participantId), 10)
  const labId = parseInt(String(req.params.labId), 10)
  if (!await verifyParticipantOwnership(participantId, labId)) {
    res.status(404).json({ error: 'Participant not found in this lab' })
    return
  }
  next()
}

router.post(
  '/:labId/participants/:participantId/sleep-data/upload',
  requireLabAccess('labId'),
  checkOwnership,
  handleEdfUpload,
  async (req, res) => {
    const participantId = parseInt(String(req.params.participantId), 10)

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const labDay = req.body.labDay ? parseInt(String(req.body.labDay), 10) : null

    const result = await pool.query(
      `INSERT INTO file_uploads (participant_id, lab_day, file_type, original_name, storage_path, uploaded_by)
       VALUES ($1, $2, 'edf', $3, $4, $5)
       RETURNING id, storage_path`,
      [participantId, labDay, req.file.originalname, req.file.path, req.session.userId]
    )

    res.status(201).json(result.rows[0])
  }
)

export default router

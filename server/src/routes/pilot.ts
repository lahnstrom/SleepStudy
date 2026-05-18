import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { generateImageAssignments } from '../services/imageAssignments.js'

const router = Router()

const PILOT_LAB_NUMBER = 0
const PILOT_LAB_NAME = 'Pilot'

async function ensurePilotLab(): Promise<number> {
  const result = await pool.query(
    `INSERT INTO labs (lab_number, name) VALUES ($1, $2)
     ON CONFLICT (lab_number) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [PILOT_LAB_NUMBER, PILOT_LAB_NAME]
  )
  return result.rows[0].id
}

async function fetchParticipantWithSessions(id: number) {
  const result = await pool.query(
    `SELECT p.*,
       COALESCE(json_agg(json_build_object(
         'id', s.id, 'labDay', s.lab_day, 'sessionType', s.session_type,
         'condition', s.condition, 'startedAt', s.started_at, 'completedAt', s.completed_at
       ) ORDER BY s.lab_day, s.session_type) FILTER (WHERE s.id IS NOT NULL), '[]') AS sessions
     FROM participants p
     LEFT JOIN sessions s ON s.participant_id = p.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [id]
  )
  return result.rows[0] ?? null
}

async function assertPilotParticipant(participantId: number): Promise<void> {
  const pilotLabId = await ensurePilotLab()
  const check = await pool.query(
    'SELECT 1 FROM participants WHERE id = $1 AND lab_id = $2',
    [participantId, pilotLabId]
  )
  if (check.rows.length === 0) {
    throw { status: 403, message: 'Access denied' }
  }
}

async function assertPilotSession(sessionId: string): Promise<void> {
  const pilotLabId = await ensurePilotLab()
  const check = await pool.query(
    `SELECT 1 FROM sessions s
     JOIN participants p ON p.id = s.participant_id
     WHERE s.id = $1 AND p.lab_id = $2`,
    [sessionId, pilotLabId]
  )
  if (check.rows.length === 0) {
    throw { status: 403, message: 'Access denied' }
  }
}

// Public config endpoint (timing + input)
router.get('/config', async (_req, res) => {
  const [timing, timingPractice, input] = await Promise.all([
    pool.query("SELECT value FROM config WHERE key = 'timing'"),
    pool.query("SELECT value FROM config WHERE key = 'timing_practice'"),
    pool.query("SELECT value FROM config WHERE key = 'input'"),
  ])
  res.json({
    timing: timing.rows[0]?.value ?? null,
    timingPractice: timingPractice.rows[0]?.value ?? null,
    input: input.rows[0]?.value ?? null,
  })
})

// Create or find pilot participant by code
router.post('/participants', async (req, res) => {
  const parsed = z.object({
    pilotCode: z.string().min(1).max(100),
    language: z.string().default('en'),
  }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'pilotCode is required' })
    return
  }

  const { pilotCode, language } = parsed.data
  const pilotLabId = await ensurePilotLab()

  // Return existing participant (with sessions) if the code is already registered
  const existing = await pool.query(
    'SELECT id FROM participants WHERE lab_id = $1 AND participant_code = $2',
    [pilotLabId, pilotCode]
  )
  if (existing.rows.length > 0) {
    res.json(await fetchParticipantWithSessions(existing.rows[0].id))
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const conditionOrder = Math.random() < 0.5 ? 0 : 1
    const result = await client.query(
      'SELECT * FROM create_participant($1, $2, $3, $4, $5, $6)',
      [pilotLabId, pilotCode, conditionOrder, null, null, language]
    )
    const participant = result.rows[0]
    await generateImageAssignments(client, participant.id, true)
    await client.query('COMMIT')
    res.status(201).json(await fetchParticipantWithSessions(participant.id))
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23505') {
      // Concurrent creation race — return the winner's record
      const raced = await pool.query(
        'SELECT id FROM participants WHERE lab_id = $1 AND participant_code = $2',
        [pilotLabId, pilotCode]
      )
      if (raced.rows.length > 0) {
        res.json(await fetchParticipantWithSessions(raced.rows[0].id))
        return
      }
      res.status(409).json({ error: 'Pilot code already taken' })
      return
    }
    if (err.message?.startsWith('Need at least')) {
      res.status(400).json({ error: err.message })
      return
    }
    throw err
  } finally {
    client.release()
  }
})

// Get pilot participant (with sessions)
router.get('/participants/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid participant ID' }); return }
  try { await assertPilotParticipant(id) } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message }); return
  }
  const participant = await fetchParticipantWithSessions(id)
  if (!participant) { res.status(404).json({ error: 'Not found' }); return }
  res.json(participant)
})

// Get image assignments for pilot participant
router.get('/participants/:id/assignments', async (req, res) => {
  const id = parseInt(String(req.params.id), 10)
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid participant ID' }); return }
  try { await assertPilotParticipant(id) } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message }); return
  }

  const parsed = z.object({
    labDay: z.coerce.number().int().min(1).max(2),
    sessionType: z.enum(['encoding', 'test1', 'test2']).optional(),
  }).safeParse(req.query)
  if (!parsed.success) { res.status(400).json({ error: 'labDay required' }); return }

  const { labDay, sessionType } = parsed.data
  const roleFilter: Record<string, string[]> = {
    encoding: ['encoding_test1_target', 'encoding_test2_target'],
    test1: ['encoding_test1_target', 'test1_foil'],
    test2: ['encoding_test2_target', 'test2_foil'],
  }
  const params: (number | string)[] = [id, labDay]
  let roleClause = ''
  if (sessionType && roleFilter[sessionType]) {
    const roles = roleFilter[sessionType]
    roleClause = ` AND a.image_role IN (${roles.map((_, i) => `$${i + 3}`).join(', ')})`
    params.push(...roles)
  }
  const isTest = sessionType === 'test1' || sessionType === 'test2'
  const orderClause = isTest ? 'ORDER BY a.test_position NULLS LAST' : 'ORDER BY a.presentation_position'

  const result = await pool.query(
    `SELECT a.id, a.image_id, a.lab_day, a.image_role, a.presentation_position,
            a.test_position, i.filename, i.emotion
     FROM participant_image_assignments a
     JOIN images i ON i.id = a.image_id
     WHERE a.participant_id = $1 AND a.lab_day = $2${roleClause}
     ${orderClause}`,
    params
  )
  res.json(result.rows)
})

// Create session
router.post('/sessions', async (req, res) => {
  const parsed = z.object({
    sessionId: z.string().uuid(),
    participantId: z.number().int().positive(),
    labDay: z.union([z.literal(1), z.literal(2)]),
    sessionType: z.enum(['encoding', 'test1', 'test2']),
  }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return }

  try { await assertPilotParticipant(parsed.data.participantId) } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message }); return
  }

  const { sessionId, participantId, labDay, sessionType } = parsed.data
  try {
    const result = await pool.query(
      'SELECT * FROM create_session($1, $2, $3, $4)',
      [sessionId, participantId, labDay, sessionType]
    )
    res.status(201).json(result.rows[0])
  } catch (err: any) {
    if (err.code === 'P0001') { res.status(400).json({ error: err.message }); return }
    throw err
  }
})

// Save trials
router.post('/sessions/:id/trials', async (req, res) => {
  const sessionId = String(req.params.id)
  try { await assertPilotSession(sessionId) } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message }); return
  }

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
  const parsed = z.object({ trials: z.array(trialSchema).min(1).max(80) }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const sessionCheck = await client.query('SELECT completed_at FROM sessions WHERE id = $1', [sessionId])
    if (sessionCheck.rows.length === 0) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Session not found' }); return }
    if (sessionCheck.rows[0].completed_at) { await client.query('ROLLBACK'); res.status(409).json({ error: 'Session already completed' }); return }

    for (const trial of parsed.data.trials) {
      await client.query(
        `INSERT INTO trials (session_id, trial_number, image_id, valence_rating, arousal_rating,
          target_foil, memory_response, correct, valence_rt_ms, arousal_rt_ms, memory_rt_ms,
          presented_at, image_actual_ms, image_frame_count, dropped_frames)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [sessionId, trial.trialNumber, trial.imageId, trial.valenceRating ?? null,
          trial.arousalRating ?? null, trial.targetFoil ?? null, trial.memoryResponse ?? null,
          trial.correct ?? null, trial.valenceRtMs ?? null, trial.arousalRtMs ?? null,
          trial.memoryRtMs ?? null, trial.presentedAt ?? null, trial.imageActualMs ?? null,
          trial.imageFrameCount ?? null, trial.droppedFrames]
      )
    }
    await client.query('COMMIT')
    res.status(201).json({ inserted: parsed.data.trials.length })
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23505') { res.status(409).json({ error: 'Duplicate trial numbers' }); return }
    throw err
  } finally {
    client.release()
  }
})

// Complete session
router.patch('/sessions/:id/complete', async (req, res) => {
  const sessionId = String(req.params.id)
  try { await assertPilotSession(sessionId) } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message }); return
  }
  const parsed = z.object({ timingMetadata: z.record(z.unknown()).optional() }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return }

  const result = await pool.query(
    `UPDATE sessions SET completed_at = now(), timing_metadata = $2
     WHERE id = $1 AND completed_at IS NULL RETURNING *`,
    [sessionId, parsed.data.timingMetadata ? JSON.stringify(parsed.data.timingMetadata) : null]
  )
  if (result.rows.length === 0) {
    const exists = await pool.query('SELECT id FROM sessions WHERE id = $1', [sessionId])
    if (exists.rows.length === 0) { res.status(404).json({ error: 'Session not found' }); return }
    res.status(409).json({ error: 'Session already completed' }); return
  }
  res.json(result.rows[0])
})

export default router

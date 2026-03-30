import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getParticipantLabId, checkLabAccess } from '../utils/labAccess.js'

const router = Router()

const assignmentQuerySchema = z.object({
  labDay: z.coerce.number().int().min(1).max(2),
  sessionType: z.enum(['encoding', 'test1', 'test2']).optional(),
})

const roleFilter: Record<string, string[]> = {
  encoding: ['encoding_test1_target', 'encoding_test2_target'],
  test1: ['encoding_test1_target', 'test1_foil'],
  test2: ['encoding_test2_target', 'test2_foil'],
}

router.get('/:participantId/assignments', requireAuth, async (req, res) => {
  const participantId = parseInt(String(req.params.participantId), 10)
  if (isNaN(participantId)) {
    res.status(400).json({ error: 'Invalid participant ID' })
    return
  }

  const labId = await getParticipantLabId(participantId)
  if (!await checkLabAccess(req, res, labId)) return

  const parsed = assignmentQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() })
    return
  }

  const { labDay, sessionType } = parsed.data
  const params: (number | string)[] = [participantId, labDay]

  let roleClause = ''
  if (sessionType && roleFilter[sessionType]) {
    const roles = roleFilter[sessionType]
    roleClause = ` AND a.image_role IN (${roles.map((_, i) => `$${i + 3}`).join(', ')})`
    params.push(...roles)
  }

  const result = await pool.query(
    `SELECT a.id, a.image_id, a.lab_day, a.image_role, a.presentation_position,
            i.filename, i.emotion
     FROM participant_image_assignments a
     JOIN images i ON i.id = a.image_id
     WHERE a.participant_id = $1 AND a.lab_day = $2${roleClause}
     ORDER BY a.image_role, a.presentation_position`,
    params
  )

  res.json(result.rows)
})

export default router

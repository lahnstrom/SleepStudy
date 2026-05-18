import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/csv', requireAuth, async (req, res) => {
  // Access control: lab users can only export their own lab
  let labFilter = ''
  const params: (number | string)[] = []

  if (req.session.role === 'lab_user') {
    params.push(req.session.labId!)
    labFilter = `AND l.id = $${params.length}`
  } else if (req.query.labId) {
    params.push(Number(req.query.labId))
    labFilter = `AND l.id = $${params.length}`
  }

  let participantFilter = ''
  if (req.query.participantId) {
    params.push(Number(req.query.participantId))
    participantFilter = `AND p.id = $${params.length}`
  }

  let sessionTypeFilter = ''
  if (req.query.sessionType) {
    params.push(String(req.query.sessionType))
    sessionTypeFilter = `AND s.session_type = $${params.length}`
  }

  let labDayFilter = ''
  if (req.query.labDay) {
    const labDayNum = parseInt(String(req.query.labDay), 10)
    if (isNaN(labDayNum)) {
      res.status(400).json({ error: 'Invalid labDay parameter' })
      return
    }
    params.push(labDayNum)
    labDayFilter = `AND s.lab_day = $${params.length}`
  }

  const query = `
    SELECT
      p.participant_code AS "ParticipantID",
      l.lab_number AS "LabNumber",
      s.lab_day AS "LabDay",
      CASE s.session_type
        WHEN 'encoding' THEN 0
        WHEN 'test1' THEN 1
        WHEN 'test2' THEN 2
      END AS "Session",
      CASE s.condition
        WHEN 'wake' THEN 0
        WHEN 'sleep' THEN 1
      END AS "Condition",
      p.condition_order AS "Order",
      p.age AS "Age",
      p.gender AS "Gender",
      t.trial_number AS "TrialNumber",
      i.filename AS "ImageFile",
      INITCAP(i.emotion::text) AS "Emotion",
      t.target_foil AS "TargetFoil",
      t.memory_response AS "Response",
      t.correct AS "Correct",
      t.valence_rating AS "ValenceRating",
      t.arousal_rating AS "ArousalRating",
      t.valence_rt_ms AS "ValenceRT",
      t.arousal_rt_ms AS "ArousalRT",
      t.memory_rt_ms AS "MemoryRT"
    FROM trials t
    JOIN sessions s ON s.id = t.session_id
    JOIN participants p ON p.id = s.participant_id
    JOIN labs l ON l.id = p.lab_id
    JOIN images i ON i.id = t.image_id
    WHERE s.completed_at IS NOT NULL
      ${labFilter}
      ${participantFilter}
      ${sessionTypeFilter}
      ${labDayFilter}
    ORDER BY p.id, s.lab_day, s.session_type, t.trial_number
  `

  const result = await pool.query(query, params)

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'No completed trial data found' })
    return
  }

  // Build CSV
  const columns = [
    'ParticipantID', 'LabNumber', 'LabDay', 'Session', 'Condition', 'Order',
    'Age', 'Gender', 'TrialNumber', 'ImageFile', 'Emotion',
    'TargetFoil', 'Response', 'Correct',
    'ValenceRating', 'ArousalRating', 'ValenceRT', 'ArousalRT', 'MemoryRT',
  ]

  const header = columns.join(',')
  const rows = result.rows.map((row) =>
    columns.map((col) => {
      const val = row[col]
      if (val === null || val === undefined) return ''
      const str = String(val)
      // Quote strings that contain commas or quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(',')
  )

  const csv = [header, ...rows].join('\n')

  let filename = 'naps_all_data.csv'
  if (req.query.participantId) {
    const parts = [`naps_p${req.query.participantId}`]
    if (req.query.labDay) parts.push(`day${req.query.labDay}`)
    if (req.query.sessionType) parts.push(String(req.query.sessionType))
    filename = `${parts.join('_')}.csv`
  } else if (req.query.labId) {
    filename = `naps_lab_${req.query.labId}.csv`
  }

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
})

router.get('/assignments', requireAuth, async (req, res) => {
  const participantId = req.query.participantId ? Number(req.query.participantId) : null
  if (!participantId) {
    res.status(400).json({ error: 'participantId is required' })
    return
  }

  // Lab users can only export their own participants
  if (req.session.role === 'lab_user') {
    const check = await pool.query(
      'SELECT 1 FROM participants WHERE id = $1 AND lab_id = $2',
      [participantId, req.session.labId]
    )
    if (check.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' })
      return
    }
  }

  const result = await pool.query(`
    SELECT
      i.filename AS "ImageFile",
      INITCAP(i.emotion::text) AS "Emotion",
      pia.lab_day AS "LabDay",
      CASE
        WHEN (p.condition_order = 0 AND pia.lab_day = 1)
          OR (p.condition_order = 1 AND pia.lab_day = 2) THEN 'Sleep'
        ELSE 'Wake'
      END AS "Condition",
      pia.image_role AS "ImageRole",
      pia.presentation_position AS "PresentationPosition",
      pia.test_position AS "TestPosition"
    FROM participant_image_assignments pia
    JOIN images i ON i.id = pia.image_id
    JOIN participants p ON p.id = pia.participant_id
    WHERE pia.participant_id = $1
    ORDER BY pia.lab_day, pia.image_role, pia.presentation_position
  `, [participantId])

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'No assignments found for this participant' })
    return
  }

  const columns = ['ImageFile', 'Emotion', 'LabDay', 'Condition', 'ImageRole', 'PresentationPosition', 'TestPosition']
  const header = columns.join(',')
  const rows = result.rows.map((row) =>
    columns.map((col) => {
      const val = row[col]
      if (val === null || val === undefined) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(',')
  )

  const csv = [header, ...rows].join('\n')
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="naps_assignments_${participantId}.csv"`)
  res.send(csv)
})

export default router

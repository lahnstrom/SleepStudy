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

  const query = `
    SELECT
      t.trial_number AS "TrialNumber",
      i.filename AS "ImageFile",
      INITCAP(i.emotion::text) AS "Emotion",
      t.valence_rating AS "ValenceRating",
      t.arousal_rating AS "ArousalRating",
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
      END AS "WakeSleep",
      p.condition_order AS "Order",
      p.age AS "Age",
      p.gender AS "Gender",
      t.target_foil AS "TargetFoil",
      t.memory_response AS "Response",
      t.correct AS "Correct",
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
    ORDER BY p.id, s.lab_day, s.session_type, t.trial_number
  `

  const result = await pool.query(query, params)

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'No completed trial data found' })
    return
  }

  // Build CSV
  const columns = [
    'TrialNumber', 'ImageFile', 'Emotion', 'ValenceRating', 'ArousalRating',
    'ParticipantID', 'LabNumber', 'LabDay', 'Session', 'WakeSleep', 'Order',
    'Age', 'Gender', 'TargetFoil', 'Response', 'Correct',
    'ValenceRT', 'ArousalRT', 'MemoryRT',
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

  const filename = req.query.participantId
    ? `naps_participant_${req.query.participantId}.csv`
    : req.query.labId
      ? `naps_lab_${req.query.labId}.csv`
      : 'naps_all_data.csv'

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
})

export default router

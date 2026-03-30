import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

const router = Router()

const createLabSchema = z.object({
  labNumber: z.number().int().positive(),
  name: z.string().min(1).max(200),
})

router.get('/', requireAdmin, async (_req, res) => {
  const result = await pool.query(
    `SELECT l.*, COUNT(p.id)::int AS participant_count
     FROM labs l
     LEFT JOIN participants p ON p.lab_id = l.id
     GROUP BY l.id
     ORDER BY l.lab_number`
  )
  res.json(result.rows)
})

router.post('/', requireAdmin, async (req, res) => {
  const parsed = createLabSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const { labNumber, name } = parsed.data

  try {
    const result = await pool.query(
      'INSERT INTO labs (lab_number, name) VALUES ($1, $2) RETURNING *',
      [labNumber, name]
    )
    res.status(201).json(result.rows[0])
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'A lab with this number already exists' })
      return
    }
    throw err
  }
})

router.get('/:labId', requireAuth, async (req, res) => {
  const labId = parseInt(String(req.params.labId), 10)
  if (isNaN(labId)) {
    res.status(400).json({ error: 'Invalid lab ID' })
    return
  }

  const result = await pool.query(
    `SELECT l.*, COUNT(p.id)::int AS participant_count
     FROM labs l
     LEFT JOIN participants p ON p.lab_id = l.id
     WHERE l.id = $1
     GROUP BY l.id`,
    [labId]
  )

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Lab not found' })
    return
  }

  res.json(result.rows[0])
})

export default router

import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

const router = Router()

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['lab_user', 'admin']),
  labId: z.number().int().positive().nullable(),
})

router.post('/users', requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const { email, password, role, labId } = parsed.data

  if (role === 'lab_user' && labId === null) {
    res.status(400).json({ error: 'Lab users must be assigned to a lab' })
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)

  try {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role, lab_id) VALUES ($1, $2, $3, $4) RETURNING id, email, role, lab_id',
      [email, passwordHash, role, labId]
    )
    res.status(201).json(result.rows[0])
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'A user with this email already exists' })
      return
    }
    throw err
  }
})

router.get('/users', requireAdmin, async (_req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.email, u.role, u.lab_id, l.lab_number, l.name as lab_name, u.created_at
     FROM users u
     LEFT JOIN labs l ON l.id = u.lab_id
     ORDER BY u.created_at DESC`
  )
  res.json(result.rows)
})

const resetPasswordSchema = z.object({
  password: z.string().min(8),
})

router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.id), 10)
  const parsed = resetPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Password must be at least 8 characters' })
    return
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  const result = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, email',
    [passwordHash, userId]
  )

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  res.json({ ok: true, user: result.rows[0] })
})

router.get('/participants', requireAdmin, async (req, res) => {
  const labFilter = req.query.labId ? 'WHERE p.lab_id = $1' : ''
  const params = req.query.labId ? [Number(req.query.labId)] : []

  const result = await pool.query(
    `SELECT p.*, l.lab_number, l.name as lab_name,
       COUNT(DISTINCT s.id) FILTER (WHERE s.completed_at IS NOT NULL)::int as completed_sessions,
       COUNT(DISTINCT s.id)::int as total_sessions
     FROM participants p
     JOIN labs l ON l.id = p.lab_id
     LEFT JOIN sessions s ON s.participant_id = p.id
     ${labFilter}
     GROUP BY p.id, l.lab_number, l.name
     ORDER BY l.lab_number, p.participant_code`,
    params
  )
  res.json(result.rows)
})

export default router

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

export default router

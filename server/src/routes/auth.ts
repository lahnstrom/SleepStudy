import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { config } from '../config.js'

const router = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email or password format' })
    return
  }

  const { email, password } = parsed.data

  const result = await pool.query(
    'SELECT id, email, password_hash, role, lab_id FROM users WHERE email = $1',
    [email]
  )

  if (result.rows.length === 0) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  const user = result.rows[0]
  const valid = await bcrypt.compare(password, user.password_hash)

  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  req.session.userId = user.id
  req.session.email = user.email
  req.session.role = user.role
  req.session.labId = user.lab_id

  res.json({ id: user.id, email: user.email, role: user.role, labId: user.lab_id })
})

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to logout' })
      return
    }
    res.clearCookie(config.sessionCookieName)
    res.json({ ok: true })
  })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({
    id: req.session.userId,
    email: req.session.email,
    role: req.session.role,
    labId: req.session.labId,
  })
})

export default router

import bcrypt from 'bcrypt'
import { pool } from './db.js'

async function seed() {
  const email = 'admin@ki.se'
  const password = process.argv[2] || 'changeme123'

  const passwordHash = await bcrypt.hash(password, 12)

  const result = await pool.query(
    `INSERT INTO users (email, password_hash, role, lab_id)
     VALUES ($1, $2, 'admin', NULL)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, role`,
    [email, passwordHash]
  )

  if (result.rows.length > 0) {
    console.log('Created admin user:', result.rows[0])
  } else {
    console.log('Admin user already exists')
  }

  await pool.end()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})

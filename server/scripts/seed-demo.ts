/**
 * Seeds demo data: a lab, a lab user, and test images.
 * Usage: npx tsx scripts/seed-demo.ts
 */

import bcrypt from 'bcrypt'
import { pool } from '../src/db.js'

async function main() {
  // Create lab
  const labResult = await pool.query(
    `INSERT INTO labs (lab_number, name) VALUES (1, 'KI Demo Lab')
     ON CONFLICT (lab_number) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`
  )
  const labId = labResult.rows[0].id
  console.log(`Lab created: id=${labId}`)

  // Create lab user for Per
  const hash = await bcrypt.hash('naps2026', 12)
  const userResult = await pool.query(
    `INSERT INTO users (email, password_hash, role, lab_id)
     VALUES ('per@ki.se', $1, 'lab_user', $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id, email, role`,
    [hash, labId]
  )
  console.log(`Lab user created:`, userResult.rows[0])

  // Seed 320 test images if not present
  const imageCount = await pool.query('SELECT COUNT(*) FROM images')
  if (parseInt(imageCount.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO images (filename, database_source, emotion)
      SELECT 'neg_' || i || '.jpg', 'TEST', 'negative'
      FROM generate_series(1, 160) AS i
    `)
    await pool.query(`
      INSERT INTO images (filename, database_source, emotion)
      SELECT 'neu_' || i || '.jpg', 'TEST', 'neutral'
      FROM generate_series(1, 160) AS i
    `)
    console.log('Seeded 320 test images')
  } else {
    console.log(`Images already present (${imageCount.rows[0].count})`)
  }

  // Create a demo participant
  const participantResult = await pool.query(
    `SELECT * FROM create_participant($1, $2, $3, $4, $5, $6)`,
    [labId, 'DEMO-001', 0, 28, 'F', 'en']
  ).catch((err) => {
    if (err.code === '23505') {
      console.log('Demo participant already exists')
      return null
    }
    throw err
  })

  if (participantResult) {
    console.log('Demo participant created:', participantResult.rows[0].participant_code)
  }

  await pool.end()
  console.log('\nDemo setup complete!')
  console.log('Lab user login: per@ki.se / naps2026')
  console.log('Admin login: admin@ki.se / demoPassword123')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})

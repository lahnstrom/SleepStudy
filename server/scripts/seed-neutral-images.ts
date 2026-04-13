/**
 * Seeds real neutral stimulus images from the Neutrala/ folder into the database.
 * Replaces placeholder neu_1.jpg..neu_160.jpg entries with actual filenames.
 * Infers the database source from filename patterns.
 *
 * Usage: npx tsx scripts/seed-neutral-images.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { pool } from '../src/db.js'

function inferSource(filename: string): string {
  // Pure numeric IDs → IAPS
  if (/^\d+\.\w+$/.test(filename)) return 'IAPS'
  // Nencki Affective Picture System (NAPS): Animals_, Faces_, Landscapes_, Objects_, People_
  if (/^(Animals|Faces|Landscapes|Objects|People)_/.test(filename)) return 'Nencki'
  // EmoMadrid
  if (/^EM\d+/.test(filename)) return 'EmoMadrid'
  // Nencki BMP files (N001.bmp etc)
  if (/^N\d+\.bmp$/.test(filename)) return 'Nencki'
  // OASIS (descriptive names like "Acorns 3.jpg", "Band 1.jpg")
  return 'OASIS'
}

async function main() {
  const neutralDir = path.join(process.cwd(), '..', 'Neutrala')
  if (!fs.existsSync(neutralDir)) {
    console.error('Neutrala/ directory not found at', neutralDir)
    process.exit(1)
  }

  const files = fs.readdirSync(neutralDir).filter(f =>
    /\.(jpg|jpeg|bmp|png)$/i.test(f)
  ).sort()

  console.log(`Found ${files.length} neutral image files`)

  // Remove old placeholder neutral images and their assignments
  const placeholders = await pool.query(
    `SELECT id FROM images WHERE emotion = 'neutral' AND database_source = 'TEST'`
  )
  if (placeholders.rows.length > 0) {
    const ids = placeholders.rows.map(r => r.id)
    const deletedAssignments = await pool.query(
      `DELETE FROM participant_image_assignments WHERE image_id = ANY($1) RETURNING id`,
      [ids]
    )
    console.log(`Removed ${deletedAssignments.rowCount} assignments referencing placeholder images`)

    await pool.query(`ALTER TABLE trials DISABLE TRIGGER trials_immutable`)
    const deletedTrials = await pool.query(
      `DELETE FROM trials WHERE image_id = ANY($1) RETURNING id`,
      [ids]
    )
    await pool.query(`ALTER TABLE trials ENABLE TRIGGER trials_immutable`)
    console.log(`Removed ${deletedTrials.rowCount} trials referencing placeholder images`)

    const deleted = await pool.query(
      `DELETE FROM images WHERE id = ANY($1) RETURNING id`,
      [ids]
    )
    console.log(`Removed ${deleted.rowCount} placeholder neutral images`)
  } else {
    console.log('No placeholder neutral images to remove')
  }

  // Insert real neutral images
  let inserted = 0
  for (const file of files) {
    const source = inferSource(file)
    const result = await pool.query(
      `INSERT INTO images (filename, database_source, emotion)
       VALUES ($1, $2, 'neutral')
       ON CONFLICT (filename) DO NOTHING
       RETURNING id`,
      [file, source]
    )
    if (result.rowCount && result.rowCount > 0) inserted++
  }

  console.log(`Inserted ${inserted} neutral images (${files.length - inserted} already existed)`)

  const total = await pool.query(`SELECT COUNT(*) FROM images WHERE emotion = 'neutral'`)
  console.log(`Total neutral images in database: ${total.rows[0].count}`)

  await pool.end()
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})

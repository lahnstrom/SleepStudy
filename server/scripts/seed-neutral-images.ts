/**
 * Seeds real neutral stimulus images from the Neutrala/ folder into the database.
 * Infers the database source from filename patterns.
 *
 * Usage: npx tsx scripts/seed-neutral-images.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { pool } from '../src/db.js'

function inferSource(filename: string): string {
  if (/^\d+\.\w+$/.test(filename)) return 'IAPS'
  if (/^(Animals|Faces|Landscapes|Objects|People)_/.test(filename)) return 'Nencki'
  if (/^EM\d+/.test(filename)) return 'EmoMadrid'
  if (/^N\d+\.bmp$/.test(filename)) return 'Nencki'
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

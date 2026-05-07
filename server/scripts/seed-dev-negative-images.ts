/**
 * Seeds 160 placeholder negative images for local development.
 * Creates both the DB records and BMP placeholder files in ./images/.
 *
 * NOT for production — negative stimuli (IAPS etc.) are seeded per-lab with real files.
 *
 * Usage: npx tsx scripts/seed-dev-negative-images.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { pool } from '../src/db.js'

const WIDTH = 800
const HEIGHT = 600
const COUNT = 160

function createBMP(width: number, height: number): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelDataSize = rowSize * height
  const fileSize = 54 + pixelDataSize
  const buf = Buffer.alloc(fileSize)

  buf.write('BM', 0)
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(-height, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(pixelDataSize, 34)

  // Reddish tint
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = 54 + y * rowSize + x * 3
      const shade = (Math.sin(x * 0.02) * 15 + Math.cos(y * 0.02) * 15) | 0
      buf[offset]     = Math.max(0, Math.min(255, 60 + shade))  // B
      buf[offset + 1] = Math.max(0, Math.min(255, 60 + shade))  // G
      buf[offset + 2] = Math.max(0, Math.min(255, 140 + shade)) // R
    }
  }
  return buf
}

async function main() {
  const imagesDir = path.join(process.cwd(), 'images')
  fs.mkdirSync(imagesDir, { recursive: true })

  let inserted = 0
  let filesCreated = 0

  for (let i = 1; i <= COUNT; i++) {
    const filename = `dev_neg_${String(i).padStart(3, '0')}.bmp`

    const result = await pool.query(
      `INSERT INTO images (filename, database_source, emotion)
       VALUES ($1, 'DEV_PLACEHOLDER', 'negative')
       ON CONFLICT (filename) DO NOTHING
       RETURNING id`,
      [filename]
    )
    if (result.rowCount && result.rowCount > 0) inserted++

    const filePath = path.join(imagesDir, filename)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, createBMP(WIDTH, HEIGHT))
      filesCreated++
    }
  }

  console.log(`Inserted ${inserted} negative image records (${COUNT - inserted} already existed)`)
  console.log(`Created ${filesCreated} placeholder image files`)

  const total = await pool.query(`SELECT COUNT(*) FROM images WHERE emotion = 'negative'`)
  console.log(`Total negative images in database: ${total.rows[0].count}`)

  await pool.end()
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})

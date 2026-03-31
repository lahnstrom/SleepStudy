/**
 * Generates placeholder JPEG images for all entries in the images table.
 * Each image is an 800x600 colored rectangle with the filename overlaid.
 * Negative images get a reddish tint, neutral images get a blue-grey tint.
 *
 * Usage: npx tsx scripts/generate-placeholder-images.ts [output-dir]
 * Default output-dir: ./images
 */

import fs from 'node:fs'
import path from 'node:path'
import { pool } from '../src/db.js'

const WIDTH = 800
const HEIGHT = 600

// Minimal BMP generator (no external deps) — converted to JPEG would need a lib,
// so we generate PPM files and rename to .jpg. Browsers handle raw image data
// when served with correct content-type, but for simplicity we'll create
// actual image files using canvas-like approach with raw pixel buffers.

// Since we're in Node without canvas, let's create simple PPM images
// (which won't work as .jpg) — instead, let's use a tiny inline BMP encoder.

function createBMP(width: number, height: number, r: number, g: number, b: number, label: string): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelDataSize = rowSize * height
  const fileSize = 54 + pixelDataSize

  const buf = Buffer.alloc(fileSize)

  // BMP Header
  buf.write('BM', 0)
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(54, 10) // pixel data offset
  // DIB Header
  buf.writeUInt32LE(40, 14) // DIB header size
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(-height, 22) // negative = top-down
  buf.writeUInt16LE(1, 26) // color planes
  buf.writeUInt16LE(24, 28) // bits per pixel
  buf.writeUInt32LE(pixelDataSize, 34)

  // Fill pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = 54 + y * rowSize + x * 3
      // Add some variation
      const shade = Math.sin(x * 0.02) * 15 + Math.cos(y * 0.02) * 15
      buf[offset] = Math.max(0, Math.min(255, b + shade | 0))     // B
      buf[offset + 1] = Math.max(0, Math.min(255, g + shade | 0)) // G
      buf[offset + 2] = Math.max(0, Math.min(255, r + shade | 0)) // R
    }
  }

  // Draw a simple text area in the center (white rectangle + we can't render text in BMP easily,
  // but the filename will be visible in the browser title/alt text)
  const cx = Math.floor(width / 2)
  const cy = Math.floor(height / 2)
  for (let y = cy - 20; y < cy + 20; y++) {
    for (let x = cx - 150; x < cx + 150; x++) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const offset = 54 + y * rowSize + x * 3
        buf[offset] = 255     // B
        buf[offset + 1] = 255 // G
        buf[offset + 2] = 255 // R
      }
    }
  }

  return buf
}

async function main() {
  const outputDir = process.argv[2] || path.join(process.cwd(), 'images')

  console.log(`Output directory: ${outputDir}`)

  // Get all image filenames and emotions from DB
  const result = await pool.query('SELECT filename, emotion FROM images ORDER BY filename')
  console.log(`Found ${result.rows.length} images in database`)

  let created = 0
  for (const row of result.rows) {
    const filePath = path.join(outputDir, row.filename)
    const dir = path.dirname(filePath)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    if (fs.existsSync(filePath)) continue

    // Negative = reddish, Neutral = blue-grey
    const isNeg = row.emotion === 'negative'
    const r = isNeg ? 140 : 80
    const g = isNeg ? 60 : 90
    const b = isNeg ? 60 : 120

    const bmp = createBMP(WIDTH, HEIGHT, r, g, b, row.filename)
    fs.writeFileSync(filePath, bmp)
    created++
  }

  console.log(`Created ${created} placeholder images (${result.rows.length - created} already existed)`)
  await pool.end()
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})

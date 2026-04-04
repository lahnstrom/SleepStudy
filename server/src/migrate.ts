import fs from 'node:fs'
import path from 'node:path'
import { pool } from './db.js'

async function migrate() {
  // Create tracking table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `)

  const migrationsDir = path.join(import.meta.dirname, '..', 'migrations')
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  // Get already-applied migrations
  const applied = await pool.query('SELECT filename FROM _migrations')
  const appliedSet = new Set(applied.rows.map(r => r.filename))

  let ranCount = 0
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`Skipping ${file} (already applied)`)
      continue
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    console.log(`Running ${file}...`)
    await pool.query(sql)
    await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
    console.log(`  Done.`)
    ranCount++
  }

  if (ranCount === 0) {
    console.log('No new migrations to run.')
  } else {
    console.log(`${ranCount} migration(s) applied.`)
  }

  await pool.end()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})

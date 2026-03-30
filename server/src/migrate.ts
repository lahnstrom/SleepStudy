import fs from 'node:fs'
import path from 'node:path'
import { pool } from './db.js'

async function migrate() {
  const migrationsDir = path.join(import.meta.dirname, '..', 'migrations')
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    console.log(`Running ${file}...`)
    await pool.query(sql)
    console.log(`  Done.`)
  }

  console.log('All migrations complete.')
  await pool.end()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})

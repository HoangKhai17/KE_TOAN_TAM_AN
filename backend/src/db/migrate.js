/**
 * Simple migration runner.
 * Usage: node src/db/migrate.js up|down|status
 *
 * Migrations live in /migrations/*.sql (naming: 001_name.sql, 001_name.down.sql)
 */
require('../config/env')
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const MIGRATIONS_DIR = path.join(__dirname, '../../migrations')
const command = process.argv[2] || 'status'

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)
}

async function getApplied(client) {
  const res = await client.query('SELECT filename FROM schema_migrations ORDER BY filename')
  return new Set(res.rows.map((r) => r.filename))
}

// CHỈ nhận file migration đánh số dạng NNN_*.sql (001_..., 082_...).
// Cố tình BỎ QUA mọi file khác (vd seed_*.sql) để migrate KHÔNG bao giờ
// chạy nhầm dữ liệu seed/demo trên production.
const MIGRATION_RE = /^\d{3,}_.*\.sql$/
function getUpFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => MIGRATION_RE.test(f) && !f.endsWith('.down.sql'))
    .sort()
}

async function migrateUp(client) {
  const applied = await getApplied(client)
  const files = getUpFiles().filter((f) => !applied.has(f))

  if (files.length === 0) {
    console.log('Nothing to migrate — already up to date.')
    return
  }

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    console.log(`Applying: ${file}`)
    await client.query(sql)
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
    console.log(`  ✓ ${file}`)
  }
  console.log(`\nMigrated ${files.length} file(s).`)
}

async function migrateDown(client) {
  const applied = await getApplied(client)
  const files = [...applied].sort().reverse()
  const last = files[0]
  if (!last) {
    console.log('Nothing to roll back.')
    return
  }
  const downFile = last.replace('.sql', '.down.sql')
  const downPath = path.join(MIGRATIONS_DIR, downFile)
  if (!fs.existsSync(downPath)) {
    throw new Error(`Down migration not found: ${downFile}`)
  }
  console.log(`Rolling back: ${last}`)
  const sql = fs.readFileSync(downPath, 'utf8')
  await client.query(sql)
  await client.query('DELETE FROM schema_migrations WHERE filename = $1', [last])
  console.log(`  ✓ Rolled back ${last}`)
}

async function showStatus(client) {
  const applied = await getApplied(client)
  const files = getUpFiles()
  console.log('\nMigration Status:')
  console.log('─'.repeat(60))
  for (const f of files) {
    const status = applied.has(f) ? '✅ applied' : '⬜ pending'
    console.log(`  ${status}  ${f}`)
  }
  console.log(`\nApplied: ${applied.size} / ${files.length}`)
}

async function main() {
  const client = await pool.connect()
  try {
    await ensureMigrationsTable(client)
    if (command === 'up') await migrateUp(client)
    else if (command === 'down') await migrateDown(client)
    else await showStatus(client)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Migration error:', err.message)
  process.exit(1)
})

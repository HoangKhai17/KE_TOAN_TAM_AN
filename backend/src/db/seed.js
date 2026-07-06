/**
 * Seed runner.
 * Usage:
 *   node src/db/seed.js            → chỉ chạy seed NỀN /seeds/*.sql (admin, configs, task types…)
 *   node src/db/seed.js --demo     → chạy thêm dữ liệu DEMO /seeds/demo/*.sql (chỉ dùng dev/test)
 *   SEED_DEMO=true node src/db/seed.js  → tương đương --demo
 *
 * Idempotent (ON CONFLICT DO NOTHING).
 * ⚠️ TUYỆT ĐỐI KHÔNG chạy demo trên production — sẽ bơm users/companies/payroll/tasks giả.
 */
require('../config/env')
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const SEEDS_DIR = path.join(__dirname, '../../seeds')
const DEMO_DIR = path.join(SEEDS_DIR, 'demo')

const wantDemo = process.argv.includes('--demo') || process.env.SEED_DEMO === 'true'

function sqlFilesIn(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
}

async function runFiles(client, dir, files, label) {
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    console.log(`Seeding [${label}]: ${file}`)
    await client.query(sql)
    console.log(`  ✓ ${file}`)
  }
}

async function main() {
  // Chặn an toàn: không cho seed demo trên môi trường production.
  if (wantDemo && process.env.NODE_ENV === 'production') {
    console.error('✋ Từ chối: KHÔNG seed dữ liệu demo trên production (NODE_ENV=production).')
    process.exit(1)
  }

  const client = await pool.connect()
  try {
    const baseFiles = sqlFilesIn(SEEDS_DIR)
    const demoFiles = wantDemo ? sqlFilesIn(DEMO_DIR) : []

    if (baseFiles.length === 0 && demoFiles.length === 0) {
      console.log('No seed files found.')
      return
    }

    await runFiles(client, SEEDS_DIR, baseFiles, 'base')
    if (wantDemo) {
      console.log('\n⚠️  Đang nạp dữ liệu DEMO (chỉ nên dùng ở dev/test)…')
      await runFiles(client, DEMO_DIR, demoFiles, 'demo')
    }

    console.log(`\nSeeded ${baseFiles.length} base + ${demoFiles.length} demo file(s).`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Seed error:', err.message)
  process.exit(1)
})

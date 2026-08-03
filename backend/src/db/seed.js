/**
 * Seed runner (CÓ TRACKING — mỗi file seed NỀN chỉ chạy ĐÚNG 1 LẦN).
 * Usage:
 *   node src/db/seed.js            → chạy seed NỀN /seeds/*.sql (admin, configs, task types…)
 *   node src/db/seed.js --demo     → chạy thêm dữ liệu DEMO /seeds/demo/*.sql (chỉ dev/test)
 *   SEED_DEMO=true node src/db/seed.js  → tương đương --demo
 *
 * ── Cơ chế chống ghi đè production ────────────────────────────────────────────
 * - Bảng `schema_seeds` ghi lại file seed nền đã áp (giống `schema_migrations`).
 *   Chạy lại → file đã áp bị BỎ QUA → KHÔNG re-insert / KHÔNG ghi đè dữ liệu thật.
 * - BACKFILL: nếu DB đã có dữ liệu (đã go-live: có user) mà chưa track seed nào,
 *   thì đánh dấu toàn bộ seed nền hiện có là "ĐÃ ÁP" mà KHÔNG chạy — bảo vệ
 *   production đang vận hành khỏi bị nạp lại. Cài mới (DB trống) vẫn chạy bình thường.
 * - Seed DEMO KHÔNG track (chỉ dev/test) và bị CHẶN khi NODE_ENV=production.
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

async function ensureSeedTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_seeds (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`)
}

async function getAppliedSeeds(client) {
  const res = await client.query('SELECT filename FROM schema_seeds')
  return new Set(res.rows.map((r) => r.filename))
}

// DB đã go-live chưa? (đã có ít nhất 1 user) → seed nền coi như đã áp, không nạp lại.
async function dbAlreadyProvisioned(client) {
  try {
    const r = await client.query('SELECT 1 FROM users LIMIT 1')
    return r.rowCount > 0
  } catch {
    return false   // bảng users chưa tồn tại → DB trống (cài mới)
  }
}

// Chạy 1 file seed nền TRONG transaction + ghi tracking (nguyên tử: lỗi thì rollback, không đánh dấu).
async function applyTracked(client, dir, file) {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8')
  console.log(`Seeding [base]: ${file}`)
  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query('INSERT INTO schema_seeds (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file])
    await client.query('COMMIT')
    console.log(`  ✓ ${file}`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }
}

// Demo: chạy thẳng, KHÔNG track (chỉ dev/test).
async function runDemo(client, files) {
  for (const file of files) {
    const sql = fs.readFileSync(path.join(DEMO_DIR, file), 'utf8')
    console.log(`Seeding [demo]: ${file}`)
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
    await ensureSeedTable(client)
    const applied = await getAppliedSeeds(client)
    const baseFiles = sqlFilesIn(SEEDS_DIR)

    // BACKFILL: DB đã có dữ liệu nhưng chưa track seed nào → đánh dấu seed nền hiện có là
    // ĐÃ ÁP (không chạy), tránh nạp lại đè production. (Cài mới: DB trống → bỏ qua nhánh này.)
    if (applied.size === 0 && await dbAlreadyProvisioned(client)) {
      for (const f of baseFiles) {
        await client.query('INSERT INTO schema_seeds (filename) VALUES ($1) ON CONFLICT DO NOTHING', [f])
        applied.add(f)
      }
      console.log(`⚑ DB đã có dữ liệu (go-live) — đánh dấu ${baseFiles.length} seed nền là ĐÃ ÁP, KHÔNG chạy lại (bảo vệ production).`)
    }

    const toRun = baseFiles.filter((f) => !applied.has(f))
    if (toRun.length === 0) {
      console.log('Seed nền: không có file mới cần chạy — bỏ qua.')
    } else {
      for (const file of toRun) await applyTracked(client, SEEDS_DIR, file)
    }

    let demoCount = 0
    if (wantDemo) {
      const demoFiles = sqlFilesIn(DEMO_DIR)
      demoCount = demoFiles.length
      console.log('\n⚠️  Đang nạp dữ liệu DEMO (chỉ nên dùng ở dev/test)…')
      await runDemo(client, demoFiles)
    }

    console.log(`\nHoàn tất: chạy ${toRun.length} seed nền mới (${baseFiles.length - toRun.length} đã áp trước đó) + ${demoCount} demo file(s).`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Seed error:', err.message)
  process.exit(1)
})

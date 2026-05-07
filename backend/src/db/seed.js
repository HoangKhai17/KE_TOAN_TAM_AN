/**
 * Seed runner.
 * Usage: node src/db/seed.js
 * Runs all files in /seeds/*.sql in alphabetical order (idempotent — uses ON CONFLICT DO NOTHING).
 */
require('../config/env')
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const SEEDS_DIR = path.join(__dirname, '../../seeds')

async function main() {
  const client = await pool.connect()
  try {
    const files = fs
      .readdirSync(SEEDS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    if (files.length === 0) {
      console.log('No seed files found in /seeds/')
      return
    }

    for (const file of files) {
      const sql = fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8')
      console.log(`Seeding: ${file}`)
      await client.query(sql)
      console.log(`  ✓ ${file}`)
    }
    console.log(`\nSeeded ${files.length} file(s).`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Seed error:', err.message)
  process.exit(1)
})

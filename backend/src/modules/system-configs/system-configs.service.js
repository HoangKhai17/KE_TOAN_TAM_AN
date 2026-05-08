const { query } = require('../../config/db')
const { applyTimezone } = require('../../config/appSettings')

function toDto(row) {
  return {
    id:          row.id,
    key:         row.key,
    value:       row.value,
    description: row.description ?? null,
    updatedBy:   row.updated_by ?? null,
    updatedAt:   row.updated_at,
  }
}

async function listConfigs() {
  const { rows } = await query(
    'SELECT id, key, value, description, updated_by, updated_at FROM system_configs ORDER BY key'
  )
  return rows.map(toDto)
}

async function updateConfig(key, value, userId) {
  // UPSERT — creates the row if it doesn't exist (handles first-run before seed)
  const { rows } = await query(
    `INSERT INTO system_configs (key, value, updated_by, updated_at)
          VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE
           SET value      = EXCLUDED.value,
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()
     RETURNING id, key, value, description, updated_by, updated_at`,
    [key, String(value), userId]
  )

  const config = toDto(rows[0])

  // Re-apply in memory immediately so subsequent DB sessions and Node.js
  // date operations use the new timezone without requiring a server restart.
  if (key === 'system_timezone') {
    applyTimezone(config.value)
  }

  return config
}

module.exports = { listConfigs, updateConfig }

const { query } = require('../../config/db')
const enumsLib = require('../../lib/enums')

async function listAllEnums() {
  return enumsLib.getAll()
}

async function listEnumType(typeKey) {
  const all = await enumsLib.getAll()
  const entry = all[typeKey]
  if (!entry) return null
  return { typeKey, ...entry }
}

async function updateOptionLabel(typeKey, optionKey, label) {
  const { rows } = await query(`
    UPDATE enum_options eo
    SET label = $1
    FROM enum_types et
    WHERE eo.type_id = et.id
      AND et.type_key = $2
      AND eo.option_key = $3
    RETURNING eo.id, eo.option_key, eo.label, eo.sort_order, eo.is_active
  `, [label, typeKey, optionKey])

  if (rows.length === 0) return null
  enumsLib.invalidate()
  return {
    key:       rows[0].option_key,
    label:     rows[0].label,
    sortOrder: rows[0].sort_order,
    isActive:  rows[0].is_active,
  }
}

module.exports = { listAllEnums, listEnumType, updateOptionLabel }

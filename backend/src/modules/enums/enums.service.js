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

async function addOption(typeKey, optionKey, label) {
  // check type exists
  const { rows: typeRows } = await query(
    'SELECT id FROM enum_types WHERE type_key = $1', [typeKey]
  )
  if (typeRows.length === 0) return null

  const typeId = typeRows[0].id

  // next sort_order
  const { rows: maxRows } = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM enum_options WHERE type_id = $1', [typeId]
  )
  const sortOrder = maxRows[0].next

  const { rows } = await query(`
    INSERT INTO enum_options (type_id, option_key, label, sort_order)
    VALUES ($1, $2, $3, $4)
    RETURNING id, option_key, label, sort_order, is_active
  `, [typeId, optionKey, label, sortOrder])

  enumsLib.invalidate()
  return {
    key:       rows[0].option_key,
    label:     rows[0].label,
    sortOrder: rows[0].sort_order,
    isActive:  rows[0].is_active,
  }
}

async function toggleOption(typeKey, optionKey) {
  const { rows } = await query(`
    UPDATE enum_options eo
    SET is_active = NOT is_active
    FROM enum_types et
    WHERE eo.type_id = et.id
      AND et.type_key = $1
      AND eo.option_key = $2
    RETURNING eo.option_key, eo.label, eo.sort_order, eo.is_active
  `, [typeKey, optionKey])

  if (rows.length === 0) return null
  enumsLib.invalidate()
  return {
    key:       rows[0].option_key,
    label:     rows[0].label,
    sortOrder: rows[0].sort_order,
    isActive:  rows[0].is_active,
  }
}

module.exports = { listAllEnums, listEnumType, updateOptionLabel, addOption, toggleOption }

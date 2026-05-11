const { query } = require('../config/db')

let _cache = null

async function _load() {
  const { rows } = await query(`
    SELECT et.type_key, et.label AS type_label, et.is_editable,
           eo.option_key, eo.label AS option_label, eo.sort_order, eo.is_active
    FROM enum_types et
    JOIN enum_options eo ON eo.type_id = et.id
    ORDER BY et.type_key, eo.sort_order, eo.option_key
  `)
  const map = {}
  for (const row of rows) {
    if (!map[row.type_key]) {
      map[row.type_key] = { label: row.type_label, isEditable: row.is_editable, options: [] }
    }
    map[row.type_key].options.push({
      key:       row.option_key,
      label:     row.option_label,
      sortOrder: row.sort_order,
      isActive:  row.is_active,
    })
  }
  return map
}

async function getAll() {
  if (!_cache) _cache = await _load()
  return _cache
}

function invalidate() {
  _cache = null
}

async function getOptions(typeKey) {
  const all = await getAll()
  return all[typeKey]?.options ?? []
}

async function getValues(typeKey) {
  const opts = await getOptions(typeKey)
  return opts.filter((o) => o.isActive).map((o) => o.key)
}

async function getLabel(typeKey, optionKey, fallback) {
  const opts = await getOptions(typeKey)
  const found = opts.find((o) => o.key === optionKey)
  return found?.label ?? fallback ?? optionKey
}

module.exports = { getAll, getOptions, getValues, getLabel, invalidate }

const { query } = require('../config/db')

let _cache = null

async function _load() {
  const { rows } = await query(`
    SELECT et.type_key, et.label AS type_label, et.is_editable, et.has_groups,
           eo.option_key, eo.label AS option_label, eo.sort_order, eo.is_active,
           g.group_key, g.label AS group_label, g.sort_order AS group_sort
    FROM enum_types et
    JOIN enum_options eo ON eo.type_id = et.id
    LEFT JOIN enum_option_groups g ON g.id = eo.group_id
    ORDER BY et.type_key, eo.sort_order, eo.option_key
  `)
  // Nhóm được nạp riêng để danh mục có nhóm RỖNG (chưa gán lựa chọn nào) vẫn hiện ra
  const { rows: groupRows } = await query(`
    SELECT et.type_key, g.group_key, g.label, g.sort_order
    FROM enum_option_groups g
    JOIN enum_types et ON et.id = g.type_id
    ORDER BY et.type_key, g.sort_order, g.group_key
  `)

  const map = {}
  for (const row of rows) {
    if (!map[row.type_key]) {
      map[row.type_key] = {
        label: row.type_label, isEditable: row.is_editable,
        hasGroups: row.has_groups, groups: [], options: [],
      }
    }
    map[row.type_key].options.push({
      key:       row.option_key,
      label:     row.option_label,
      sortOrder: row.sort_order,
      isActive:  row.is_active,
      groupKey:  row.group_key ?? null,
      groupLabel: row.group_label ?? null,
    })
  }
  for (const g of groupRows) {
    if (!map[g.type_key]) continue
    map[g.type_key].groups.push({ key: g.group_key, label: g.label, sortOrder: g.sort_order })
  }
  return map
}

// Dịch danh sách MÃ NHÓM → danh sách MÃ LỰA CHỌN của danh mục đó.
// Nhờ vậy bộ lọc chỉ cần đổi ở lớp dịch, câu SQL lọc bên dưới giữ nguyên `IN (...)`.
async function expandGroupKeys(typeKey, groupKeys) {
  if (!Array.isArray(groupKeys) || groupKeys.length === 0) return []
  const opts = await getOptions(typeKey)
  const want = new Set(groupKeys)
  return opts.filter((o) => o.groupKey && want.has(o.groupKey)).map((o) => o.key)
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

module.exports = {
  expandGroupKeys, getAll, getOptions, getValues, getLabel, invalidate }

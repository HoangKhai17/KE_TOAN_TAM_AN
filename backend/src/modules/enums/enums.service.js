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

// Các type không phải native PG enum (cột varchar) — map thủ công tới nơi lưu giá trị
const NON_ENUM_USAGE = {
  task_source: [{ table: 'tasks', column: 'source' }],
}

// Tìm mọi cột (bảng.cột) đang dùng giá trị của một enum type.
// Với native PG enum: tra catalog (tự động, không hardcode). Với type varchar: dùng NON_ENUM_USAGE.
async function findUsageColumns(typeKey) {
  const { rows } = await query(`
    SELECT c.relname AS tbl, a.attname AS col
    FROM pg_type ty
    JOIN pg_attribute a ON a.atttypid = ty.oid
    JOIN pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE ty.typname = $1 AND ty.typtype = 'e' AND a.attnum > 0 AND NOT a.attisdropped
  `, [typeKey])
  if (rows.length) return rows.map((r) => ({ table: r.tbl, column: r.col }))
  return NON_ENUM_USAGE[typeKey] ?? []
}

async function deleteOption(typeKey, optionKey) {
  const { rows: typeRows } = await query(
    'SELECT id, is_editable FROM enum_types WHERE type_key = $1', [typeKey]
  )
  if (typeRows.length === 0) return { notFound: true }
  if (!typeRows[0].is_editable) {
    throw Object.assign(new Error('Danh mục hệ thống này không cho phép xóa'), { status: 403 })
  }

  const { rows: optRows } = await query(
    'SELECT id, label FROM enum_options WHERE type_id = $1 AND option_key = $2',
    [typeRows[0].id, optionKey]
  )
  if (optRows.length === 0) return { notFound: true }

  // Kiểm tra đang được sử dụng trong dữ liệu thực tế
  const cols = await findUsageColumns(typeKey)
  for (const { table, column } of cols) {
    const { rows: used } = await query(
      `SELECT 1 FROM "${table}" WHERE "${column}"::text = $1 LIMIT 1`, [optionKey]
    )
    if (used.length > 0) {
      throw Object.assign(
        new Error(`Không thể xóa "${optRows[0].label}" vì đang được sử dụng trong dữ liệu (bảng ${table}). Bạn có thể tắt (ẩn) mục này thay vì xóa.`),
        { status: 409 }
      )
    }
  }

  await query('DELETE FROM enum_options WHERE id = $1', [optRows[0].id])
  enumsLib.invalidate()
  return { deleted: true }
}


// ── NHÓM LỰA CHỌN ────────────────────────────────────────────────────────────
// Gom nhiều lựa chọn thành một nhóm để lọc gọn (vd Loại hình: TNHH/CP/DN tư nhân
// đều thuộc "Doanh nghiệp"). Chỉ dùng cho danh mục có has_groups = TRUE.

async function _typeIdCoNhom(typeKey) {
  const { rows } = await query(
    'SELECT id, has_groups FROM enum_types WHERE type_key = $1', [typeKey])
  if (rows.length === 0) return null
  if (!rows[0].has_groups) {
    throw Object.assign(
      new Error('Danh mục này chưa bật tính năng nhóm'), { status: 400 })
  }
  return rows[0].id
}

async function addGroup(typeKey, groupKey, label) {
  const typeId = await _typeIdCoNhom(typeKey)
  if (!typeId) return null
  const { rows: maxRows } = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM enum_option_groups WHERE type_id = $1', [typeId])
  const { rows } = await query(`
    INSERT INTO enum_option_groups (type_id, group_key, label, sort_order)
    VALUES ($1, $2, $3, $4)
    RETURNING group_key, label, sort_order
  `, [typeId, groupKey, label, maxRows[0].next])
  enumsLib.invalidate()
  return { key: rows[0].group_key, label: rows[0].label, sortOrder: rows[0].sort_order }
}

async function updateGroup(typeKey, groupKey, label) {
  const typeId = await _typeIdCoNhom(typeKey)
  if (!typeId) return null
  const { rows } = await query(`
    UPDATE enum_option_groups SET label = $1
    WHERE type_id = $2 AND group_key = $3
    RETURNING group_key, label, sort_order
  `, [label, typeId, groupKey])
  if (rows.length === 0) return null
  enumsLib.invalidate()
  return { key: rows[0].group_key, label: rows[0].label, sortOrder: rows[0].sort_order }
}

// Xoá nhóm KHÔNG xoá lựa chọn — khoá ngoại ON DELETE SET NULL đưa chúng về
// trạng thái "chưa gán nhóm". Nhóm chỉ là cách gom lại để lọc.
async function deleteGroup(typeKey, groupKey) {
  const typeId = await _typeIdCoNhom(typeKey)
  if (!typeId) return null
  const { rows } = await query(
    'DELETE FROM enum_option_groups WHERE type_id = $1 AND group_key = $2 RETURNING id',
    [typeId, groupKey])
  if (rows.length === 0) return null
  enumsLib.invalidate()
  return true
}

// Gán lựa chọn vào nhóm. groupKey = null → bỏ khỏi nhóm.
async function setOptionGroup(typeKey, optionKey, groupKey) {
  const typeId = await _typeIdCoNhom(typeKey)
  if (!typeId) return null

  let groupId = null
  if (groupKey) {
    const { rows: g } = await query(
      'SELECT id FROM enum_option_groups WHERE type_id = $1 AND group_key = $2', [typeId, groupKey])
    if (g.length === 0) {
      throw Object.assign(new Error('Không tìm thấy nhóm'), { status: 404 })
    }
    groupId = g[0].id
  }

  const { rows } = await query(`
    UPDATE enum_options SET group_id = $1
    WHERE type_id = $2 AND option_key = $3
    RETURNING option_key
  `, [groupId, typeId, optionKey])
  if (rows.length === 0) return null
  enumsLib.invalidate()
  return { key: rows[0].option_key, groupKey: groupKey ?? null }
}

module.exports = {
  addGroup, updateGroup, deleteGroup, setOptionGroup, listAllEnums, listEnumType, updateOptionLabel, addOption, toggleOption, deleteOption }

const { query, getClient } = require('../../config/db')

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(str, fallback) {
  const s = String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return s || fallback || `c_${Date.now().toString(36)}`
}

function uniqueKey(base, existing) {
  if (!existing.has(base)) return base
  let i = 2
  while (existing.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

async function assertAccess(companyId, user) {
  if (user.role === 'admin') return
  const { rows } = await query(
    'SELECT id FROM companies WHERE id = $1 AND assigned_staff_id = $2',
    [companyId, user.id],
  )
  if (!rows.length) {
    const err = new Error('Không có quyền truy cập dữ liệu công ty này')
    err.status = 403
    throw err
  }
}

// ── DTOs ────────────────────────────────────────────────────────────────────

function colToDto(c) {
  return {
    id: c.id, defId: c.def_id, colKey: c.col_key, label: c.label,
    dataType: c.data_type, required: c.required ?? false,
    options: c.options ?? null, sortOrder: c.sort_order, width: c.width ?? null,
    computedType: c.computed_type ?? null, computedConfig: c.computed_config ?? null,
    isActive: c.is_active ?? true,
    companyId: c.company_id ?? null,
    scope: c.company_id ? 'company' : 'global',
  }
}

function defToDto(d, columns) {
  return {
    id: d.id, tableKey: d.table_key, name: d.name, description: d.description ?? null,
    icon: d.icon ?? null, sortOrder: d.sort_order, isActive: d.is_active,
    allowCompanyColumns: d.allow_company_columns, isSystem: d.is_system,
    createdAt: d.created_at, updatedAt: d.updated_at,
    columns: columns ? columns.map(colToDto) : undefined,
  }
}

function rowToDto(r) {
  return {
    id: r.id, defId: r.def_id, companyId: r.company_id, data: r.data ?? {},
    position: r.position, createdBy: r.created_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

// ── Defs (global) ───────────────────────────────────────────────────────────

async function listDefs({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = TRUE' : ''
  const { rows: defs } = await query(
    `SELECT * FROM company_table_defs ${where} ORDER BY sort_order, created_at`,
  )
  if (!defs.length) return []
  const ids = defs.map((d) => d.id)
  const { rows: cols } = await query(
    'SELECT * FROM company_table_columns WHERE def_id = ANY($1) ORDER BY sort_order, created_at',
    [ids],
  )
  const byDef = {}
  for (const c of cols) (byDef[c.def_id] ??= []).push(c)
  return defs.map((d) => defToDto(d, byDef[d.id] ?? []))
}

async function getDef(id) {
  const { rows } = await query('SELECT * FROM company_table_defs WHERE id = $1', [id])
  if (!rows.length) { const e = new Error('Không tìm thấy bảng'); e.status = 404; throw e }
  const { rows: cols } = await query(
    'SELECT * FROM company_table_columns WHERE def_id = $1 ORDER BY sort_order, created_at', [id],
  )
  return defToDto(rows[0], cols)
}

async function createDef(body, userId) {
  const { rows: existing } = await query('SELECT table_key FROM company_table_defs')
  const set = new Set(existing.map((r) => r.table_key))
  const tableKey = uniqueKey(slugify(body.tableKey || body.name, 'tbl'), set)

  const { rows: maxRows } = await query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM company_table_defs')
  const sortOrder = body.sortOrder ?? maxRows[0].next

  const { rows } = await query(
    `INSERT INTO company_table_defs (table_key, name, description, icon, sort_order, allow_company_columns, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tableKey, body.name, body.description || null, body.icon || null, sortOrder,
     body.allowCompanyColumns ?? false, userId],
  )
  return defToDto(rows[0], [])
}

async function updateDef(id, body) {
  const fields = []; const vals = []; let i = 1
  const push = (col, val) => { fields.push(`${col} = $${i++}`); vals.push(val) }
  if (body.name !== undefined)        push('name', body.name)
  if (body.description !== undefined) push('description', body.description || null)
  if (body.icon !== undefined)        push('icon', body.icon || null)
  if (body.sortOrder !== undefined)   push('sort_order', body.sortOrder)
  if (body.isActive !== undefined)    push('is_active', body.isActive)
  if (body.allowCompanyColumns !== undefined) push('allow_company_columns', body.allowCompanyColumns)
  if (!fields.length) { const e = new Error('Không có gì để cập nhật'); e.status = 400; throw e }
  push('updated_at', new Date())
  vals.push(id)
  const { rows } = await query(
    `UPDATE company_table_defs SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, vals,
  )
  if (!rows.length) { const e = new Error('Không tìm thấy bảng'); e.status = 404; throw e }
  return getDef(id)
}

async function deleteDef(id) {
  const { rows } = await query('SELECT is_system FROM company_table_defs WHERE id = $1', [id])
  if (!rows.length) { const e = new Error('Không tìm thấy bảng'); e.status = 404; throw e }
  if (rows[0].is_system) { const e = new Error('Bảng hệ thống — không thể xóa'); e.status = 403; throw e }
  await query('DELETE FROM company_table_defs WHERE id = $1', [id])
}

// ── Columns (global) ────────────────────────────────────────────────────────

async function addColumn(defId, body) {
  const { rows: defRows } = await query('SELECT id FROM company_table_defs WHERE id = $1', [defId])
  if (!defRows.length) { const e = new Error('Không tìm thấy bảng'); e.status = 404; throw e }

  const { rows: existing } = await query('SELECT col_key FROM company_table_columns WHERE def_id = $1', [defId])
  const set = new Set(existing.map((r) => r.col_key))
  const colKey = uniqueKey(slugify(body.colKey || body.label, 'col'), set)

  const { rows: maxRows } = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM company_table_columns WHERE def_id = $1', [defId])
  const sortOrder = body.sortOrder ?? maxRows[0].next

  const { rows } = await query(
    `INSERT INTO company_table_columns
       (def_id, col_key, label, data_type, required, options, sort_order, width, computed_type, computed_config)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [defId, colKey, body.label, body.dataType || 'text', body.required ?? false,
     body.options ? JSON.stringify(body.options) : null, sortOrder, body.width ?? null,
     body.computedType || null, body.computedConfig ? JSON.stringify(body.computedConfig) : null],
  )
  return colToDto(rows[0])
}

async function updateColumn(colId, body) {
  const fields = []; const vals = []; let i = 1
  const push = (col, val) => { fields.push(`${col} = $${i++}`); vals.push(val) }
  if (body.label !== undefined)    push('label', body.label)
  if (body.dataType !== undefined) push('data_type', body.dataType)
  if (body.required !== undefined) push('required', body.required)
  if (body.options !== undefined)  push('options', body.options ? JSON.stringify(body.options) : null)
  if (body.width !== undefined)    push('width', body.width)
  if (body.sortOrder !== undefined) push('sort_order', body.sortOrder)
  if (body.isActive !== undefined) push('is_active', body.isActive)
  if (body.computedType !== undefined)   push('computed_type', body.computedType || null)
  if (body.computedConfig !== undefined) push('computed_config', body.computedConfig ? JSON.stringify(body.computedConfig) : null)
  if (!fields.length) { const e = new Error('Không có gì để cập nhật'); e.status = 400; throw e }
  vals.push(colId)
  const { rows } = await query(
    `UPDATE company_table_columns SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, vals,
  )
  if (!rows.length) { const e = new Error('Không tìm thấy cột'); e.status = 404; throw e }
  return colToDto(rows[0])
}

async function deleteColumn(colId) {
  const { rowCount } = await query('DELETE FROM company_table_columns WHERE id = $1', [colId])
  if (!rowCount) { const e = new Error('Không tìm thấy cột'); e.status = 404; throw e }
}

async function reorderColumns(defId, orderedIds) {
  for (let idx = 0; idx < orderedIds.length; idx++) {
    await query('UPDATE company_table_columns SET sort_order = $1 WHERE id = $2 AND def_id = $3',
      [idx, orderedIds[idx], defId])
  }
  return getDef(defId)
}

// ── Per-company columns (hybrid) ────────────────────────────────────────────

async function listCompanyColumns(defId, companyId) {
  const { rows } = await query(
    'SELECT * FROM company_table_company_columns WHERE def_id = $1 AND company_id = $2 ORDER BY sort_order, created_at',
    [defId, companyId])
  return rows.map(colToDto)
}

async function addCompanyColumn(defId, companyId, user, body) {
  await assertAccess(companyId, user)
  const { rows: gcols } = await query('SELECT col_key FROM company_table_columns WHERE def_id = $1', [defId])
  const { rows: ccols } = await query('SELECT col_key FROM company_table_company_columns WHERE def_id = $1 AND company_id = $2', [defId, companyId])
  const set = new Set([...gcols, ...ccols].map((r) => r.col_key))
  const colKey = uniqueKey(slugify(body.colKey || body.label, 'col'), set)
  const { rows: maxRows } = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM company_table_company_columns WHERE def_id = $1 AND company_id = $2', [defId, companyId])
  const { rows } = await query(
    `INSERT INTO company_table_company_columns (def_id, company_id, col_key, label, data_type, options, sort_order, width)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [defId, companyId, colKey, body.label, body.dataType || 'text',
     body.options ? JSON.stringify(body.options) : null, maxRows[0].next, body.width ?? null])
  return colToDto(rows[0])
}

async function deleteCompanyColumn(defId, companyId, colId, user) {
  await assertAccess(companyId, user)
  await query('DELETE FROM company_table_company_columns WHERE id = $1 AND def_id = $2 AND company_id = $3',
    [colId, defId, companyId])
}

// ── Rows (per-company) ──────────────────────────────────────────────────────

async function getColumnsForCompany(defId, companyId) {
  const { rows: g } = await query(
    'SELECT col_key, data_type FROM company_table_columns WHERE def_id = $1 AND is_active = TRUE', [defId])
  const { rows: c } = await query(
    'SELECT col_key, data_type FROM company_table_company_columns WHERE def_id = $1 AND company_id = $2', [defId, companyId])
  return [...g, ...c]
}

function sanitizeData(raw, columns) {
  const byKey = {}
  for (const c of columns) byKey[c.col_key] = c
  const out = {}
  for (const [k, v] of Object.entries(raw || {})) {
    const col = byKey[k]
    if (!col || col.data_type === 'computed') continue
    if (v === null || v === undefined || v === '') { out[k] = null; continue }
    if (col.data_type === 'number') { const n = Number(v); out[k] = Number.isNaN(n) ? null : n }
    else if (col.data_type === 'date') { out[k] = String(v).substring(0, 10) }
    else out[k] = String(v)
  }
  return out
}

async function listRows(defId, companyId, user) {
  await assertAccess(companyId, user)
  const { rows } = await query(
    'SELECT * FROM company_table_rows WHERE def_id = $1 AND company_id = $2 ORDER BY position, created_at LIMIT 1000',
    [defId, companyId])
  return rows.map(rowToDto)
}

async function createRow(defId, companyId, user, data) {
  await assertAccess(companyId, user)
  const columns = await getColumnsForCompany(defId, companyId)
  const clean = sanitizeData(data, columns)
  const { rows: maxRows } = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM company_table_rows WHERE def_id = $1 AND company_id = $2',
    [defId, companyId])
  const { rows } = await query(
    `INSERT INTO company_table_rows (def_id, company_id, data, position, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [defId, companyId, JSON.stringify(clean), maxRows[0].next, user.id])
  return rowToDto(rows[0])
}

async function updateRow(defId, companyId, rowId, user, data) {
  await assertAccess(companyId, user)
  const { rows: cur } = await query(
    'SELECT data FROM company_table_rows WHERE id = $1 AND def_id = $2 AND company_id = $3',
    [rowId, defId, companyId])
  if (!cur.length) { const e = new Error('Không tìm thấy dòng'); e.status = 404; throw e }
  const columns = await getColumnsForCompany(defId, companyId)
  const patch = sanitizeData(data, columns)
  const merged = { ...(cur[0].data ?? {}), ...patch }
  const { rows } = await query(
    'UPDATE company_table_rows SET data = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [JSON.stringify(merged), rowId])
  return rowToDto(rows[0])
}

async function deleteRow(defId, companyId, rowId, user) {
  await assertAccess(companyId, user)
  const { rowCount } = await query(
    'DELETE FROM company_table_rows WHERE id = $1 AND def_id = $2 AND company_id = $3',
    [rowId, defId, companyId])
  if (!rowCount) { const e = new Error('Không tìm thấy dòng'); e.status = 404; throw e }
}

async function batchCreateRows(defId, companyId, user, rowsData) {
  await assertAccess(companyId, user)
  const columns = await getColumnsForCompany(defId, companyId)
  const client = await getClient()
  let inserted = 0, failed = 0
  const errors = []
  try {
    await client.query('BEGIN')
    const { rows: posRows } = await client.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM company_table_rows WHERE def_id = $1 AND company_id = $2',
      [defId, companyId])
    let pos = posRows[0].next
    for (let i = 0; i < rowsData.length; i++) {
      const sp = `sp_${i}`
      await client.query(`SAVEPOINT ${sp}`)
      try {
        const clean = sanitizeData(rowsData[i], columns)
        await client.query(
          'INSERT INTO company_table_rows (def_id, company_id, data, position, created_by) VALUES ($1,$2,$3,$4,$5)',
          [defId, companyId, JSON.stringify(clean), pos++, user.id])
        inserted++
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`)
        failed++
        errors.push({ row: rowsData[i]._rowNum ?? i + 2, message: err.message })
      }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK'); throw err
  } finally { client.release() }
  return { inserted, failed, errors }
}

async function reorderRows(defId, companyId, user, orderedIds) {
  await assertAccess(companyId, user)
  for (let idx = 0; idx < orderedIds.length; idx++) {
    await query('UPDATE company_table_rows SET position = $1 WHERE id = $2 AND def_id = $3 AND company_id = $4',
      [idx, orderedIds[idx], defId, companyId])
  }
}

module.exports = {
  listDefs, getDef, createDef, updateDef, deleteDef,
  addColumn, updateColumn, deleteColumn, reorderColumns,
  listCompanyColumns, addCompanyColumn, deleteCompanyColumn,
  listRows, createRow, updateRow, deleteRow, reorderRows, batchCreateRows,
}

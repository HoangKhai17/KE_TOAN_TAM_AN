const { query, getClient } = require('../../config/db')
const attachmentsSvc = require('../attachments/attachments.service')

// Chuẩn hoá cột kiểu 'link' → mảng {url,label}. Chấp nhận string | object | mảng.
function normalizeLinks(v) {
  const arr = Array.isArray(v) ? v : [v]
  const out = []
  for (const item of arr) {
    if (item == null) continue
    let url, label
    if (typeof item === 'string') { url = item; label = '' }
    else if (typeof item === 'object') { url = item.url; label = item.label ?? '' }
    else continue
    url = String(url ?? '').trim()
    if (!url) continue
    // Bổ sung scheme nếu người dùng gõ thiếu (vd "abc.com" → "https://abc.com")
    if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url
    out.push({ url, label: String(label ?? '').trim() })
  }
  return out.length ? out : null
}

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
    parentDefId: d.parent_def_id ?? null,   // null = bảng cấp cao; có = bảng con (sub-tab)
    groupConfig: d.group_config ?? null,     // cấu hình "gom nhóm (pivot)" từ bảng cha
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

  // Bảng con: chỉ cho 1 CẤP — def cha phải tồn tại và chính nó KHÔNG phải bảng con.
  let parentDefId = null
  if (body.parentDefId) {
    const { rows: [p] } = await query('SELECT id, parent_def_id FROM company_table_defs WHERE id = $1', [body.parentDefId])
    if (!p) { const e = new Error('Không tìm thấy bảng cha'); e.status = 404; throw e }
    if (p.parent_def_id) { const e = new Error('Chỉ hỗ trợ 1 cấp: bảng con không thể có bảng con'); e.status = 422; throw e }
    parentDefId = p.id
  }

  // sort_order tính trong PHẠM VI anh em (cùng cha, hoặc cùng cấp cao)
  const { rows: maxRows } = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM company_table_defs WHERE parent_def_id IS NOT DISTINCT FROM $1',
    [parentDefId])
  const sortOrder = body.sortOrder ?? maxRows[0].next

  const { rows } = await query(
    `INSERT INTO company_table_defs (table_key, name, description, icon, sort_order, allow_company_columns, parent_def_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [tableKey, body.name, body.description || null, body.icon || null, sortOrder,
     body.allowCompanyColumns ?? false, parentDefId, userId],
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
  if (body.groupConfig !== undefined) push('group_config', body.groupConfig ? JSON.stringify(body.groupConfig) : null)
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
  // Dọn file đính kèm của mọi dòng thuộc bảng NÀY và mọi BẢNG CON (CASCADE xoá row nhưng
  // không xoá attachments — attachments không có FK tới rows).
  const { rows: rowIds } = await query(
    'SELECT id FROM company_table_rows WHERE def_id IN (SELECT id FROM company_table_defs WHERE id = $1 OR parent_def_id = $1)',
    [id])
  await attachmentsSvc.removeAllForEntities('company_table_row', rowIds.map((r) => r.id))
  await query('DELETE FROM company_table_defs WHERE id = $1', [id])   // CASCADE tự xoá def con
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
  const { rows } = await query('SELECT def_id, col_key, data_type FROM company_table_columns WHERE id = $1', [colId])
  if (!rows.length) { const e = new Error('Không tìm thấy cột'); e.status = 404; throw e }
  const col = rows[0]
  await query('DELETE FROM company_table_columns WHERE id = $1', [colId])
  // Cột file → dọn file của CHỈ cột này trên mọi dòng của bảng (giữ file cột khác)
  if (col.data_type === 'file') {
    const { rows: rowIds } = await query('SELECT id FROM company_table_rows WHERE def_id = $1', [col.def_id])
    await attachmentsSvc.removeAllForField('company_table_row', rowIds.map((r) => r.id), col.col_key)
  }
}

// Đổi thứ tự các BẢNG (quyết định thứ tự tab hiển thị trong Chi tiết khách hàng)
async function reorderDefs(orderedIds) {
  for (let idx = 0; idx < orderedIds.length; idx++) {
    await query('UPDATE company_table_defs SET sort_order = $1, updated_at = NOW() WHERE id = $2',
      [idx, orderedIds[idx]])
  }
  return listDefs({})
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

// Các kiểu KHÔNG nhận giá trị qua PATCH row:
//  - computed/formula: tính động lúc render, không lưu
//  - file: do hệ attachments quản lý (entity_id=row, field_key=col), không nằm trong data
const SERVER_MANAGED_TYPES = new Set(['computed', 'formula', 'file'])

function sanitizeData(raw, columns) {
  const byKey = {}
  for (const c of columns) byKey[c.col_key] = c
  const out = {}
  for (const [k, v] of Object.entries(raw || {})) {
    const col = byKey[k]
    if (!col || SERVER_MANAGED_TYPES.has(col.data_type)) continue
    if (col.data_type === 'link') { out[k] = normalizeLinks(v); continue }
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
  // Dọn file đính kèm của dòng (attachments không có FK tới rows → phải xoá tay)
  await attachmentsSvc.removeAllForEntity('company_table_row', rowId)
}

// Gộp toàn bộ file (cột kiểu 'file') của 1 bảng trong 1 công ty → nhóm theo (rowId, colKey).
// 1 query, tránh N+1 khi render lưới. RBAC bám công ty.
async function listDefFiles(defId, companyId, user) {
  await assertAccess(companyId, user)
  const { rows } = await query(
    `SELECT a.id, a.entity_id AS row_id, a.field_key AS col_key,
            a.file_name, a.mime_type, a.size_bytes, a.uploaded_by, a.created_at
       FROM attachments a
       JOIN company_table_rows r ON r.id = a.entity_id
      WHERE a.module = 'company_table_row' AND r.def_id = $1 AND r.company_id = $2
      ORDER BY a.created_at`,
    [defId, companyId])
  return rows.map((r) => ({
    id: r.id, rowId: r.row_id, colKey: r.col_key,
    fileName: r.file_name, mimeType: r.mime_type, sizeBytes: Number(r.size_bytes),
    uploadedBy: r.uploaded_by, createdAt: r.created_at,
  }))
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Upsert: ưu tiên khớp theo __id (UUID), fallback theo cột khóa matchKey; merge data.
async function upsertRows(defId, companyId, user, matchKey, rowsData) {
  await assertAccess(companyId, user)
  const columns = await getColumnsForCompany(defId, companyId)
  const useMatch = matchKey && columns.some((c) => c.col_key === matchKey)
  const client = await getClient()
  let inserted = 0, updated = 0, failed = 0
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
        const raw = rowsData[i]
        const id = raw.__id && UUID_RE.test(String(raw.__id).trim()) ? String(raw.__id).trim() : null
        const clean = sanitizeData(raw, columns)  // bỏ __id / computed / key lạ
        let targets = []
        if (id) {
          const r = await client.query(
            'SELECT id, data FROM company_table_rows WHERE id = $1 AND def_id = $2 AND company_id = $3',
            [id, defId, companyId])
          targets = r.rows
        }
        if (!targets.length && useMatch && clean[matchKey] != null && clean[matchKey] !== '') {
          const r = await client.query(
            'SELECT id, data FROM company_table_rows WHERE def_id = $1 AND company_id = $2 AND data->>$3 = $4',
            [defId, companyId, matchKey, String(clean[matchKey])])
          targets = r.rows
        }
        if (targets.length) {
          for (const t of targets) {
            const merged = { ...(t.data ?? {}), ...clean }   // MERGE: chỉ ghi đè cột có trong file
            await client.query('UPDATE company_table_rows SET data = $1, updated_at = NOW() WHERE id = $2',
              [JSON.stringify(merged), t.id])
          }
          updated += targets.length
        } else {
          await client.query(
            'INSERT INTO company_table_rows (def_id, company_id, data, position, created_by) VALUES ($1,$2,$3,$4,$5)',
            [defId, companyId, JSON.stringify(clean), pos++, user.id])
          inserted++
        }
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
  return { inserted, updated, failed, errors }
}

// ── Đồng bộ NHÓM (Pivot): tự sinh dòng bảng con từ các cặp khoá khác nhau ở bảng cha ──
// group_config = { enabled, keys:[{childCol,parentCol}], autoSync, removeOrphans }.
async function syncGroups(childDefId, companyId, user) {
  await assertAccess(companyId, user)
  const { rows: defRows } = await query(
    'SELECT id, parent_def_id, group_config FROM company_table_defs WHERE id = $1', [childDefId])
  if (!defRows.length) { const e = new Error('Không tìm thấy bảng'); e.status = 404; throw e }
  const def = defRows[0]
  const cfg = def.group_config
  if (!cfg || !cfg.enabled || !Array.isArray(cfg.keys) || cfg.keys.length === 0) {
    const e = new Error('Bảng chưa bật gom nhóm (pivot)'); e.status = 400; throw e
  }
  if (!def.parent_def_id) { const e = new Error('Bảng không có bảng cha'); e.status = 400; throw e }

  const { rows: parentRows } = await query(
    'SELECT data FROM company_table_rows WHERE def_id = $1 AND company_id = $2', [def.parent_def_id, companyId])

  const norm = (v) => String(v ?? '').trim()
  const keyChildCols = new Set(cfg.keys.map((k) => k.childCol))
  const hasExtra = (r) => Object.entries(r.data || {}).some(([k, v]) => !keyChildCols.has(k) && norm(v) !== '')
  const keyOf = (data, side) => cfg.keys.map((k) => norm(data?.[side === 'p' ? k.parentCol : k.childCol])).join('')

  // Cặp khoá DISTINCT ở cha (bỏ cặp rỗng toàn bộ)
  const parentTuples = new Map()   // key → [values theo thứ tự cfg.keys]
  for (const r of parentRows) {
    if (cfg.keys.every((k) => norm(r.data?.[k.parentCol]) === '')) continue
    const key = keyOf(r.data, 'p')
    if (!parentTuples.has(key)) parentTuples.set(key, cfg.keys.map((k) => norm(r.data?.[k.parentCol])))
  }
  const columns = await getColumnsForCompany(childDefId, companyId)
  const client = await getClient()
  let added = 0, removed = 0
  try {
    await client.query('BEGIN')
    // Khoa tuan tu theo (bang con + cong ty): chong 2 lan dong bo chay chong gay nhan doi.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ctbl_sync:${childDefId}:${companyId}`])

    // Doc dong con SAU khi co khoa -> luon thay trang thai moi nhat.
    const { rows: childRows } = await client.query(
      'SELECT id, data FROM company_table_rows WHERE def_id = $1 AND company_id = $2 ORDER BY position, created_at',
      [childDefId, companyId])

    // Gom dong con theo khoa + DEDUP (giu 1 dong/nhom, uu tien dong co du lieu ngoai khoa nhu Ghi chu).
    const childByKey = new Map()
    for (const r of childRows) {
      const key = keyOf(r.data, 'c')
      if (!childByKey.has(key)) childByKey.set(key, [])
      childByKey.get(key).push(r)
    }
    for (const [, list] of childByKey) {
      if (list.length <= 1) continue
      const keep = list.find(hasExtra) ?? list[0]
      for (const r of list) {
        if (r.id === keep.id) continue
        await client.query('DELETE FROM company_table_rows WHERE id = $1', [r.id])
        await attachmentsSvc.removeAllForEntity('company_table_row', r.id)
        removed++
      }
    }

    // Them nhom cha CON THIEU ben con
    const { rows: posRows } = await client.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM company_table_rows WHERE def_id = $1 AND company_id = $2',
      [childDefId, companyId])
    let pos = posRows[0].next
    for (const [key, values] of parentTuples) {
      if (childByKey.has(key)) continue
      const data = {}
      cfg.keys.forEach((k, idx) => { data[k.childCol] = values[idx] })
      const clean = sanitizeData(data, columns)
      const { rows: ins } = await client.query(
        'INSERT INTO company_table_rows (def_id, company_id, data, position, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [childDefId, companyId, JSON.stringify(clean), pos++, user.id])
      childByKey.set(key, [{ id: ins[0].id, data }])
      added++
    }

    // Xoa dong THUA (nhom khong con o cha)
    if (cfg.removeOrphans) {
      for (const [key, list] of childByKey) {
        if (parentTuples.has(key)) continue
        for (const r of list) {
          if (!r.id) continue
          await client.query('DELETE FROM company_table_rows WHERE id = $1', [r.id])
          await attachmentsSvc.removeAllForEntity('company_table_row', r.id)
          removed++
        }
      }
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK'); throw err
  } finally { client.release() }
  return { added, removed }
}

module.exports = {
  listDefs, getDef, createDef, updateDef, deleteDef, reorderDefs,
  addColumn, updateColumn, deleteColumn, reorderColumns,
  listCompanyColumns, addCompanyColumn, deleteCompanyColumn,
  listRows, createRow, updateRow, deleteRow, reorderRows, batchCreateRows, upsertRows,
  listDefFiles, syncGroups,
}

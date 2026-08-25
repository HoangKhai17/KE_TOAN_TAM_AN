'use strict'
const { query } = require('../../config/db')

// ── DTO ───────────────────────────────────────────────────────────────────────

function processToDto(row, { withContent = false } = {}) {
  const dto = {
    id:          row.id,
    companyId:   row.company_id,
    name:        row.name,
    description: row.description ?? null,
    position:    row.position ?? null,
    hasContent:  row.has_content != null
      ? row.has_content === true || row.has_content === 't'
      : Boolean(row.content && String(row.content).trim()),
    createdBy:   row.created_by ?? null,
    updatedBy:   row.updated_by ?? null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
  if (withContent) dto.content = row.content ?? null
  return dto
}

// ── RBAC ──────────────────────────────────────────────────────────────────────
// Xem: mọi người đã đăng nhập. Sửa: admin HOẶC nhân sự PHỤ TRÁCH công ty đó.

async function assertCompanyExists(companyId) {
  const { rows: [c] } = await query('SELECT id, assigned_staff_id FROM companies WHERE id = $1', [companyId])
  if (!c) throw Object.assign(new Error('Không tìm thấy công ty'), { status: 404 })
  return c
}

async function assertCanEdit(companyId, user) {
  const company = await assertCompanyExists(companyId)
  if (user?.role === 'admin') return company
  if (company.assigned_staff_id && company.assigned_staff_id === user?.id) return company
  throw Object.assign(
    new Error('Chỉ Quản trị viên hoặc nhân sự phụ trách công ty này được chỉnh sửa quy trình'),
    { status: 403 },
  )
}

// Quy trình có thuộc đúng công ty không (chặn sửa chéo công ty qua id đoán được)
async function getProcessOrThrow(companyId, processId) {
  const { rows: [p] } = await query(
    'SELECT * FROM company_processes WHERE id = $1 AND company_id = $2',
    [processId, companyId],
  )
  if (!p) throw Object.assign(new Error('Không tìm thấy quy trình'), { status: 404 })
  return p
}

// ── Quy trình ─────────────────────────────────────────────────────────────────

// Danh sách chỉ trả cờ có/không nội dung (has_content) — không kéo cả HTML cho nhẹ.
async function listProcesses(companyId) {
  await assertCompanyExists(companyId)
  const { rows } = await query(
    `SELECT id, company_id, name, description, position, created_by, updated_by,
            created_at, updated_at,
            (content IS NOT NULL AND btrim(content) <> '') AS has_content
     FROM company_processes
     WHERE company_id = $1
     ORDER BY position ASC NULLS LAST, created_at ASC`,
    [companyId],
  )
  return rows.map((r) => processToDto(r))
}

// Lấy 1 quy trình KÈM nội dung (cho trình soạn thảo).
async function getProcess(companyId, processId) {
  const row = await getProcessOrThrow(companyId, processId)
  return processToDto(row, { withContent: true })
}

async function createProcess(companyId, data, user) {
  await assertCanEdit(companyId, user)
  const { rows: [posRow] } = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM company_processes WHERE company_id = $1',
    [companyId],
  )
  const { rows: [row] } = await query(
    `INSERT INTO company_processes (company_id, name, description, position, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
    [companyId, data.name, data.description ?? null, posRow.next, user.id],
  )
  return processToDto(row, { withContent: true })
}

// Cập nhật tên/mô tả/thứ tự HOẶC nội dung tài liệu.
// Khi client gửi expectedUpdatedAt → chặn ghi đè nếu người khác vừa sửa (409).
async function updateProcess(companyId, processId, data, user) {
  await assertCanEdit(companyId, user)
  const current = await getProcessOrThrow(companyId, processId)

  if (data.expectedUpdatedAt
    && new Date(data.expectedUpdatedAt).getTime() !== new Date(current.updated_at).getTime()) {
    throw Object.assign(
      new Error('Quy trình vừa được người khác cập nhật. Vui lòng tải lại trước khi lưu.'),
      { status: 409, code: 'PROCESS_CONFLICT' },
    )
  }

  const fields = []
  const params = []
  for (const [key, col] of Object.entries({
    name: 'name', description: 'description', position: 'position', content: 'content',
  })) {
    if (data[key] !== undefined) { params.push(data[key]); fields.push(`${col} = $${params.length}`) }
  }
  if (!fields.length) throw Object.assign(new Error('Không có thay đổi nào'), { status: 400 })

  params.push(user.id); fields.push(`updated_by = $${params.length}`)
  fields.push('updated_at = NOW()')
  params.push(processId)

  const { rows: [row] } = await query(
    `UPDATE company_processes SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  )
  return processToDto(row, { withContent: true })
}

async function deleteProcess(companyId, processId, user) {
  await assertCanEdit(companyId, user)
  await getProcessOrThrow(companyId, processId)
  await query('DELETE FROM company_processes WHERE id = $1', [processId])
}

module.exports = {
  listProcesses,
  getProcess,
  createProcess,
  updateProcess,
  deleteProcess,
  assertCanEdit,
}

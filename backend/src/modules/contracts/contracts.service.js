const { query } = require('../../config/db')
const { assertEndNotBeforeStart } = require('../../utils/dateRange')
const attachmentsSvc = require('../attachments/attachments.service')

// Trạng thái active/renew/expired TỰ TÍNH ở frontend (theo end_date vs hôm nay).
// status_override chỉ lưu 2 trạng thái CHỌN TAY: 'renewed' (Đã gia hạn), 'stopped' (Ngưng dịch vụ).
function toDto(row) {
  return {
    id:             row.id,
    companyId:      row.company_id,
    contractType:   row.contract_type ?? null,
    content:        row.content ?? null,
    startDate:      row.start_date ?? null,
    endDate:        row.end_date ?? null,
    statusOverride: row.status_override ?? null,
    sortOrder:      row.sort_order,
    createdBy:      row.created_by,
    updatedBy:      row.updated_by ?? null,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    fileCount:      row.file_count != null ? Number(row.file_count) : 0,
  }
}

// Admin: toàn quyền. Staff: chỉ công ty MÌNH phụ trách (giống locations/credentials).
async function assertCompanyAccess(companyId, user) {
  const { rows: [c] } = await query('SELECT assigned_staff_id FROM companies WHERE id = $1', [companyId])
  if (!c) throw Object.assign(new Error('Company not found'), { status: 404 })
  if (user && user.role !== 'admin' && c.assigned_staff_id !== user.id) {
    throw Object.assign(new Error('Bạn không có quyền truy cập hợp đồng của công ty này'), { status: 403 })
  }
}

async function listContracts(companyId, user) {
  await assertCompanyAccess(companyId, user)
  const { rows } = await query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM attachments a
              WHERE a.module = 'company_contract' AND a.entity_id = c.id) AS file_count
       FROM company_service_contracts c
      WHERE c.company_id = $1
      ORDER BY c.sort_order ASC, c.created_at ASC`,
    [companyId]
  )
  return rows.map(toDto)
}

async function getContract(companyId, id, user) {
  await assertCompanyAccess(companyId, user)
  const { rows: [row] } = await query(
    'SELECT * FROM company_service_contracts WHERE id = $1 AND company_id = $2', [id, companyId])
  if (!row) throw Object.assign(new Error('Contract not found'), { status: 404 })
  return toDto(row)
}

async function createContract(companyId, data, user) {
  await assertCompanyAccess(companyId, user)
  const { contractType, content, startDate, endDate, statusOverride, sortOrder = 0 } = data
  assertEndNotBeforeStart(startDate, endDate, 'Ngày kết thúc không được nhỏ hơn ngày bắt đầu')
  const { rows: [row] } = await query(
    `INSERT INTO company_service_contracts
       (company_id, contract_type, content, start_date, end_date, status_override, sort_order, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
    [companyId, contractType ?? null, content ?? null, startDate ?? null, endDate ?? null, statusOverride ?? null, sortOrder, user.id]
  )
  return toDto(row)
}

async function updateContract(companyId, id, data, user) {
  await assertCompanyAccess(companyId, user)
  const { rows: [existing] } = await query(
    'SELECT id, start_date, end_date FROM company_service_contracts WHERE id = $1 AND company_id = $2', [id, companyId])
  if (!existing) throw Object.assign(new Error('Contract not found'), { status: 404 })
  assertEndNotBeforeStart(
    data.startDate !== undefined ? data.startDate : existing.start_date,
    data.endDate   !== undefined ? data.endDate   : existing.end_date,
    'Ngày kết thúc không được nhỏ hơn ngày bắt đầu',
  )

  const map = {
    contractType:   'contract_type',
    content:        'content',
    startDate:      'start_date',
    endDate:        'end_date',
    statusOverride: 'status_override',
    sortOrder:      'sort_order',
  }
  const updates = ['updated_by = $1', 'updated_at = NOW()']
  const params  = [user.id]
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      params.push(data[key] === '' ? null : data[key])
      updates.push(`${col} = $${params.length}`)
    }
  }
  params.push(id)
  const { rows: [row] } = await query(
    `UPDATE company_service_contracts SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`, params)
  return toDto(row)
}

async function deleteContract(companyId, id, user) {
  await assertCompanyAccess(companyId, user)
  const { rows: [row] } = await query(
    'SELECT id FROM company_service_contracts WHERE id = $1 AND company_id = $2', [id, companyId])
  if (!row) throw Object.assign(new Error('Contract not found'), { status: 404 })
  await attachmentsSvc.removeAllForEntity('company_contract', id)   // dọn file, không để orphan
  await query('DELETE FROM company_service_contracts WHERE id = $1', [id])
}

module.exports = { listContracts, getContract, createContract, updateContract, deleteContract }

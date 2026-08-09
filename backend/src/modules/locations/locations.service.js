const { query } = require('../../config/db')
const { assertEndNotBeforeStart } = require('../../utils/dateRange')
const attachmentsSvc = require('../attachments/attachments.service')

function toDto(row) {
  return {
    id:             row.id,
    companyId:      row.company_id,
    locationType:   row.location_type,
    name:           row.name ?? null,
    address:        row.address ?? null,
    taxCode:        row.tax_code ?? null,
    accountingForm: row.accounting_form ?? null,
    locationFunction: row.location_function ?? null,
    taxAuthority:   row.tax_authority ?? null,
    status:         row.status,
    startDate:      row.start_date ?? null,
    licenseEstablishedDate: row.license_established_date ?? null,
    endDate:        row.end_date ?? null,
    contactName:    row.contact_name ?? null,
    contactPhone:   row.contact_phone ?? null,
    sortOrder:      row.sort_order,
    notes:          row.notes ?? null,
    createdBy:      row.created_by,
    updatedBy:      row.updated_by ?? null,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    // Đếm file đính kèm gộp sẵn trong query danh sách → frontend KHÔNG phải gọi N+1 request.
    fileCount:      row.file_count != null ? Number(row.file_count) : 0,
  }
}

// Admin: toàn quyền. Staff: chỉ địa điểm của công ty MÌNH phụ trách. (giống credentials)
async function assertCompanyAccess(companyId, user) {
  const { rows: [c] } = await query('SELECT assigned_staff_id FROM companies WHERE id = $1', [companyId])
  if (!c) throw Object.assign(new Error('Company not found'), { status: 404 })
  if (user && user.role !== 'admin' && c.assigned_staff_id !== user.id) {
    throw Object.assign(new Error('Bạn không có quyền truy cập địa điểm của công ty này'), { status: 403 })
  }
}

async function listLocations(companyId, { status } = {}, user) {
  await assertCompanyAccess(companyId, user)

  const conditions = ['cl.company_id = $1']
  const params = [companyId]
  if (status !== undefined && status !== '') {
    params.push(status)
    conditions.push(`cl.status = $${params.length}`)
  }

  // file_count gộp bằng subquery — 1 query duy nhất, không N+1 gọi API đếm file từng dòng.
  const { rows } = await query(
    `SELECT cl.*,
            (SELECT COUNT(*) FROM attachments a
              WHERE a.module = 'company_location' AND a.entity_id = cl.id) AS file_count
       FROM company_locations cl
      WHERE ${conditions.join(' AND ')}
      ORDER BY cl.sort_order ASC, cl.created_at ASC`,
    params
  )
  return rows.map(toDto)
}

async function getLocation(companyId, id, user) {
  await assertCompanyAccess(companyId, user)
  const { rows: [row] } = await query(
    'SELECT * FROM company_locations WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!row) throw Object.assign(new Error('Location not found'), { status: 404 })
  return toDto(row)
}

async function createLocation(companyId, data, user) {
  await assertCompanyAccess(companyId, user)
  const actorId = user.id
  const {
    locationType, name, address, taxCode, accountingForm, locationFunction, taxAuthority,
    status = 'active', startDate, endDate, contactName, contactPhone,
    sortOrder, notes, licenseEstablishedDate,
  } = data
  const order = sortOrder ?? Number((await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM company_locations WHERE company_id = $1', [companyId]
  )).rows[0].next)
  assertEndNotBeforeStart(startDate, endDate, 'Ngày chấm dứt không được nhỏ hơn ngày thành lập/bắt đầu')

  const { rows: [row] } = await query(
    `INSERT INTO company_locations
       (company_id, location_type, name, address, tax_code, accounting_form, location_function, tax_authority,
        status, start_date, end_date, contact_name, contact_phone, sort_order, notes,
        license_established_date, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
     RETURNING *`,
    [
      companyId, locationType, name ?? null, address ?? null, taxCode ?? null,
      accountingForm ?? null, locationFunction ?? null, taxAuthority ?? null, status, startDate ?? null, endDate ?? null,
      contactName ?? null, contactPhone ?? null, order, notes ?? null,
      licenseEstablishedDate ?? null, actorId,
    ]
  )
  return toDto(row)
}

async function updateLocation(companyId, id, data, user) {
  await assertCompanyAccess(companyId, user)
  const actorId = user.id

  const { rows: [existing] } = await query(
    'SELECT id, start_date, end_date FROM company_locations WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!existing) throw Object.assign(new Error('Location not found'), { status: 404 })
  assertEndNotBeforeStart(
    data.startDate !== undefined ? data.startDate : existing.start_date,
    data.endDate   !== undefined ? data.endDate   : existing.end_date,
    'Ngày chấm dứt không được nhỏ hơn ngày thành lập/bắt đầu',
  )

  const map = {
    locationType:   'location_type',
    name:           'name',
    address:        'address',
    taxCode:        'tax_code',
    accountingForm: 'accounting_form',
    locationFunction: 'location_function',
    taxAuthority:   'tax_authority',
    status:         'status',
    startDate:      'start_date',
    licenseEstablishedDate: 'license_established_date',
    endDate:        'end_date',
    contactName:    'contact_name',
    contactPhone:   'contact_phone',
    sortOrder:      'sort_order',
    notes:          'notes',
  }
  const updates = ['updated_by = $1', 'updated_at = NOW()']
  const params  = [actorId]
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      params.push(data[key] === '' ? null : data[key])
      updates.push(`${col} = $${params.length}`)
    }
  }

  params.push(id)
  const { rows: [row] } = await query(
    `UPDATE company_locations SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  )
  return toDto(row)
}

async function deleteLocation(companyId, id, user) {
  await assertCompanyAccess(companyId, user)
  const { rows: [row] } = await query(
    'SELECT id FROM company_locations WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!row) throw Object.assign(new Error('Location not found'), { status: 404 })
  // Dọn file đính kèm của địa điểm trước để không để lại orphan (record + file trên đĩa).
  await attachmentsSvc.removeAllForEntity('company_location', id)
  await query('DELETE FROM company_locations WHERE id = $1', [id])
}

module.exports = {
  listLocations, getLocation, createLocation, updateLocation, deleteLocation,
}

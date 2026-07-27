const { query, getClient } = require('../../config/db')

function toDto(row) {
  return {
    id:             row.id,
    companyId:      row.company_id,
    locationType:   row.location_type,
    name:           row.name ?? null,
    address:        row.address ?? null,
    taxCode:        row.tax_code ?? null,
    accountingForm: row.accounting_form ?? null,
    taxAuthority:   row.tax_authority ?? null,
    status:         row.status,
    startDate:      row.start_date ?? null,
    licenseEstablishedDate: row.license_established_date ?? null,
    endDate:        row.end_date ?? null,
    contactName:    row.contact_name ?? null,
    contactPhone:   row.contact_phone ?? null,
    isPrimary:      row.is_primary,
    sortOrder:      row.sort_order,
    notes:          row.notes ?? null,
    createdBy:      row.created_by,
    updatedBy:      row.updated_by ?? null,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
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

  const conditions = ['company_id = $1']
  const params = [companyId]
  if (status !== undefined && status !== '') {
    params.push(status)
    conditions.push(`status = $${params.length}`)
  }

  // Trụ sở chính lên đầu, sau đó theo thứ tự thủ công rồi tên
  const { rows } = await query(
    `SELECT * FROM company_locations
      WHERE ${conditions.join(' AND ')}
      ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
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
    locationType, name, address, taxCode, accountingForm, taxAuthority,
    status = 'active', startDate, endDate, contactName, contactPhone,
    isPrimary = false, sortOrder = 0, notes, licenseEstablishedDate,
  } = data

  const client = await getClient()
  try {
    await client.query('BEGIN')
    // Chỉ 1 trụ sở chính: bỏ cờ ở các địa điểm khác trước khi đặt cờ mới
    if (isPrimary) {
      await client.query(
        'UPDATE company_locations SET is_primary = FALSE, updated_at = NOW() WHERE company_id = $1 AND is_primary = TRUE',
        [companyId]
      )
    }
    const { rows: [row] } = await client.query(
      `INSERT INTO company_locations
         (company_id, location_type, name, address, tax_code, accounting_form, tax_authority,
          status, start_date, end_date, contact_name, contact_phone, is_primary, sort_order, notes,
          license_established_date, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
       RETURNING *`,
      [
        companyId, locationType, name ?? null, address ?? null, taxCode ?? null,
        accountingForm ?? null, taxAuthority ?? null, status, startDate ?? null, endDate ?? null,
        contactName ?? null, contactPhone ?? null, isPrimary, sortOrder, notes ?? null,
        licenseEstablishedDate ?? null, actorId,
      ]
    )
    await client.query('COMMIT')
    return toDto(row)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function updateLocation(companyId, id, data, user) {
  await assertCompanyAccess(companyId, user)
  const actorId = user.id

  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows: [existing] } = await client.query(
      'SELECT id FROM company_locations WHERE id = $1 AND company_id = $2',
      [id, companyId]
    )
    if (!existing) throw Object.assign(new Error('Location not found'), { status: 404 })

    // Đặt làm trụ sở chính → bỏ cờ ở địa điểm khác (trừ chính nó)
    if (data.isPrimary === true) {
      await client.query(
        'UPDATE company_locations SET is_primary = FALSE, updated_at = NOW() WHERE company_id = $1 AND is_primary = TRUE AND id <> $2',
        [companyId, id]
      )
    }

    const map = {
      locationType:   'location_type',
      name:           'name',
      address:        'address',
      taxCode:        'tax_code',
      accountingForm: 'accounting_form',
      taxAuthority:   'tax_authority',
      status:         'status',
      startDate:      'start_date',
      licenseEstablishedDate: 'license_established_date',
      endDate:        'end_date',
      contactName:    'contact_name',
      contactPhone:   'contact_phone',
      isPrimary:      'is_primary',
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
    const { rows: [row] } = await client.query(
      `UPDATE company_locations SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    await client.query('COMMIT')
    return toDto(row)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function deleteLocation(companyId, id, user) {
  await assertCompanyAccess(companyId, user)
  const { rows: [row] } = await query(
    'SELECT id FROM company_locations WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!row) throw Object.assign(new Error('Location not found'), { status: 404 })
  await query('DELETE FROM company_locations WHERE id = $1', [id])
}

module.exports = {
  listLocations, getLocation, createLocation, updateLocation, deleteLocation,
}

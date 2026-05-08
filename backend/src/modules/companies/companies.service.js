const { query, getClient } = require('../../config/db')
const audit = require('../../lib/audit')

function toDto(row) {
  return {
    id:               row.id,
    name:             row.name,
    taxCode:          row.tax_code ?? null,
    address:          row.address ?? null,
    businessType:     row.business_type,
    industry:         row.industry ?? null,
    legalRepName:     row.legal_rep_name ?? null,
    legalRepPhone:    row.legal_rep_phone ?? null,
    contactName:      row.contact_name ?? null,
    contactPhone:     row.contact_phone ?? null,
    contactEmail:     row.contact_email ?? null,
    bankAccount:      row.bank_account ?? null,
    bankName:         row.bank_name ?? null,
    serviceStartDate: row.service_start_date ?? null,
    status:           row.status,
    notes:            row.notes ?? null,
    assignedStaffId:  row.assigned_staff_id ?? null,
    assignedStaff:    row.staff_name
      ? { id: row.assigned_staff_id, name: row.staff_name, email: row.staff_email, jobTitle: row.staff_job_title }
      : null,
    taskOpenCount:    parseInt(row.task_open_count ?? 0, 10),
    taskOverdueCount: parseInt(row.task_overdue_count ?? 0, 10),
    createdBy:        row.created_by,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  }
}

async function listCompanies({ page = 1, limit = 20, status, businessType, assignedStaffId, search } = {}) {
  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const filterParams = []

  if (status) {
    filterParams.push(status)
    conditions.push(`c.status = $${filterParams.length}`)
  }
  if (businessType) {
    filterParams.push(businessType)
    conditions.push(`c.business_type = $${filterParams.length}`)
  }
  if (assignedStaffId) {
    filterParams.push(assignedStaffId)
    conditions.push(`c.assigned_staff_id = $${filterParams.length}`)
  }
  if (search && search.trim()) {
    filterParams.push(search.trim())
    conditions.push(
      `to_tsvector('simple', c.name || ' ' || coalesce(c.tax_code, '')) @@ plainto_tsquery('simple', $${filterParams.length})`
    )
  }

  const where = conditions.join(' AND ')

  const countRes = await query(
    `SELECT COUNT(*) FROM companies c WHERE ${where}`,
    filterParams
  )
  const total = parseInt(countRes.rows[0].count, 10)

  const dataParams = [...filterParams, limit, offset]
  const { rows } = await query(
    `SELECT c.*,
            u.name AS staff_name, u.email AS staff_email, u.job_title AS staff_job_title,
            (SELECT COUNT(*) FROM tasks t WHERE t.company_id = c.id AND t.status != 'completed') AS task_open_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.company_id = c.id AND t.status != 'completed' AND t.due_date < CURRENT_DATE) AS task_overdue_count
     FROM companies c
     LEFT JOIN users u ON u.id = c.assigned_staff_id
     WHERE ${where}
     ORDER BY c.created_at DESC
     LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
    dataParams
  )

  return {
    companies: rows.map(toDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

async function getCompanyById(id) {
  const { rows } = await query(
    `SELECT c.*,
            u.name AS staff_name, u.email AS staff_email, u.job_title AS staff_job_title,
            (SELECT COUNT(*) FROM tasks t WHERE t.company_id = c.id AND t.status != 'completed') AS task_open_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.company_id = c.id AND t.status != 'completed' AND t.due_date < CURRENT_DATE) AS task_overdue_count
     FROM companies c
     LEFT JOIN users u ON u.id = c.assigned_staff_id
     WHERE c.id = $1`,
    [id]
  )
  if (!rows[0]) throw Object.assign(new Error('Company not found'), { status: 404 })
  return toDto(rows[0])
}

async function createCompany(data, actorId, ipAddress, userAgent) {
  const {
    name, taxCode, address, businessType = 'TNHH', industry,
    legalRepName, legalRepPhone, contactName, contactPhone, contactEmail,
    bankAccount, bankName, serviceStartDate, notes, assignedStaffId,
  } = data

  if (taxCode) {
    const existing = await query('SELECT id FROM companies WHERE tax_code = $1', [taxCode])
    if (existing.rows.length) throw Object.assign(new Error('Tax code already exists'), { status: 409 })
  }

  const { rows } = await query(
    `INSERT INTO companies
       (name, tax_code, address, business_type, industry, legal_rep_name, legal_rep_phone,
        contact_name, contact_phone, contact_email, bank_account, bank_name,
        service_start_date, notes, assigned_staff_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      name, taxCode ?? null, address ?? null, businessType, industry ?? null,
      legalRepName ?? null, legalRepPhone ?? null, contactName ?? null, contactPhone ?? null,
      contactEmail ?? null, bankAccount ?? null, bankName ?? null,
      serviceStartDate ?? null, notes ?? null, assignedStaffId ?? null, actorId,
    ]
  )

  // Placeholder: Phase 11 will auto-create OneDrive folder here

  await audit.log({
    userId: actorId,
    action: 'company.created',
    targetType: 'company',
    targetId: rows[0].id,
    meta: { name, taxCode },
    ipAddress,
    userAgent,
  })

  return toDto({ ...rows[0], task_open_count: 0, task_overdue_count: 0 })
}

async function updateCompany(id, data, actorId, ipAddress, userAgent) {
  const fieldMap = {
    name: 'name', taxCode: 'tax_code', address: 'address', businessType: 'business_type',
    industry: 'industry', legalRepName: 'legal_rep_name', legalRepPhone: 'legal_rep_phone',
    contactName: 'contact_name', contactPhone: 'contact_phone', contactEmail: 'contact_email',
    bankAccount: 'bank_account', bankName: 'bank_name', serviceStartDate: 'service_start_date',
    notes: 'notes', assignedStaffId: 'assigned_staff_id',
  }

  const updates = []
  const params = []
  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      params.push(data[key])
      updates.push(`${col} = $${params.length}`)
    }
  }
  if (!updates.length) throw Object.assign(new Error('No fields to update'), { status: 400 })

  params.push(id)
  const { rows } = await query(
    `UPDATE companies SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length} RETURNING *`,
    params
  )
  if (!rows[0]) throw Object.assign(new Error('Company not found'), { status: 404 })

  await audit.log({
    userId: actorId, action: 'company.updated',
    targetType: 'company', targetId: id, meta: data, ipAddress, userAgent,
  })

  return toDto({ ...rows[0], task_open_count: 0, task_overdue_count: 0 })
}

async function terminateCompany(id, actorId, ipAddress, userAgent) {
  const { rows } = await query(
    `UPDATE companies SET status = 'terminated', updated_at = NOW()
     WHERE id = $1 AND status != 'terminated'
     RETURNING id, name`,
    [id]
  )
  if (!rows[0]) throw Object.assign(new Error('Company not found or already terminated'), { status: 404 })

  await audit.log({
    userId: actorId, action: 'company.terminated',
    targetType: 'company', targetId: id, meta: { name: rows[0].name }, ipAddress, userAgent,
  })
}

async function getAssignments(companyId) {
  const { rows: company } = await query('SELECT id FROM companies WHERE id = $1', [companyId])
  if (!company[0]) throw Object.assign(new Error('Company not found'), { status: 404 })

  const { rows } = await query(
    `SELECT sca.id, sca.company_id, sca.staff_id, sca.start_date, sca.end_date, sca.notes, sca.created_at,
            u.name AS staff_name, u.email AS staff_email, u.job_title AS staff_job_title,
            ab.name AS assigned_by_name
     FROM staff_company_assignments sca
     JOIN users u  ON u.id  = sca.staff_id
     JOIN users ab ON ab.id = sca.assigned_by
     WHERE sca.company_id = $1
     ORDER BY sca.start_date DESC, sca.created_at DESC`,
    [companyId]
  )
  return rows.map((r) => ({
    id:         r.id,
    companyId:  r.company_id,
    staffId:    r.staff_id,
    staff:      { id: r.staff_id, name: r.staff_name, email: r.staff_email, jobTitle: r.staff_job_title },
    assignedBy: { name: r.assigned_by_name },
    startDate:  r.start_date,
    endDate:    r.end_date ?? null,
    notes:      r.notes ?? null,
    createdAt:  r.created_at,
    isCurrent:  !r.end_date,
  }))
}

async function assignStaff(companyId, staffId, actorId, startDate, notes, ipAddress, userAgent) {
  // Validate company exists
  const { rows: [company] } = await query('SELECT id, name FROM companies WHERE id = $1', [companyId])
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 })

  // Validate staff exists and is eligible
  const { rows: [staff] } = await query(
    `SELECT id, name, role, status FROM users WHERE id = $1`,
    [staffId]
  )
  if (!staff) throw Object.assign(new Error('Staff not found'), { status: 404 })
  if (staff.role !== 'staff') throw Object.assign(new Error('User must have role = staff'), { status: 422 })
  if (staff.status !== 'active') throw Object.assign(new Error('Staff must be active'), { status: 422 })

  const assignDate = startDate || new Date().toISOString().slice(0, 10)

  const client = await getClient()
  try {
    await client.query('BEGIN')

    // Close any open assignment
    await client.query(
      `UPDATE staff_company_assignments SET end_date = $1
       WHERE company_id = $2 AND end_date IS NULL`,
      [assignDate, companyId]
    )

    // Create new assignment
    const { rows: [newAssignment] } = await client.query(
      `INSERT INTO staff_company_assignments (company_id, staff_id, assigned_by, start_date, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [companyId, staffId, actorId, assignDate, notes ?? null]
    )

    // Update denormalized field on company
    await client.query(
      `UPDATE companies SET assigned_staff_id = $1, updated_at = NOW() WHERE id = $2`,
      [staffId, companyId]
    )

    await client.query('COMMIT')

    await audit.log({
      userId: actorId, action: 'company.staff_assigned',
      targetType: 'company', targetId: companyId,
      meta: { staffId, staffName: staff.name, companyName: company.name },
      ipAddress, userAgent,
    })

    return { assignmentId: newAssignment.id, staffId, startDate: assignDate }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

module.exports = {
  listCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  terminateCompany,
  getAssignments,
  assignStaff,
}

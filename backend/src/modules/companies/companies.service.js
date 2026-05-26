const { query, getClient } = require('../../config/db')
const audit = require('../../lib/audit')
const { createAndEmit, emitData } = require('../../lib/notify')
const { sendMail } = require('../../utils/mailer')
const { getTemplate, renderTemplate } = require('../../utils/emailTemplates')

async function sendCompanyAssignmentEmail({ staffId, companyName, assignerName, startDate, type = 'assigned' }) {
  try {
    const { rows: [staff] } = await query('SELECT name, email FROM users WHERE id = $1', [staffId])
    if (!staff?.email) return
    const dateStr = startDate
      ? new Date(startDate).toLocaleDateString('vi-VN')
      : new Date().toLocaleDateString('vi-VN')
    const key = type === 'assigned' ? 'email_tpl_company_assignment' : 'email_tpl_company_unassignment'
    const tpl = await getTemplate(key)
    const html = renderTemplate(tpl, {
      assignee_name: staff.name,
      company_name: companyName,
      assigner_name: assignerName || '—',
      start_date: dateStr,
    })
    const subject = type === 'assigned'
      ? `[Phân công] Bạn phụ trách khách hàng: ${companyName}`
      : `[Thay đổi] Không còn phụ trách: ${companyName}`
    await sendMail({ to: staff.email, subject, html, text: subject })
  } catch {
    // Non-blocking — email failure must not break the main flow
  }
}

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
    avatarUrl:        row.avatar_url ?? null,
    assignedStaffId:  row.assigned_staff_id ?? null,
    assignedStaff:    row.staff_name
      ? { id: row.assigned_staff_id, name: row.staff_name, email: row.staff_email, jobTitle: row.staff_job_title, avatarUrl: row.staff_avatar_url ?? null }
      : null,
    taskOpenCount:      parseInt(row.task_open_count ?? 0, 10),
    taskOverdueCount:   parseInt(row.task_overdue_count ?? 0, 10),
    taskCompletedCount: parseInt(row.task_completed_count ?? 0, 10),
    taskOnTimeCount:    parseInt(row.task_on_time_count ?? 0, 10),
    createdBy:        row.created_by,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  }
}

async function listCompanies({ page = 1, limit = 20, status, businessType, assignedStaffId, search, forceStaffId } = {}) {
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
  // forceStaffId (staff role) overrides any assignedStaffId from query string
  const effectiveStaffId = forceStaffId ?? assignedStaffId
  if (effectiveStaffId) {
    filterParams.push(effectiveStaffId)
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
            u.name AS staff_name, u.email AS staff_email, u.job_title AS staff_job_title, u.avatar_url AS staff_avatar_url,
            tc.task_open_count,
            tc.task_overdue_count,
            tc.task_completed_count,
            tc.task_on_time_count
     FROM companies c
     LEFT JOIN users u ON u.id = c.assigned_staff_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE tk.status != 'completed')                                                                                          AS task_open_count,
              COUNT(*) FILTER (WHERE tk.status != 'completed' AND tk.due_date < CURRENT_DATE)                                                          AS task_overdue_count,
              COUNT(*) FILTER (WHERE tk.status = 'completed')                                                                                          AS task_completed_count,
              COUNT(*) FILTER (WHERE tk.status = 'completed' AND (tk.due_date IS NULL OR tk.completed_at IS NULL OR tk.completed_at <= tk.due_date + INTERVAL '1 day')) AS task_on_time_count
       FROM tasks tk WHERE tk.company_id = c.id
     ) tc ON TRUE
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

async function getCompanyById(id, user = null) {
  const { rows } = await query(
    `SELECT c.*,
            u.name AS staff_name, u.email AS staff_email, u.job_title AS staff_job_title, u.avatar_url AS staff_avatar_url,
            tc.task_open_count,
            tc.task_overdue_count,
            tc.task_completed_count,
            tc.task_on_time_count
     FROM companies c
     LEFT JOIN users u ON u.id = c.assigned_staff_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE tk.status != 'completed')                                                                                          AS task_open_count,
              COUNT(*) FILTER (WHERE tk.status != 'completed' AND tk.due_date < CURRENT_DATE)                                                          AS task_overdue_count,
              COUNT(*) FILTER (WHERE tk.status = 'completed')                                                                                          AS task_completed_count,
              COUNT(*) FILTER (WHERE tk.status = 'completed' AND (tk.due_date IS NULL OR tk.completed_at IS NULL OR tk.completed_at <= tk.due_date + INTERVAL '1 day')) AS task_on_time_count
       FROM tasks tk WHERE tk.company_id = c.id
     ) tc ON TRUE
     WHERE c.id = $1`,
    [id]
  )
  if (!rows[0]) throw Object.assign(new Error('Company not found'), { status: 404 })
  if (user?.role === 'staff' && rows[0].assigned_staff_id !== user.id) {
    throw Object.assign(new Error('Bạn không có quyền xem thông tin công ty này'), { status: 403 })
  }
  return toDto(rows[0])
}

async function createCompany(data, actorId, ipAddress, userAgent) {
  const {
    name, taxCode, address, businessType = 'TNHH', industry,
    legalRepName, legalRepPhone, contactName, contactPhone, contactEmail,
    bankAccount, bankName, serviceStartDate, notes, assignedStaffId, avatarUrl,
  } = data

  if (taxCode) {
    const existing = await query('SELECT id FROM companies WHERE tax_code = $1', [taxCode])
    if (existing.rows.length) throw Object.assign(new Error('Tax code already exists'), { status: 409 })
  }

  const { rows } = await query(
    `INSERT INTO companies
       (name, tax_code, address, business_type, industry, legal_rep_name, legal_rep_phone,
        contact_name, contact_phone, contact_email, bank_account, bank_name,
        service_start_date, notes, assigned_staff_id, avatar_url, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      name, taxCode ?? null, address ?? null, businessType, industry ?? null,
      legalRepName ?? null, legalRepPhone ?? null, contactName ?? null, contactPhone ?? null,
      contactEmail ?? null, bankAccount ?? null, bankName ?? null,
      serviceStartDate ?? null, notes ?? null, assignedStaffId ?? null, avatarUrl ?? null, actorId,
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

  // Notify assigned staff when company is created with an assignee
  if (assignedStaffId && assignedStaffId !== actorId) {
    const { rows: [actor] } = await query('SELECT name FROM users WHERE id = $1', [actorId])
    await createAndEmit(
      assignedStaffId, 'task_assigned',
      'Bạn được phân công phụ trách công ty',
      `Công ty "${name}" vừa được giao cho bạn`,
      null,
    )
    sendCompanyAssignmentEmail({
      staffId: assignedStaffId,
      companyName: name,
      assignerName: actor?.name,
      startDate: new Date(),
      type: 'assigned',
    })
  }

  emitData('data:company', { action: 'created', id: rows[0].id, actorId })
  return toDto({ ...rows[0], task_open_count: 0, task_overdue_count: 0 })
}

async function updateCompany(id, data, actorId, ipAddress, userAgent, user = null) {
  // Pre-fetch current state to detect assignment changes
  const { rows: [current] } = await query(
    'SELECT name, assigned_staff_id FROM companies WHERE id = $1', [id]
  )
  if (!current) throw Object.assign(new Error('Company not found'), { status: 404 })

  // Staff can only update their own assigned company and cannot reassign staff
  if (user?.role === 'staff') {
    if (current.assigned_staff_id !== actorId) {
      throw Object.assign(new Error('Bạn không có quyền chỉnh sửa công ty này'), { status: 403 })
    }
  }

  const fieldMap = {
    name: 'name', taxCode: 'tax_code', address: 'address', businessType: 'business_type',
    industry: 'industry', legalRepName: 'legal_rep_name', legalRepPhone: 'legal_rep_phone',
    contactName: 'contact_name', contactPhone: 'contact_phone', contactEmail: 'contact_email',
    bankAccount: 'bank_account', bankName: 'bank_name', serviceStartDate: 'service_start_date',
    notes: 'notes', assignedStaffId: 'assigned_staff_id', avatarUrl: 'avatar_url',
  }
  // Staff cannot reassign themselves or others
  if (user?.role === 'staff') delete fieldMap.assignedStaffId

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

  // Notify on assigned staff change
  if (data.assignedStaffId !== undefined && data.assignedStaffId !== current.assigned_staff_id) {
    const companyName = rows[0].name
    const newStaff    = data.assignedStaffId
    const oldStaff    = current.assigned_staff_id
    const { rows: [actor] } = await query('SELECT name FROM users WHERE id = $1', [actorId])

    const notifyPromises = []

    // Notify new assignee
    if (newStaff && newStaff !== actorId) {
      notifyPromises.push(
        createAndEmit(
          newStaff, 'task_assigned',
          'Bạn được phân công phụ trách công ty',
          `Công ty "${companyName}" vừa được giao cho bạn`,
          null,
        )
      )
      sendCompanyAssignmentEmail({ staffId: newStaff, companyName, assignerName: actor?.name, startDate: new Date(), type: 'assigned' })
    }
    // Notify previous assignee they are no longer responsible
    if (oldStaff && oldStaff !== actorId && oldStaff !== newStaff) {
      notifyPromises.push(
        createAndEmit(
          oldStaff, 'task_status_changed',
          'Thay đổi phân công công ty',
          `Bạn không còn phụ trách công ty "${companyName}" nữa`,
          null,
        )
      )
      sendCompanyAssignmentEmail({ staffId: oldStaff, companyName, assignerName: actor?.name, startDate: new Date(), type: 'unassigned' })
    }

    await Promise.all(notifyPromises)
  }

  emitData('data:company', { action: 'updated', id, actorId })
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
  emitData('data:company', { action: 'updated', id, actorId })
}

async function getAssignments(companyId) {
  const { rows: company } = await query('SELECT id FROM companies WHERE id = $1', [companyId])
  if (!company[0]) throw Object.assign(new Error('Company not found'), { status: 404 })

  const { rows } = await query(
    `SELECT sca.id, sca.company_id, sca.staff_id, sca.start_date, sca.end_date, sca.notes, sca.created_at,
            u.name AS staff_name, u.email AS staff_email, u.job_title AS staff_job_title, u.avatar_url AS staff_avatar_url,
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

async function deleteCompany(id, actorId, ipAddress, userAgent) {
  // Check for any tasks linked to this company
  const { rows: tasks } = await query(
    'SELECT id FROM tasks WHERE company_id = $1 LIMIT 1',
    [id]
  )
  if (tasks.length > 0) {
    throw Object.assign(
      new Error('Không thể xoá công ty đã có dữ liệu công việc. Hãy chuyển trạng thái sang "Đã kết thúc" thay thế.'),
      { status: 409 }
    )
  }

  // Check for any assignment history
  const { rows: assignments } = await query(
    'SELECT id FROM staff_company_assignments WHERE company_id = $1 LIMIT 1',
    [id]
  )
  if (assignments.length > 0) {
    throw Object.assign(
      new Error('Không thể xoá công ty đã có lịch sử phân công nhân sự. Hãy chuyển trạng thái sang "Đã kết thúc" thay thế.'),
      { status: 409 }
    )
  }

  const { rows } = await query(
    'DELETE FROM companies WHERE id = $1 RETURNING id, name',
    [id]
  )
  if (!rows[0]) throw Object.assign(new Error('Company not found'), { status: 404 })

  await audit.log({
    userId: actorId, action: 'company.deleted',
    targetType: 'company', targetId: id,
    meta: { name: rows[0].name },
    ipAddress, userAgent,
  })
  emitData('data:company', { action: 'deleted', id, actorId })
}

async function assignStaff(companyId, staffId, actorId, startDate, notes, ipAddress, userAgent) {
  // Validate company exists and get current assignee
  const { rows: [company] } = await query('SELECT id, name, assigned_staff_id FROM companies WHERE id = $1', [companyId])
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 })

  const previousStaffId = company.assigned_staff_id

  // Validate new assignee exists and is active
  const { rows: [staff] } = await query(
    `SELECT id, name, role, status FROM users WHERE id = $1`,
    [staffId]
  )
  if (!staff) throw Object.assign(new Error('Nhân sự không tồn tại'), { status: 404 })
  if (staff.status !== 'active') throw Object.assign(new Error('Nhân sự phải đang hoạt động'), { status: 422 })

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

    const { rows: [actor] } = await query('SELECT name FROM users WHERE id = $1', [actorId])

    const notifyPromises = []

    // Notify new assignee
    if (staffId !== actorId) {
      notifyPromises.push(
        createAndEmit(
          staffId, 'task_assigned',
          'Bạn được phân công phụ trách công ty',
          `Công ty "${company.name}" vừa được giao cho bạn`,
          null,
        )
      )
      sendCompanyAssignmentEmail({ staffId, companyName: company.name, assignerName: actor?.name, startDate: assignDate, type: 'assigned' })
    }
    // Notify previous assignee they are no longer responsible
    if (previousStaffId && previousStaffId !== actorId && previousStaffId !== staffId) {
      notifyPromises.push(
        createAndEmit(
          previousStaffId, 'task_status_changed',
          'Thay đổi phân công công ty',
          `Bạn không còn phụ trách công ty "${company.name}" nữa`,
          null,
        )
      )
      sendCompanyAssignmentEmail({ staffId: previousStaffId, companyName: company.name, assignerName: actor?.name, startDate: assignDate, type: 'unassigned' })
    }

    await Promise.all(notifyPromises)
    emitData('data:company', { action: 'updated', id: companyId, actorId })
    return { assignmentId: newAssignment.id, staffId, startDate: assignDate }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function getActivityLog(companyId, { page = 1, limit = 10 } = {}) {
  const offset = (page - 1) * limit
  const countRes = await query(
    `SELECT COUNT(*) FROM task_activity_logs tal
     JOIN tasks t ON t.id = tal.task_id
     WHERE t.company_id = $1`,
    [companyId]
  )
  const total = parseInt(countRes.rows[0].count, 10)
  const { rows } = await query(
    `SELECT tal.id, tal.action, tal.old_value, tal.new_value, tal.meta, tal.created_at,
            u.name AS actor_name,
            t.id   AS task_id, t.title AS task_title
     FROM task_activity_logs tal
     JOIN tasks t ON t.id = tal.task_id
     LEFT JOIN users u ON u.id = tal.user_id
     WHERE t.company_id = $1
     ORDER BY tal.created_at DESC
     LIMIT $2 OFFSET $3`,
    [companyId, limit, offset]
  )
  const activities = rows.map((r) => ({
    id:         r.id,
    action:     r.action,
    oldValue:   r.old_value ?? null,
    newValue:   r.new_value ?? null,
    meta:       r.meta ? (typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta) : null,
    actorName:  r.actor_name ?? 'Hệ thống',
    taskId:     r.task_id,
    taskTitle:  r.task_title,
    createdAt:  r.created_at,
  }))
  return { activities, total }
}

// ── Company Notes ──────────────────────────────────────────────────────────────

async function listNotes(companyId) {
  const { rows } = await query(
    `SELECT cn.id, cn.content, cn.is_pinned, cn.created_at, cn.updated_at,
            u.name AS author_name, cn.created_by
     FROM company_notes cn
     LEFT JOIN users u ON u.id = cn.created_by
     WHERE cn.company_id = $1
     ORDER BY cn.is_pinned DESC, cn.created_at DESC`,
    [companyId]
  )
  return rows.map(r => ({
    id:         r.id,
    content:    r.content,
    isPinned:   r.is_pinned,
    authorName: r.author_name ?? 'Hệ thống',
    createdBy:  r.created_by,
    createdAt:  r.created_at,
    updatedAt:  r.updated_at,
  }))
}

async function createNote(companyId, { content, isPinned = false }, userId) {
  const { rows: [row] } = await query(
    `INSERT INTO company_notes (company_id, content, is_pinned, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, content, is_pinned, created_at, updated_at, created_by`,
    [companyId, content.trim(), isPinned, userId]
  )
  const { rows: [user] } = await query('SELECT name FROM users WHERE id = $1', [userId])
  return {
    id:         row.id,
    content:    row.content,
    isPinned:   row.is_pinned,
    authorName: user?.name ?? 'Hệ thống',
    createdBy:  row.created_by,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  }
}

async function updateNote(companyId, noteId, { content, isPinned }) {
  const sets = []
  const vals = []
  if (content  !== undefined) { sets.push(`content = $${sets.length + 1}`);   vals.push(content.trim()) }
  if (isPinned !== undefined) { sets.push(`is_pinned = $${sets.length + 1}`); vals.push(isPinned) }
  if (!sets.length) throw new Error('Nothing to update')
  sets.push('updated_at = NOW()')
  vals.push(companyId, noteId)

  const { rows: [row] } = await query(
    `UPDATE company_notes SET ${sets.join(', ')}
     WHERE company_id = $${vals.length - 1} AND id = $${vals.length}
     RETURNING id, content, is_pinned, created_at, updated_at, created_by`,
    vals
  )
  if (!row) throw Object.assign(new Error('Note not found'), { status: 404 })
  return {
    id:         row.id,
    content:    row.content,
    isPinned:   row.is_pinned,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  }
}

async function deleteNote(companyId, noteId) {
  const { rowCount } = await query(
    'DELETE FROM company_notes WHERE company_id = $1 AND id = $2',
    [companyId, noteId]
  )
  if (!rowCount) throw Object.assign(new Error('Note not found'), { status: 404 })
}

module.exports = {
  listCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  terminateCompany,
  deleteCompany,
  getAssignments,
  assignStaff,
  getActivityLog,
  listNotes,
  createNote,
  updateNote,
  deleteNote,
}

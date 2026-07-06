const { query } = require('../../config/db')
const audit    = require('../../lib/audit')
const activity = require('../../lib/activity')
const { canTransition } = require('./tasks.transitions')
const { checkBlockers } = require('./dependencies.service')
const { createAndEmit, emitData } = require('../../lib/notify')
const { countPendingByTask, listClientRequests } = require('../client-requests/clientRequests.service')
const enums = require('../../lib/enums')

function cdrToTaskDto(cdr) {
  return {
    id:             cdr.id,
    _type:          'client_request',
    title:          cdr.documentName,
    description:    cdr.description,
    companyId:      cdr.companyId,
    companyName:    cdr.companyName,
    taskTypeId:     null,
    taskTypeName:   null,
    customerTaskScheduleId: null,
    assignedTo:     cdr.requestedBy,
    assignedToName: cdr.requestedByName,
    assignedBy:     null,
    status:         cdr.status,
    priority:       null,
    source:         'client_request',
    startDate:      null,
    dueDate:        cdr.deadlineDate,
    periodLabel:    cdr.periodLabel,
    completedAt:    cdr.receivedAt,
    onHoldReason:   null,
    slaDays:        null,
    actualHours:    null,
    checklistTotal: 0,
    checklistDone:  0,
    createdBy:      cdr.requestedBy,
    createdAt:      cdr.createdAt,
    updatedAt:      cdr.updatedAt,
    linkedTaskId:   cdr.taskId,
    linkedTaskTitle: cdr.taskTitle,
  }
}

const STATUS_LABEL = {
  pending:        'Chờ xử lý',
  in_progress:    'Đang xử lý',
  on_hold:        'Tạm hoãn',
  pending_review: 'Chờ duyệt',
  needs_revision: 'Cần xem lại',
  completed:      'Hoàn thành',
  cancelled:      'Đã huỷ',
}

function toDto(row) {
  return {
    id:                     row.id,
    title:                  row.title,
    description:            row.description ?? null,
    companyId:              row.company_id,
    companyName:            row.company_name ?? null,
    companyShortName:       row.company_short_name ?? null,
    taskTypeId:             row.task_type_id ?? null,
    taskTypeName:           row.task_type_name ?? null,
    customerTaskScheduleId: row.customer_task_schedule_id ?? null,
    assignedTo:             row.assigned_to ?? null,
    assignedToName:         row.assigned_to_name ?? null,
    assignedBy:             row.assigned_by ?? null,
    status:                 row.status,
    priority:               row.priority,
    source:                 row.source,
    startDate:              row.start_date ?? null,
    dueDate:                row.due_date ?? null,
    periodLabel:            row.period_label ?? null,
    completedAt:            row.completed_at ?? null,
    onHoldReason:           row.on_hold_reason ?? null,
    slaDays:                row.sla_days ?? null,
    actualHours:            row.actual_hours ? parseFloat(row.actual_hours) : null,
    checklistTotal:         parseInt(row.checklist_total ?? 0, 10),
    checklistDone:          parseInt(row.checklist_done ?? 0, 10),
    createdBy:              row.created_by,
    createdAt:              row.created_at,
    updatedAt:              row.updated_at,
  }
}

const TASK_SELECT = `
  SELECT t.*,
         c.name       AS company_name,
         c.short_name AS company_short_name,
         tt.name  AS task_type_name,
         ua.name  AS assigned_to_name,
         cl.checklist_total,
         cl.checklist_done
  FROM tasks t
  LEFT JOIN companies  c  ON c.id  = t.company_id
  LEFT JOIN task_types tt ON tt.id = t.task_type_id
  LEFT JOIN users      ua ON ua.id = t.assigned_to
  LEFT JOIN LATERAL (
    SELECT COUNT(*)                                        AS checklist_total,
           COUNT(*) FILTER (WHERE ci.is_completed = TRUE) AS checklist_done
    FROM task_checklist_items ci WHERE ci.task_id = t.id
  ) cl ON TRUE`

async function assertTaskAccess(taskId, user) {
  if (!user || user.role !== 'staff') return
  const { rows: [task] } = await query('SELECT assigned_to FROM tasks WHERE id = $1', [taskId])
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 })
  if (task.assigned_to !== user.id) {
    throw Object.assign(new Error('Bạn không có quyền thực hiện thao tác này'), { status: 403 })
  }
}

async function listTasks(filters = {}) {
  const {
    page = 1, limit = 20,
    companyId, assignedTo, status, priority, source,
    dueDateFrom, dueDateTo, periodLabel, isOverdue, search,
    sortBy = 'created_at', sortDir = 'desc',
    audience = 'internal',
    forceAssignedTo,
  } = filters

  const effectiveAssignedTo = forceAssignedTo ?? assignedTo

  // audience=client_request: return CDRs mapped to task-like shape
  if (audience === 'client_request') {
    const cdrFilters = {
      page: parseInt(page, 10),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
      companyId,
      requestedBy:      effectiveAssignedTo,
      periodLabel,
      deadlineDateFrom: dueDateFrom,
      deadlineDateTo:   dueDateTo,
      sortBy: sortBy === 'due_date' ? 'deadline_date' : sortBy === 'priority' ? 'created_at' : sortBy,
      sortDir,
    }
    if (isOverdue === 'true' || isOverdue === true) cdrFilters.status = ['overdue', 'pending']
    const result = await listClientRequests(cdrFilters)
    return {
      tasks:        result.items.map(cdrToTaskDto),
      pagination:   result.pagination,
      statusCounts: {},
    }
  }

  // audience=all: fetch tasks + CDRs, merge and paginate in memory
  if (audience === 'all') {
    const [tasksResult, cdrsResult] = await Promise.all([
      listTasks({ ...filters, audience: 'internal', page: 1, limit: 1000 }),
      listClientRequests({
        companyId, requestedBy: effectiveAssignedTo, periodLabel,
        deadlineDateFrom: dueDateFrom, deadlineDateTo: dueDateTo,
        page: 1, limit: 1000,
      }),
    ])

    const allItems = [
      ...tasksResult.tasks,
      ...cdrsResult.items.map(cdrToTaskDto),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    const pageInt   = parseInt(page, 10)
    const limitInt  = Math.min(100, Math.max(1, parseInt(limit, 10)))
    const offset    = (pageInt - 1) * limitInt
    const total     = allItems.length

    return {
      tasks:        allItems.slice(offset, offset + limitInt),
      pagination:   { page: pageInt, limit: limitInt, total, totalPages: Math.ceil(total / limitInt) },
      statusCounts: tasksResult.statusCounts,
    }
  }

  const offset = (page - 1) * limit

  // Base conditions: all filters EXCEPT status (used for statusCounts)
  const baseConditions = ['1=1']
  const baseParams = []

  if (companyId && (!Array.isArray(companyId) || companyId.length > 0)) {
    const arr = Array.isArray(companyId) ? companyId : [companyId]
    baseParams.push(arr)
    baseConditions.push(`t.company_id = ANY($${baseParams.length}::uuid[])`)
  }
  if (effectiveAssignedTo && (!Array.isArray(effectiveAssignedTo) || effectiveAssignedTo.length > 0)) {
    const arr = Array.isArray(effectiveAssignedTo) ? effectiveAssignedTo : [effectiveAssignedTo]
    baseParams.push(arr)
    baseConditions.push(`t.assigned_to = ANY($${baseParams.length}::uuid[])`)
  }
  if (source) {
    const arr = Array.isArray(source) ? source : [source]
    baseParams.push(arr)
    baseConditions.push(`t.source = ANY($${baseParams.length})`)
  }
  if (dueDateFrom && dueDateTo) {
    // Overlap on the task's effective date range. COALESCE anchors a single-date task
    // (e.g. auto-generated tasks have only due_date) to that one date, so it matches
    // only the period that actually contains it. A task with NO dates at all yields
    // NULL on both sides and is excluded from any period filter.
    baseParams.push(dueDateTo)
    baseConditions.push(`COALESCE(t.start_date, t.due_date) <= $${baseParams.length}`)
    baseParams.push(dueDateFrom)
    baseConditions.push(`COALESCE(t.due_date, t.start_date) >= $${baseParams.length}`)
  } else if (dueDateFrom) {
    baseParams.push(dueDateFrom)
    baseConditions.push(`COALESCE(t.due_date, t.start_date) >= $${baseParams.length}`)
  } else if (dueDateTo) {
    baseParams.push(dueDateTo)
    baseConditions.push(`COALESCE(t.start_date, t.due_date) <= $${baseParams.length}`)
  }
  if (periodLabel) { baseParams.push(periodLabel); baseConditions.push(`t.period_label = $${baseParams.length}`) }
  if (isOverdue === 'true' || isOverdue === true) {
    baseConditions.push(`t.due_date < CURRENT_DATE AND t.status != 'completed'`)
  }
  if (search && search.trim()) {
    baseParams.push(search.trim())
    baseConditions.push(
      `to_tsvector('simple', t.title || ' ' || coalesce(t.description, '')) @@ plainto_tsquery('simple', $${baseParams.length})`
    )
  }

  // Full conditions: base + status + priority (used for main list/count)
  const conditions = [...baseConditions]
  const params = [...baseParams]
  if (status) {
    const arr = Array.isArray(status) ? status : [status]
    params.push(arr)
    conditions.push(`t.status = ANY($${params.length}::task_status[])`)
  }
  if (priority) {
    const arr = Array.isArray(priority) ? priority : [priority]
    params.push(arr)
    conditions.push(`t.priority = ANY($${params.length}::task_priority[])`)
  }

  const baseWhere = baseConditions.join(' AND ')
  const where     = conditions.join(' AND ')

  const SORT_COLS = {
    created_at: 't.created_at',
    due_date:   't.due_date',
    updated_at: 't.updated_at',
    priority: `CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END`,
    status:   `CASE t.status WHEN 'pending' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'on_hold' THEN 3 WHEN 'pending_review' THEN 4 WHEN 'needs_revision' THEN 5 WHEN 'completed' THEN 6 ELSE 7 END`,
  }
  const orderBy = `${SORT_COLS[sortBy] || 't.created_at'} ${sortDir === 'asc' ? 'ASC' : 'DESC'}`

  const [countRes, statusCountsRes, { rows }] = await Promise.all([
    query(`SELECT COUNT(*) FROM tasks t WHERE ${where}`, params),
    query(`SELECT t.status, COUNT(*) AS cnt FROM tasks t WHERE ${baseWhere} GROUP BY t.status`, baseParams),
    query(
      `${TASK_SELECT} WHERE ${where} ORDER BY ${orderBy}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
  ])

  const total = parseInt(countRes.rows[0].count, 10)
  const statusCounts = {}
  for (const r of statusCountsRes.rows) statusCounts[r.status] = parseInt(r.cnt, 10)

  return {
    tasks: rows.map(toDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    statusCounts,
  }
}

async function getTaskById(id, user = null) {
  const { rows } = await query(`${TASK_SELECT} WHERE t.id = $1`, [id])
  if (!rows[0]) throw Object.assign(new Error('Task not found'), { status: 404 })
  if (user?.role === 'staff' && rows[0].assigned_to !== user.id) {
    throw Object.assign(new Error('Bạn không có quyền xem công việc này'), { status: 403 })
  }
  return toDto(rows[0])
}

async function createTask(data, actorId, ipAddress, userAgent) {
  const { title, description, companyId, taskTypeId, assignedTo, startDate, dueDate, priority = 'medium', slaDays } = data

  const { rows: [company] } = await query('SELECT id FROM companies WHERE id = $1', [companyId])
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 })

  // Resolve task source (metadata-driven via enum_options); defaults to 'manual'.
  let source = 'manual'
  if (data.source) {
    const validSources = await enums.getValues('task_source')
    if (!validSources.includes(data.source)) {
      throw Object.assign(new Error(`Nguồn công việc không hợp lệ: ${data.source}`), { status: 422 })
    }
    source = data.source
  }

  // Inherit SLA from task type if not overridden
  let effectiveSlaDays = slaDays ?? null
  if (taskTypeId && !slaDays) {
    const { rows: [tt] } = await query('SELECT default_sla_days FROM task_types WHERE id = $1', [taskTypeId])
    if (tt) effectiveSlaDays = tt.default_sla_days
  }

  const { rows: [task] } = await query(
    `INSERT INTO tasks
       (title, description, company_id, task_type_id, assigned_to, assigned_by,
        start_date, due_date, priority, source, sla_days, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      title, description ?? null, companyId, taskTypeId ?? null,
      assignedTo ?? null, actorId, startDate ?? null, dueDate ?? null,
      priority, source, effectiveSlaDays, actorId,
    ]
  )

  // Copy checklist template from task type — single INSERT … SELECT (no loop)
  if (taskTypeId) {
    await query(
      `INSERT INTO task_checklist_items (task_id, step_order, step_text)
       SELECT $1, step_order, step_text
       FROM task_type_checklist_templates
       WHERE task_type_id = $2
       ORDER BY step_order`,
      [task.id, taskTypeId]
    )
  }

  await activity.logActivity(task.id, actorId, 'created', null, null, { title, companyId, taskTypeId })
  await audit.log({
    userId: actorId, action: 'task.created',
    targetType: 'task', targetId: task.id,
    meta: { title, companyId }, ipAddress, userAgent,
  })

  const result = await getTaskById(task.id)

  // Notify assignee if set and different from actor
  if (assignedTo && assignedTo !== actorId) {
    await createAndEmit(
      assignedTo, 'task_assigned',
      'Bạn được giao công việc mới',
      `"${result.title}" — ${result.companyName || ''}`,
      task.id,
    )
  }

  emitData('data:task', { action: 'created', id: task.id, companyId, actorId })
  return result
}

// Chuẩn hoá về chuỗi 'YYYY-MM-DD' (theo giờ địa phương của node-pg) để so sánh ngày an toàn
function toDateStr(v) {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function updateTask(id, data, actorId, ipAddress, userAgent, user = null) {
  const fieldMap = {
    title:       'title',
    description: 'description',
    assignedTo:  'assigned_to',
    startDate:   'start_date',
    dueDate:     'due_date',
    priority:    'priority',
    slaDays:     'sla_days',
    source:      'source',
  }

  const { rows: [current] } = await query('SELECT * FROM tasks WHERE id = $1', [id])
  if (!current) throw Object.assign(new Error('Task not found'), { status: 404 })

  // Validate source against active enum options (metadata-driven)
  if (data.source !== undefined && data.source !== null) {
    const validSources = await enums.getValues('task_source')
    if (!validSources.includes(data.source)) {
      throw Object.assign(new Error(`Nguồn công việc không hợp lệ: ${data.source}`), { status: 422 })
    }
  }

  if (user?.role === 'staff') {
    if (current.assigned_to !== actorId) {
      throw Object.assign(new Error('Bạn không có quyền chỉnh sửa công việc này'), { status: 403 })
    }
    delete fieldMap.assignedTo
    // Nhân viên KHÔNG được sửa Ngày hết hạn (chỉ admin) — chặn khi có thay đổi thực sự
    if (data.dueDate !== undefined && toDateStr(data.dueDate) !== toDateStr(current.due_date)) {
      throw Object.assign(
        new Error('Nhân viên không được sửa Ngày hết hạn. Vui lòng báo Quản trị viên để điều chỉnh.'),
        { status: 403 }
      )
    }
    delete fieldMap.dueDate
  }

  const updates = []
  const params = []
  let newAssignee = null
  let prevAssignee = null

  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      if (key === 'assignedTo' && data[key] !== current.assigned_to) {
        await activity.logActivity(id, actorId, 'assigned', current.assigned_to, data[key], null)
        prevAssignee = current.assigned_to
        newAssignee  = data[key]
      }
      if (key === 'dueDate' && data[key] !== current.due_date)
        await activity.logActivity(id, actorId, 'due_date_changed', current.due_date, data[key], null)
      if (key === 'priority' && data[key] !== current.priority)
        await activity.logActivity(id, actorId, 'priority_changed', current.priority, data[key], null)

      params.push(data[key])
      updates.push(`${col} = $${params.length}`)
    }
  }
  if (!updates.length) throw Object.assign(new Error('No fields to update'), { status: 400 })

  params.push(id)
  await query(
    `UPDATE tasks SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
    params
  )

  await audit.log({
    userId: actorId, action: 'task.updated',
    targetType: 'task', targetId: id, meta: data, ipAddress, userAgent,
  })

  const result = await getTaskById(id)

  const notifyPromises = []
  // Notify new assignee when task is re-assigned
  if (newAssignee && newAssignee !== actorId) {
    notifyPromises.push(createAndEmit(
      newAssignee, 'task_assigned',
      'Bạn được giao công việc',
      `"${result.title}" — ${result.companyName || ''}`,
      id,
    ))
  }
  // Notify previous assignee they were unassigned
  if (prevAssignee && prevAssignee !== actorId && prevAssignee !== newAssignee) {
    notifyPromises.push(createAndEmit(
      prevAssignee, 'task_status_changed',
      'Công việc đã được giao cho người khác',
      `"${result.title}" không còn được giao cho bạn nữa`,
      id,
    ))
  }
  await Promise.all(notifyPromises)

  emitData('data:task', { action: 'updated', id, companyId: result.companyId, actorId })
  return result
}

async function deleteTask(id, user, ipAddress, userAgent) {
  const actorId = user.id
  const { rows: [task] } = await query('SELECT id, title, company_id FROM tasks WHERE id = $1', [id])
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 })

  if (user.role === 'staff') {
    const { rows: [company] } = await query(
      'SELECT assigned_staff_id FROM companies WHERE id = $1',
      [task.company_id],
    )
    if (!company || company.assigned_staff_id !== actorId)
      throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  await query('DELETE FROM tasks WHERE id = $1', [id])

  await audit.log({
    userId: actorId, action: 'task.deleted',
    targetType: 'task', targetId: id, meta: { title: task.title }, ipAddress, userAgent,
  })

  emitData('data:task', { action: 'deleted', id, companyId: task.company_id, actorId })
}

async function changeTaskStatus(id, newStatus, params, actorId, ipAddress, userAgent, user = null) {
  const { onHoldReason, force = false } = params

  const { rows } = await query(
    `SELECT t.*,
            (SELECT COUNT(*) FROM task_checklist_items ci WHERE ci.task_id = t.id AND ci.is_completed = FALSE) AS unchecked_count
     FROM tasks t WHERE t.id = $1`,
    [id]
  )
  const task = rows[0]
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 })

  if (user?.role === 'staff' && task.assigned_to !== user.id) {
    throw Object.assign(new Error('Bạn không có quyền thay đổi trạng thái công việc này'), { status: 403 })
  }

  const currentStatus = task.status
  if (!canTransition(currentStatus, newStatus)) {
    throw Object.assign(
      new Error(`Cannot transition from '${currentStatus}' to '${newStatus}'`),
      { status: 422 }
    )
  }

  // Block if dependency tasks are not yet completed
  if (newStatus !== 'pending') {
    const blockers = await checkBlockers(id)
    if (blockers.length > 0) {
      throw Object.assign(
        new Error(`Task is blocked by ${blockers.length} incomplete dependency task(s): ${blockers.map(b => b.title).join(', ')}`),
        { status: 422, blockers }
      )
    }
  }

  // Block completion if unchecked items remain (unless force)
  const unchecked = parseInt(task.unchecked_count, 10)
  if (newStatus === 'completed' && unchecked > 0 && !force) {
    const err = Object.assign(
      new Error(`${unchecked} checklist item(s) are not done. Pass force=true to override.`),
      { status: 409, uncheckedCount: unchecked }
    )
    throw err
  }

  // Soft-block completion when linked client document requests are still pending
  if (newStatus === 'completed') {
    const pendingCdrCount = await countPendingByTask(id)
    if (pendingCdrCount > 0) {
      throw Object.assign(
        new Error(`${pendingCdrCount} yêu cầu tài liệu khách hàng chưa hoàn thành.`),
        { status: 422, code: 'CLIENT_REQUESTS_PENDING', pendingCdrCount }
      )
    }
  }

  const setClauses = ['status = $1', 'updated_at = NOW()']
  const queryParams = [newStatus]

  if (newStatus === 'completed') setClauses.push('completed_at = NOW()')

  if (newStatus === 'on_hold') {
    queryParams.push(onHoldReason)
    setClauses.push(`on_hold_reason = $${queryParams.length}`)
  }
  // Clear reason when leaving on_hold
  if (currentStatus === 'on_hold' && newStatus !== 'on_hold') {
    setClauses.push('on_hold_reason = NULL')
  }

  queryParams.push(id)
  await query(
    `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $${queryParams.length}`,
    queryParams
  )

  await activity.logActivity(id, actorId, 'status_changed', currentStatus, newStatus, { onHoldReason: onHoldReason ?? null })
  await audit.log({
    userId: actorId, action: 'task.status_changed',
    targetType: 'task', targetId: id,
    meta: { from: currentStatus, to: newStatus }, ipAddress, userAgent,
  })

  const result = await getTaskById(id)
  const fromLabel = STATUS_LABEL[currentStatus] || currentStatus
  const toLabel   = STATUS_LABEL[newStatus]     || newStatus

  const notifyPromises = []

  // Notify assignee about status change (if not the one making the change)
  if (result.assignedTo && result.assignedTo !== actorId) {
    notifyPromises.push(createAndEmit(
      result.assignedTo, 'task_status_changed',
      `Công việc cập nhật: ${toLabel}`,
      `"${result.title}" chuyển từ ${fromLabel} → ${toLabel}`,
      id,
    ))
  }

  // When completed — notify all relevant parties
  if (newStatus === 'completed') {
    const notified = new Set([actorId, result.assignedTo].filter(Boolean))

    // Notify creator if set and not already notified (manual task case)
    if (result.createdBy && !notified.has(result.createdBy)) {
      notifyPromises.push(createAndEmit(
        result.createdBy, 'task_status_changed',
        'Công việc đã hoàn thành',
        `"${result.title}" — ${result.companyName || ''} đã được đánh dấu hoàn thành`,
        id,
      ))
      notified.add(result.createdBy)
    }

    // When staff completes: notify all active admins not yet notified
    // Covers auto-generated tasks (createdBy may be null) and ensures all admins are informed
    if (user?.role === 'staff') {
      const { rows: admins } = await query(
        `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
      )
      for (const adm of admins) {
        if (!notified.has(adm.id)) {
          notifyPromises.push(createAndEmit(
            adm.id, 'task_status_changed',
            'Công việc đã hoàn thành',
            `"${result.title}" — ${result.companyName || ''} đã được đánh dấu hoàn thành`,
            id,
          ))
          notified.add(adm.id)
        }
      }
    }
  }

  // When needs_revision — actor is assignee, notify creator
  if (newStatus === 'needs_revision' && result.assignedTo && result.assignedTo === actorId) {
    if (result.createdBy && result.createdBy !== actorId) {
      notifyPromises.push(createAndEmit(
        result.createdBy, 'task_status_changed',
        `Công việc cần xem lại`,
        `"${result.title}" đã chuyển sang "Cần xem lại"`,
        id,
      ))
    }
  }

  await Promise.all(notifyPromises)
  emitData('data:task', { action: 'updated', id, companyId: result.companyId, actorId })
  return result
}

async function getActivityLog(taskId, { page = 1, limit = 50 } = {}) {
  const { rows: [t] } = await query('SELECT id FROM tasks WHERE id = $1', [taskId])
  if (!t) throw Object.assign(new Error('Task not found'), { status: 404 })

  const offset = (page - 1) * limit
  const { rows } = await query(
    `SELECT al.*, u.name AS user_name
     FROM task_activity_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.task_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2 OFFSET $3`,
    [taskId, limit, offset]
  )

  return rows.map(r => ({
    id:        r.id,
    userId:    r.user_id,
    userName:  r.user_name ?? null,
    action:    r.action,
    oldValue:  r.old_value,
    newValue:  r.new_value,
    meta:      r.meta,
    createdAt: r.created_at,
  }))
}

async function getAvailableYears() {
  const { rows } = await query(
    `SELECT DISTINCT EXTRACT(YEAR FROM due_date)::int AS year
     FROM tasks
     WHERE due_date IS NOT NULL
     ORDER BY year DESC`
  )
  return rows.map((r) => r.year)
}

module.exports = {
  listTasks, getTaskById, createTask, updateTask, deleteTask,
  changeTaskStatus, getActivityLog, getAvailableYears,
  assertTaskAccess,
}

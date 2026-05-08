const { query } = require('../../config/db')
const audit    = require('../../lib/audit')
const activity = require('../../lib/activity')
const { canTransition } = require('./tasks.transitions')

function toDto(row) {
  return {
    id:                     row.id,
    title:                  row.title,
    description:            row.description ?? null,
    companyId:              row.company_id,
    companyName:            row.company_name ?? null,
    taskTypeId:             row.task_type_id ?? null,
    taskTypeName:           row.task_type_name ?? null,
    customerTaskScheduleId: row.customer_task_schedule_id ?? null,
    assignedTo:             row.assigned_to ?? null,
    assignedToName:         row.assigned_to_name ?? null,
    assignedBy:             row.assigned_by ?? null,
    status:                 row.status,
    priority:               row.priority,
    source:                 row.source,
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
         c.name   AS company_name,
         tt.name  AS task_type_name,
         ua.name  AS assigned_to_name,
         (SELECT COUNT(*) FROM task_checklist_items ci WHERE ci.task_id = t.id)                          AS checklist_total,
         (SELECT COUNT(*) FROM task_checklist_items ci WHERE ci.task_id = t.id AND ci.is_completed = TRUE) AS checklist_done
  FROM tasks t
  LEFT JOIN companies  c  ON c.id  = t.company_id
  LEFT JOIN task_types tt ON tt.id = t.task_type_id
  LEFT JOIN users      ua ON ua.id = t.assigned_to`

async function listTasks(filters = {}) {
  const {
    page = 1, limit = 20,
    companyId, assignedTo, status, priority, source,
    dueDateFrom, dueDateTo, periodLabel, isOverdue, search,
    sortBy = 'created_at', sortDir = 'desc',
  } = filters

  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const params = []

  if (companyId)  { params.push(companyId);  conditions.push(`t.company_id = $${params.length}`) }
  if (assignedTo) { params.push(assignedTo); conditions.push(`t.assigned_to = $${params.length}`) }

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
  if (source)      { params.push(source);      conditions.push(`t.source = $${params.length}::task_source`) }
  if (dueDateFrom) { params.push(dueDateFrom); conditions.push(`t.due_date >= $${params.length}`) }
  if (dueDateTo)   { params.push(dueDateTo);   conditions.push(`t.due_date <= $${params.length}`) }
  if (periodLabel) { params.push(periodLabel); conditions.push(`t.period_label = $${params.length}`) }

  if (isOverdue === 'true' || isOverdue === true) {
    conditions.push(`t.due_date < CURRENT_DATE AND t.status != 'completed'`)
  }
  if (search && search.trim()) {
    params.push(search.trim())
    conditions.push(
      `to_tsvector('simple', t.title || ' ' || coalesce(t.description, '')) @@ plainto_tsquery('simple', $${params.length})`
    )
  }

  const where = conditions.join(' AND ')
  const SORT_COLS = {
    created_at: 't.created_at', due_date: 't.due_date',
    priority: 't.priority',     updated_at: 't.updated_at',
  }
  const orderBy = `${SORT_COLS[sortBy] || 't.created_at'} ${sortDir === 'asc' ? 'ASC' : 'DESC'}`

  const countRes = await query(`SELECT COUNT(*) FROM tasks t WHERE ${where}`, params)
  const total = parseInt(countRes.rows[0].count, 10)

  const { rows } = await query(
    `${TASK_SELECT} WHERE ${where} ORDER BY ${orderBy}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )

  return {
    tasks: rows.map(toDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

async function getTaskById(id) {
  const { rows } = await query(`${TASK_SELECT} WHERE t.id = $1`, [id])
  if (!rows[0]) throw Object.assign(new Error('Task not found'), { status: 404 })
  return toDto(rows[0])
}

async function createTask(data, actorId, ipAddress, userAgent) {
  const { title, description, companyId, taskTypeId, assignedTo, dueDate, priority = 'medium', slaDays } = data

  const { rows: [company] } = await query('SELECT id FROM companies WHERE id = $1', [companyId])
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 })

  // Inherit SLA from task type if not overridden
  let effectiveSlaDays = slaDays ?? null
  if (taskTypeId && !slaDays) {
    const { rows: [tt] } = await query('SELECT default_sla_days FROM task_types WHERE id = $1', [taskTypeId])
    if (tt) effectiveSlaDays = tt.default_sla_days
  }

  const { rows: [task] } = await query(
    `INSERT INTO tasks
       (title, description, company_id, task_type_id, assigned_to, assigned_by,
        due_date, priority, source, sla_days, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9,$10)
     RETURNING *`,
    [
      title, description ?? null, companyId, taskTypeId ?? null,
      assignedTo ?? null, actorId, dueDate ?? null, priority,
      effectiveSlaDays, actorId,
    ]
  )

  // Copy checklist template from task type
  if (taskTypeId) {
    const { rows: steps } = await query(
      'SELECT step_order, step_text FROM task_type_checklist_templates WHERE task_type_id = $1 ORDER BY step_order',
      [taskTypeId]
    )
    for (const step of steps) {
      await query(
        'INSERT INTO task_checklist_items (task_id, step_order, step_text) VALUES ($1,$2,$3)',
        [task.id, step.step_order, step.step_text]
      )
    }
  }

  await activity.logActivity(task.id, actorId, 'created', null, null, { title, companyId, taskTypeId })
  await audit.log({
    userId: actorId, action: 'task.created',
    targetType: 'task', targetId: task.id,
    meta: { title, companyId }, ipAddress, userAgent,
  })

  return getTaskById(task.id)
}

async function updateTask(id, data, actorId, ipAddress, userAgent) {
  const fieldMap = {
    title:       'title',
    description: 'description',
    assignedTo:  'assigned_to',
    dueDate:     'due_date',
    priority:    'priority',
    slaDays:     'sla_days',
  }

  const { rows: [current] } = await query('SELECT * FROM tasks WHERE id = $1', [id])
  if (!current) throw Object.assign(new Error('Task not found'), { status: 404 })

  const updates = []
  const params = []

  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      // Fire specific activity events
      if (key === 'assignedTo' && data[key] !== current.assigned_to)
        await activity.logActivity(id, actorId, 'assigned', current.assigned_to, data[key], null)
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

  return getTaskById(id)
}

async function deleteTask(id, actorId, ipAddress, userAgent) {
  const { rows: [task] } = await query('SELECT id, title FROM tasks WHERE id = $1', [id])
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 })

  await query('DELETE FROM tasks WHERE id = $1', [id])

  await audit.log({
    userId: actorId, action: 'task.deleted',
    targetType: 'task', targetId: id, meta: { title: task.title }, ipAddress, userAgent,
  })
}

async function changeTaskStatus(id, newStatus, params, actorId, ipAddress, userAgent) {
  const { onHoldReason, force = false } = params

  const { rows } = await query(
    `SELECT t.*,
            (SELECT COUNT(*) FROM task_checklist_items ci WHERE ci.task_id = t.id AND ci.is_completed = FALSE) AS unchecked_count
     FROM tasks t WHERE t.id = $1`,
    [id]
  )
  const task = rows[0]
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 })

  const currentStatus = task.status
  if (!canTransition(currentStatus, newStatus)) {
    throw Object.assign(
      new Error(`Cannot transition from '${currentStatus}' to '${newStatus}'`),
      { status: 422 }
    )
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

  return getTaskById(id)
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

module.exports = {
  listTasks, getTaskById, createTask, updateTask, deleteTask,
  changeTaskStatus, getActivityLog,
}

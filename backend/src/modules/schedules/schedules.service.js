const { query } = require('../../config/db')
const audit = require('../../lib/audit')
const { getNextOccurrences } = require('../../utils/recurrence.calculator')

function toDto(row) {
  return {
    id:                 row.id,
    companyId:          row.company_id,
    taskTypeId:         row.task_type_id,
    taskTypeName:       row.task_type_name ?? null,
    assignedStaffId:    row.assigned_staff_id ?? null,
    assignedStaffName:  row.staff_name ?? null,
    recurrenceType:     row.recurrence_type,
    recurrenceConfig:   row.recurrence_config,
    deadlineOffsetDays: row.deadline_offset_days,
    overrideSlaDays:    row.override_sla_days ?? null,
    notes:              row.notes ?? null,
    isActive:           row.is_active,
    lastGeneratedAt:    row.last_generated_at ?? null,
    createdBy:          row.created_by,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  }
}

async function assertCompanyExists(companyId) {
  const { rows: [c] } = await query('SELECT id FROM companies WHERE id = $1', [companyId])
  if (!c) throw Object.assign(new Error('Company not found'), { status: 404 })
}

async function getScheduleById(id) {
  const { rows: [row] } = await query(
    `SELECT s.*, tt.name AS task_type_name, u.name AS staff_name
     FROM customer_task_schedules s
     JOIN task_types tt ON tt.id = s.task_type_id
     LEFT JOIN users u  ON u.id  = s.assigned_staff_id
     WHERE s.id = $1`,
    [id]
  )
  if (!row) throw Object.assign(new Error('Schedule not found'), { status: 404 })
  return toDto(row)
}

async function listSchedules(companyId) {
  await assertCompanyExists(companyId)
  const { rows } = await query(
    `SELECT s.*, tt.name AS task_type_name, u.name AS staff_name
     FROM customer_task_schedules s
     JOIN task_types tt ON tt.id = s.task_type_id
     LEFT JOIN users u  ON u.id  = s.assigned_staff_id
     WHERE s.company_id = $1
     ORDER BY s.created_at DESC`,
    [companyId]
  )
  return rows.map(toDto)
}

async function createSchedule(companyId, data, actorId, ipAddress, userAgent) {
  await assertCompanyExists(companyId)

  const {
    taskTypeId, assignedStaffId, recurrenceType, recurrenceConfig,
    deadlineOffsetDays = 0, overrideSlaDays, notes,
  } = data

  const { rows: [tt] } = await query('SELECT id FROM task_types WHERE id = $1 AND is_active = TRUE', [taskTypeId])
  if (!tt) throw Object.assign(new Error('Task type not found or inactive'), { status: 404 })

  const { rows: [schedule] } = await query(
    `INSERT INTO customer_task_schedules
       (company_id, task_type_id, assigned_staff_id, recurrence_type, recurrence_config,
        deadline_offset_days, override_sla_days, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      companyId, taskTypeId, assignedStaffId ?? null,
      recurrenceType, JSON.stringify(recurrenceConfig),
      deadlineOffsetDays, overrideSlaDays ?? null, notes ?? null, actorId,
    ]
  )

  await audit.log({
    userId: actorId, action: 'schedule.created',
    targetType: 'schedule', targetId: schedule.id,
    meta: { companyId, taskTypeId, recurrenceType }, ipAddress, userAgent,
  })

  return getScheduleById(schedule.id)
}

async function updateSchedule(id, data, actorId, ipAddress, userAgent) {
  const fieldMap = {
    assignedStaffId:    'assigned_staff_id',
    recurrenceType:     'recurrence_type',
    deadlineOffsetDays: 'deadline_offset_days',
    overrideSlaDays:    'override_sla_days',
    notes:              'notes',
  }

  const updates = []
  const params = []

  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      params.push(data[key])
      updates.push(`${col} = $${params.length}`)
    }
  }
  if (data.recurrenceConfig !== undefined) {
    params.push(JSON.stringify(data.recurrenceConfig))
    updates.push(`recurrence_config = $${params.length}`)
  }

  if (!updates.length) throw Object.assign(new Error('No fields to update'), { status: 400 })

  params.push(id)
  const { rows: [row] } = await query(
    `UPDATE customer_task_schedules SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length} RETURNING id`,
    params
  )
  if (!row) throw Object.assign(new Error('Schedule not found'), { status: 404 })

  await audit.log({
    userId: actorId, action: 'schedule.updated',
    targetType: 'schedule', targetId: id, meta: data, ipAddress, userAgent,
  })

  return getScheduleById(id)
}

async function deleteSchedule(id, actorId, ipAddress, userAgent) {
  const { rows: [schedule] } = await query('SELECT id FROM customer_task_schedules WHERE id = $1', [id])
  if (!schedule) throw Object.assign(new Error('Schedule not found'), { status: 404 })

  const { rows: [taskCount] } = await query(
    'SELECT COUNT(*) FROM tasks WHERE customer_task_schedule_id = $1',
    [id]
  )
  if (parseInt(taskCount.count, 10) > 0) {
    throw Object.assign(new Error('Cannot delete schedule that has already generated tasks'), { status: 409 })
  }

  await query('DELETE FROM customer_task_schedules WHERE id = $1', [id])

  await audit.log({
    userId: actorId, action: 'schedule.deleted',
    targetType: 'schedule', targetId: id, ipAddress, userAgent,
  })
}

async function toggleSchedule(id, actorId, ipAddress, userAgent) {
  const { rows: [row] } = await query(
    `UPDATE customer_task_schedules SET is_active = NOT is_active, updated_at = NOW()
     WHERE id = $1 RETURNING id, is_active`,
    [id]
  )
  if (!row) throw Object.assign(new Error('Schedule not found'), { status: 404 })

  await audit.log({
    userId: actorId,
    action: row.is_active ? 'schedule.activated' : 'schedule.deactivated',
    targetType: 'schedule', targetId: id, ipAddress, userAgent,
  })

  return getScheduleById(id)
}

async function previewSchedule(id, count = 10) {
  const { rows: [row] } = await query(
    'SELECT recurrence_type, recurrence_config FROM customer_task_schedules WHERE id = $1',
    [id]
  )
  if (!row) throw Object.assign(new Error('Schedule not found'), { status: 404 })

  return getNextOccurrences(row.recurrence_type, row.recurrence_config, new Date(), count)
}

module.exports = {
  listSchedules, getScheduleById, createSchedule,
  updateSchedule, deleteSchedule, toggleSchedule, previewSchedule,
}

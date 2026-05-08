const { query, getClient } = require('../../config/db')
const audit = require('../../lib/audit')

function toTaskTypeDto(row) {
  return {
    id:             row.id,
    name:           row.name,
    groupName:      row.group_name ?? null,
    description:    row.description ?? null,
    defaultSlaDays: row.default_sla_days,
    isActive:       row.is_active,
    createdBy:      row.created_by,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  }
}

function toStepDto(row) {
  return {
    id:        row.id,
    stepOrder: row.step_order,
    stepText:  row.step_text,
    createdAt: row.created_at,
  }
}

function toFieldDto(row) {
  return {
    id:           row.id,
    fieldKey:     row.field_key,
    label:        row.label,
    dataType:     row.data_type,
    options:      row.options ?? null,
    isRequired:   row.is_required,
    displayOrder: row.display_order,
    createdAt:    row.created_at,
  }
}

async function listTaskTypes({ groupName, isActive } = {}) {
  const conditions = ['1=1']
  const params = []

  if (groupName) {
    params.push(groupName)
    conditions.push(`group_name = $${params.length}`)
  }
  if (isActive !== undefined) {
    params.push(isActive === 'true' || isActive === true)
    conditions.push(`is_active = $${params.length}`)
  }

  const where = conditions.join(' AND ')
  const { rows } = await query(
    `SELECT * FROM task_types WHERE ${where} ORDER BY group_name NULLS LAST, name`,
    params
  )

  // Group by group_name
  const grouped = {}
  for (const row of rows) {
    const group = row.group_name ?? 'Khác'
    if (!grouped[group]) grouped[group] = []
    grouped[group].push(toTaskTypeDto(row))
  }

  return { taskTypes: rows.map(toTaskTypeDto), grouped }
}

async function getTaskTypeById(id) {
  const { rows: [tt] } = await query('SELECT * FROM task_types WHERE id = $1', [id])
  if (!tt) throw Object.assign(new Error('Task type not found'), { status: 404 })

  const [{ rows: checklist }, { rows: fields }] = await Promise.all([
    query(
      'SELECT * FROM task_type_checklist_templates WHERE task_type_id = $1 ORDER BY step_order',
      [id]
    ),
    query(
      'SELECT * FROM task_type_custom_field_schemas WHERE task_type_id = $1 ORDER BY display_order, created_at',
      [id]
    ),
  ])

  return {
    ...toTaskTypeDto(tt),
    checklist: checklist.map(toStepDto),
    customFields: fields.map(toFieldDto),
  }
}

async function createTaskType(data, actorId, ipAddress, userAgent) {
  const { name, groupName, description, defaultSlaDays = 7 } = data
  const { rows: [tt] } = await query(
    `INSERT INTO task_types (name, group_name, description, default_sla_days, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, groupName ?? null, description ?? null, defaultSlaDays, actorId]
  )
  await audit.log({
    userId: actorId, action: 'task_type.created',
    targetType: 'task_type', targetId: tt.id, meta: { name }, ipAddress, userAgent,
  })
  return toTaskTypeDto(tt)
}

async function updateTaskType(id, data, actorId, ipAddress, userAgent) {
  const fieldMap = {
    name: 'name', groupName: 'group_name', description: 'description', defaultSlaDays: 'default_sla_days',
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
  const { rows: [tt] } = await query(
    `UPDATE task_types SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length} RETURNING *`,
    params
  )
  if (!tt) throw Object.assign(new Error('Task type not found'), { status: 404 })

  await audit.log({
    userId: actorId, action: 'task_type.updated',
    targetType: 'task_type', targetId: id, meta: data, ipAddress, userAgent,
  })
  return toTaskTypeDto(tt)
}

async function toggleTaskType(id, actorId, ipAddress, userAgent) {
  const { rows: [tt] } = await query(
    `UPDATE task_types SET is_active = NOT is_active, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id]
  )
  if (!tt) throw Object.assign(new Error('Task type not found'), { status: 404 })
  await audit.log({
    userId: actorId, action: tt.is_active ? 'task_type.activated' : 'task_type.deactivated',
    targetType: 'task_type', targetId: id, ipAddress, userAgent,
  })
  return toTaskTypeDto(tt)
}

// ── Checklist ────────────────────────────────────────────────────────────────

async function assertTaskTypeExists(id) {
  const { rows: [tt] } = await query('SELECT id FROM task_types WHERE id = $1', [id])
  if (!tt) throw Object.assign(new Error('Task type not found'), { status: 404 })
}

async function getChecklist(taskTypeId) {
  await assertTaskTypeExists(taskTypeId)
  const { rows } = await query(
    'SELECT * FROM task_type_checklist_templates WHERE task_type_id = $1 ORDER BY step_order',
    [taskTypeId]
  )
  return rows.map(toStepDto)
}

async function addChecklistStep(taskTypeId, stepText) {
  await assertTaskTypeExists(taskTypeId)
  const { rows: [maxRow] } = await query(
    'SELECT COALESCE(MAX(step_order), 0) AS max FROM task_type_checklist_templates WHERE task_type_id = $1',
    [taskTypeId]
  )
  const nextOrder = parseInt(maxRow.max, 10) + 1
  const { rows: [step] } = await query(
    `INSERT INTO task_type_checklist_templates (task_type_id, step_order, step_text)
     VALUES ($1, $2, $3) RETURNING *`,
    [taskTypeId, nextOrder, stepText]
  )
  return toStepDto(step)
}

async function updateChecklistStep(taskTypeId, stepId, data) {
  await assertTaskTypeExists(taskTypeId)
  const updates = []
  const params = []
  if (data.stepText !== undefined) { params.push(data.stepText); updates.push(`step_text = $${params.length}`) }
  if (data.stepOrder !== undefined) { params.push(data.stepOrder); updates.push(`step_order = $${params.length}`) }

  params.push(stepId, taskTypeId)
  const { rows: [step] } = await query(
    `UPDATE task_type_checklist_templates SET ${updates.join(', ')}
     WHERE id = $${params.length - 1} AND task_type_id = $${params.length} RETURNING *`,
    params
  )
  if (!step) throw Object.assign(new Error('Checklist step not found'), { status: 404 })
  return toStepDto(step)
}

async function deleteChecklistStep(taskTypeId, stepId) {
  await assertTaskTypeExists(taskTypeId)
  const { rows: [step] } = await query(
    'DELETE FROM task_type_checklist_templates WHERE id = $1 AND task_type_id = $2 RETURNING id',
    [stepId, taskTypeId]
  )
  if (!step) throw Object.assign(new Error('Checklist step not found'), { status: 404 })
}

async function reorderChecklist(taskTypeId, steps) {
  await assertTaskTypeExists(taskTypeId)

  const client = await getClient()
  try {
    await client.query('BEGIN')

    // Phase 1: shift all step_orders to large values to avoid UNIQUE conflicts
    await client.query(
      `UPDATE task_type_checklist_templates SET step_order = step_order + 10000 WHERE task_type_id = $1`,
      [taskTypeId]
    )

    // Phase 2: set final step_orders
    for (const step of steps) {
      await client.query(
        `UPDATE task_type_checklist_templates SET step_order = $1 WHERE id = $2 AND task_type_id = $3`,
        [step.stepOrder, step.id, taskTypeId]
      )
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return getChecklist(taskTypeId)
}

// ── Custom Fields ─────────────────────────────────────────────────────────────

async function getCustomFields(taskTypeId) {
  await assertTaskTypeExists(taskTypeId)
  const { rows } = await query(
    'SELECT * FROM task_type_custom_field_schemas WHERE task_type_id = $1 ORDER BY display_order, created_at',
    [taskTypeId]
  )
  return rows.map(toFieldDto)
}

async function addCustomField(taskTypeId, data) {
  await assertTaskTypeExists(taskTypeId)

  const existing = await query(
    'SELECT id FROM task_type_custom_field_schemas WHERE task_type_id = $1 AND field_key = $2',
    [taskTypeId, data.fieldKey]
  )
  if (existing.rows.length) {
    throw Object.assign(new Error(`Field key '${data.fieldKey}' already exists`), { status: 409 })
  }

  const { rows: [field] } = await query(
    `INSERT INTO task_type_custom_field_schemas
       (task_type_id, field_key, label, data_type, options, is_required, display_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      taskTypeId, data.fieldKey, data.label, data.dataType,
      data.options ? JSON.stringify(data.options) : null,
      data.isRequired ?? false, data.displayOrder ?? 0,
    ]
  )
  return toFieldDto(field)
}

async function updateCustomField(taskTypeId, fieldId, data) {
  await assertTaskTypeExists(taskTypeId)
  const fieldMap = {
    label: 'label', dataType: 'data_type', isRequired: 'is_required', displayOrder: 'display_order',
  }
  const updates = []
  const params = []
  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) { params.push(data[key]); updates.push(`${col} = $${params.length}`) }
  }
  if (data.options !== undefined) {
    params.push(data.options ? JSON.stringify(data.options) : null)
    updates.push(`options = $${params.length}`)
  }
  if (!updates.length) throw Object.assign(new Error('No fields to update'), { status: 400 })

  params.push(fieldId, taskTypeId)
  const { rows: [field] } = await query(
    `UPDATE task_type_custom_field_schemas SET ${updates.join(', ')}
     WHERE id = $${params.length - 1} AND task_type_id = $${params.length} RETURNING *`,
    params
  )
  if (!field) throw Object.assign(new Error('Custom field not found'), { status: 404 })
  return toFieldDto(field)
}

async function deleteCustomField(taskTypeId, fieldId) {
  await assertTaskTypeExists(taskTypeId)
  const { rows: [field] } = await query(
    'DELETE FROM task_type_custom_field_schemas WHERE id = $1 AND task_type_id = $2 RETURNING id',
    [fieldId, taskTypeId]
  )
  if (!field) throw Object.assign(new Error('Custom field not found'), { status: 404 })
}

module.exports = {
  listTaskTypes, getTaskTypeById, createTaskType, updateTaskType, toggleTaskType,
  getChecklist, addChecklistStep, updateChecklistStep, deleteChecklistStep, reorderChecklist,
  getCustomFields, addCustomField, updateCustomField, deleteCustomField,
}

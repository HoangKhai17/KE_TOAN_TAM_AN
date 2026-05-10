const { query } = require('../../config/db')

const DATA_TYPES = ['text', 'number', 'date', 'boolean', 'select']

function toDto(row) {
  let value
  switch (row.data_type) {
    case 'number':  value = row.value_number != null ? parseFloat(row.value_number) : null; break
    case 'date':    value = row.value_date ?? null; break
    case 'boolean': value = row.value_boolean ?? null; break
    default:        value = row.value_text ?? null
  }
  return {
    fieldSchemaId: row.field_schema_id,
    fieldKey:      row.field_key,
    label:         row.label,
    dataType:      row.data_type,
    options:       row.options ?? null,
    isRequired:    row.is_required,
    displayOrder:  row.display_order,
    value,
    updatedAt:     row.updated_at,
  }
}

async function assertTask(taskId) {
  const { rows } = await query(
    'SELECT id, task_type_id FROM tasks WHERE id = $1',
    [taskId]
  )
  if (!rows[0]) throw Object.assign(new Error('Task not found'), { status: 404 })
  return rows[0]
}

async function getCustomFields(taskId) {
  const task = await assertTask(taskId)
  if (!task.task_type_id) return []

  // Return all schemas for this task type, left-joined with current values
  const { rows } = await query(
    `SELECT s.id AS field_schema_id, s.field_key, s.label, s.data_type, s.options, s.is_required, s.display_order,
            v.value_text, v.value_number, v.value_date, v.value_boolean, v.updated_at
     FROM task_type_custom_field_schemas s
     LEFT JOIN task_custom_field_values v ON v.field_schema_id = s.id AND v.task_id = $1
     WHERE s.task_type_id = $2
     ORDER BY s.display_order, s.field_key`,
    [taskId, task.task_type_id]
  )
  return rows.map(toDto)
}

async function upsertCustomFields(taskId, fields) {
  const task = await assertTask(taskId)
  if (!task.task_type_id) {
    throw Object.assign(new Error('Task has no task type, cannot set custom fields'), { status: 422 })
  }

  // Validate each field key exists in schema and value matches data_type
  const { rows: schemas } = await query(
    'SELECT id, field_key, data_type, options, is_required FROM task_type_custom_field_schemas WHERE task_type_id = $1',
    [task.task_type_id]
  )
  const schemaMap = Object.fromEntries(schemas.map(s => [s.field_key, s]))

  const results = []
  for (const { fieldKey, value } of fields) {
    const schema = schemaMap[fieldKey]
    if (!schema) {
      throw Object.assign(new Error(`Unknown field key: ${fieldKey}`), { status: 422 })
    }

    // Validate select options
    if (schema.data_type === 'select' && value != null && schema.options && !schema.options.includes(value)) {
      throw Object.assign(
        new Error(`Invalid value for field '${fieldKey}': must be one of ${schema.options.join(', ')}`),
        { status: 422 }
      )
    }

    // Map value to correct column
    const valueCol = {
      text: 'value_text', number: 'value_number',
      date: 'value_date', boolean: 'value_boolean', select: 'value_text',
    }[schema.data_type]

    const { rows: [upserted] } = await query(
      `INSERT INTO task_custom_field_values (task_id, field_schema_id, ${valueCol})
       VALUES ($1, $2, $3)
       ON CONFLICT (task_id, field_schema_id)
       DO UPDATE SET ${valueCol} = EXCLUDED.${valueCol}, updated_at = NOW()
       RETURNING *`,
      [taskId, schema.id, value ?? null]
    )

    results.push({
      fieldSchemaId: schema.id,
      fieldKey:      schema.field_key,
      dataType:      schema.data_type,
      value:         schema.data_type === 'number' && upserted.value_number != null
        ? parseFloat(upserted.value_number)
        : (upserted[valueCol] ?? null),
      updatedAt: upserted.updated_at,
    })
  }

  // Re-fetch full list with schema metadata
  return getCustomFields(taskId)
}

module.exports = { getCustomFields, upsertCustomFields }

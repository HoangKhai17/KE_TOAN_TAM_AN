'use strict'
const { query } = require('../../config/db')
const { emitData } = require('../../lib/notify')

function toDto(row) {
  return {
    id:          row.id,
    requestId:   row.request_id,
    stepOrder:   row.step_order,
    stepText:    row.step_text,
    level:       row.level ?? 0,
    isCompleted: row.is_completed,
    completedBy: row.completed_by ?? null,
    completedAt: row.completed_at ?? null,
    createdAt:   row.created_at,
  }
}

async function assertRequest(requestId) {
  const { rows } = await query('SELECT id FROM client_document_requests WHERE id = $1', [requestId])
  if (!rows[0]) throw Object.assign(new Error('Client request not found'), { status: 404 })
}

async function listItems(requestId) {
  await assertRequest(requestId)
  const { rows } = await query(
    'SELECT * FROM client_request_checklist_items WHERE request_id = $1 ORDER BY step_order ASC, created_at ASC',
    [requestId],
  )
  return rows.map(toDto)
}

async function addItem(requestId, { stepText }) {
  await assertRequest(requestId)
  const { rows: [{ next }] } = await query(
    'SELECT COALESCE(MAX(step_order), 0) + 1 AS next FROM client_request_checklist_items WHERE request_id = $1',
    [requestId],
  )
  const { rows: [item] } = await query(
    'INSERT INTO client_request_checklist_items (request_id, step_order, step_text) VALUES ($1,$2,$3) RETURNING *',
    [requestId, next, stepText],
  )
  emitData('data:cdr_checklist', { requestId })
  return toDto(item)
}

async function updateItem(requestId, itemId, patch, actorId) {
  const { rows: [item] } = await query(
    'SELECT * FROM client_request_checklist_items WHERE id = $1 AND request_id = $2',
    [itemId, requestId],
  )
  if (!item) throw Object.assign(new Error('Checklist item not found'), { status: 404 })

  const fields = []
  const params = []
  if (patch.stepText !== undefined) { params.push(patch.stepText); fields.push(`step_text = $${params.length}`) }
  if (patch.level !== undefined) { params.push(patch.level === 1 ? 1 : 0); fields.push(`level = $${params.length}`) }
  if (patch.isCompleted !== undefined) {
    params.push(patch.isCompleted); fields.push(`is_completed = $${params.length}`)
    if (patch.isCompleted) {
      params.push(actorId); fields.push(`completed_by = $${params.length}`)
      fields.push('completed_at = NOW()')
    } else {
      fields.push('completed_by = NULL', 'completed_at = NULL')
    }
  }
  if (!fields.length) return toDto(item)

  params.push(itemId)
  const { rows: [updated] } = await query(
    `UPDATE client_request_checklist_items SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  )
  emitData('data:cdr_checklist', { requestId })
  return toDto(updated)
}

async function deleteItem(requestId, itemId) {
  const { rowCount } = await query(
    'DELETE FROM client_request_checklist_items WHERE id = $1 AND request_id = $2',
    [itemId, requestId],
  )
  if (!rowCount) throw Object.assign(new Error('Checklist item not found'), { status: 404 })
  emitData('data:cdr_checklist', { requestId })
}

async function reorder(requestId, order) {
  await assertRequest(requestId)
  // order: [{ id, stepOrder }]
  for (const { id, stepOrder } of order) {
    await query(
      'UPDATE client_request_checklist_items SET step_order = $1 WHERE id = $2 AND request_id = $3',
      [stepOrder, id, requestId],
    )
  }
  emitData('data:cdr_checklist', { requestId })
  return listItems(requestId)
}

module.exports = { listItems, addItem, updateItem, deleteItem, reorder }

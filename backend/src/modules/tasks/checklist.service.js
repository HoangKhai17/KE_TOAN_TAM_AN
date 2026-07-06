const { query } = require('../../config/db')
const activity = require('../../lib/activity')

function toDto(row) {
  return {
    id:          row.id,
    taskId:      row.task_id,
    stepOrder:   row.step_order,
    stepText:    row.step_text,
    level:       row.level ?? 0,
    isCompleted: row.is_completed,
    completedBy: row.completed_by ?? null,
    completedAt: row.completed_at ?? null,
    createdAt:   row.created_at,
  }
}

async function assertTask(taskId) {
  const { rows } = await query('SELECT id FROM tasks WHERE id = $1', [taskId])
  if (!rows[0]) throw Object.assign(new Error('Task not found'), { status: 404 })
}

async function listChecklist(taskId) {
  await assertTask(taskId)
  const { rows } = await query(
    'SELECT * FROM task_checklist_items WHERE task_id = $1 ORDER BY step_order',
    [taskId]
  )
  return rows.map(toDto)
}

async function addItem(taskId, { stepText, level = 0 }, actorId) {
  await assertTask(taskId)
  const { rows: [{ max_order }] } = await query(
    'SELECT COALESCE(MAX(step_order), 0) AS max_order FROM task_checklist_items WHERE task_id = $1',
    [taskId]
  )
  const { rows: [item] } = await query(
    'INSERT INTO task_checklist_items (task_id, step_order, step_text, level) VALUES ($1,$2,$3,$4) RETURNING *',
    [taskId, max_order + 1, stepText, level === 1 ? 1 : 0]
  )
  return toDto(item)
}

// Đếm số mục leaf (mục con, hoặc mục chính không con) CHƯA hoàn thành
async function countUncheckedLeaves(taskId) {
  const { rows: [r] } = await query(
    `SELECT COUNT(*)::int AS n FROM (
       SELECT is_completed,
              NOT (level = 0 AND COALESCE(LEAD(level) OVER (ORDER BY step_order, id), 0) = 1) AS is_leaf
       FROM task_checklist_items WHERE task_id = $1
     ) z WHERE is_leaf AND NOT is_completed`,
    [taskId]
  )
  return r.n
}

async function updateItem(taskId, itemId, { stepText, isCompleted, level }, actorId) {
  const { rows: [item] } = await query(
    'SELECT * FROM task_checklist_items WHERE id = $1 AND task_id = $2',
    [itemId, taskId]
  )
  if (!item) throw Object.assign(new Error('Checklist item not found'), { status: 404 })

  // Yêu cầu 2: không cho tích checklist khi công việc còn ở trạng thái "Mới" (pending)
  if (isCompleted === true) {
    const { rows: [t] } = await query('SELECT status FROM tasks WHERE id = $1', [taskId])
    if (t?.status === 'pending') {
      throw Object.assign(
        new Error('Vui lòng chuyển công việc sang "Đang thực hiện" trước khi tích checklist.'),
        { status: 422, code: 'TASK_NOT_STARTED' }
      )
    }
  }

  const updates = []
  const params = []

  if (stepText !== undefined) {
    params.push(stepText)
    updates.push(`step_text = $${params.length}`)
  }
  if (level !== undefined) {
    params.push(level === 1 ? 1 : 0)
    updates.push(`level = $${params.length}`)
  }
  if (isCompleted !== undefined) {
    params.push(isCompleted)
    updates.push(`is_completed = $${params.length}`)

    if (isCompleted && !item.is_completed) {
      params.push(actorId)
      updates.push(`completed_by = $${params.length}`)
      updates.push('completed_at = NOW()')
      await activity.logActivity(taskId, actorId, 'checklist_checked', item.step_text, 'completed', null)
    } else if (!isCompleted) {
      updates.push('completed_by = NULL')
      updates.push('completed_at = NULL')
    }
  }

  if (updates.length === 0) return toDto(item)

  params.push(itemId)
  const { rows: [updated] } = await query(
    `UPDATE task_checklist_items SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  )
  return toDto(updated)
}

async function deleteItem(taskId, itemId) {
  const { rows: [item] } = await query(
    'SELECT id FROM task_checklist_items WHERE id = $1 AND task_id = $2',
    [itemId, taskId]
  )
  if (!item) throw Object.assign(new Error('Checklist item not found'), { status: 404 })
  await query('DELETE FROM task_checklist_items WHERE id = $1', [itemId])
}

module.exports = { listChecklist, addItem, updateItem, deleteItem, countUncheckedLeaves }

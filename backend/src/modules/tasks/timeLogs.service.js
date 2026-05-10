const { query } = require('../../config/db')
const activity = require('../../lib/activity')

function toDto(row) {
  return {
    id:         row.id,
    taskId:     row.task_id,
    userId:     row.user_id,
    userName:   row.user_name ?? null,
    hours:      parseFloat(row.hours),
    note:       row.note ?? null,
    loggedDate: row.logged_date,
    createdAt:  row.created_at,
  }
}

async function assertTask(taskId) {
  const { rows } = await query('SELECT id FROM tasks WHERE id = $1', [taskId])
  if (!rows[0]) throw Object.assign(new Error('Task not found'), { status: 404 })
}

async function listTimeLogs(taskId) {
  await assertTask(taskId)
  const { rows } = await query(
    `SELECT tl.*, u.name AS user_name
     FROM task_time_logs tl
     JOIN users u ON u.id = tl.user_id
     WHERE tl.task_id = $1
     ORDER BY tl.logged_date DESC, tl.created_at DESC`,
    [taskId]
  )
  return rows.map(toDto)
}

async function addTimeLog(taskId, { hours, note, loggedDate }, actorId) {
  await assertTask(taskId)
  const { rows: [log] } = await query(
    `INSERT INTO task_time_logs (task_id, user_id, hours, note, logged_date)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [taskId, actorId, hours, note ?? null, loggedDate ?? new Date().toISOString().slice(0, 10)]
  )
  // Trigger on DB updates actual_hours automatically, but log the activity
  activity.logActivity(taskId, actorId, 'time_logged', null, String(hours), { note: note ?? null })

  const { rows: [full] } = await query(
    'SELECT tl.*, u.name AS user_name FROM task_time_logs tl JOIN users u ON u.id = tl.user_id WHERE tl.id = $1',
    [log.id]
  )
  return toDto(full)
}

async function deleteTimeLog(taskId, logId, actorId, isAdmin) {
  const { rows: [log] } = await query(
    'SELECT * FROM task_time_logs WHERE id = $1 AND task_id = $2',
    [logId, taskId]
  )
  if (!log) throw Object.assign(new Error('Time log not found'), { status: 404 })
  if (log.user_id !== actorId && !isAdmin) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
  await query('DELETE FROM task_time_logs WHERE id = $1', [logId])
}

module.exports = { listTimeLogs, addTimeLog, deleteTimeLog }

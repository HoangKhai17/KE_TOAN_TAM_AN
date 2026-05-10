const { query } = require('../../config/db')

function toDto(row) {
  return {
    id:              row.id,
    taskId:          row.task_id,
    dependsOnTaskId: row.depends_on_task_id,
    dependsOnTitle:  row.depends_on_title ?? null,
    dependsOnStatus: row.depends_on_status ?? null,
    createdBy:       row.created_by,
    createdAt:       row.created_at,
  }
}

async function assertTask(taskId) {
  const { rows } = await query('SELECT id FROM tasks WHERE id = $1', [taskId])
  if (!rows[0]) throw Object.assign(new Error('Task not found'), { status: 404 })
}

// DFS to detect if adding (taskId -> dependsOnTaskId) creates a cycle
async function hasCycle(taskId, dependsOnTaskId) {
  // BFS/DFS: starting from dependsOnTaskId, can we reach taskId following dependencies?
  const visited = new Set()
  const queue = [dependsOnTaskId]

  while (queue.length) {
    const current = queue.shift()
    if (current === taskId) return true
    if (visited.has(current)) continue
    visited.add(current)

    const { rows } = await query(
      'SELECT depends_on_task_id FROM task_dependencies WHERE task_id = $1',
      [current]
    )
    for (const r of rows) queue.push(r.depends_on_task_id)
  }
  return false
}

async function listDependencies(taskId) {
  await assertTask(taskId)
  const { rows } = await query(
    `SELECT td.*, t.title AS depends_on_title, t.status AS depends_on_status
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.depends_on_task_id
     WHERE td.task_id = $1
     ORDER BY td.created_at`,
    [taskId]
  )
  return rows.map(toDto)
}

async function addDependency(taskId, { dependsOnTaskId }, actorId) {
  await assertTask(taskId)

  if (taskId === dependsOnTaskId) {
    throw Object.assign(new Error('A task cannot depend on itself'), { status: 422 })
  }

  const { rows: [target] } = await query('SELECT id FROM tasks WHERE id = $1', [dependsOnTaskId])
  if (!target) throw Object.assign(new Error('Dependency task not found'), { status: 404 })

  const cycle = await hasCycle(taskId, dependsOnTaskId)
  if (cycle) {
    throw Object.assign(new Error('Adding this dependency would create a circular dependency'), { status: 422 })
  }

  try {
    const { rows: [dep] } = await query(
      `INSERT INTO task_dependencies (task_id, depends_on_task_id, created_by)
       VALUES ($1,$2,$3) RETURNING *`,
      [taskId, dependsOnTaskId, actorId]
    )

    const { rows: [full] } = await query(
      `SELECT td.*, t.title AS depends_on_title, t.status AS depends_on_status
       FROM task_dependencies td
       JOIN tasks t ON t.id = td.depends_on_task_id
       WHERE td.id = $1`,
      [dep.id]
    )
    return toDto(full)
  } catch (err) {
    if (err.code === '23505') {
      throw Object.assign(new Error('Dependency already exists'), { status: 409 })
    }
    throw err
  }
}

async function removeDependency(taskId, dependencyId) {
  const { rows: [dep] } = await query(
    'SELECT id FROM task_dependencies WHERE id = $1 AND task_id = $2',
    [dependencyId, taskId]
  )
  if (!dep) throw Object.assign(new Error('Dependency not found'), { status: 404 })
  await query('DELETE FROM task_dependencies WHERE id = $1', [dependencyId])
}

// Called by changeTaskStatus — checks if all blockers are completed
async function checkBlockers(taskId) {
  const { rows } = await query(
    `SELECT t.id, t.title, t.status
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.depends_on_task_id
     WHERE td.task_id = $1 AND t.status != 'completed'`,
    [taskId]
  )
  return rows // non-empty = blocked
}

module.exports = { listDependencies, addDependency, removeDependency, checkBlockers }

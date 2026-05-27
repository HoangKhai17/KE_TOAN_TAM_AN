'use strict'
const { query } = require('../../config/db')

// ─── Traditional tasks ────────────────────────────────────────────────────────

async function getTraditionalSummary(userId, role, from, to) {
  const isStaff = role === 'staff'
  const [companies, open, overdue, completedPeriod, sla, myToday] = await Promise.all([

    isStaff
      ? query(`SELECT COUNT(DISTINCT company_id) AS count FROM tasks WHERE assigned_to = $1 AND status != 'completed'`, [userId])
      : query(`SELECT COUNT(*) AS count FROM companies WHERE status = 'active'`),

    isStaff
      ? query(`SELECT COUNT(*) AS count FROM tasks WHERE assigned_to = $1 AND status != 'completed'`, [userId])
      : query(`SELECT COUNT(*) AS count FROM tasks WHERE status != 'completed'`),

    isStaff
      ? query(`SELECT COUNT(*) AS count FROM tasks WHERE assigned_to = $1 AND due_date < CURRENT_DATE AND status != 'completed'`, [userId])
      : query(`SELECT COUNT(*) AS count FROM tasks WHERE due_date < CURRENT_DATE AND status != 'completed'`),

    isStaff
      ? query(`SELECT COUNT(*) AS count FROM tasks WHERE assigned_to = $1 AND status = 'completed' AND completed_at::date BETWEEN $2 AND $3`, [userId, from, to])
      : query(`SELECT COUNT(*) AS count FROM tasks WHERE status = 'completed' AND completed_at::date BETWEEN $1 AND $2`, [from, to]),

    isStaff
      ? query(`SELECT ROUND(COUNT(*) FILTER (WHERE completed_at::date <= due_date) * 100.0 / NULLIF(COUNT(*), 0), 1) AS rate FROM tasks WHERE assigned_to = $1 AND status = 'completed' AND completed_at::date BETWEEN $2 AND $3`, [userId, from, to])
      : query(`SELECT ROUND(COUNT(*) FILTER (WHERE completed_at::date <= due_date) * 100.0 / NULLIF(COUNT(*), 0), 1) AS rate FROM tasks WHERE status = 'completed' AND completed_at::date BETWEEN $1 AND $2`, [from, to]),

    isStaff
      ? query(`SELECT COUNT(*) AS count FROM tasks WHERE assigned_to = $1 AND due_date = CURRENT_DATE AND status != 'completed'`, [userId])
      : Promise.resolve({ rows: [{ count: '0' }] }),
  ])

  return {
    activeCompanies:    parseInt(companies.rows[0].count, 10),
    openTasks:          parseInt(open.rows[0].count, 10),
    overdueTasks:       parseInt(overdue.rows[0].count, 10),
    completedThisMonth: parseInt(completedPeriod.rows[0].count, 10),
    slaComplianceRate:  parseFloat(sla.rows[0].rate) || 0,
    myTasksToday:       parseInt(myToday.rows[0].count, 10),
  }
}

async function getTraditionalCharts(userId, role, from, to) {
  const isStaff = role === 'staff'
  const [weekly, workload, typeDistrib, overdueList, dueTodayList] = await Promise.all([

    isStaff
      ? query(`SELECT DATE_TRUNC('week', completed_at)::date AS week_start, COUNT(*) AS completed FROM tasks WHERE assigned_to = $1 AND status = 'completed' AND completed_at::date BETWEEN $2 AND $3 GROUP BY week_start ORDER BY week_start`, [userId, from, to])
      : query(`SELECT DATE_TRUNC('week', completed_at)::date AS week_start, COUNT(*) AS completed FROM tasks WHERE status = 'completed' AND completed_at::date BETWEEN $1 AND $2 GROUP BY week_start ORDER BY week_start`, [from, to]),

    isStaff
      ? query(`SELECT u.name, COUNT(t.id) FILTER (WHERE t.status != 'completed') AS open_count, COUNT(t.id) FILTER (WHERE t.status = 'completed' AND t.completed_at::date BETWEEN $2 AND $3) AS completed_period FROM users u LEFT JOIN tasks t ON t.assigned_to = u.id WHERE u.id = $1 GROUP BY u.id, u.name`, [userId, from, to])
      : query(`SELECT u.name, COUNT(t.id) FILTER (WHERE t.status != 'completed') AS open_count, COUNT(t.id) FILTER (WHERE t.status = 'completed' AND t.completed_at::date BETWEEN $1 AND $2) AS completed_period FROM users u LEFT JOIN tasks t ON t.assigned_to = u.id WHERE u.role = 'staff' AND u.status = 'active' GROUP BY u.id, u.name ORDER BY (COUNT(t.id) FILTER (WHERE t.status != 'completed') + COUNT(t.id) FILTER (WHERE t.status = 'completed' AND t.completed_at::date BETWEEN $1 AND $2)) DESC LIMIT 8`, [from, to]),

    isStaff
      ? query(`SELECT COALESCE(tt.group_name, 'Khác') AS name, COUNT(*) AS value FROM tasks t LEFT JOIN task_types tt ON tt.id = t.task_type_id WHERE t.assigned_to = $1 AND t.created_at::date BETWEEN $2 AND $3 GROUP BY COALESCE(tt.group_name, 'Khác') ORDER BY COUNT(*) DESC LIMIT 8`, [userId, from, to])
      : query(`SELECT COALESCE(tt.group_name, 'Khác') AS name, COUNT(*) AS value FROM tasks t LEFT JOIN task_types tt ON tt.id = t.task_type_id WHERE t.created_at::date BETWEEN $1 AND $2 GROUP BY COALESCE(tt.group_name, 'Khác') ORDER BY COUNT(*) DESC LIMIT 8`, [from, to]),

    isStaff
      ? query(`SELECT t.id, t.title, t.due_date, t.created_at, t.status, t.priority, c.name AS company_name, u.name AS assigned_to_name, (CURRENT_DATE - t.due_date)::int AS days_overdue FROM tasks t LEFT JOIN companies c ON c.id = t.company_id LEFT JOIN users u ON u.id = t.assigned_to WHERE t.assigned_to = $1 AND t.due_date < CURRENT_DATE AND t.status != 'completed' ORDER BY t.due_date ASC LIMIT 10`, [userId])
      : query(`SELECT t.id, t.title, t.due_date, t.created_at, t.status, t.priority, c.name AS company_name, u.name AS assigned_to_name, (CURRENT_DATE - t.due_date)::int AS days_overdue FROM tasks t LEFT JOIN companies c ON c.id = t.company_id LEFT JOIN users u ON u.id = t.assigned_to WHERE t.due_date < CURRENT_DATE AND t.status != 'completed' ORDER BY t.due_date ASC LIMIT 10`),

    isStaff
      ? query(`SELECT t.id, t.title, t.due_date, t.created_at, t.status, t.priority, c.name AS company_name, u.name AS assigned_to_name FROM tasks t LEFT JOIN companies c ON c.id = t.company_id LEFT JOIN users u ON u.id = t.assigned_to WHERE t.assigned_to = $1 AND t.due_date = CURRENT_DATE AND t.status != 'completed' ORDER BY t.priority DESC LIMIT 20`, [userId])
      : query(`SELECT t.id, t.title, t.due_date, t.created_at, t.status, t.priority, c.name AS company_name, u.name AS assigned_to_name FROM tasks t LEFT JOIN companies c ON c.id = t.company_id LEFT JOIN users u ON u.id = t.assigned_to WHERE t.due_date = CURRENT_DATE AND t.status != 'completed' ORDER BY t.priority DESC LIMIT 20`),
  ])

  return {
    weeklyTrend: weekly.rows.map((r) => ({
      week: r.week_start, completed: parseInt(r.completed, 10),
    })),
    staffWorkload: workload.rows.map((r) => ({
      name: r.name, open: parseInt(r.open_count, 10), completed: parseInt(r.completed_period, 10),
    })),
    taskTypeDistrib: typeDistrib.rows.map((r) => ({
      name: r.name, value: parseInt(r.value, 10),
    })),
    overdueList: overdueList.rows.map((r) => ({
      id: r.id, title: r.title, dueDate: r.due_date, createdAt: r.created_at,
      status: r.status, priority: r.priority,
      companyName: r.company_name, assignedToName: r.assigned_to_name,
      daysOverdue: r.days_overdue,
    })),
    dueTodayList: dueTodayList.rows.map((r) => ({
      id: r.id, title: r.title, dueDate: r.due_date, createdAt: r.created_at,
      status: r.status, priority: r.priority,
      companyName: r.company_name, assignedToName: r.assigned_to_name,
    })),
  }
}

// ─── CDR ─────────────────────────────────────────────────────────────────────

const CDR_STAFF_COMPANY_FILTER = `
  AND company_id IN (SELECT DISTINCT company_id FROM tasks WHERE assigned_to = $1 AND status != 'completed')
`

async function getCdrSummary(userId, role) {
  const isStaff = role === 'staff'
  const { rows } = await (isStaff
    ? query(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
          COUNT(*) FILTER (WHERE status = 'overdue')  AS overdue,
          COUNT(*) FILTER (WHERE status = 'received') AS received
        FROM client_document_requests WHERE 1=1 ${CDR_STAFF_COMPANY_FILTER}
      `, [userId])
    : query(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
          COUNT(*) FILTER (WHERE status = 'overdue')  AS overdue,
          COUNT(*) FILTER (WHERE status = 'received') AS received
        FROM client_document_requests
      `)
  )
  const r = rows[0] ?? {}
  return {
    openTasks:          parseInt(r.pending  ?? 0, 10),
    overdueTasks:       parseInt(r.overdue  ?? 0, 10),
    completedThisMonth: parseInt(r.received ?? 0, 10),
    totalItems:         parseInt(r.total    ?? 0, 10),
    activeCompanies:    null,
    slaComplianceRate:  null,
    myTasksToday:       0,
  }
}

async function getCdrCharts(userId, role, from, to) {
  const isStaff = role === 'staff'
  const [weekly, workload, typeDistrib, overdueList, dueTodayList] = await Promise.all([

    // weeklyTrend: received per week
    isStaff
      ? query(`
          SELECT DATE_TRUNC('week', updated_at)::date AS week_start, COUNT(*) AS completed
          FROM client_document_requests
          WHERE status = 'received' AND updated_at::date BETWEEN $2 AND $3
            ${CDR_STAFF_COMPANY_FILTER}
          GROUP BY week_start ORDER BY week_start
        `, [userId, from, to])
      : query(`
          SELECT DATE_TRUNC('week', updated_at)::date AS week_start, COUNT(*) AS completed
          FROM client_document_requests
          WHERE status = 'received' AND updated_at::date BETWEEN $1 AND $2
          GROUP BY week_start ORDER BY week_start
        `, [from, to]),

    // staffWorkload: CDR per company (open=pending+overdue, completed=received)
    isStaff
      ? query(`
          SELECT c.name,
            COUNT(*) FILTER (WHERE cdr.status IN ('pending','overdue')) AS open,
            COUNT(*) FILTER (WHERE cdr.status = 'received' AND cdr.updated_at::date BETWEEN $2 AND $3) AS completed
          FROM client_document_requests cdr
          JOIN companies c ON c.id = cdr.company_id
          WHERE cdr.company_id IN (SELECT DISTINCT company_id FROM tasks WHERE assigned_to = $1 AND status != 'completed')
          GROUP BY c.id, c.name ORDER BY c.name
        `, [userId, from, to])
      : query(`
          SELECT c.name,
            COUNT(*) FILTER (WHERE cdr.status IN ('pending','overdue')) AS open,
            COUNT(*) FILTER (WHERE cdr.status = 'received' AND cdr.updated_at::date BETWEEN $1 AND $2) AS completed
          FROM client_document_requests cdr
          JOIN companies c ON c.id = cdr.company_id
          GROUP BY c.id, c.name
          ORDER BY (COUNT(*) FILTER (WHERE cdr.status IN ('pending','overdue')) + COUNT(*) FILTER (WHERE cdr.status = 'received' AND cdr.updated_at::date BETWEEN $1 AND $2)) DESC
          LIMIT 8
        `, [from, to]),

    // taskTypeDistrib: CDR by period_label
    isStaff
      ? query(`
          SELECT COALESCE(period_label, 'Không xác định') AS name, COUNT(*) AS value
          FROM client_document_requests
          WHERE created_at::date BETWEEN $2 AND $3
            ${CDR_STAFF_COMPANY_FILTER}
          GROUP BY COALESCE(period_label, 'Không xác định')
          ORDER BY COUNT(*) DESC LIMIT 8
        `, [userId, from, to])
      : query(`
          SELECT COALESCE(period_label, 'Không xác định') AS name, COUNT(*) AS value
          FROM client_document_requests
          WHERE created_at::date BETWEEN $1 AND $2
          GROUP BY COALESCE(period_label, 'Không xác định')
          ORDER BY COUNT(*) DESC LIMIT 8
        `, [from, to]),

    // overdueList: overdue CDRs
    isStaff
      ? query(`
          SELECT cdr.id, cdr.document_name AS title, cdr.deadline_date AS due_date,
            c.name AS company_name,
            (CURRENT_DATE - cdr.deadline_date)::int AS days_overdue
          FROM client_document_requests cdr
          JOIN companies c ON c.id = cdr.company_id
          WHERE cdr.status = 'overdue' AND cdr.deadline_date IS NOT NULL
            AND cdr.company_id IN (SELECT DISTINCT company_id FROM tasks WHERE assigned_to = $1 AND status != 'completed')
          ORDER BY cdr.deadline_date ASC LIMIT 10
        `, [userId])
      : query(`
          SELECT cdr.id, cdr.document_name AS title, cdr.deadline_date AS due_date,
            c.name AS company_name,
            (CURRENT_DATE - cdr.deadline_date)::int AS days_overdue
          FROM client_document_requests cdr
          JOIN companies c ON c.id = cdr.company_id
          WHERE cdr.status = 'overdue' AND cdr.deadline_date IS NOT NULL
          ORDER BY cdr.deadline_date ASC LIMIT 10
        `),

    // dueTodayList: CDRs with deadline today
    isStaff
      ? query(`
          SELECT cdr.id, cdr.document_name AS title, cdr.deadline_date AS due_date,
            c.name AS company_name, cdr.created_at
          FROM client_document_requests cdr
          JOIN companies c ON c.id = cdr.company_id
          WHERE cdr.deadline_date = CURRENT_DATE
            AND cdr.status NOT IN ('received', 'not_required')
            AND cdr.company_id IN (SELECT DISTINCT company_id FROM tasks WHERE assigned_to = $1 AND status != 'completed')
          ORDER BY cdr.created_at ASC LIMIT 20
        `, [userId])
      : query(`
          SELECT cdr.id, cdr.document_name AS title, cdr.deadline_date AS due_date,
            c.name AS company_name, cdr.created_at
          FROM client_document_requests cdr
          JOIN companies c ON c.id = cdr.company_id
          WHERE cdr.deadline_date = CURRENT_DATE
            AND cdr.status NOT IN ('received', 'not_required')
          ORDER BY cdr.created_at ASC LIMIT 20
        `),
  ])

  return {
    weeklyTrend: weekly.rows.map((r) => ({
      week: r.week_start, completed: parseInt(r.completed, 10),
    })),
    staffWorkload: workload.rows.map((r) => ({
      name: r.name, open: parseInt(r.open, 10), completed: parseInt(r.completed, 10),
    })),
    taskTypeDistrib: typeDistrib.rows.map((r) => ({
      name: r.name, value: parseInt(r.value, 10),
    })),
    overdueList: overdueList.rows.map((r) => ({
      id: r.id, title: r.title, dueDate: r.due_date, createdAt: null,
      status: 'overdue', priority: null,
      companyName: r.company_name, assignedToName: null,
      daysOverdue: r.days_overdue,
    })),
    dueTodayList: dueTodayList.rows.map((r) => ({
      id: r.id, title: r.title, dueDate: r.due_date, createdAt: r.created_at,
      status: 'pending', priority: null,
      companyName: r.company_name, assignedToName: null,
    })),
  }
}

// ─── Internal Assignments ─────────────────────────────────────────────────────

async function getIaSummary(userId, role) {
  const isStaff = role === 'staff'
  const { rows } = await (isStaff
    ? query(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE ia.status = 'draft')     AS draft,
          COUNT(*) FILTER (WHERE ia.status = 'active')    AS active,
          COUNT(*) FILTER (WHERE ia.status = 'done')      AS done,
          COUNT(*) FILTER (WHERE ia.status NOT IN ('done','cancelled') AND ia.deadline_date < CURRENT_DATE) AS overdue
        FROM internal_assignments ia
        JOIN internal_assignment_assignees iaa ON iaa.assignment_id = ia.id
        WHERE iaa.user_id = $1
      `, [userId])
    : query(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'draft')     AS draft,
          COUNT(*) FILTER (WHERE status = 'active')    AS active,
          COUNT(*) FILTER (WHERE status = 'done')      AS done,
          COUNT(*) FILTER (WHERE status NOT IN ('done','cancelled') AND deadline_date < CURRENT_DATE) AS overdue
        FROM internal_assignments
      `)
  )
  const r = rows[0] ?? {}
  return {
    openTasks:          parseInt(r.active  ?? 0, 10),
    overdueTasks:       parseInt(r.overdue ?? 0, 10),
    completedThisMonth: parseInt(r.done    ?? 0, 10),
    draftCount:         parseInt(r.draft   ?? 0, 10),
    totalItems:         parseInt(r.total   ?? 0, 10),
    activeCompanies:    null,
    slaComplianceRate:  null,
    myTasksToday:       0,
  }
}

async function getIaCharts(userId, role, from, to) {
  const isStaff = role === 'staff'
  const [weekly, workload, typeDistrib, overdueList, dueTodayList] = await Promise.all([

    // weeklyTrend: done IAs per week
    isStaff
      ? query(`
          SELECT DATE_TRUNC('week', ia.closed_at)::date AS week_start, COUNT(*) AS completed
          FROM internal_assignments ia
          JOIN internal_assignment_assignees iaa ON iaa.assignment_id = ia.id
          WHERE iaa.user_id = $1 AND ia.status = 'done'
            AND ia.closed_at::date BETWEEN $2 AND $3
          GROUP BY week_start ORDER BY week_start
        `, [userId, from, to])
      : query(`
          SELECT DATE_TRUNC('week', closed_at)::date AS week_start, COUNT(*) AS completed
          FROM internal_assignments
          WHERE status = 'done' AND closed_at::date BETWEEN $1 AND $2
          GROUP BY week_start ORDER BY week_start
        `, [from, to]),

    // staffWorkload: IA per assignee (open=active, completed=done in period)
    isStaff
      ? query(`
          SELECT u.name,
            COUNT(ia.id) FILTER (WHERE ia.status = 'active') AS open,
            COUNT(ia.id) FILTER (WHERE ia.status = 'done' AND ia.closed_at::date BETWEEN $2 AND $3) AS completed
          FROM users u
          JOIN internal_assignment_assignees iaa ON iaa.user_id = u.id
          JOIN internal_assignments ia ON ia.id = iaa.assignment_id
          WHERE u.id = $1
          GROUP BY u.id, u.name
        `, [userId, from, to])
      : query(`
          SELECT u.name,
            COUNT(ia.id) FILTER (WHERE ia.status = 'active') AS open,
            COUNT(ia.id) FILTER (WHERE ia.status = 'done' AND ia.closed_at::date BETWEEN $1 AND $2) AS completed
          FROM users u
          JOIN internal_assignment_assignees iaa ON iaa.user_id = u.id
          JOIN internal_assignments ia ON ia.id = iaa.assignment_id
          WHERE u.role = 'staff' AND u.status = 'active'
          GROUP BY u.id, u.name
          ORDER BY (COUNT(ia.id) FILTER (WHERE ia.status = 'active') + COUNT(ia.id) FILTER (WHERE ia.status = 'done' AND ia.closed_at::date BETWEEN $1 AND $2)) DESC
          LIMIT 8
        `, [from, to]),

    // taskTypeDistrib: IA by company
    isStaff
      ? query(`
          SELECT COALESCE(c.name, 'Không có KH') AS name, COUNT(*) AS value
          FROM internal_assignments ia
          LEFT JOIN companies c ON c.id = ia.company_id
          JOIN internal_assignment_assignees iaa ON iaa.assignment_id = ia.id
          WHERE iaa.user_id = $1 AND ia.created_at::date BETWEEN $2 AND $3
          GROUP BY COALESCE(c.name, 'Không có KH')
          ORDER BY COUNT(*) DESC LIMIT 8
        `, [userId, from, to])
      : query(`
          SELECT COALESCE(c.name, 'Không có KH') AS name, COUNT(*) AS value
          FROM internal_assignments ia
          LEFT JOIN companies c ON c.id = ia.company_id
          WHERE ia.created_at::date BETWEEN $1 AND $2
          GROUP BY COALESCE(c.name, 'Không có KH')
          ORDER BY COUNT(*) DESC LIMIT 8
        `, [from, to]),

    // overdueList: overdue IAs
    isStaff
      ? query(`
          SELECT ia.id, ia.title, ia.deadline_date AS due_date,
            c.name AS company_name, ia.priority,
            (CURRENT_DATE - ia.deadline_date)::int AS days_overdue,
            STRING_AGG(DISTINCT u.name, ', ') AS assigned_to_name
          FROM internal_assignments ia
          LEFT JOIN companies c ON c.id = ia.company_id
          JOIN internal_assignment_assignees iaa ON iaa.assignment_id = ia.id
          LEFT JOIN users u ON u.id = iaa.user_id
          WHERE ia.status NOT IN ('done','cancelled')
            AND ia.deadline_date IS NOT NULL AND ia.deadline_date < CURRENT_DATE
            AND ia.id IN (SELECT assignment_id FROM internal_assignment_assignees WHERE user_id = $1)
          GROUP BY ia.id, ia.title, ia.deadline_date, c.name, ia.priority
          ORDER BY ia.deadline_date ASC LIMIT 10
        `, [userId])
      : query(`
          SELECT ia.id, ia.title, ia.deadline_date AS due_date,
            c.name AS company_name, ia.priority,
            (CURRENT_DATE - ia.deadline_date)::int AS days_overdue,
            STRING_AGG(DISTINCT u.name, ', ') AS assigned_to_name
          FROM internal_assignments ia
          LEFT JOIN companies c ON c.id = ia.company_id
          LEFT JOIN internal_assignment_assignees iaa ON iaa.assignment_id = ia.id
          LEFT JOIN users u ON u.id = iaa.user_id
          WHERE ia.status NOT IN ('done','cancelled')
            AND ia.deadline_date IS NOT NULL AND ia.deadline_date < CURRENT_DATE
          GROUP BY ia.id, ia.title, ia.deadline_date, c.name, ia.priority
          ORDER BY ia.deadline_date ASC LIMIT 10
        `),

    // dueTodayList: IAs due today
    isStaff
      ? query(`
          SELECT ia.id, ia.title, ia.deadline_date AS due_date,
            c.name AS company_name, ia.priority, ia.created_at,
            STRING_AGG(DISTINCT u.name, ', ') AS assigned_to_name
          FROM internal_assignments ia
          LEFT JOIN companies c ON c.id = ia.company_id
          JOIN internal_assignment_assignees iaa ON iaa.assignment_id = ia.id
          LEFT JOIN users u ON u.id = iaa.user_id
          WHERE ia.deadline_date = CURRENT_DATE
            AND ia.status NOT IN ('done','cancelled')
            AND ia.id IN (SELECT assignment_id FROM internal_assignment_assignees WHERE user_id = $1)
          GROUP BY ia.id, ia.title, ia.deadline_date, c.name, ia.priority, ia.created_at
          ORDER BY ia.priority DESC LIMIT 20
        `, [userId])
      : query(`
          SELECT ia.id, ia.title, ia.deadline_date AS due_date,
            c.name AS company_name, ia.priority, ia.created_at,
            STRING_AGG(DISTINCT u.name, ', ') AS assigned_to_name
          FROM internal_assignments ia
          LEFT JOIN companies c ON c.id = ia.company_id
          LEFT JOIN internal_assignment_assignees iaa ON iaa.assignment_id = ia.id
          LEFT JOIN users u ON u.id = iaa.user_id
          WHERE ia.deadline_date = CURRENT_DATE
            AND ia.status NOT IN ('done','cancelled')
          GROUP BY ia.id, ia.title, ia.deadline_date, c.name, ia.priority, ia.created_at
          ORDER BY ia.priority DESC LIMIT 20
        `),
  ])

  return {
    weeklyTrend: weekly.rows.map((r) => ({
      week: r.week_start, completed: parseInt(r.completed, 10),
    })),
    staffWorkload: workload.rows.map((r) => ({
      name: r.name, open: parseInt(r.open, 10), completed: parseInt(r.completed, 10),
    })),
    taskTypeDistrib: typeDistrib.rows.map((r) => ({
      name: r.name, value: parseInt(r.value, 10),
    })),
    overdueList: overdueList.rows.map((r) => ({
      id: r.id, title: r.title, dueDate: r.due_date, createdAt: null,
      status: null, priority: r.priority,
      companyName: r.company_name, assignedToName: r.assigned_to_name,
      daysOverdue: r.days_overdue,
    })),
    dueTodayList: dueTodayList.rows.map((r) => ({
      id: r.id, title: r.title, dueDate: r.due_date, createdAt: r.created_at,
      status: null, priority: r.priority,
      companyName: r.company_name, assignedToName: r.assigned_to_name,
    })),
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

async function getSummary(userId, role, from, to, taskType) {
  if (taskType === 'cdr') return getCdrSummary(userId, role)
  if (taskType === 'ia')  return getIaSummary(userId, role)
  return getTraditionalSummary(userId, role, from, to)
}

async function getCharts(userId, role, from, to, taskType) {
  if (taskType === 'cdr') return getCdrCharts(userId, role, from, to)
  if (taskType === 'ia')  return getIaCharts(userId, role, from, to)
  return getTraditionalCharts(userId, role, from, to)
}

module.exports = { getSummary, getCharts }

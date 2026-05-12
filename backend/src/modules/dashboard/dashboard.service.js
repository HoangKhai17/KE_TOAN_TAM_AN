const { query } = require('../../config/db')

async function getSummary(userId, role, from, to) {
  const [companies, open, overdue, completedPeriod, sla, myToday] = await Promise.all([
    query(`SELECT COUNT(*) FROM companies WHERE status = 'active'`),
    query(`SELECT COUNT(*) FROM tasks WHERE status != 'completed'`),
    query(`SELECT COUNT(*) FROM tasks WHERE due_date < CURRENT_DATE AND status != 'completed'`),
    query(`
      SELECT COUNT(*) FROM tasks
      WHERE status = 'completed' AND completed_at::date BETWEEN $1 AND $2
    `, [from, to]),
    query(`
      SELECT ROUND(
        COUNT(*) FILTER (WHERE completed_at::date <= due_date) * 100.0 / NULLIF(COUNT(*), 0), 1
      ) AS rate
      FROM tasks
      WHERE status = 'completed' AND completed_at::date BETWEEN $1 AND $2
    `, [from, to]),
    role === 'staff'
      ? query(
          `SELECT COUNT(*) FROM tasks
           WHERE assigned_to = $1 AND due_date = CURRENT_DATE AND status != 'completed'`,
          [userId]
        )
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

async function getCharts(from, to) {
  const [weekly, workload, typeDistrib, overdueList, dueTodayList] = await Promise.all([
    // Completion trend — weekly buckets within range
    query(`
      SELECT DATE_TRUNC('week', completed_at)::date AS week_start, COUNT(*) AS completed
      FROM tasks
      WHERE status = 'completed' AND completed_at::date BETWEEN $1 AND $2
      GROUP BY week_start
      ORDER BY week_start
    `, [from, to]),

    // Staff workload: open (always current) + completed in range
    query(`
      SELECT u.name,
        COUNT(t.id) FILTER (WHERE t.status != 'completed')                                               AS open_count,
        COUNT(t.id) FILTER (WHERE t.status = 'completed' AND t.completed_at::date BETWEEN $1 AND $2)    AS completed_period
      FROM users u
      LEFT JOIN tasks t ON t.assigned_to = u.id
      WHERE u.role = 'staff' AND u.status = 'active'
      GROUP BY u.id, u.name
      ORDER BY (
        COUNT(t.id) FILTER (WHERE t.status != 'completed') +
        COUNT(t.id) FILTER (WHERE t.status = 'completed' AND t.completed_at::date BETWEEN $1 AND $2)
      ) DESC
      LIMIT 8
    `, [from, to]),

    // Task type distribution within range
    query(`
      SELECT COALESCE(tt.group_name, 'Khác') AS name, COUNT(*) AS value
      FROM tasks t
      LEFT JOIN task_types tt ON tt.id = t.task_type_id
      WHERE t.created_at::date BETWEEN $1 AND $2
      GROUP BY COALESCE(tt.group_name, 'Khác')
      ORDER BY COUNT(*) DESC
      LIMIT 8
    `, [from, to]),

    // Top 10 most overdue open tasks — always current state
    query(`
      SELECT t.id, t.title, t.due_date, t.created_at, t.status, t.priority,
        c.name AS company_name, u.name AS assigned_to_name,
        (CURRENT_DATE - t.due_date)::int AS days_overdue
      FROM tasks t
      LEFT JOIN companies c ON c.id = t.company_id
      LEFT JOIN users     u ON u.id = t.assigned_to
      WHERE t.due_date < CURRENT_DATE AND t.status != 'completed'
      ORDER BY t.due_date ASC
      LIMIT 10
    `),

    // Tasks due today — always current state
    query(`
      SELECT t.id, t.title, t.due_date, t.created_at, t.status, t.priority,
        c.name AS company_name, u.name AS assigned_to_name
      FROM tasks t
      LEFT JOIN companies c ON c.id = t.company_id
      LEFT JOIN users     u ON u.id = t.assigned_to
      WHERE t.due_date = CURRENT_DATE AND t.status != 'completed'
      ORDER BY t.priority DESC
      LIMIT 20
    `),
  ])

  return {
    weeklyTrend: weekly.rows.map((r) => ({
      week:      r.week_start,
      completed: parseInt(r.completed, 10),
    })),
    staffWorkload: workload.rows.map((r) => ({
      name:      r.name,
      open:      parseInt(r.open_count, 10),
      completed: parseInt(r.completed_period, 10),
    })),
    taskTypeDistrib: typeDistrib.rows.map((r) => ({
      name:  r.name,
      value: parseInt(r.value, 10),
    })),
    overdueList: overdueList.rows.map((r) => ({
      id:             r.id,
      title:          r.title,
      dueDate:        r.due_date,
      createdAt:      r.created_at,
      status:         r.status,
      priority:       r.priority,
      companyName:    r.company_name,
      assignedToName: r.assigned_to_name,
      daysOverdue:    r.days_overdue,
    })),
    dueTodayList: dueTodayList.rows.map((r) => ({
      id:             r.id,
      title:          r.title,
      dueDate:        r.due_date,
      createdAt:      r.created_at,
      status:         r.status,
      priority:       r.priority,
      companyName:    r.company_name,
      assignedToName: r.assigned_to_name,
    })),
  }
}

module.exports = { getSummary, getCharts }

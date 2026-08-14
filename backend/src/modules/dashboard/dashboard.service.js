'use strict'
const { query } = require('../../config/db')

// ─── Traditional tasks ────────────────────────────────────────────────────────

// Phạm vi task theo vai trò — GIỐNG HỆT trang Công việc (listTasks) để 2 nơi khớp số:
//   admin  → toàn bộ task (kể cả chưa giao cho ai)
//   staff  → việc ĐƯỢC GIAO cho mình, HOẶC thuộc công ty mình phụ trách (trừ task 'private'),
//            HOẶC được nhờ HỖ TRỢ. Alias bảng phải là `t`. userId luôn là $1 khi staff.
function taskRoleScope(role) {
  if (role !== 'staff') return ''
  return `AND (t.assigned_to = $1
      OR (t.visibility <> 'private' AND t.company_id IN (SELECT id FROM companies WHERE assigned_staff_id = $1))
      OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = t.id AND tc.user_id = $1))`
}

async function getTraditionalSummary(userId, role, from, to) {
  const isStaff = role === 'staff'
  const scope = taskRoleScope(role)
  // Lọc KỲ = OVERLAP khoảng ngày hiệu lực của task với [from, to] — ĐÚNG như trang Công việc:
  // COALESCE(start,due) neo task chỉ có 1 ngày; task không có ngày nào bị loại khỏi kỳ.
  const off = isStaff ? 1 : 0                // staff: $1=userId → from/to bắt đầu từ $2
  const overlap = `COALESCE(t.start_date, t.due_date) <= $${off + 1} AND COALESCE(t.due_date, t.start_date) >= $${off + 2}`
  const baseWhere = `(${overlap}) ${scope}`
  const pBase = isStaff ? [userId, to, from] : [to, from]

  const [companies, open, overdue, completedPeriod, myToday] = await Promise.all([
    // KH đang hợp tác — ảnh chụp hiện tại (không theo kỳ)
    isStaff
      ? query(`SELECT COUNT(DISTINCT company_id) AS count FROM tasks WHERE assigned_to = $1 AND status != 'completed'`, [userId])
      : query(`SELECT COUNT(*) AS count FROM companies WHERE status = 'active'`),

    // Đang mở / Quá hạn / Hoàn thành — ĐỀU lọc theo KỲ + phạm vi (khớp Tasks)
    query(`SELECT COUNT(*) AS count FROM tasks t WHERE ${baseWhere} AND t.status != 'completed'`, pBase),
    query(`SELECT COUNT(*) AS count FROM tasks t WHERE ${baseWhere} AND t.due_date < CURRENT_DATE AND t.status != 'completed'`, pBase),
    query(`SELECT COUNT(*) AS count FROM tasks t WHERE ${baseWhere} AND t.status = 'completed'`, pBase),

    // "Đến hạn hôm nay" — GIỐNG nút "Hôm nay" (Lịch làm việc hôm nay) ở trang Công việc:
    // chưa xong VÀ (đến hạn hôm nay/quá hạn trước → due_date<=today, HOẶC đã tới ngày bắt đầu
    // đang trong giai đoạn làm → start_date<=today). Ảnh chụp hiện tại (không theo kỳ tháng).
    query(`SELECT COUNT(*) AS count FROM tasks t
           WHERE t.status != 'completed' AND (t.due_date <= CURRENT_DATE OR t.start_date <= CURRENT_DATE) ${scope}`,
          isStaff ? [userId] : []),
  ])

  return {
    activeCompanies:    parseInt(companies.rows[0].count, 10),
    openTasks:          parseInt(open.rows[0].count, 10),
    overdueTasks:       parseInt(overdue.rows[0].count, 10),
    completedThisMonth: parseInt(completedPeriod.rows[0].count, 10),
    slaComplianceRate:  null,   // đã bỏ thẻ SLA
    dueToday:           parseInt(myToday.rows[0].count, 10),
    myTasksToday:       parseInt(myToday.rows[0].count, 10),
  }
}

async function getTraditionalCharts(userId, role, from, to) {
  const isStaff = role === 'staff'
  const scope = taskRoleScope(role)   // staff: $1 = userId
  // Overlap kỳ dùng chung cho biểu đồ tải công việc (khớp KPI + trang Công việc)
  const wl = isStaff
    ? `COALESCE(t.start_date, t.due_date) <= $3 AND COALESCE(t.due_date, t.start_date) >= $2`
    : `COALESCE(t.start_date, t.due_date) <= $2 AND COALESCE(t.due_date, t.start_date) >= $1`
  const [weekly, workload, typeDistrib, overdueList, dueTodayList] = await Promise.all([

    // Xu hướng hoàn thành — theo NGÀY trong đúng kỳ [from, to] (generate_series lấp 0 cho
    // ngày không có việc); mốc thời gian = completed_at. KHÔNG gom tuần (tránh kéo về tháng trước).
    isStaff
      ? query(`SELECT gs::date AS week_start, COALESCE(c.cnt, 0) AS completed
               FROM generate_series($2::date, $3::date, interval '1 day') gs
               LEFT JOIN (SELECT t.completed_at::date AS d, COUNT(*) AS cnt FROM tasks t
                          WHERE t.status = 'completed' AND t.completed_at::date BETWEEN $2 AND $3 ${scope}
                          GROUP BY t.completed_at::date) c ON c.d = gs::date
               ORDER BY week_start`, [userId, from, to])
      : query(`SELECT gs::date AS week_start, COALESCE(c.cnt, 0) AS completed
               FROM generate_series($1::date, $2::date, interval '1 day') gs
               LEFT JOIN (SELECT t.completed_at::date AS d, COUNT(*) AS cnt FROM tasks t
                          WHERE t.status = 'completed' AND t.completed_at::date BETWEEN $1 AND $2
                          GROUP BY t.completed_at::date) c ON c.d = gs::date
               ORDER BY week_start`, [from, to]),

    // Tải công việc nhân viên — open/hoàn thành ĐỀU lọc theo KỲ (overlap) + trạng thái, khớp KPI
    isStaff
      ? query(`SELECT u.name,
                 COUNT(t.id) FILTER (WHERE t.status != 'completed' AND ${wl}) AS open_count,
                 COUNT(t.id) FILTER (WHERE t.status = 'completed' AND ${wl}) AS completed_period
               FROM users u LEFT JOIN tasks t ON t.assigned_to = u.id
               WHERE u.id = $1 GROUP BY u.id, u.name`, [userId, from, to])
      : query(`SELECT u.name,
                 COUNT(t.id) FILTER (WHERE t.status != 'completed' AND ${wl}) AS open_count,
                 COUNT(t.id) FILTER (WHERE t.status = 'completed' AND ${wl}) AS completed_period
               FROM users u LEFT JOIN tasks t ON t.assigned_to = u.id
               WHERE u.role = 'staff' AND u.status = 'active' GROUP BY u.id, u.name
               ORDER BY (COUNT(t.id) FILTER (WHERE t.status != 'completed' AND ${wl}) + COUNT(t.id) FILTER (WHERE t.status = 'completed' AND ${wl})) DESC LIMIT 8`, [from, to]),

    // Phân loại công việc theo nhóm — lọc theo KỲ (overlap) + phạm vi, khớp Tổng ở trang Công việc
    isStaff
      ? query(`SELECT COALESCE(tt.group_name, 'Khác') AS name, COUNT(*) AS value FROM tasks t LEFT JOIN task_types tt ON tt.id = t.task_type_id WHERE (${wl}) ${scope} GROUP BY COALESCE(tt.group_name, 'Khác') ORDER BY COUNT(*) DESC LIMIT 8`, [userId, from, to])
      : query(`SELECT COALESCE(tt.group_name, 'Khác') AS name, COUNT(*) AS value FROM tasks t LEFT JOIN task_types tt ON tt.id = t.task_type_id WHERE (${wl}) GROUP BY COALESCE(tt.group_name, 'Khác') ORDER BY COUNT(*) DESC LIMIT 8`, [from, to]),

    // Danh sách "Việc quá hạn" (actionable) — LỌC THEO KỲ (overlap) + phạm vi, KHỚP thẻ KPI "Quá hạn".
    // (Trước đây là ảnh chụp toàn thời gian → hiện cả việc tháng khác; nay đồng bộ với kỳ đang chọn.)
    isStaff
      ? query(`SELECT t.id, t.title, t.due_date, t.created_at, t.status, t.priority, c.name AS company_name, u.name AS assigned_to_name, (CURRENT_DATE - t.due_date)::int AS days_overdue FROM tasks t LEFT JOIN companies c ON c.id = t.company_id LEFT JOIN users u ON u.id = t.assigned_to WHERE (${wl}) ${scope} AND t.due_date < CURRENT_DATE AND t.status != 'completed' ORDER BY t.due_date ASC LIMIT 10`, [userId, from, to])
      : query(`SELECT t.id, t.title, t.due_date, t.created_at, t.status, t.priority, c.name AS company_name, u.name AS assigned_to_name, (CURRENT_DATE - t.due_date)::int AS days_overdue FROM tasks t LEFT JOIN companies c ON c.id = t.company_id LEFT JOIN users u ON u.id = t.assigned_to WHERE (${wl}) AND t.due_date < CURRENT_DATE AND t.status != 'completed' ORDER BY t.due_date ASC LIMIT 10`, [from, to]),

    // Danh sách "Đến hạn hôm nay" (actionable) — KHỚP thẻ KPI: GIỐNG nút "Hôm nay" ở trang CV
    // (chưa xong VÀ due_date<=today HOẶC start_date<=today) + phạm vi vai trò. Ưu tiên việc trễ nhất trước.
    isStaff
      ? query(`SELECT t.id, t.title, t.due_date, t.created_at, t.status, t.priority, c.name AS company_name, u.name AS assigned_to_name FROM tasks t LEFT JOIN companies c ON c.id = t.company_id LEFT JOIN users u ON u.id = t.assigned_to WHERE t.status != 'completed' AND (t.due_date <= CURRENT_DATE OR t.start_date <= CURRENT_DATE) ${scope} ORDER BY t.due_date ASC NULLS LAST, t.priority DESC LIMIT 20`, [userId])
      : query(`SELECT t.id, t.title, t.due_date, t.created_at, t.status, t.priority, c.name AS company_name, u.name AS assigned_to_name FROM tasks t LEFT JOIN companies c ON c.id = t.company_id LEFT JOIN users u ON u.id = t.assigned_to WHERE t.status != 'completed' AND (t.due_date <= CURRENT_DATE OR t.start_date <= CURRENT_DATE) ORDER BY t.due_date ASC NULLS LAST, t.priority DESC LIMIT 20`, []),
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

// Staff chỉ thấy yêu cầu MÌNH tạo (requested_by) — khớp mô hình quyền của trang Yêu cầu KH.
const CDR_STAFF_FILTER = `AND requested_by = $1`

async function getCdrSummary(userId, role, from, to) {
  const isStaff = role === 'staff'
  // pending/overdue/total = ảnh chụp hiện tại; received = "đã nhận" TRONG khoảng range (đồng bộ biểu đồ)
  const { rows } = await (isStaff
    ? query(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
          COUNT(*) FILTER (WHERE status = 'overdue')  AS overdue,
          COUNT(*) FILTER (WHERE status = 'received' AND updated_at::date BETWEEN $2 AND $3) AS received
        FROM client_document_requests WHERE 1=1 ${CDR_STAFF_FILTER}
      `, [userId, from, to])
    : query(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
          COUNT(*) FILTER (WHERE status = 'overdue')  AS overdue,
          COUNT(*) FILTER (WHERE status = 'received' AND updated_at::date BETWEEN $1 AND $2) AS received
        FROM client_document_requests
      `, [from, to])
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
            ${CDR_STAFF_FILTER}
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
          WHERE cdr.requested_by = $1
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
            ${CDR_STAFF_FILTER}
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
            AND cdr.requested_by = $1
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
            AND cdr.requested_by = $1
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

async function getIaSummary(userId, role, from, to) {
  const isStaff = role === 'staff'
  // draft/active/overdue/total = ảnh chụp hiện tại; done = hoàn thành TRONG khoảng range (đồng bộ biểu đồ)
  const { rows } = await (isStaff
    ? query(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE ia.status = 'draft')     AS draft,
          COUNT(*) FILTER (WHERE ia.status = 'active')    AS active,
          COUNT(*) FILTER (WHERE ia.status = 'done' AND ia.closed_at::date BETWEEN $2 AND $3) AS done,
          COUNT(*) FILTER (WHERE ia.status NOT IN ('done','cancelled') AND ia.deadline_date < CURRENT_DATE) AS overdue
        FROM internal_assignments ia
        JOIN internal_assignment_assignees iaa ON iaa.assignment_id = ia.id
        WHERE iaa.user_id = $1
      `, [userId, from, to])
    : query(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'draft')     AS draft,
          COUNT(*) FILTER (WHERE status = 'active')    AS active,
          COUNT(*) FILTER (WHERE status = 'done' AND closed_at::date BETWEEN $1 AND $2) AS done,
          COUNT(*) FILTER (WHERE status NOT IN ('done','cancelled') AND deadline_date < CURRENT_DATE) AS overdue
        FROM internal_assignments
      `, [from, to])
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
  if (taskType === 'cdr') return getCdrSummary(userId, role, from, to)
  if (taskType === 'ia')  return getIaSummary(userId, role, from, to)
  return getTraditionalSummary(userId, role, from, to)
}

async function getCharts(userId, role, from, to, taskType) {
  if (taskType === 'cdr') return getCdrCharts(userId, role, from, to)
  if (taskType === 'ia')  return getIaCharts(userId, role, from, to)
  return getTraditionalCharts(userId, role, from, to)
}

module.exports = { getSummary, getCharts }

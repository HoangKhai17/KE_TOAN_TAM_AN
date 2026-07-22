const { query } = require('../../config/db')
const audit    = require('../../lib/audit')
const activity = require('../../lib/activity')
const { canTransition } = require('./tasks.transitions')
const { checkBlockers } = require('./dependencies.service')
const { createAndEmit, emitData } = require('../../lib/notify')
const { countPendingByTask, listClientRequests } = require('../client-requests/clientRequests.service')
const enums = require('../../lib/enums')

function cdrToTaskDto(cdr) {
  return {
    id:             cdr.id,
    _type:          'client_request',
    title:          cdr.documentName,
    description:    cdr.description,
    companyId:      cdr.companyId,
    companyName:    cdr.companyName,
    taskTypeId:     null,
    taskTypeName:   null,
    customerTaskScheduleId: null,
    assignedTo:     cdr.requestedBy,
    assignedToName: cdr.requestedByName,
    assignedBy:     null,
    collaborators:  Array.isArray(cdr.collaborators) ? cdr.collaborators : [],
    status:         cdr.status,
    priority:       null,
    source:         'client_request',
    startDate:      null,
    dueDate:        cdr.deadlineDate,
    periodLabel:    cdr.periodLabel,
    completedAt:    cdr.receivedAt,
    onHoldReason:   null,
    slaDays:        null,
    actualHours:    null,
    checklistTotal: 0,
    checklistDone:  0,
    createdBy:      cdr.requestedBy,
    createdAt:      cdr.createdAt,
    updatedAt:      cdr.updatedAt,
    linkedTaskId:   cdr.taskId,
    linkedTaskTitle: cdr.taskTitle,
  }
}

const STATUS_LABEL = {
  pending:        'Chờ xử lý',
  in_progress:    'Đang xử lý',
  on_hold:        'Tạm hoãn',
  pending_review: 'Chờ duyệt',
  needs_revision: 'Cần xem lại',
  completed:      'Hoàn thành',
  cancelled:      'Đã huỷ',
}

function toDto(row) {
  return {
    id:                     row.id,
    title:                  row.title,
    description:            row.description ?? null,
    companyId:              row.company_id,
    companyName:            row.company_name ?? null,
    companyShortName:       row.company_short_name ?? null,
    companyAssignedStaffId: row.company_assigned_staff_id ?? null,
    taskTypeId:             row.task_type_id ?? null,
    taskTypeName:           row.task_type_name ?? null,
    customerTaskScheduleId: row.customer_task_schedule_id ?? null,
    // Có giá trị = nhân viên đã dùng lượt chỉnh của NGÀY ĐÓ → khoá riêng ngày đó
    staffStartAdjustedAt:   row.staff_start_adjusted_at ?? null,
    staffDueAdjustedAt:     row.staff_due_adjusted_at ?? null,
    assignedTo:             row.assigned_to ?? null,
    assignedToName:         row.assigned_to_name ?? null,
    assignedBy:             row.assigned_by ?? null,
    collaborators:          Array.isArray(row.collaborators) ? row.collaborators : [],
    status:                 row.status,
    priority:               row.priority,
    source:                 row.source,
    startDate:              row.start_date ?? null,
    dueDate:                row.due_date ?? null,
    periodLabel:            row.period_label ?? null,
    completedAt:            row.completed_at ?? null,
    onHoldReason:           row.on_hold_reason ?? null,
    slaDays:                row.sla_days ?? null,
    actualHours:            row.actual_hours ? parseFloat(row.actual_hours) : null,
    checklistTotal:         parseInt(row.checklist_total ?? 0, 10),
    checklistDone:          parseInt(row.checklist_done ?? 0, 10),
    latestComment:          row.latest_comment ?? null,
    latestCommentAt:        row.latest_comment_at ?? null,
    latestCommentBy:        row.latest_comment_by ?? null,
    createdBy:              row.created_by,
    createdByName:          row.created_by_name ?? null,
    createdAt:              row.created_at,
    updatedAt:              row.updated_at,
  }
}

const TASK_SELECT = `
  SELECT t.*,
         c.name       AS company_name,
         c.short_name AS company_short_name,
         c.assigned_staff_id AS company_assigned_staff_id,
         tt.name  AS task_type_name,
         ua.name  AS assigned_to_name,
         uc.name  AS created_by_name,
         cl.checklist_total,
         cl.checklist_done,
         lc.latest_comment,
         lc.latest_comment_at,
         lc.latest_comment_by,
         COALESCE(collab.list, '[]'::json) AS collaborators
  FROM tasks t
  LEFT JOIN companies  c  ON c.id  = t.company_id
  LEFT JOIN task_types tt ON tt.id = t.task_type_id
  LEFT JOIN users      ua ON ua.id = t.assigned_to
  LEFT JOIN users      uc ON uc.id = t.created_by
  LEFT JOIN LATERAL (
    -- Người hỗ trợ (collaborators) — owner vẫn nằm ở t.assigned_to, KHÔNG gộp vào đây.
    SELECT json_agg(json_build_object('id', u2.id, 'name', u2.name) ORDER BY u2.name) AS list
    FROM task_collaborators tc JOIN users u2 ON u2.id = tc.user_id
    WHERE tc.task_id = t.id
  ) collab ON TRUE
  LEFT JOIN LATERAL (
    -- Chỉ đếm mục "leaf": mục phụ (level 1) hoặc mục chính không có con.
    -- Mục chính CÓ con (level 0 ngay trước 1 level 1) là nhóm → không tính vào tiến độ.
    SELECT COUNT(*) FILTER (WHERE is_leaf)                  AS checklist_total,
           COUNT(*) FILTER (WHERE is_leaf AND is_completed) AS checklist_done
    FROM (
      SELECT is_completed,
             NOT (level = 0 AND COALESCE(LEAD(level) OVER (ORDER BY step_order, id), 0) = 1) AS is_leaf
      FROM task_checklist_items WHERE task_id = t.id
    ) z
  ) cl ON TRUE
  LEFT JOIN LATERAL (
    SELECT cm.content AS latest_comment, cm.created_at AS latest_comment_at, ucm.name AS latest_comment_by
    FROM task_comments cm JOIN users ucm ON ucm.id = cm.user_id
    WHERE cm.task_id = t.id
    ORDER BY cm.created_at DESC LIMIT 1
  ) lc ON TRUE`

// Nhân sự được truy cập 1 task khi: được GIAO (assigned_to), là nhân sự PHỤ TRÁCH
// công ty của task (companies.assigned_staff_id), HOẶC là NGƯỜI HỖ TRỢ task đó
// (task_collaborators). Nhận cả cờ `is_collaborator` (query rời) lẫn mảng
// `collaborators` (từ TASK_SELECT). Trả về false nếu không đủ quyền.
function staffOwnsOrManagesRow(row, staffId) {
  return row.assigned_to === staffId
    || row.company_assigned_staff_id === staffId
    || row.is_collaborator === true
    || (Array.isArray(row.collaborators) && row.collaborators.some((c) => c && c.id === staffId))
}

async function assertTaskAccess(taskId, user) {
  if (!user || user.role !== 'staff') return
  const { rows: [task] } = await query(
    `SELECT t.assigned_to,
            c.assigned_staff_id AS company_assigned_staff_id,
            EXISTS (SELECT 1 FROM task_collaborators tc
                    WHERE tc.task_id = t.id AND tc.user_id = $2) AS is_collaborator
     FROM tasks t LEFT JOIN companies c ON c.id = t.company_id
     WHERE t.id = $1`,
    [taskId, user.id]
  )
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 })
  if (!staffOwnsOrManagesRow(task, user.id)) {
    throw Object.assign(new Error('Bạn không có quyền thực hiện thao tác này'), { status: 403 })
  }
}

// Đồng bộ danh sách người hỗ trợ cho 1 task (diff insert/delete).
// - Loại bỏ trùng, loại bỏ OWNER khỏi danh sách (owner không phải collaborator).
// - Trả về { toAdd, toRemove } (mảng userId) để phía gọi gửi thông báo.
async function syncCollaborators(taskId, collaboratorIds, ownerId, actorId) {
  const desired = [...new Set((collaboratorIds || []).filter(Boolean))]
    .filter((id) => id !== ownerId)
  const desiredSet = new Set(desired)

  const { rows: currentRows } = await query(
    'SELECT user_id FROM task_collaborators WHERE task_id = $1', [taskId]
  )
  const current = new Set(currentRows.map((r) => r.user_id))

  const toAdd    = desired.filter((id) => !current.has(id))
  const toRemove = [...current].filter((id) => !desiredSet.has(id))

  for (const uid of toAdd) {
    await query(
      `INSERT INTO task_collaborators (task_id, user_id, added_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [taskId, uid, actorId]
    )
  }
  if (toRemove.length) {
    await query(
      'DELETE FROM task_collaborators WHERE task_id = $1 AND user_id = ANY($2::uuid[])',
      [taskId, toRemove]
    )
  }
  return { toAdd, toRemove }
}

// Gửi thông báo khi thêm/gỡ người hỗ trợ (bỏ qua chính người thao tác).
async function notifyCollaboratorChanges({ toAdd, toRemove }, task, actorId) {
  const jobs = []
  const label = `"${task.title}" — ${task.companyName || ''}`
  for (const uid of toAdd) {
    if (uid === actorId) continue
    jobs.push(createAndEmit(uid, 'task_assigned', 'Bạn được thêm hỗ trợ công việc', label, task.id))
  }
  for (const uid of toRemove) {
    if (uid === actorId) continue
    jobs.push(createAndEmit(uid, 'task_status_changed', 'Bạn không còn hỗ trợ công việc', `${label} — bạn đã được gỡ khỏi danh sách hỗ trợ`, task.id))
  }
  await Promise.all(jobs)
}

async function listTasks(filters = {}) {
  const {
    page = 1, limit = 20,
    companyId, assignedTo, createdBy, status, priority, source,
    dueDateFrom, dueDateTo, periodLabel, isOverdue, scheduleToday, search,
    sortBy = 'created_at', sortDir = 'desc',
    audience = 'internal',
    forceAssignedTo, staffScopeId, collaboratorIds,
  } = filters

  // Lọc "CV hỗ trợ": chỉ giữ task mà 1 trong các user chỉ định là NGƯỜI HỖ TRỢ.
  const collabArr = collaboratorIds == null
    ? null
    : (Array.isArray(collaboratorIds) ? collaboratorIds : [collaboratorIds]).filter(Boolean)
  const hasCollabFilter = Array.isArray(collabArr) && collabArr.length > 0

  const effectiveAssignedTo = forceAssignedTo ?? assignedTo

  // audience=client_request: return CDRs mapped to task-like shape.
  if (audience === 'client_request') {
    const cdrFilters = {
      page: parseInt(page, 10),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
      companyId,
      periodLabel,
      deadlineDateFrom: dueDateFrom,
      deadlineDateTo:   dueDateTo,
      sortBy: sortBy === 'due_date' ? 'deadline_date' : sortBy === 'priority' ? 'created_at' : sortBy,
      sortDir,
    }
    // Owner-filter (accountability) khi admin lọc theo nhân viên; else phạm vi staff = tạo HOẶC hỗ trợ.
    if (effectiveAssignedTo) cdrFilters.requestedBy = effectiveAssignedTo
    else if (staffScopeId)   cdrFilters.staffScopeId = staffScopeId
    if (hasCollabFilter)     cdrFilters.collaboratorIds = collabArr
    if (isOverdue === 'true' || isOverdue === true) cdrFilters.status = ['overdue', 'pending']
    const result = await listClientRequests(cdrFilters)
    return {
      tasks:        result.items.map(cdrToTaskDto),
      pagination:   result.pagination,
      statusCounts: {},
    }
  }

  // audience=all: fetch tasks + CDRs, merge and paginate in memory.
  if (audience === 'all') {
    const cdrScope = {}
    if (effectiveAssignedTo) cdrScope.requestedBy = effectiveAssignedTo
    else if (staffScopeId)   cdrScope.staffScopeId = staffScopeId
    if (hasCollabFilter)     cdrScope.collaboratorIds = collabArr
    const [tasksResult, cdrsResult] = await Promise.all([
      listTasks({ ...filters, audience: 'internal', page: 1, limit: 1000 }),
      listClientRequests({
        companyId, periodLabel,
        deadlineDateFrom: dueDateFrom, deadlineDateTo: dueDateTo,
        ...cdrScope,
        page: 1, limit: 1000,
      }),
    ])

    const allItems = [
      ...tasksResult.tasks,
      ...cdrsResult.items.map(cdrToTaskDto),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    const pageInt   = parseInt(page, 10)
    const limitInt  = Math.min(100, Math.max(1, parseInt(limit, 10)))
    const offset    = (pageInt - 1) * limitInt
    const total     = allItems.length

    return {
      tasks:        allItems.slice(offset, offset + limitInt),
      pagination:   { page: pageInt, limit: limitInt, total, totalPages: Math.ceil(total / limitInt) },
      statusCounts: tasksResult.statusCounts,
    }
  }

  const offset = (page - 1) * limit

  // Base conditions: all filters EXCEPT status (used for statusCounts)
  const baseConditions = ['1=1']
  const baseParams = []

  if (companyId && (!Array.isArray(companyId) || companyId.length > 0)) {
    const arr = Array.isArray(companyId) ? companyId : [companyId]
    baseParams.push(arr)
    baseConditions.push(`t.company_id = ANY($${baseParams.length}::uuid[])`)
  }
  if (effectiveAssignedTo && (!Array.isArray(effectiveAssignedTo) || effectiveAssignedTo.length > 0)) {
    const arr = Array.isArray(effectiveAssignedTo) ? effectiveAssignedTo : [effectiveAssignedTo]
    baseParams.push(arr)
    baseConditions.push(`t.assigned_to = ANY($${baseParams.length}::uuid[])`)
  }
  // Lọc theo NGƯỜI TẠO task (vd: admin xem tiến độ những việc chính mình tạo & giao cho staff).
  // Vẫn cộng dồn với staffScopeId nên không nới rộng phạm vi xem của nhân sự.
  if (createdBy && (!Array.isArray(createdBy) || createdBy.length > 0)) {
    const arr = Array.isArray(createdBy) ? createdBy : [createdBy]
    baseParams.push(arr)
    baseConditions.push(`t.created_by = ANY($${baseParams.length}::uuid[])`)
  }
  // Phạm vi nhân sự: việc ĐƯỢC GIAO cho mình, việc thuộc công ty mình PHỤ TRÁCH
  // (companies.assigned_staff_id), HOẶC việc mình được nhờ HỖ TRỢ (task_collaborators).
  // Nhờ vậy nhân sự quản lý công ty vẫn thấy việc đã nhờ đồng nghiệp khác hỗ trợ, và
  // người hỗ trợ cũng thấy được việc mình tham gia dù không phải người phụ trách.
  if (staffScopeId) {
    baseParams.push(staffScopeId)
    const p = baseParams.length
    baseConditions.push(
      `(t.assigned_to = $${p}
        OR t.company_id IN (SELECT id FROM companies WHERE assigned_staff_id = $${p})
        OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = t.id AND tc.user_id = $${p}))`
    )
  }
  // Lọc "CV hỗ trợ": chỉ task mà 1 trong các user chỉ định là NGƯỜI HỖ TRỢ.
  // (Admin: multi-select nhiều nhân viên · Nhân viên: chính mình.)
  if (hasCollabFilter) {
    baseParams.push(collabArr)
    baseConditions.push(
      `EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = t.id AND tc.user_id = ANY($${baseParams.length}::uuid[]))`
    )
  }
  if (source) {
    const arr = Array.isArray(source) ? source : [source]
    baseParams.push(arr)
    baseConditions.push(`t.source = ANY($${baseParams.length})`)
  }
  // "Lịch làm việc hôm nay": việc CHƯA hoàn thành và ĐÃ tới lượt tính đến hôm nay:
  //   - đến hạn hôm nay hoặc quá hạn trước đó  → due_date <= CURRENT_DATE
  //   - đang trong giai đoạn làm (đã tới ngày bắt đầu, chưa tới hạn) → start_date <= CURRENT_DATE
  // KHÔNG dùng created_at làm mốc: task chưa có ngày bắt đầu + hạn ở tương lai thì chưa hiện.
  // Bỏ qua bộ lọc khoảng ngày (tháng) để lấy được cả việc quá hạn từ trước.
  const scheduleTodayOn = scheduleToday === 'true' || scheduleToday === true
  if (scheduleTodayOn) {
    baseConditions.push(`t.status != 'completed' AND (t.due_date <= CURRENT_DATE OR t.start_date <= CURRENT_DATE)`)
  } else if (dueDateFrom && dueDateTo) {
    // Overlap on the task's effective date range. COALESCE anchors a single-date task
    // (e.g. auto-generated tasks have only due_date) to that one date, so it matches
    // only the period that actually contains it. A task with NO dates at all yields
    // NULL on both sides and is excluded from any period filter.
    baseParams.push(dueDateTo)
    baseConditions.push(`COALESCE(t.start_date, t.due_date) <= $${baseParams.length}`)
    baseParams.push(dueDateFrom)
    baseConditions.push(`COALESCE(t.due_date, t.start_date) >= $${baseParams.length}`)
  } else if (dueDateFrom) {
    baseParams.push(dueDateFrom)
    baseConditions.push(`COALESCE(t.due_date, t.start_date) >= $${baseParams.length}`)
  } else if (dueDateTo) {
    baseParams.push(dueDateTo)
    baseConditions.push(`COALESCE(t.start_date, t.due_date) <= $${baseParams.length}`)
  }
  if (periodLabel) { baseParams.push(periodLabel); baseConditions.push(`t.period_label = $${baseParams.length}`) }
  if (!scheduleTodayOn && (isOverdue === 'true' || isOverdue === true)) {
    baseConditions.push(`t.due_date < CURRENT_DATE AND t.status != 'completed'`)
  }
  if (search && search.trim()) {
    baseParams.push(search.trim())
    baseConditions.push(
      `to_tsvector('simple', t.title || ' ' || coalesce(t.description, '')) @@ plainto_tsquery('simple', $${baseParams.length})`
    )
  }

  // Full conditions: base + status + priority (used for main list/count)
  const conditions = [...baseConditions]
  const params = [...baseParams]
  if (status) {
    const arr = Array.isArray(status) ? status : [status]
    params.push(arr)
    conditions.push(`t.status = ANY($${params.length}::task_status[])`)
  }
  if (priority) {
    const arr = Array.isArray(priority) ? priority : [priority]
    params.push(arr)
    conditions.push(`t.priority = ANY($${params.length}::task_priority[])`)
  }

  const baseWhere = baseConditions.join(' AND ')
  const where     = conditions.join(' AND ')

  const SORT_COLS = {
    created_at: 't.created_at',
    due_date:   't.due_date',
    updated_at: 't.updated_at',
    priority: `CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END`,
    status:   `CASE t.status WHEN 'pending' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'on_hold' THEN 3 WHEN 'pending_review' THEN 4 WHEN 'needs_revision' THEN 5 WHEN 'completed' THEN 6 ELSE 7 END`,
    // Gom nhóm theo VIỆC CẦN XỬ LÝ TRƯỚC — khác với `status` (thứ tự vòng đời).
    // Trễ hạn lên đầu, việc đã xong đẩy xuống cuối, để mở danh sách là thấy ngay
    // cái gì cần làm.
    work_priority: `CASE t.status
      WHEN 'needs_revision' THEN 1
      WHEN 'in_progress'    THEN 2
      WHEN 'pending'        THEN 3
      WHEN 'pending_review' THEN 4
      WHEN 'on_hold'        THEN 5
      WHEN 'completed'      THEN 6
      ELSE 7 END`,
  }
  const huong = sortDir === 'asc' ? 'ASC' : 'DESC'

  // Tiêu chí PHỤ khi giá trị chính bằng nhau. Hai việc:
  //   1. Trong cùng nhóm trạng thái, đưa việc KHẨN CẤP lên trước — để thấy ngay
  //      cái nào vừa trễ hạn vừa gấp.
  //   2. Cho thứ tự ỔN ĐỊNH: không có tiêu chí phụ thì các dòng bằng nhau sẽ
  //      đảo lộn ngẫu nhiên mỗi lần tải lại (Postgres không đảm bảo thứ tự).
  // Không lặp lại chính cột đang sắp — vd sắp theo priority thì bỏ vế priority.
  const phu = []
  if (sortBy !== 'priority') phu.push(`${SORT_COLS.priority} ASC`)
  if (sortBy !== 'due_date') phu.push('t.due_date ASC NULLS LAST')
  if (sortBy !== 'created_at') phu.push('t.created_at DESC')

  // Chỉ nhóm-hoá mới cần chuỗi tiêu chí phụ; sắp theo ngày thì bản thân nó đã đủ mịn.
  const canPhu = ['work_priority', 'status', 'priority'].includes(sortBy)
  const orderBy = canPhu
    ? [`${SORT_COLS[sortBy]} ${huong}`, ...phu].join(', ')
    : `${SORT_COLS[sortBy] || 't.created_at'} ${huong}`

  const [countRes, statusCountsRes, { rows }] = await Promise.all([
    query(`SELECT COUNT(*) FROM tasks t WHERE ${where}`, params),
    query(`SELECT t.status, COUNT(*) AS cnt FROM tasks t WHERE ${baseWhere} GROUP BY t.status`, baseParams),
    query(
      `${TASK_SELECT} WHERE ${where} ORDER BY ${orderBy}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
  ])

  const total = parseInt(countRes.rows[0].count, 10)
  const statusCounts = {}
  for (const r of statusCountsRes.rows) statusCounts[r.status] = parseInt(r.cnt, 10)

  return {
    tasks: rows.map(toDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    statusCounts,
  }
}

async function getTaskById(id, user = null) {
  const { rows } = await query(`${TASK_SELECT} WHERE t.id = $1`, [id])
  if (!rows[0]) throw Object.assign(new Error('Task not found'), { status: 404 })
  if (user?.role === 'staff' && !staffOwnsOrManagesRow(rows[0], user.id)) {
    throw Object.assign(new Error('Bạn không có quyền xem công việc này'), { status: 403 })
  }
  return toDto(rows[0])
}

async function createTask(data, actorId, ipAddress, userAgent) {
  const { title, description, companyId, taskTypeId, assignedTo, startDate, dueDate, priority = 'medium', slaDays, collaboratorIds } = data

  const { rows: [company] } = await query('SELECT id FROM companies WHERE id = $1', [companyId])
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 })

  // Resolve task source (metadata-driven via enum_options); defaults to 'manual'.
  let source = 'manual'
  if (data.source) {
    const validSources = await enums.getValues('task_source')
    if (!validSources.includes(data.source)) {
      throw Object.assign(new Error(`Nguồn công việc không hợp lệ: ${data.source}`), { status: 422 })
    }
    source = data.source
  }

  // Inherit SLA from task type if not overridden
  let effectiveSlaDays = slaDays ?? null
  if (taskTypeId && !slaDays) {
    const { rows: [tt] } = await query('SELECT default_sla_days FROM task_types WHERE id = $1', [taskTypeId])
    if (tt) effectiveSlaDays = tt.default_sla_days
  }

  const { rows: [task] } = await query(
    `INSERT INTO tasks
       (title, description, company_id, task_type_id, assigned_to, assigned_by,
        start_date, due_date, priority, source, sla_days, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      title, description ?? null, companyId, taskTypeId ?? null,
      assignedTo ?? null, actorId, startDate ?? null, dueDate ?? null,
      priority, source, effectiveSlaDays, actorId,
    ]
  )

  // Copy checklist template from task type — mang theo source_step_id + source_parent_id (đóng băng cha-con).
  // source_parent_id = id bước level-0 gần nhất PHÍA TRƯỚC (nếu bước hiện tại là con).
  if (taskTypeId) {
    await query(
      `INSERT INTO task_checklist_items
         (task_id, step_order, step_text, level, source_step_id, source_parent_id)
       SELECT $1, t.step_order, t.step_text, t.level, t.id,
              CASE WHEN t.level = 1 THEN (
                SELECT p.id FROM task_type_checklist_templates p
                WHERE p.task_type_id = t.task_type_id AND p.level = 0 AND p.step_order < t.step_order
                ORDER BY p.step_order DESC LIMIT 1
              ) END
       FROM task_type_checklist_templates t
       WHERE t.task_type_id = $2
       ORDER BY t.step_order`,
      [task.id, taskTypeId]
    )
  }

  await activity.logActivity(task.id, actorId, 'created', null, null, { title, companyId, taskTypeId })
  await audit.log({
    userId: actorId, action: 'task.created',
    targetType: 'task', targetId: task.id,
    meta: { title, companyId }, ipAddress, userAgent,
  })

  // Người hỗ trợ ban đầu (nếu có) — owner = assignedTo, tự loại khỏi danh sách hỗ trợ.
  let collabChanges = { toAdd: [], toRemove: [] }
  if (Array.isArray(collaboratorIds) && collaboratorIds.length) {
    collabChanges = await syncCollaborators(task.id, collaboratorIds, assignedTo ?? null, actorId)
  }

  const result = await getTaskById(task.id)

  // Notify assignee if set and different from actor
  if (assignedTo && assignedTo !== actorId) {
    await createAndEmit(
      assignedTo, 'task_assigned',
      'Bạn được giao công việc mới',
      `"${result.title}" — ${result.companyName || ''}`,
      task.id,
    )
  }
  if (collabChanges.toAdd.length || collabChanges.toRemove.length) {
    await notifyCollaboratorChanges(collabChanges, result, actorId)
  }

  emitData('data:task', { action: 'created', id: task.id, companyId, actorId })
  return result
}

// Chuẩn hoá về chuỗi 'YYYY-MM-DD' (theo giờ địa phương của node-pg) để so sánh ngày an toàn
function toDateStr(v) {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function updateTask(id, data, actorId, ipAddress, userAgent, user = null) {
  const fieldMap = {
    title:       'title',
    description: 'description',
    assignedTo:  'assigned_to',
    startDate:   'start_date',
    dueDate:     'due_date',
    priority:    'priority',
    slaDays:     'sla_days',
    source:      'source',
  }

  const { rows: [current] } = await query('SELECT * FROM tasks WHERE id = $1', [id])
  if (!current) throw Object.assign(new Error('Task not found'), { status: 404 })

  // Mỗi ngày một lượt riêng — chỉnh ngày này không khoá ngày kia
  let staffAdjustStart = false
  let staffAdjustDue   = false

  // Ai được sửa DANH SÁCH người hỗ trợ: admin, owner, hoặc người phụ trách công ty.
  // Người hỗ trợ (collaborator thuần) KHÔNG tự thêm/bớt người hỗ trợ khác.
  let managesCompany  = false
  let isCollaborator  = false

  // Validate source against active enum options (metadata-driven)
  if (data.source !== undefined && data.source !== null) {
    const validSources = await enums.getValues('task_source')
    if (!validSources.includes(data.source)) {
      throw Object.assign(new Error(`Nguồn công việc không hợp lệ: ${data.source}`), { status: 422 })
    }
  }

  if (user?.role === 'staff') {
    // Được chỉnh sửa nếu: được giao việc, là nhân sự phụ trách công ty của việc,
    // HOẶC là người được nhờ HỖ TRỢ (task_collaborators) — quyền như owner.
    const { rows: [co] } = await query('SELECT assigned_staff_id FROM companies WHERE id = $1', [current.company_id])
    managesCompany = !!co && co.assigned_staff_id === actorId
    const { rows: [collabRow] } = await query(
      'SELECT 1 FROM task_collaborators WHERE task_id = $1 AND user_id = $2', [id, actorId]
    )
    isCollaborator = !!collabRow
    if (current.assigned_to !== actorId && !managesCompany && !isCollaborator) {
      throw Object.assign(new Error('Bạn không có quyền chỉnh sửa công việc này'), { status: 403 })
    }
    delete fieldMap.assignedTo

    // ── Quy tắc NGÀY với nhân viên ───────────────────────────────────────────
    // 1) Chỉ sửa được nếu task sinh từ LỊCH ĐỊNH KỲ (customer_task_schedule_id).
    // 2) Mỗi ngày có lượt RIÊNG, mỗi ngày được chỉnh ĐÚNG 1 LẦN:
    //    - Ngày bắt đầu  → staff_start_adjusted_at
    //    - Ngày hết hạn  → staff_due_adjusted_at
    //    Chỉnh ngày này KHÔNG khoá ngày kia.
    // Admin không bị giới hạn (và không đóng dấu cờ nào).
    const fromRecurring = current.customer_task_schedule_id != null
    const changingStart = data.startDate !== undefined && toDateStr(data.startDate) !== toDateStr(current.start_date)
    const changingDue   = data.dueDate   !== undefined && toDateStr(data.dueDate)   !== toDateStr(current.due_date)

    if (!fromRecurring) {
      if (changingStart || changingDue) {
        throw Object.assign(
          new Error('Nhân viên không được sửa Ngày bắt đầu / Ngày hết hạn của công việc này (không thuộc lịch định kỳ). Vui lòng báo Quản trị viên.'),
          { status: 403 },
        )
      }
      delete fieldMap.startDate
      delete fieldMap.dueDate
    } else {
      // Ngày bắt đầu — lượt riêng
      if (changingStart) {
        if (current.staff_start_adjusted_at != null) {
          throw Object.assign(
            new Error('Bạn đã điều chỉnh Ngày bắt đầu 1 lần cho công việc này. Vui lòng báo Quản trị viên nếu cần đổi thêm.'),
            { status: 403 },
          )
        }
        staffAdjustStart = true
      } else if (current.staff_start_adjusted_at != null) {
        delete fieldMap.startDate   // đã dùng lượt → khoá, không ghi đè
      }

      // Ngày hết hạn — lượt riêng, độc lập với ngày bắt đầu
      if (changingDue) {
        if (current.staff_due_adjusted_at != null) {
          throw Object.assign(
            new Error('Bạn đã điều chỉnh Ngày hết hạn 1 lần cho công việc này. Vui lòng báo Quản trị viên nếu cần đổi thêm.'),
            { status: 403 },
          )
        }
        staffAdjustDue = true
      } else if (current.staff_due_adjusted_at != null) {
        delete fieldMap.dueDate
      }
    }
  }

  const updates = []
  const params = []
  let newAssignee = null
  let prevAssignee = null

  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      if (key === 'assignedTo' && data[key] !== current.assigned_to) {
        await activity.logActivity(id, actorId, 'assigned', current.assigned_to, data[key], null)
        prevAssignee = current.assigned_to
        newAssignee  = data[key]
      }
      if (key === 'dueDate' && data[key] !== current.due_date)
        await activity.logActivity(id, actorId, 'due_date_changed', current.due_date, data[key], null)
      if (key === 'priority' && data[key] !== current.priority)
        await activity.logActivity(id, actorId, 'priority_changed', current.priority, data[key], null)

      params.push(data[key])
      updates.push(`${col} = $${params.length}`)
    }
  }
  // Quyền sửa DANH SÁCH người hỗ trợ: admin (hoặc gọi nội bộ), owner, hoặc phụ trách công ty.
  const canManageCollaborators =
    user?.role !== 'staff' || current.assigned_to === actorId || managesCompany
  const wantsCollabUpdate = canManageCollaborators && data.collaboratorIds !== undefined

  if (!updates.length && !wantsCollabUpdate) {
    throw Object.assign(new Error('No fields to update'), { status: 400 })
  }

  // Staff vừa dùng lượt chỉnh của TỪNG ngày → khoá riêng ngày đó
  if (staffAdjustStart) updates.push('staff_start_adjusted_at = NOW()')
  if (staffAdjustDue)   updates.push('staff_due_adjusted_at = NOW()')

  if (updates.length) {
    params.push(id)
    await query(
      `UPDATE tasks SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
      params
    )
  }

  // Đồng bộ người hỗ trợ (nếu có gửi collaboratorIds và đủ quyền quản lý danh sách)
  let collabChanges = { toAdd: [], toRemove: [] }
  if (wantsCollabUpdate) {
    collabChanges = await syncCollaborators(id, data.collaboratorIds, current.assigned_to, actorId)
    if (collabChanges.toAdd.length || collabChanges.toRemove.length) {
      await activity.logActivity(
        id, actorId, 'collaborators_changed',
        collabChanges.toRemove.length, collabChanges.toAdd.length,
        { added: collabChanges.toAdd, removed: collabChanges.toRemove }
      )
    }
  }

  await audit.log({
    userId: actorId, action: 'task.updated',
    targetType: 'task', targetId: id, meta: data, ipAddress, userAgent,
  })

  const result = await getTaskById(id)

  const notifyPromises = []
  // Notify new assignee when task is re-assigned
  if (newAssignee && newAssignee !== actorId) {
    notifyPromises.push(createAndEmit(
      newAssignee, 'task_assigned',
      'Bạn được giao công việc',
      `"${result.title}" — ${result.companyName || ''}`,
      id,
    ))
  }
  // Notify previous assignee they were unassigned
  if (prevAssignee && prevAssignee !== actorId && prevAssignee !== newAssignee) {
    notifyPromises.push(createAndEmit(
      prevAssignee, 'task_status_changed',
      'Công việc đã được giao cho người khác',
      `"${result.title}" không còn được giao cho bạn nữa`,
      id,
    ))
  }
  await Promise.all(notifyPromises)

  if (collabChanges.toAdd.length || collabChanges.toRemove.length) {
    await notifyCollaboratorChanges(collabChanges, result, actorId)
  }

  emitData('data:task', { action: 'updated', id, companyId: result.companyId, actorId })
  return result
}

async function deleteTask(id, user, ipAddress, userAgent) {
  const actorId = user.id
  const { rows: [task] } = await query('SELECT id, title, company_id FROM tasks WHERE id = $1', [id])
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 })

  // CHỈ admin được xoá công việc (lớp phòng thủ thứ 2 — router đã chặn bằng requireRole).
  if (user.role !== 'admin') {
    throw Object.assign(
      new Error('Chỉ Quản trị viên được xoá công việc. Vui lòng liên hệ Quản trị viên.'),
      { status: 403 },
    )
  }

  await query('DELETE FROM tasks WHERE id = $1', [id])

  await audit.log({
    userId: actorId, action: 'task.deleted',
    targetType: 'task', targetId: id, meta: { title: task.title }, ipAddress, userAgent,
  })

  emitData('data:task', { action: 'deleted', id, companyId: task.company_id, actorId })
}

async function changeTaskStatus(id, newStatus, params, actorId, ipAddress, userAgent, user = null) {
  const { onHoldReason } = params

  const { rows } = await query(
    `SELECT t.*,
            c.assigned_staff_id AS company_assigned_staff_id,
            EXISTS (SELECT 1 FROM task_collaborators tc
                    WHERE tc.task_id = t.id AND tc.user_id = $2) AS is_collaborator,
            (SELECT COUNT(*) FROM (
               SELECT is_completed,
                      NOT (level = 0 AND COALESCE(LEAD(level) OVER (ORDER BY step_order, id), 0) = 1) AS is_leaf
               FROM task_checklist_items WHERE task_id = t.id
             ) z WHERE is_leaf AND NOT is_completed) AS unchecked_count
     FROM tasks t LEFT JOIN companies c ON c.id = t.company_id WHERE t.id = $1`,
    [id, user?.id ?? null]
  )
  const task = rows[0]
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 })

  if (user?.role === 'staff' && !staffOwnsOrManagesRow(task, user.id)) {
    throw Object.assign(new Error('Bạn không có quyền thay đổi trạng thái công việc này'), { status: 403 })
  }

  const currentStatus = task.status
  if (!canTransition(currentStatus, newStatus)) {
    throw Object.assign(
      new Error(`Cannot transition from '${currentStatus}' to '${newStatus}'`),
      { status: 422 }
    )
  }

  // Block if dependency tasks are not yet completed
  if (newStatus !== 'pending') {
    const blockers = await checkBlockers(id)
    if (blockers.length > 0) {
      throw Object.assign(
        new Error(`Task is blocked by ${blockers.length} incomplete dependency task(s): ${blockers.map(b => b.title).join(', ')}`),
        { status: 422, blockers }
      )
    }
  }

  // Yêu cầu 1: CHẶN hoàn thành khi checklist chưa tick đủ (không cho ép/force nữa)
  const unchecked = parseInt(task.unchecked_count, 10)
  if (newStatus === 'completed' && unchecked > 0) {
    throw Object.assign(
      new Error(`Còn ${unchecked} mục checklist chưa hoàn thành. Vui lòng tích đủ checklist trước khi hoàn thành công việc.`),
      { status: 409, uncheckedCount: unchecked }
    )
  }

  // Soft-block completion when linked client document requests are still pending
  if (newStatus === 'completed') {
    const pendingCdrCount = await countPendingByTask(id)
    if (pendingCdrCount > 0) {
      throw Object.assign(
        new Error(`${pendingCdrCount} yêu cầu tài liệu khách hàng chưa hoàn thành.`),
        { status: 422, code: 'CLIENT_REQUESTS_PENDING', pendingCdrCount }
      )
    }
  }

  const setClauses = ['status = $1', 'updated_at = NOW()']
  const queryParams = [newStatus]

  if (newStatus === 'completed') setClauses.push('completed_at = NOW()')
  // Mở lại công việc đã hoàn thành → xoá completed_at để báo cáo năng suất
  // (đếm theo completed_at) không còn tính nhầm là đã hoàn thành.
  if (currentStatus === 'completed' && newStatus !== 'completed') setClauses.push('completed_at = NULL')

  if (newStatus === 'on_hold') {
    queryParams.push(onHoldReason)
    setClauses.push(`on_hold_reason = $${queryParams.length}`)
  }
  // Clear reason when leaving on_hold
  if (currentStatus === 'on_hold' && newStatus !== 'on_hold') {
    setClauses.push('on_hold_reason = NULL')
  }

  queryParams.push(id)
  await query(
    `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $${queryParams.length}`,
    queryParams
  )

  await activity.logActivity(id, actorId, 'status_changed', currentStatus, newStatus, { onHoldReason: onHoldReason ?? null })
  await audit.log({
    userId: actorId, action: 'task.status_changed',
    targetType: 'task', targetId: id,
    meta: { from: currentStatus, to: newStatus }, ipAddress, userAgent,
  })

  const result = await getTaskById(id)
  const fromLabel = STATUS_LABEL[currentStatus] || currentStatus
  const toLabel   = STATUS_LABEL[newStatus]     || newStatus

  const notifyPromises = []

  // Notify assignee about status change (if not the one making the change)
  if (result.assignedTo && result.assignedTo !== actorId) {
    notifyPromises.push(createAndEmit(
      result.assignedTo, 'task_status_changed',
      `Công việc cập nhật: ${toLabel}`,
      `"${result.title}" chuyển từ ${fromLabel} → ${toLabel}`,
      id,
    ))
  }

  // Notify người HỖ TRỢ về đổi trạng thái (trừ người thao tác & owner đã báo ở trên)
  for (const c of result.collaborators || []) {
    if (!c?.id || c.id === actorId || c.id === result.assignedTo) continue
    notifyPromises.push(createAndEmit(
      c.id, 'task_status_changed',
      `Công việc cập nhật: ${toLabel}`,
      `"${result.title}" chuyển từ ${fromLabel} → ${toLabel}`,
      id,
    ))
  }

  // When completed — notify all relevant parties
  if (newStatus === 'completed') {
    const notified = new Set([actorId, result.assignedTo].filter(Boolean))

    // Notify creator if set and not already notified (manual task case)
    if (result.createdBy && !notified.has(result.createdBy)) {
      notifyPromises.push(createAndEmit(
        result.createdBy, 'task_status_changed',
        'Công việc đã hoàn thành',
        `"${result.title}" — ${result.companyName || ''} đã được đánh dấu hoàn thành`,
        id,
      ))
      notified.add(result.createdBy)
    }

    // When staff completes: notify all active admins not yet notified
    // Covers auto-generated tasks (createdBy may be null) and ensures all admins are informed
    if (user?.role === 'staff') {
      const { rows: admins } = await query(
        `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
      )
      for (const adm of admins) {
        if (!notified.has(adm.id)) {
          notifyPromises.push(createAndEmit(
            adm.id, 'task_status_changed',
            'Công việc đã hoàn thành',
            `"${result.title}" — ${result.companyName || ''} đã được đánh dấu hoàn thành`,
            id,
          ))
          notified.add(adm.id)
        }
      }
    }
  }

  // When needs_revision — actor is assignee, notify creator
  if (newStatus === 'needs_revision' && result.assignedTo && result.assignedTo === actorId) {
    if (result.createdBy && result.createdBy !== actorId) {
      notifyPromises.push(createAndEmit(
        result.createdBy, 'task_status_changed',
        `Công việc cần xem lại`,
        `"${result.title}" đã chuyển sang "Cần xem lại"`,
        id,
      ))
    }
  }

  await Promise.all(notifyPromises)
  emitData('data:task', { action: 'updated', id, companyId: result.companyId, actorId })
  return result
}

async function getActivityLog(taskId, { page = 1, limit = 50 } = {}) {
  const { rows: [t] } = await query('SELECT id FROM tasks WHERE id = $1', [taskId])
  if (!t) throw Object.assign(new Error('Task not found'), { status: 404 })

  const offset = (page - 1) * limit
  const { rows } = await query(
    `SELECT al.*, u.name AS user_name
     FROM task_activity_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.task_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2 OFFSET $3`,
    [taskId, limit, offset]
  )

  return rows.map(r => ({
    id:        r.id,
    userId:    r.user_id,
    userName:  r.user_name ?? null,
    action:    r.action,
    oldValue:  r.old_value,
    newValue:  r.new_value,
    meta:      r.meta,
    createdAt: r.created_at,
  }))
}

async function getAvailableYears() {
  const { rows } = await query(
    `SELECT DISTINCT EXTRACT(YEAR FROM due_date)::int AS year
     FROM tasks
     WHERE due_date IS NOT NULL
     ORDER BY year DESC`
  )
  return rows.map((r) => r.year)
}

// ── Xuất Excel: frontend gửi sẵn cột + dữ liệu (đã render đúng như bảng),
// backend chỉ định dạng ra file. Không map/tính lại → KHÔNG lệch với giao diện.
function buildTasksExcel({ sheetName = 'Cong viec', columns = [], rows = [] }) {
  const ExcelJS = require('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(String(sheetName).slice(0, 31) || 'Cong viec')

  const header = ws.addRow(columns)
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  ws.getRow(1).height = 30

  rows.forEach((r, idx) => {
    const row = ws.addRow(r)
    const even = idx % 2 === 0
    row.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: even ? 'FFFFFFFF' : 'FFF8FAFC' } }
      c.alignment = { vertical: 'middle', wrapText: true }
      c.border = { top: { style: 'hair', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } }
    })
    row.height = 20
  })

  columns.forEach((label, i) => {
    const maxLen = Math.max(String(label).length + 4, ...rows.map((r) => String(r[i] ?? '').length))
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 12), 55)
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  return wb.xlsx.writeBuffer()
}

module.exports = {
  listTasks, getTaskById, createTask, updateTask, deleteTask,
  changeTaskStatus, getActivityLog, getAvailableYears,
  assertTaskAccess, buildTasksExcel,
}

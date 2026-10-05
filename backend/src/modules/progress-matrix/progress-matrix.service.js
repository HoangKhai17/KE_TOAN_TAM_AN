// ── BC Tiến Độ CV — ma trận tiến độ quy trình theo khách hàng ───────────────────
//
// Pivot tiến độ checklist của một quy trình (task_type) trong một kỳ (tháng/năm):
//   hàng  = khách hàng có phát sinh phiếu của quy trình đó trong kỳ
//   cột   = các bước checklist (task_type_checklist_templates)
//   ô     = task_checklist_items.is_completed (✓ / trống) — read-only
//
// Xem chi tiết: docs/020_BC_TIEN_DO_CV.md

const { query } = require('../../config/db')
const ExcelJS = require('exceljs')
const { applyStandardStyle } = require('../export/excel-renderer')

// Danh sách quy trình (task_type) cho dropdown — kèm số bước checklist
async function listTaskTypes() {
  const { rows } = await query(`
    SELECT tt.id, tt.name, tt.group_name,
           COUNT(tct.id) AS step_count
    FROM task_types tt
    LEFT JOIN task_type_checklist_templates tct ON tct.task_type_id = tt.id
    WHERE tt.is_active
    GROUP BY tt.id, tt.name, tt.group_name
    ORDER BY tt.group_name NULLS LAST, tt.name
  `)
  return rows.map((r) => ({
    id: r.id, name: r.name, groupName: r.group_name,
    stepCount: parseInt(r.step_count, 10),
  }))
}

// Các năm thực sự có dữ liệu (theo kỳ phiếu = COALESCE(start_date, due_date))
async function listYears() {
  const { rows } = await query(`
    SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(start_date, due_date))::int AS year
    FROM tasks
    WHERE COALESCE(start_date, due_date) IS NOT NULL
    ORDER BY year DESC
  `)
  return rows.map((r) => r.year)
}

// Ma trận tiến độ cho (taskTypeId, month, year). forceAssignedTo: staff chỉ thấy phiếu của mình.
async function getMatrix({ taskTypeId, companyId, month, year, source, forceAssignedTo, collapse = false, importantOnly = true, includeChildren = true, useManualCols = false }) {
  const m = parseInt(month, 10)
  const y = parseInt(year, 10)
  if (!taskTypeId || !m || !y) {
    throw Object.assign(new Error('Thiếu tham số taskTypeId / month / year'), { status: 400 })
  }
  const periodStart = `${y}-${String(m).padStart(2, '0')}-01`

  const { rows: ttRows } = await query(
    'SELECT id, name, group_name FROM task_types WHERE id = $1', [taskTypeId],
  )
  if (!ttRows[0]) throw Object.assign(new Error('Loại công việc không tồn tại'), { status: 404 })
  const taskType = ttRows[0]

  // Nhãn cột lấy từ mẫu HIỆN TẠI (chỉ để hiển thị); dữ liệu khớp theo id nên đổi tên không sai.
  const { rows: templ } = await query(
    `SELECT id, step_order, step_text, level, is_important FROM task_type_checklist_templates
     WHERE task_type_id = $1 ORDER BY step_order, id`,
    [taskTypeId],
  )
  const templById = new Map(templ.map((t) => [t.id, t]))

  // Hàng = phiếu của quy trình có kỳ rơi vào tháng (1 phiếu mới nhất / công ty)
  const params = [taskTypeId, periodStart]
  let staffCond = ''
  if (forceAssignedTo) { params.push(forceAssignedTo); staffCond += ` AND t.assigned_to = $${params.length}` }
  if (companyId) { params.push(companyId); staffCond += ` AND t.company_id = $${params.length}` }
  const srcArr = parseSources(source)
  if (srcArr) { params.push(srcArr); staffCond += ` AND t.source = ANY($${params.length})` }
  // 1 dòng = 1 PHIẾU CHA (đợt). Quy trình lặp (5 ngày/lần…) → 1 công ty có nhiều đợt/tháng, hiện đủ.
  // CHỈ lấy task cấp cao nhất (parent_task_id IS NULL): "việc con" dùng chung task_type nhưng
  // checklist riêng (không khớp bước quy trình) nên KHÔNG làm hàng ma trận — tiến độ của chúng
  // được tổng hợp thành chỉ báo "Việc con x/y" trên hàng cha (xem childAgg bên dưới).
  const { rows: tasks } = await query(`
    SELECT t.id, t.company_id, t.assigned_to,
           t.start_date, t.due_date, t.period_label,
           c.name AS company_name, c.tax_code,
           u.name AS assignee_name
    FROM tasks t
    JOIN companies c ON c.id = t.company_id
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.task_type_id = $1
      AND t.parent_task_id IS NULL
      AND t.source = 'auto'
      AND COALESCE(t.start_date, t.due_date) >= $2::date
      AND COALESCE(t.start_date, t.due_date) <  ($2::date + INTERVAL '1 month')
      ${staffCond}
    ORDER BY c.name, COALESCE(t.due_date, t.start_date), t.created_at
  `, params)

  // Gom checklist items. MẶC ĐỊNH khớp theo source_step_id (THEO MẪU) — bước nhập tay lẻ → badge.
  // useManualCols=true (Theo công ty): gộp CẢ bước nhập tay theo nội dung (txt:) → lịch TỰ TẠO cũng
  // thành cột (trong 1 công ty+1 quy trình nên không phân mảnh).
  const itemsByTask = new Map()   // task_id -> Map(colKey -> item)
  const customByTask = new Map()  // task_id -> { total, done }
  const stepAgg = new Map()       // colKey -> { sourceStepId(=colKey), stepOrder, text, parentId, important }
  const parentIds = new Set()

  const colKeyOf = (it) => (it.source_step_id != null
    ? `tpl:${it.source_step_id}`
    : (useManualCols ? `txt:${String(it.step_text || '').trim().toLowerCase()}|${it.level === 1 ? 1 : 0}` : null))

  if (tasks.length) {
    const taskIds = tasks.map((t) => t.id)
    const { rows: items } = await query(
      `SELECT task_id, source_step_id, source_parent_id, level, step_text, step_order, is_important, is_completed, completed_at
       FROM task_checklist_items WHERE task_id = ANY($1)`,
      [taskIds],
    )
    for (const it of items) {
      const key = colKeyOf(it)
      if (key == null) {   // bước nhập tay + chế độ theo-mẫu → gộp badge "+N riêng"
        const c = customByTask.get(it.task_id) || { total: 0, done: 0 }
        c.total++; if (it.is_completed) c.done++
        customByTask.set(it.task_id, c)
        continue
      }
      if (!itemsByTask.has(it.task_id)) itemsByTask.set(it.task_id, new Map())
      itemsByTask.get(it.task_id).set(key, it)
      if (!stepAgg.has(key)) {
        const tpl = it.source_step_id != null ? templById.get(it.source_step_id) : null
        stepAgg.set(key, {
          sourceStepId: key,
          stepOrder:    tpl?.step_order ?? it.step_order ?? 0,
          text:         tpl?.step_text ?? it.step_text,
          parentId:     it.source_parent_id != null ? `tpl:${it.source_parent_id}` : null,
          important:    it.source_step_id != null ? !!(tpl?.is_important) : !!it.is_important,
        })
      }
      if (it.source_parent_id != null) parentIds.add(`tpl:${it.source_parent_id}`)
    }
  }

  // Rollup VIỆC CON: mỗi phiếu cha → tổng số việc con + số đã hoàn thành (theo trạng thái task).
  let childAgg = new Map()   // parent_task_id -> { total, done }
  if (includeChildren && tasks.length) {
    const { rows: ch } = await query(
      `SELECT parent_task_id,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'completed')::int AS done
       FROM tasks WHERE parent_task_id = ANY($1) GROUP BY parent_task_id`,
      [tasks.map((t) => t.id)],
    )
    childAgg = new Map(ch.map((r) => [r.parent_task_id, { total: r.total, done: r.done }]))
  }

  const labelOf = (id) => stepAgg.get(id)?.text
    ?? (typeof id === 'string' && id.startsWith('tpl:') ? templById.get(id.slice(4))?.step_text : null)
    ?? null

  // Map cha → danh sách con (source_step_id) để tính "x/N" và badge "(N mục)".
  const childrenByParent = new Map()
  for (const s of stepAgg.values()) {
    if (s.parentId != null) {
      if (!childrenByParent.has(s.parentId)) childrenByParent.set(s.parentId, new Set())
      childrenByParent.get(s.parentId).add(s.sourceStepId)
    }
  }

  let cols
  if (collapse) {
    // CHẾ ĐỘ GỘP: cột = mục cấp trên cùng (parentId == null) = cha (có con) + leaf lẻ. Ẩn con.
    cols = [...stepAgg.values()]
      .filter((s) => s.parentId == null)
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map((s) => {
        const isGroup  = parentIds.has(s.sourceStepId)
        const childIds = isGroup
          ? [...childrenByParent.get(s.sourceStepId)].map((id) => stepAgg.get(id)).sort((a, b) => a.stepOrder - b.stepOrder)
          : []
        return {
          sourceStepId: s.sourceStepId,
          stepOrder:    s.stepOrder,
          stepText:     s.text,
          group:        null, groupId: null,
          isGroup,
          important:    !!s.important,
          childCount:   childIds.length,
          childNames:   childIds.map((c) => c.text),   // cho tooltip "Gồm: …"
        }
      })
  } else {
    // CHẾ ĐỘ ĐẦY ĐỦ (mặc định): cột = các bước LEAF; cha là header nhóm.
    cols = [...stepAgg.values()]
      .filter((s) => !parentIds.has(s.sourceStepId))
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map((s) => ({
        sourceStepId: s.sourceStepId,
        stepOrder:    s.stepOrder,
        stepText:     s.text,
        group:        s.parentId ? labelOf(s.parentId) : null,
        groupId:      s.parentId ?? null,
        isGroup:      false,
        important:    !!s.important,
        childCount:   0,
        childNames:   [],
      }))
  }

  // KPI v2: mặc định CHỈ hiện các bước ★ (quan trọng). Nếu quy trình chưa đánh dấu bước nào ★
  // thì KHÔNG lọc (tránh bảng rỗng) — trả cờ để FE biết.
  let importantFilterApplied = false
  if (importantOnly) {
    const imp = cols.filter((c) => c.important)
    if (imp.length) { cols = imp; importantFilterApplied = true }
  }

  const cellFor = (col, map) => {
    if (col.isGroup) {
      // Ô cha (chế độ gộp): tiến độ suy từ CON của phiếu đó. Con của cha = source_parent_id trỏ tới cha.
      let total = 0, doneCount = 0
      for (const cid of (childrenByParent.get(col.sourceStepId) || [])) {
        const it = map.get(cid)
        if (it) { total++; if (it.is_completed) doneCount++ }
      }
      return {
        sourceStepId: col.sourceStepId, stepText: col.stepText, isGroup: true,
        present: total > 0, total, doneCount,
        done: total > 0 && doneCount === total,   // xong hết con → ✓
        completedAt: null,
      }
    }
    const it = map.get(col.sourceStepId)
    return {
      sourceStepId: col.sourceStepId, stepText: col.stepText, isGroup: false,
      present: !!it, done: it ? it.is_completed : false,
      total: it ? 1 : 0, doneCount: it && it.is_completed ? 1 : 0,
      completedAt: it?.completed_at ?? null,
    }
  }

  const rows = tasks
    .filter((t) => itemsByTask.has(t.id))   // CHỈ phiếu THEO MẪU (có bước khớp template); lịch tự tạo loại ra
    .map((t) => {
      const map  = itemsByTask.get(t.id) || new Map()
      const cust = customByTask.get(t.id) || { total: 0, done: 0 }
      return {
        companyId:    t.company_id,
        companyName:  t.company_name,
        taxCode:      t.tax_code,
        assigneeName: t.assignee_name,
        taskId:       t.id,
        startDate:    t.start_date,
        dueDate:      t.due_date,
        periodLabel:  t.period_label,
        cells: cols.map((col) => cellFor(col, map)),
        custom: { total: cust.total, done: cust.done },
        childTasks: childAgg.get(t.id) || { total: 0, done: 0 },
      }
    })
    .sort((a, b) =>
      String(a.companyName).localeCompare(String(b.companyName), 'vi')
      || String(a.dueDate ?? a.startDate ?? '').localeCompare(String(b.dueDate ?? b.startDate ?? '')),
    )

  return {
    taskType: { id: taskType.id, name: taskType.name, groupName: taskType.group_name },
    period:   { month: m, year: y, label: `Tháng ${m}/${y}` },
    columns:  cols,
    rows,
    collapse: !!collapse,
    importantOnly: !!importantOnly,
    importantFilterApplied,   // false = quy trình chưa có bước ★ nên đang hiện tất cả
    includeChildren: !!includeChildren,
  }
}

// ── Tab "Theo công ty" / "Theo nhân viên" — bảng tiến độ tổng hợp ───────────────
const STATUS_LABELS = {
  pending: 'Chờ xử lý', in_progress: 'Đang làm', on_hold: 'Tạm hoãn',
  pending_review: 'Chờ duyệt', needs_revision: 'Cần sửa', completed: 'Hoàn thành',
}
// % suy ra từ trạng thái cho task KHÔNG có checklist (tiến độ thích ứng)
const STATUS_PROGRESS = {
  pending: 0, in_progress: 40, on_hold: 20, needs_revision: 60, pending_review: 80, completed: 100,
}
// Fallback chỉ dùng khi enum chưa có (nhãn chuẩn lấy từ enum_options 'task_source')
const SOURCE_LABELS_FALLBACK = {
  auto: 'CV định kỳ', manual: 'CV tự sắp xếp', customerrequest: 'CV KH yêu cầu',
  handout: 'CV đi ra ngoài', client_request: 'CV KH yêu cầu',
}
// Nhãn nguồn LẤY TỪ ENUM (metadata-driven), fallback nếu enum thiếu key
async function loadSourceLabels() {
  const map = { ...SOURCE_LABELS_FALLBACK }
  try {
    const { rows } = await query(`
      SELECT eo.option_key, eo.label
      FROM enum_options eo JOIN enum_types et ON et.id = eo.type_id
      WHERE et.type_key = 'task_source'`)
    for (const r of rows) map[r.option_key] = r.label
  } catch { /* dùng fallback */ }
  return map
}
// Chuẩn hóa tham số nguồn → mảng hoặc null (không lọc)
function parseSources(source) {
  if (!source) return null
  const arr = Array.isArray(source) ? source : String(source).split(',').map((s) => s.trim()).filter(Boolean)
  return arr.length ? arr : null
}

// Danh sách nguồn cho dropdown lọc = TẤT CẢ nguồn cấu hình (active) trong enum,
// kể cả nguồn chưa có task (vd "CV đi ra ngoài"); bổ sung nguồn lạ có trong data.
async function listSources() {
  const labels = await loadSourceLabels()
  const { rows: enumRows } = await query(`
    SELECT eo.option_key AS key
    FROM enum_options eo JOIN enum_types et ON et.id = eo.type_id
    WHERE et.type_key = 'task_source' AND eo.is_active = TRUE
    ORDER BY eo.sort_order, eo.option_key`)
  const list = enumRows.map((r) => ({ key: r.key, label: labels[r.key] ?? r.key }))
  const seen = new Set(list.map((x) => x.key))
  // An toàn: thêm nguồn có trong dữ liệu nhưng chưa khai báo enum
  const { rows: dataRows } = await query(`SELECT DISTINCT source FROM tasks WHERE source IS NOT NULL`)
  for (const r of dataRows) {
    if (!seen.has(r.source)) { list.push({ key: r.source, label: labels[r.source] ?? r.source }); seen.add(r.source) }
  }
  return list
}
function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function slug(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bc'
}

// Chạy truy vấn tiến độ 1 lần (dùng chung company/staff + fetch việc con). Trả raw rows.
async function runProgressQuery(whereCond, params, orderBy) {
  const { rows } = await query(`
    SELECT t.id, t.title, t.status, t.source, t.due_date, t.period_label, t.parent_task_id,
           COALESCE(tt.name, t.title) AS task_type_name,
           c.name AS company_name, c.tax_code,
           u.name AS assignee_name,
           cl.total, cl.done
    FROM tasks t
    LEFT JOIN task_types tt ON tt.id = t.task_type_id
    JOIN companies  c  ON c.id  = t.company_id
    LEFT JOIN users u  ON u.id  = t.assigned_to
    LEFT JOIN LATERAL (
      -- Chỉ đếm mục leaf (mục phụ, hoặc mục chính không con) — mục chính có con là nhóm
      SELECT COUNT(*) FILTER (WHERE is_leaf) AS total,
             COUNT(*) FILTER (WHERE is_leaf AND is_completed) AS done
      FROM (
        SELECT is_completed,
               NOT (level = 0 AND COALESCE(LEAD(level) OVER (ORDER BY step_order, id), 0) = 1) AS is_leaf
        FROM task_checklist_items WHERE task_id = t.id
      ) z
    ) cl ON TRUE
    WHERE ${whereCond}
    ORDER BY ${orderBy}
  `, params)
  return rows
}

// Map 1 task raw → DTO tiến độ thích ứng (checklist nếu có, không thì suy từ trạng thái).
function mapTaskRow(r, srcLabels) {
  const total = parseInt(r.total, 10) || 0
  const done = parseInt(r.done, 10) || 0
  const hasChecklist = total > 0
  const statusLabel = STATUS_LABELS[r.status] ?? r.status
  const percent = r.status === 'completed'
    ? 100
    : hasChecklist ? Math.round(done * 100 / total) : (STATUS_PROGRESS[r.status] ?? 0)
  return {
    taskId:       r.id,
    title:        r.title,
    parentTaskId: r.parent_task_id ?? null,
    taskTypeName: r.task_type_name,
    companyName:  r.company_name,
    taxCode:      r.tax_code,
    assigneeName: r.assignee_name,
    source:       r.source,
    sourceLabel:  srcLabels[r.source] ?? r.source,
    hasChecklist,
    doneSteps:    done,
    totalSteps:   total,
    percent,
    progressMode: hasChecklist ? 'checklist' : 'status',
    progressLabel: hasChecklist ? `${done}/${total}` : statusLabel,
    status:       r.status,
    statusLabel,
    dueDate:      r.due_date,
    periodLabel:  r.period_label,
  }
}

// Dòng TỔNG của 1 đợt = cha + các việc con. %: trung bình tiến độ các đơn vị; xong khi tất cả xong.
function makeRollup(parent, kids) {
  const units = [parent, ...kids]
  const unitCount = units.length
  const completedUnits = units.filter((u) => u.status === 'completed').length
  const percent = Math.round(units.reduce((s, u) => s + (u.percent || 0), 0) / unitCount)
  const allDone = completedUnits === unitCount
  return {
    ...parent,
    isRollup:      true,
    childCount:    kids.length,
    children:      kids,
    completedUnits, unitCount,
    hasChecklist:  false,            // dòng tổng hiển thị %, không hiển thị x/y
    percent,
    progressLabel: `${percent}%`,
    status:        allDone ? 'completed' : 'in_progress',
    statusLabel:   allDone ? 'Hoàn thành' : `${completedUnits}/${unitCount} việc xong`,
  }
}

const MONTH_COND = `COALESCE(t.start_date, t.due_date) >= $2::date
      AND COALESCE(t.start_date, t.due_date) <  ($2::date + INTERVAL '1 month')`

// Nạp checklist chi tiết theo task (để BUNG xem). is_leaf = mục lá (mục chính có con là nhóm).
async function fetchChecklists(taskIds) {
  const map = new Map()
  if (!taskIds.length) return map
  const { rows } = await query(
    `SELECT task_id, step_text, level, is_completed, is_important, step_order,
            NOT (level = 0 AND COALESCE(LEAD(level) OVER (PARTITION BY task_id ORDER BY step_order, id), 0) = 1) AS is_leaf
     FROM task_checklist_items WHERE task_id = ANY($1) ORDER BY task_id, step_order, id`,
    [taskIds])
  for (const r of rows) {
    if (!map.has(r.task_id)) map.set(r.task_id, [])
    map.get(r.task_id).push({
      stepText: r.step_text, level: r.level ?? 0,
      isCompleted: !!r.is_completed, isImportant: !!r.is_important, isLeaf: !!r.is_leaf,
    })
  }
  return map
}
function collectTaskIds(rows) {
  const ids = []
  const go = (r) => { ids.push(r.taskId); if (Array.isArray(r.children)) r.children.forEach(go) }
  rows.forEach(go)
  return ids
}
function attachChecklist(rows, clMap) {
  const go = (r) => { r.checklist = clMap.get(r.taskId) || []; if (Array.isArray(r.children)) r.children.forEach(go) }
  rows.forEach(go)
  return rows
}

// CHỈ Lịch định kỳ (source='auto') — báo cáo không thống kê CV tự sắp xếp / KH yêu cầu / đi ra ngoài.
async function byCompany({ companyId, month, year, forceAssignedTo, includeChildren = true }) {
  if (!companyId || !month || !year) throw Object.assign(new Error('Thiếu companyId / month / year'), { status: 400 })
  const { rows: coRows } = await query('SELECT name, tax_code FROM companies WHERE id = $1', [companyId])
  if (!coRows[0]) throw Object.assign(new Error('Công ty không tồn tại'), { status: 404 })
  const m = parseInt(month, 10), y = parseInt(year, 10)
  const periodStart = `${y}-${String(m).padStart(2, '0')}-01`
  const srcLabels = await loadSourceLabels()

  const params = [companyId, periodStart]
  let cond = "t.company_id = $1 AND t.source = 'auto'"
  if (forceAssignedTo) { params.push(forceAssignedTo); cond += ` AND t.assigned_to = $${params.length}` }

  const monthRows = (await runProgressQuery(
    `${cond} AND ${MONTH_COND}`, params, 'COALESCE(tt.name, t.title), t.created_at DESC',
  )).map((r) => mapTaskRow(r, srcLabels))

  const base = {
    view: 'company',
    subject: { id: companyId, name: coRows[0].name, taxCode: coRows[0].tax_code },
    period: { month: m, year: y, label: `Tháng ${m}/${y}` },
    includeChildren: !!includeChildren,
  }
  if (!includeChildren) {
    attachChecklist(monthRows, await fetchChecklists(collectTaskIds(monthRows)))
    return { ...base, rows: monthRows }
  }

  // Việc con của các phiếu trong tháng (lấy bất kể hạn con rơi tháng nào) → gộp đợt.
  const parentIds = monthRows.map((r) => r.taskId)
  let children = []
  if (parentIds.length) {
    const cp = [parentIds]
    let ccond = "t.parent_task_id = ANY($1) AND t.source = 'auto'"
    if (forceAssignedTo) { cp.push(forceAssignedTo); ccond += ` AND t.assigned_to = $${cp.length}` }
    children = (await runProgressQuery(ccond, cp, 't.created_at')).map((r) => mapTaskRow(r, srcLabels))
  }
  const byParent = new Map()
  for (const ch of children) {
    if (!byParent.has(ch.parentTaskId)) byParent.set(ch.parentTaskId, [])
    byParent.get(ch.parentTaskId).push(ch)
  }
  const monthIdSet = new Set(parentIds)
  const rows = []
  for (const r of monthRows) {
    // Con mà CHA cũng trong tháng → bỏ khỏi cấp trên (sẽ hiện lồng dưới cha).
    if (r.parentTaskId && monthIdSet.has(r.parentTaskId)) continue
    const kids = byParent.get(r.taskId) || []
    rows.push(kids.length ? makeRollup(r, kids) : { ...r, children: [], isRollup: false })
  }
  attachChecklist(rows, await fetchChecklists(collectTaskIds(rows)))
  return { ...base, rows }
}

async function byStaff({ staffId, month, year, forceAssignedTo, includeChildren = true }) {
  const id = forceAssignedTo || staffId
  if (!id || !month || !year) throw Object.assign(new Error('Thiếu staffId / month / year'), { status: 400 })
  const { rows: uRows } = await query('SELECT name FROM users WHERE id = $1', [id])
  if (!uRows[0]) throw Object.assign(new Error('Nhân viên không tồn tại'), { status: 404 })
  const m = parseInt(month, 10), y = parseInt(year, 10)
  const periodStart = `${y}-${String(m).padStart(2, '0')}-01`
  const srcLabels = await loadSourceLabels()

  const params = [id, periodStart]
  const cond = "t.assigned_to = $1 AND t.source = 'auto'"

  let rows = (await runProgressQuery(
    `${cond} AND ${MONTH_COND}`, params, 'c.name, t.created_at DESC',
  )).map((r) => mapTaskRow(r, srcLabels))

  // Đánh dấu việc con: gắn tên "đợt cha" (việc con có thể giao cho người khác cha).
  if (includeChildren) {
    const pIds = [...new Set(rows.filter((r) => r.parentTaskId).map((r) => r.parentTaskId))]
    if (pIds.length) {
      const { rows: pr } = await query('SELECT id, title FROM tasks WHERE id = ANY($1)', [pIds])
      const titleById = new Map(pr.map((p) => [p.id, p.title]))
      rows = rows.map((r) => (r.parentTaskId ? { ...r, isChild: true, parentTitle: titleById.get(r.parentTaskId) ?? null } : r))
    }
  }
  attachChecklist(rows, await fetchChecklists(collectTaskIds(rows)))

  return {
    view: 'staff',
    subject: { id, name: uRows[0].name },
    period: { month: m, year: y, label: `Tháng ${m}/${y}` },
    includeChildren: !!includeChildren,
    rows,
  }
}

// Theo công ty dạng MA TRẬN (giống Theo quy trình mẫu) — mỗi quy trình của công ty = 1 ma trận.
// Dùng useManualCols=true → lịch TỰ TẠO cũng hiện cột (trong 1 công ty+1 quy trình nên không phân mảnh).
async function companyMatrices({ companyId, month, year, includeChildren = true, forceAssignedTo }) {
  if (!companyId || !month || !year) throw Object.assign(new Error('Thiếu companyId / month / year'), { status: 400 })
  const { rows: coRows } = await query('SELECT name, tax_code FROM companies WHERE id = $1', [companyId])
  if (!coRows[0]) throw Object.assign(new Error('Công ty không tồn tại'), { status: 404 })
  const m = parseInt(month, 10), y = parseInt(year, 10)
  const periodStart = `${y}-${String(m).padStart(2, '0')}-01`

  const params = [companyId, periodStart]
  let cond = "t.company_id = $1 AND t.source = 'auto' AND t.parent_task_id IS NULL AND t.task_type_id IS NOT NULL"
  if (forceAssignedTo) { params.push(forceAssignedTo); cond += ` AND t.assigned_to = $${params.length}` }
  const { rows: types } = await query(`
    SELECT t.task_type_id AS id, COALESCE(tt.name, '(Không tên)') AS name, tt.group_name
    FROM tasks t LEFT JOIN task_types tt ON tt.id = t.task_type_id
    WHERE ${cond} AND ${MONTH_COND}
    GROUP BY t.task_type_id, tt.name, tt.group_name
    ORDER BY tt.group_name NULLS LAST, name`, params)

  const matrices = []
  for (const ty of types) {
    const mx = await getMatrix({
      taskTypeId: ty.id, companyId, month, year,
      importantOnly: false, collapse: false, includeChildren, useManualCols: true, forceAssignedTo,
    })
    if (mx.rows.length) matrices.push(mx)
  }
  return {
    view: 'company',
    subject: { id: companyId, name: coRows[0].name, taxCode: coRows[0].tax_code },
    period: { month: m, year: y, label: `Tháng ${m}/${y}` },
    includeChildren: !!includeChildren,
    matrices,
  }
}

// Xuất Excel đúng layout mẫu KH gửi (ma trận quy trình). includeSet = bộ cột tùy chọn bật.
async function exportMatrix(matrix, includeSet) {
  const has = (k) => !includeSet || includeSet.has(k)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kế Toán Tâm An'
  const ws = wb.addWorksheet('Tiến độ')

  // Cột định danh (Tên KH luôn có; MST / NV quản lý tùy chọn)
  const fmtD = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')
  const idCols = [
    { header: 'Tên khách hàng', get: (r) => r.companyName },
    { header: 'Đợt (hạn)',      get: (r) => fmtD(r.dueDate) || fmtD(r.startDate) },
  ]
  if (has('taxCode'))  idCols.push({ header: 'Mã số thuế', get: (r) => r.taxCode || '' })
  if (has('assignee')) idCols.push({ header: 'NV quản lý', get: (r) => r.assigneeName || '' })
  if (has('children')) idCols.push({ header: 'Việc con', get: (r) => (r.childTasks && r.childTasks.total ? `${r.childTasks.done}/${r.childTasks.total}` : '') })
  const idCount = idCols.length

  const stepCols  = matrix.columns
  const totalCols = idCount + stepCols.length
  const hasGroups = stepCols.some((c) => c.group)
  // Nhãn header cột: chế độ gộp → thêm "(N mục)" cho cột cha để rõ đây là nhóm gộp.
  const colHeader = (c) => (c.isGroup && c.childCount ? `${c.stepText} (${c.childCount} mục)` : c.stepText)
  // Giá trị ô Excel — khớp đúng với những gì thấy trên màn hình:
  //   không áp dụng (bước bị lịch của khách loại trừ) → '–' + nền xám
  //   đã xong → '✓'   ·   xong một phần → '2/5'   ·   chưa làm → để trống
  // Trước đây ô "không áp dụng" trả '' nên trong Excel trông y hệt ô "chưa làm",
  // làm mất hẳn thông tin: một bên là KHÔNG PHẢI LÀM, một bên là CHƯA LÀM.
  const cellText = (c) => {
    if (c.present === false) return '–'
    if (c.isGroup) return c.done ? '✓' : `${c.doneCount}/${c.total}`
    return c.done ? '✓' : ''
  }

  // Nền xám cho ô không áp dụng — tương ứng vùng sọc chéo trên giao diện.
  // Dùng nền ĐẶC thay vì kiểu sọc của Excel vì sọc hiển thị không đồng nhất
  // giữa Excel, LibreOffice và Google Sheets.
  const FILL_KHONG_AP_DUNG = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

  // Dòng 1: tiêu đề
  ws.mergeCells(1, 1, 1, totalCols)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = `BẢNG THEO DÕI TIẾN ĐỘ ${String(matrix.taskType.name).toUpperCase()} VỚI KH - ${matrix.period.label}`
  titleCell.font = { bold: true, size: 13, color: { argb: 'FF1e3a8a' } }
  titleCell.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 26

  const headerStyle = (cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1d4ed8' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  }

  let dataStartRow
  if (hasGroups) {
    // Header 2 tầng: dòng 2 = nhóm (mục chính, merge ngang), dòng 3 = mục con/mục lẻ
    idCols.forEach((c, i) => {
      const col = i + 1
      ws.mergeCells(2, col, 3, col)
      const cell = ws.getCell(2, col); cell.value = c.header; headerStyle(cell)
    })
    let c = idCount + 1, i = 0
    while (i < stepCols.length) {
      const g = stepCols[i].group
      if (g) {
        let j = i
        while (j < stepCols.length && stepCols[j].group === g) j++
        ws.mergeCells(2, c, 2, c + (j - i) - 1)
        const gc = ws.getCell(2, c); gc.value = g; headerStyle(gc)
        for (let k = i; k < j; k++) { const sc = ws.getCell(3, c); sc.value = stepCols[k].stepText; headerStyle(sc); c++ }
        i = j
      } else {
        ws.mergeCells(2, c, 3, c)
        const sc = ws.getCell(2, c); sc.value = stepCols[i].stepText; headerStyle(sc)
        c++; i++
      }
    }
    ws.getRow(2).height = 24
    ws.getRow(3).height = 44
    dataStartRow = 4
  } else {
    const headerRow = ws.getRow(2)
    headerRow.values = [...idCols.map((c) => c.header), ...stepCols.map(colHeader)]
    for (let cc = 1; cc <= totalCols; cc++) headerStyle(ws.getCell(2, cc))
    headerRow.height = 46
    dataStartRow = 3
  }

  // Dòng dữ liệu
  let rIdx = dataStartRow
  for (const r of matrix.rows) {
    const row = ws.getRow(rIdx++)
    row.values = [...idCols.map((c) => c.get(r)), ...r.cells.map(cellText)]
    // Tô nền các ô không áp dụng. Phải làm SAU khi gán row.values vì gán mảng
    // sẽ tạo lại ô và xoá style đã đặt trước đó.
    r.cells.forEach((c, i) => {
      if (c.present === false) {
        const o = row.getCell(idCount + 1 + i)
        o.fill = FILL_KHONG_AP_DUNG
        o.font = { color: { argb: 'FF94A3B8' } }
      }
    })
  }

  applyGrid(ws, totalCols, idCount)
  ws.getColumn(1).width = 28
  for (let i = 2; i <= idCount; i++) ws.getColumn(i).width = 16
  for (let i = idCount + 1; i <= totalCols; i++) ws.getColumn(i).width = 15
  ws.views = [{ state: 'frozen', xSplit: idCount, ySplit: dataStartRow - 1 }]

  // Chuẩn hoá font Calibri 11 + border đen mọi ô; GIỮ nền/màu tiêu đề + header nhóm (headerRows:0),
  // GIỮ freeze đa tầng đã set ở trên (freeze:false). Khôi phục cỡ tiêu đề (bị ép về 11).
  applyStandardStyle(ws, { headerRows: 0, freeze: false })
  ws.getCell(1, 1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1e3a8a' } }

  return wb.xlsx.writeBuffer()
}

// Viền + căn giữa cột sau idCount (ô dữ liệu)
function applyGrid(ws, totalCols, centerAfter) {
  for (let rIdx = 2; rIdx <= ws.rowCount; rIdx++) {
    const row = ws.getRow(rIdx)
    for (let cIdx = 1; cIdx <= totalCols; cIdx++) {
      const cell = row.getCell(cIdx)
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left:   { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right:  { style: 'thin', color: { argb: 'FFCBD5E1' } },
      }
      if (rIdx > 2 && cIdx > centerAfter) cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
  }
}

// Xuất Excel bảng tiến độ tổng hợp (view = company | staff). data = { view, subject, period, rows }
async function buildSummaryExcel(data, includeSet) {
  const has = (k) => !includeSet || includeSet.has(k)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kế Toán Tâm An'
  const ws = wb.addWorksheet('Tiến độ')

  // Tiến độ thích ứng: có checklist → X/Y (%); không → % suy từ trạng thái
  const progressText = (r) => (r.hasChecklist ? `${r.doneSteps}/${r.totalSteps} (${r.percent}%)` : `${r.percent}%`)
  const colDefs = data.view === 'company'
    ? [
        // Việc con hiện lồng dưới cha (thụt "↳"); dòng cha gộp nhiều con hiển thị tên quy trình.
        { key: 'taskType', header: 'Quy trình',    always: true, get: (r) => (r._child ? `    ↳ ${r.title || r.taskTypeName}` : r.taskTypeName) },
        { key: 'source',   header: 'Nguồn',                      get: (r) => r.sourceLabel },
        { key: 'assignee', header: 'NV phụ trách',               get: (r) => r.assigneeName || '' },
        { key: 'progress', header: 'Tiến độ',                    get: progressText },
        { key: 'status',   header: 'Trạng thái',                 get: (r) => r.statusLabel },
        { key: 'dueDate',  header: 'Hết hạn',                    get: (r) => fmtDate(r.dueDate) },
      ]
    : [
        { key: 'company',  header: 'Công ty',     always: true, get: (r) => r.companyName },
        { key: 'taskType', header: 'Quy trình',                 get: (r) => ((r.isChild && r.parentTitle) ? `↳ ${r.taskTypeName} (việc con của ${r.parentTitle})` : r.taskTypeName) },
        { key: 'source',   header: 'Nguồn',                     get: (r) => r.sourceLabel },
        { key: 'progress', header: 'Tiến độ',                   get: progressText },
        { key: 'status',   header: 'Trạng thái',                get: (r) => r.statusLabel },
        { key: 'dueDate',  header: 'Hết hạn',                   get: (r) => fmtDate(r.dueDate) },
      ]
  const cols = colDefs.filter((c) => c.always || has(c.key))
  const totalCols = cols.length

  // Company: bung việc con thành dòng lồng (thụt) ngay dưới dòng đợt cha.
  const flatRows = []
  for (const r of data.rows) {
    flatRows.push(r)
    if (data.view === 'company' && Array.isArray(r.children) && r.children.length) {
      for (const ch of r.children) flatRows.push({ ...ch, _child: true })
    }
  }

  ws.mergeCells(1, 1, 1, totalCols)
  const titleCell = ws.getCell(1, 1)
  const subj = data.view === 'company' ? `CÔNG TY ${data.subject.name}` : `NHÂN VIÊN ${data.subject.name}`
  titleCell.value = `BẢNG TIẾN ĐỘ CÔNG VIỆC — ${subj.toUpperCase()} — ${data.period.label}`
  titleCell.font = { bold: true, size: 13, color: { argb: 'FF1e3a8a' } }
  titleCell.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 26

  const headerRow = ws.getRow(2)
  headerRow.values = cols.map((c) => c.header)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1d4ed8' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  headerRow.height = 28

  for (const r of flatRows) ws.addRow(cols.map((c) => c.get(r)))

  applyGrid(ws, totalCols, 1)
  ws.getColumn(1).width = 30
  for (let i = 2; i <= totalCols; i++) ws.getColumn(i).width = 18
  ws.views = [{ state: 'frozen', ySplit: 2 }]

  // Chuẩn hoá font Calibri 11 + border đen mọi ô; GIỮ nền tiêu đề + header xanh (headerRows:0),
  // GIỮ freeze (freeze:false). Khôi phục cỡ tiêu đề.
  applyStandardStyle(ws, { headerRows: 0, freeze: false })
  ws.getCell(1, 1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1e3a8a' } }

  return wb.xlsx.writeBuffer()
}

// Entry export thống nhất 3 view + chọn cột → { buffer, nameBase }
async function exportReport({ view = 'matrix', taskTypeId, companyId, staffId, month, year, source, columns, collapse = false, importantOnly = true, includeChildren = true, forceAssignedTo }) {
  const includeSet = Array.isArray(columns) && columns.length ? new Set(columns) : null
  if (view === 'company') {
    const data = await byCompany({ companyId, month, year, source, forceAssignedTo, includeChildren })
    return { buffer: await buildSummaryExcel(data, includeSet), nameBase: `cong-ty-${slug(data.subject.name)}`, period: data.period }
  }
  if (view === 'staff') {
    const data = await byStaff({ staffId, month, year, source, forceAssignedTo, includeChildren })
    return { buffer: await buildSummaryExcel(data, includeSet), nameBase: `nhan-vien-${slug(data.subject.name)}`, period: data.period }
  }
  const mx = await getMatrix({ taskTypeId, month, year, source, collapse, importantOnly, includeChildren, forceAssignedTo })
  return { buffer: await exportMatrix(mx, includeSet), nameBase: slug(mx.taskType.name), period: mx.period }
}

module.exports = { listTaskTypes, listYears, listSources, getMatrix, byCompany, byStaff, companyMatrices, exportReport }

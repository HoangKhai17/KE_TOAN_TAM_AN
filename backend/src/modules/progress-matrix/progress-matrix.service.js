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
async function getMatrix({ taskTypeId, month, year, source, forceAssignedTo }) {
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

  // Cột = các bước checklist của quy trình
  const { rows: cols } = await query(
    `SELECT step_order, step_text FROM task_type_checklist_templates
     WHERE task_type_id = $1 ORDER BY step_order, id`,
    [taskTypeId],
  )

  // Hàng = phiếu của quy trình có kỳ rơi vào tháng (1 phiếu mới nhất / công ty)
  const params = [taskTypeId, periodStart]
  let staffCond = ''
  if (forceAssignedTo) { params.push(forceAssignedTo); staffCond += ` AND t.assigned_to = $${params.length}` }
  const srcArr = parseSources(source)
  if (srcArr) { params.push(srcArr); staffCond += ` AND t.source = ANY($${params.length})` }
  const { rows: tasks } = await query(`
    SELECT DISTINCT ON (t.company_id)
           t.id, t.company_id, t.assigned_to,
           c.name AS company_name, c.tax_code,
           u.name AS assignee_name
    FROM tasks t
    JOIN companies c ON c.id = t.company_id
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.task_type_id = $1
      AND COALESCE(t.start_date, t.due_date) >= $2::date
      AND COALESCE(t.start_date, t.due_date) <  ($2::date + INTERVAL '1 month')
      ${staffCond}
    ORDER BY t.company_id, t.created_at DESC
  `, params)

  // Checklist items của các phiếu trên
  const itemsByTask = new Map()
  if (tasks.length) {
    const taskIds = tasks.map((t) => t.id)
    const { rows: items } = await query(
      `SELECT task_id, step_text, is_completed, completed_at
       FROM task_checklist_items WHERE task_id = ANY($1)`,
      [taskIds],
    )
    for (const it of items) {
      if (!itemsByTask.has(it.task_id)) itemsByTask.set(it.task_id, new Map())
      itemsByTask.get(it.task_id).set(it.step_text, it)
    }
  }

  const rows = tasks
    .map((t) => {
      const itemMap = itemsByTask.get(t.id) || new Map()
      return {
        companyId:    t.company_id,
        companyName:  t.company_name,
        taxCode:      t.tax_code,
        assigneeName: t.assignee_name,
        taskId:       t.id,
        cells: cols.map((col) => {
          const it = itemMap.get(col.step_text)
          return { stepText: col.step_text, done: it ? it.is_completed : false, completedAt: it?.completed_at ?? null }
        }),
      }
    })
    .sort((a, b) => String(a.companyName).localeCompare(String(b.companyName), 'vi'))

  return {
    taskType: { id: taskType.id, name: taskType.name, groupName: taskType.group_name },
    period:   { month: m, year: y, label: `Tháng ${m}/${y}` },
    columns:  cols.map((c) => ({ stepOrder: c.step_order, stepText: c.step_text })),
    rows,
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

// Danh sách nguồn task có trong dữ liệu (cho dropdown lọc) — nhãn từ enum
async function listSources() {
  const labels = await loadSourceLabels()
  const { rows } = await query(`SELECT DISTINCT source FROM tasks WHERE source IS NOT NULL ORDER BY source`)
  return rows.map((r) => ({ key: r.source, label: labels[r.source] ?? r.source }))
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

// Mỗi hàng = 1 phiếu, kèm tiến độ THÍCH ỨNG (checklist nếu có, không thì theo trạng thái) + nguồn
async function summaryRows({ scope, id, month, year, source, forceAssignedTo }) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const periodStart = `${y}-${String(m).padStart(2, '0')}-01`
  const params = [id, periodStart]
  let scopeCond = scope === 'company' ? 't.company_id = $1' : 't.assigned_to = $1'
  if (scope === 'company' && forceAssignedTo) {
    params.push(forceAssignedTo)
    scopeCond += ` AND t.assigned_to = $${params.length}`
  }
  const srcArr = parseSources(source)
  if (srcArr) { params.push(srcArr); scopeCond += ` AND t.source = ANY($${params.length})` }

  // LEFT JOIN task_types: task ad-hoc (tự sắp xếp / KH yêu cầu / ra ngoài) KHÔNG có task_type
  // → vẫn phải hiện. Tên "Quy trình" lấy tt.name, không có thì lấy tiêu đề task.
  const { rows } = await query(`
    SELECT t.id, t.title, t.status, t.source, t.due_date, t.period_label,
           COALESCE(tt.name, t.title) AS task_type_name,
           c.name AS company_name, c.tax_code,
           u.name AS assignee_name,
           cl.total, cl.done
    FROM tasks t
    LEFT JOIN task_types tt ON tt.id = t.task_type_id
    JOIN companies  c  ON c.id  = t.company_id
    LEFT JOIN users u  ON u.id  = t.assigned_to
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_completed = TRUE) AS done
      FROM task_checklist_items ci WHERE ci.task_id = t.id
    ) cl ON TRUE
    WHERE ${scopeCond}
      AND COALESCE(t.start_date, t.due_date) >= $2::date
      AND COALESCE(t.start_date, t.due_date) <  ($2::date + INTERVAL '1 month')
    ORDER BY ${scope === 'company' ? 'COALESCE(tt.name, t.title)' : 'c.name'}, t.created_at DESC
  `, params)

  const srcLabels = await loadSourceLabels()
  return rows.map((r) => {
    const total = parseInt(r.total, 10) || 0
    const done = parseInt(r.done, 10) || 0
    const hasChecklist = total > 0
    const statusLabel = STATUS_LABELS[r.status] ?? r.status
    // Tiến độ thích ứng: hoàn thành = 100; có checklist → done/total; không → suy từ trạng thái
    const percent = r.status === 'completed'
      ? 100
      : hasChecklist ? Math.round(done * 100 / total) : (STATUS_PROGRESS[r.status] ?? 0)
    return {
      taskId:       r.id,
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
  })
}

async function byCompany({ companyId, month, year, source, forceAssignedTo }) {
  if (!companyId || !month || !year) throw Object.assign(new Error('Thiếu companyId / month / year'), { status: 400 })
  const { rows } = await query('SELECT name, tax_code FROM companies WHERE id = $1', [companyId])
  if (!rows[0]) throw Object.assign(new Error('Công ty không tồn tại'), { status: 404 })
  const m = parseInt(month, 10), y = parseInt(year, 10)
  return {
    view: 'company',
    subject: { id: companyId, name: rows[0].name, taxCode: rows[0].tax_code },
    period: { month: m, year: y, label: `Tháng ${m}/${y}` },
    rows: await summaryRows({ scope: 'company', id: companyId, month, year, source, forceAssignedTo }),
  }
}

async function byStaff({ staffId, month, year, source, forceAssignedTo }) {
  const id = forceAssignedTo || staffId
  if (!id || !month || !year) throw Object.assign(new Error('Thiếu staffId / month / year'), { status: 400 })
  const { rows } = await query('SELECT name FROM users WHERE id = $1', [id])
  if (!rows[0]) throw Object.assign(new Error('Nhân viên không tồn tại'), { status: 404 })
  const m = parseInt(month, 10), y = parseInt(year, 10)
  return {
    view: 'staff',
    subject: { id, name: rows[0].name },
    period: { month: m, year: y, label: `Tháng ${m}/${y}` },
    rows: await summaryRows({ scope: 'staff', id, month, year, source }),
  }
}

// Xuất Excel đúng layout mẫu KH gửi (ma trận quy trình). includeSet = bộ cột tùy chọn bật.
async function exportMatrix(matrix, includeSet) {
  const has = (k) => !includeSet || includeSet.has(k)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kế Toán Tâm An'
  const ws = wb.addWorksheet('Tiến độ')

  // Cột định danh (Tên KH luôn có; MST / NV quản lý tùy chọn)
  const idCols = [{ header: 'Tên khách hàng', get: (r) => r.companyName }]
  if (has('taxCode'))  idCols.push({ header: 'Mã số thuế', get: (r) => r.taxCode || '' })
  if (has('assignee')) idCols.push({ header: 'NV quản lý', get: (r) => r.assigneeName || '' })
  const idCount = idCols.length

  const stepHeaders = matrix.columns.map((c) => c.stepText)
  const headers = [...idCols.map((c) => c.header), ...stepHeaders]
  const totalCols = headers.length

  // Dòng 1: tiêu đề
  ws.mergeCells(1, 1, 1, totalCols)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = `BẢNG THEO DÕI TIẾN ĐỘ ${String(matrix.taskType.name).toUpperCase()} VỚI KH - ${matrix.period.label}`
  titleCell.font = { bold: true, size: 13, color: { argb: 'FF1e3a8a' } }
  titleCell.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 26

  // Dòng 2: header
  const headerRow = ws.getRow(2)
  headerRow.values = headers
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1d4ed8' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  headerRow.height = 46

  // Dòng dữ liệu
  for (const r of matrix.rows) {
    ws.addRow([...idCols.map((c) => c.get(r)), ...r.cells.map((c) => (c.done ? 'x' : ''))])
  }

  applyGrid(ws, totalCols, idCount)
  ws.getColumn(1).width = 28
  for (let i = 2; i <= idCount; i++) ws.getColumn(i).width = 16
  for (let i = idCount + 1; i <= totalCols; i++) ws.getColumn(i).width = 15
  ws.views = [{ state: 'frozen', xSplit: idCount, ySplit: 2 }]

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
        { key: 'taskType', header: 'Quy trình',    always: true, get: (r) => r.taskTypeName },
        { key: 'source',   header: 'Nguồn',                      get: (r) => r.sourceLabel },
        { key: 'assignee', header: 'NV phụ trách',               get: (r) => r.assigneeName || '' },
        { key: 'progress', header: 'Tiến độ',                    get: progressText },
        { key: 'status',   header: 'Trạng thái',                 get: (r) => r.statusLabel },
        { key: 'dueDate',  header: 'Hết hạn',                    get: (r) => fmtDate(r.dueDate) },
      ]
    : [
        { key: 'company',  header: 'Công ty',     always: true, get: (r) => r.companyName },
        { key: 'taskType', header: 'Quy trình',                 get: (r) => r.taskTypeName },
        { key: 'source',   header: 'Nguồn',                     get: (r) => r.sourceLabel },
        { key: 'progress', header: 'Tiến độ',                   get: progressText },
        { key: 'status',   header: 'Trạng thái',                get: (r) => r.statusLabel },
        { key: 'dueDate',  header: 'Hết hạn',                   get: (r) => fmtDate(r.dueDate) },
      ]
  const cols = colDefs.filter((c) => c.always || has(c.key))
  const totalCols = cols.length

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

  for (const r of data.rows) ws.addRow(cols.map((c) => c.get(r)))

  applyGrid(ws, totalCols, 1)
  ws.getColumn(1).width = 30
  for (let i = 2; i <= totalCols; i++) ws.getColumn(i).width = 18
  ws.views = [{ state: 'frozen', ySplit: 2 }]

  return wb.xlsx.writeBuffer()
}

// Entry export thống nhất 3 view + chọn cột → { buffer, nameBase }
async function exportReport({ view = 'matrix', taskTypeId, companyId, staffId, month, year, source, columns, forceAssignedTo }) {
  const includeSet = Array.isArray(columns) && columns.length ? new Set(columns) : null
  if (view === 'company') {
    const data = await byCompany({ companyId, month, year, source, forceAssignedTo })
    return { buffer: await buildSummaryExcel(data, includeSet), nameBase: `cong-ty-${slug(data.subject.name)}`, period: data.period }
  }
  if (view === 'staff') {
    const data = await byStaff({ staffId, month, year, source, forceAssignedTo })
    return { buffer: await buildSummaryExcel(data, includeSet), nameBase: `nhan-vien-${slug(data.subject.name)}`, period: data.period }
  }
  const mx = await getMatrix({ taskTypeId, month, year, source, forceAssignedTo })
  return { buffer: await exportMatrix(mx, includeSet), nameBase: slug(mx.taskType.name), period: mx.period }
}

module.exports = { listTaskTypes, listYears, listSources, getMatrix, byCompany, byStaff, exportReport }

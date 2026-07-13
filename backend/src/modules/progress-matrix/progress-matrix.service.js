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

  // Nhãn cột lấy từ mẫu HIỆN TẠI (chỉ để hiển thị); dữ liệu khớp theo id nên đổi tên không sai.
  const { rows: templ } = await query(
    `SELECT id, step_order, step_text, level FROM task_type_checklist_templates
     WHERE task_type_id = $1 ORDER BY step_order, id`,
    [taskTypeId],
  )
  const templById = new Map(templ.map((t) => [t.id, t]))

  // Hàng = phiếu của quy trình có kỳ rơi vào tháng (1 phiếu mới nhất / công ty)
  const params = [taskTypeId, periodStart]
  let staffCond = ''
  if (forceAssignedTo) { params.push(forceAssignedTo); staffCond += ` AND t.assigned_to = $${params.length}` }
  const srcArr = parseSources(source)
  if (srcArr) { params.push(srcArr); staffCond += ` AND t.source = ANY($${params.length})` }
  // 1 dòng = 1 PHIẾU (đợt). Quy trình lặp (5 ngày/lần…) → 1 công ty có nhiều đợt/tháng, hiện đủ.
  const { rows: tasks } = await query(`
    SELECT t.id, t.company_id, t.assigned_to,
           t.start_date, t.due_date, t.period_label,
           c.name AS company_name, c.tax_code,
           u.name AS assignee_name
    FROM tasks t
    JOIN companies c ON c.id = t.company_id
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.task_type_id = $1
      AND COALESCE(t.start_date, t.due_date) >= $2::date
      AND COALESCE(t.start_date, t.due_date) <  ($2::date + INTERVAL '1 month')
      ${staffCond}
    ORDER BY c.name, COALESCE(t.due_date, t.start_date), t.created_at
  `, params)

  // Gom checklist items của các phiếu — KHỚP THEO source_step_id (không theo chữ).
  const itemsByTask = new Map()   // task_id -> Map(source_step_id -> item)
  const customByTask = new Map()  // task_id -> { total, done }  (bước user tự thêm: source_step_id null)
  const stepAgg = new Map()       // source_step_id -> { sourceStepId, stepOrder, text, parentId }
  const parentIds = new Set()     // source_step_id nào từng làm CHA của bước khác

  if (tasks.length) {
    const taskIds = tasks.map((t) => t.id)
    const { rows: items } = await query(
      `SELECT task_id, source_step_id, source_parent_id, level, step_text, step_order, is_completed, completed_at
       FROM task_checklist_items WHERE task_id = ANY($1)`,
      [taskIds],
    )
    for (const it of items) {
      // Bước tự thêm (không thuộc mẫu) → gộp vào badge "bước riêng", không thành cột.
      if (it.source_step_id == null) {
        const c = customByTask.get(it.task_id) || { total: 0, done: 0 }
        c.total++; if (it.is_completed) c.done++
        customByTask.set(it.task_id, c)
        continue
      }
      if (!itemsByTask.has(it.task_id)) itemsByTask.set(it.task_id, new Map())
      itemsByTask.get(it.task_id).set(it.source_step_id, it)

      if (!stepAgg.has(it.source_step_id)) {
        const t = templById.get(it.source_step_id)
        stepAgg.set(it.source_step_id, {
          sourceStepId: it.source_step_id,
          stepOrder:    t?.step_order ?? it.step_order ?? 0,
          text:         t?.step_text ?? it.step_text,   // đổi tên mẫu → hiện tên mới; mẫu bị xoá → giữ tên lúc tạo
          parentId:     it.source_parent_id ?? null,
        })
      }
      if (it.source_parent_id != null) parentIds.add(it.source_parent_id)
    }
  }

  const labelOf = (id) => stepAgg.get(id)?.text ?? templById.get(id)?.step_text ?? null

  // Cột hiển thị = các bước LEAF (không đóng vai CHA của bước nào trong kỳ này).
  const cols = [...stepAgg.values()]
    .filter((s) => !parentIds.has(s.sourceStepId))
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((s) => ({
      sourceStepId: s.sourceStepId,
      stepOrder:    s.stepOrder,
      stepText:     s.text,
      group:        s.parentId ? labelOf(s.parentId) : null,   // nhãn nhóm cha
      groupId:      s.parentId ?? null,
    }))

  const rows = tasks
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
        // present=false → task này KHÔNG có bước đó (tô xám, khác với "có nhưng chưa xong")
        cells: cols.map((col) => {
          const it = map.get(col.sourceStepId)
          return {
            sourceStepId: col.sourceStepId,
            stepText:     col.stepText,
            present:      !!it,
            done:         it ? it.is_completed : false,
            completedAt:  it?.completed_at ?? null,
          }
        }),
        custom: { total: cust.total, done: cust.done },   // badge "+N bước riêng (x/N)"
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
      -- Chỉ đếm mục leaf (mục phụ, hoặc mục chính không con) — mục chính có con là nhóm
      SELECT COUNT(*) FILTER (WHERE is_leaf) AS total,
             COUNT(*) FILTER (WHERE is_leaf AND is_completed) AS done
      FROM (
        SELECT is_completed,
               NOT (level = 0 AND COALESCE(LEAD(level) OVER (ORDER BY step_order, id), 0) = 1) AS is_leaf
        FROM task_checklist_items WHERE task_id = t.id
      ) z
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
  const fmtD = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')
  const idCols = [
    { header: 'Tên khách hàng', get: (r) => r.companyName },
    { header: 'Đợt (hạn)',      get: (r) => fmtD(r.dueDate) || fmtD(r.startDate) },
  ]
  if (has('taxCode'))  idCols.push({ header: 'Mã số thuế', get: (r) => r.taxCode || '' })
  if (has('assignee')) idCols.push({ header: 'NV quản lý', get: (r) => r.assigneeName || '' })
  const idCount = idCols.length

  const stepCols  = matrix.columns
  const totalCols = idCount + stepCols.length
  const hasGroups = stepCols.some((c) => c.group)

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
    headerRow.values = [...idCols.map((c) => c.header), ...stepCols.map((c) => c.stepText)]
    for (let cc = 1; cc <= totalCols; cc++) headerStyle(ws.getCell(2, cc))
    headerRow.height = 46
    dataStartRow = 3
  }

  // Dòng dữ liệu
  let rIdx = dataStartRow
  for (const r of matrix.rows) {
    const row = ws.getRow(rIdx++)
    row.values = [...idCols.map((c) => c.get(r)), ...r.cells.map((c) => (c.done ? 'x' : ''))]
  }

  applyGrid(ws, totalCols, idCount)
  ws.getColumn(1).width = 28
  for (let i = 2; i <= idCount; i++) ws.getColumn(i).width = 16
  for (let i = idCount + 1; i <= totalCols; i++) ws.getColumn(i).width = 15
  ws.views = [{ state: 'frozen', xSplit: idCount, ySplit: dataStartRow - 1 }]

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

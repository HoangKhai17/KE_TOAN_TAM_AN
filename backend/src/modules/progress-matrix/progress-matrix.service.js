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
async function getMatrix({ taskTypeId, month, year, forceAssignedTo }) {
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
  if (forceAssignedTo) { params.push(forceAssignedTo); staffCond = `AND t.assigned_to = $${params.length}` }
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

// Xuất Excel đúng layout mẫu KH gửi
async function exportMatrix(matrix) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kế Toán Tâm An'
  const ws = wb.addWorksheet('Tiến độ')

  const fixed = ['Tên khách hàng', 'Mã số thuế', 'NV quản lý']
  const stepHeaders = matrix.columns.map((c) => c.stepText)
  const headers = [...fixed, ...stepHeaders]
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
    ws.addRow([r.companyName, r.taxCode || '', r.assigneeName || '', ...r.cells.map((c) => (c.done ? 'x' : ''))])
  }

  // Căn giữa các ô checklist + viền
  const lastRow = ws.rowCount
  for (let rIdx = 2; rIdx <= lastRow; rIdx++) {
    const row = ws.getRow(rIdx)
    for (let cIdx = 1; cIdx <= totalCols; cIdx++) {
      const cell = row.getCell(cIdx)
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left:   { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right:  { style: 'thin', color: { argb: 'FFCBD5E1' } },
      }
      if (rIdx > 2 && cIdx > 3) cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
  }

  // Độ rộng cột
  ws.getColumn(1).width = 28
  ws.getColumn(2).width = 16
  ws.getColumn(3).width = 16
  for (let i = 4; i <= totalCols; i++) ws.getColumn(i).width = 15
  // Freeze 3 cột trái + 2 dòng đầu
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 2 }]

  return wb.xlsx.writeBuffer()
}

module.exports = { listTaskTypes, listYears, getMatrix, exportMatrix }

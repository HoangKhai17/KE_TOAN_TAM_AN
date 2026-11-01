const { query } = require('../../config/db')
const ExcelJS = require('exceljs')
const { getNextOccurrence } = require('../../utils/recurrence.calculator')
const { applyStandardStyle } = require('../export/excel-renderer')

const isStaffRole = (user) => Boolean(user && user.role === 'staff')

// ── Dự báo: lịch định kỳ sẽ kích hoạt trong tháng chọn ─────────────────────────
async function forecast({ month, year, user }) {
  const targetMonth = parseInt(month, 10)
  const targetYear  = parseInt(year, 10)

  // RBAC: staff chỉ dự báo lịch của công ty MÌNH PHỤ TRÁCH (hoặc lịch giao cho mình)
  const params = []
  let scopeSql = ''
  if (isStaffRole(user)) {
    params.push(user.id)
    scopeSql = ` AND (c.assigned_staff_id = $${params.length} OR cs.assigned_staff_id = $${params.length})`
  }

  const { rows: schedules } = await query(`
    SELECT
      cs.id, cs.recurrence_type, cs.recurrence_config,
      cs.deadline_offset_days, cs.last_generated_at,
      COALESCE(tt.name, cs.title) AS task_type_name,
      COALESCE(cs.group_name, tt.group_name) AS group_name,
      c.name  AS company_name,
      u.name  AS assigned_to_name
    FROM customer_task_schedules cs
    LEFT JOIN task_types tt ON tt.id = cs.task_type_id
    JOIN companies  c  ON c.id  = cs.company_id
    LEFT JOIN users u  ON u.id  = cs.assigned_staff_id
    WHERE cs.is_active = TRUE
      AND c.status != 'terminated'${scopeSql}
    ORDER BY c.name, COALESCE(tt.name, cs.title)
  `, params)

  const result = []
  const monthStart = new Date(targetYear, targetMonth - 1, 1)
  const monthEnd = new Date(targetYear, targetMonth, 0)
  monthStart.setHours(0, 0, 0, 0)
  monthEnd.setHours(23, 59, 59, 999)

  function toDateString(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  for (const s of schedules) {
    const lastGenerated = s.last_generated_at ? new Date(s.last_generated_at) : null
    const cursorStart = lastGenerated && lastGenerated > monthStart ? lastGenerated : new Date(monthStart)
    cursorStart.setDate(cursorStart.getDate() - 1)

    let cursor = cursorStart
    let safety = 370
    while (safety-- > 0) {
      try {
        const triggerDate = getNextOccurrence(
          s.recurrence_type,
          s.recurrence_config,
          cursor
        )
        if (!triggerDate || triggerDate > monthEnd) break

        if (triggerDate >= monthStart) {
          const dueDate = new Date(triggerDate)
          dueDate.setDate(dueDate.getDate() + (s.deadline_offset_days || 0))
          result.push({
            scheduleId:       s.id,
            taskTypeName:     s.task_type_name,
            groupName:        s.group_name,
            companyName:      s.company_name,
            assignedToName:   s.assigned_to_name,
            triggerDate:      toDateString(triggerDate),
            dueDate:          toDateString(dueDate),
            deadlineOffset:   s.deadline_offset_days || 0,
          })
        }

        cursor = triggerDate
      } catch { break /* skip invalid schedule */ }
    }
  }

  return result.sort((a, b) => a.triggerDate.localeCompare(b.triggerDate))
}

// Năm có dữ liệu thực của hệ thống (để lọc Dự báo) — không hardcode năm tương lai.
// Gộp: năm của task đã có + năm của lịch định kỳ (theo last_generated_at) + năm hiện tại.
async function forecastYears() {
  const { rows } = await query(`
    SELECT DISTINCT y FROM (
      SELECT EXTRACT(YEAR FROM due_date)::int AS y FROM tasks WHERE due_date IS NOT NULL
      UNION
      SELECT EXTRACT(YEAR FROM last_generated_at)::int AS y FROM customer_task_schedules WHERE last_generated_at IS NOT NULL
    ) t WHERE y IS NOT NULL
    ORDER BY y DESC
  `)
  const years = rows.map((r) => r.y)
  const cur = new Date().getFullYear()
  if (!years.includes(cur)) years.push(cur)
  return years.sort((a, b) => b - a)
}

// ── Export helpers ────────────────────────────────────────────────────────────

function styleHeader(sheet) {
  const headerRow = sheet.getRow(1)
  headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1d4ed8' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height    = 22
}

async function exportToExcel(type, data) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kế Toán Tâm An'

  if (type === 'forecast') {
    const ws = wb.addWorksheet('Dự Báo')
    ws.columns = [
      { header: 'Công ty',         key: 'companyName',    width: 28 },
      { header: 'Loại CV',         key: 'taskTypeName',   width: 24 },
      { header: 'Nhóm',            key: 'groupName',      width: 18 },
      { header: 'Nhân viên',       key: 'assignedToName', width: 18 },
      { header: 'Ngày kích hoạt',  key: 'triggerDate',    width: 16 },
      { header: 'Hết hạn dự kiến', key: 'dueDate',        width: 16 },
    ]
    data.forEach((r) => ws.addRow(r))
    styleHeader(ws)
  }

  wb.worksheets.forEach((ws) => applyStandardStyle(ws, { headerRows: 1 }))
  return wb.xlsx.writeBuffer()
}

module.exports = {
  forecast,
  forecastYears,
  exportToExcel,
}

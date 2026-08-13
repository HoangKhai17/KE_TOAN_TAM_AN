// ── Bộ sinh Excel DÙNG CHUNG (exceljs) — style chuẩn toàn hệ thống ────────────────
// Frontend gửi dữ liệu đã tính sẵn → backend chỉ format + sinh file theo 1 chuẩn duy nhất.
//
// Contract:
//   { filename, sheets: [{ name, columns:[{label,width,align,type,thousands}],
//                          rows:[[...]], totalRow?:[...], totalPosition?:'top'|'bottom' }] }
//   type ∈ 'text' | 'number' | 'date'
const ExcelJS = require('exceljs')

// ── Chuẩn định dạng (đổi 1 chỗ, áp mọi nơi) ─────────────────────────────────────
const STD_FONT = { name: 'Calibri', size: 11 }
const THIN = { style: 'thin', color: { argb: 'FF000000' } }
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } } // nền header nhạt

function alignFor(type) {
  if (type === 'number') return 'right'
  if (type === 'date') return 'center'
  return 'left'
}

function sanitizeSheetName(name, idx) {
  const bad = /[\\/?*[\]:]/g
  const s = String(name || `Sheet${idx + 1}`)
    .replace(bad, ' ')
    .trim()
    .slice(0, 31)
  return s || `Sheet${idx + 1}`
}

// 'YYYY-MM-DD' → Date (noon UTC để tránh lệch múi giờ khi Excel hiển thị)
function parseISODate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v))
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0))
}

// Ép giá trị theo kiểu cột (số → number, ngày → Date) để Excel format & sort đúng.
function coerceValue(v, type) {
  if (v == null || v === '') return ''
  if (type === 'number') {
    const n = Number(v)
    return Number.isNaN(n) ? v : n
  }
  if (type === 'date') {
    return parseISODate(v) || v
  }
  return v
}

function styleRow(row, cols, { header = false, total = false } = {}) {
  for (let i = 1; i <= cols.length; i++) {
    const cell = row.getCell(i) // getCell tạo ô nếu chưa có → border phủ cả ô trống
    const c = cols[i - 1] || {}
    cell.font = { ...STD_FONT, bold: header || total }
    cell.border = BORDER
    cell.alignment = {
      vertical: 'middle',
      horizontal: c.align || alignFor(c.type),
      wrapText: false,
    }
    if (header) {
      cell.fill = HEADER_FILL
    } else {
      if (c.type === 'number' && c.thousands) cell.numFmt = '#,##0'
      else if (c.type === 'date') cell.numFmt = 'dd/mm/yyyy'
    }
  }
}

function addStyledRow(ws, values, cols, opts) {
  const row = ws.addRow((cols || []).map((c, i) => coerceValue(values?.[i], c.type)))
  styleRow(row, cols, opts)
  return row
}

function buildWorkbook({ sheets } = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KTTA'
  const list =
    Array.isArray(sheets) && sheets.length ? sheets : [{ name: 'Sheet1', columns: [], rows: [] }]
  list.forEach((sheet, idx) => {
    const cols = Array.isArray(sheet.columns) ? sheet.columns : []
    const ws = wb.addWorksheet(sanitizeSheetName(sheet.name, idx), {
      views: [{ state: 'frozen', ySplit: 1 }], // đóng băng hàng tiêu đề
    })
    if (cols.length) ws.columns = cols.map((c) => ({ width: Number(c.width) || 18 }))

    // Header
    styleRow(ws.addRow(cols.map((c) => c.label ?? '')), cols, { header: true })

    // Dòng Tổng ở TRÊN (mặc định)
    const hasTotal = Array.isArray(sheet.totalRow) && sheet.totalRow.length > 0
    if (hasTotal && (sheet.totalPosition || 'top') === 'top')
      addStyledRow(ws, sheet.totalRow, cols, { total: true })

    // Dữ liệu
    for (const r of Array.isArray(sheet.rows) ? sheet.rows : []) addStyledRow(ws, r, cols, {})

    // Dòng Tổng ở DƯỚI (nếu chọn)
    if (hasTotal && sheet.totalPosition === 'bottom')
      addStyledRow(ws, sheet.totalRow, cols, { total: true })
  })
  return wb
}

// Áp STYLE CHUẨN lên một worksheet đã có dữ liệu (dùng cho các module export cũ:
// reports/users/payroll…). Chỉ đổi font→Calibri 11 + border + header đậm/nền + freeze;
// GIỮ bold/màu/căn lề riêng nếu ô đã có. headerRows = số hàng tiêu đề (mặc định 1).
function applyStandardStyle(ws, { headerRows = 1, freeze = true } = {}) {
  const nRows = ws.rowCount
  const nCols = ws.columnCount
  for (let r = 1; r <= nRows; r++) {
    const row = ws.getRow(r)
    const isHeader = r <= headerRows
    for (let c = 1; c <= nCols; c++) {
      const cell = row.getCell(c)
      // Header: ép chữ tối + đậm (tránh chữ trắng của style cũ thành vô hình trên nền nhạt).
      cell.font = isHeader
        ? { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1F2937' } }
        : { ...(cell.font || {}), name: 'Calibri', size: 11, bold: !!(cell.font && cell.font.bold) }
      cell.border = BORDER
      cell.alignment = { vertical: 'middle', ...(cell.alignment || {}) }
      if (isHeader) cell.fill = HEADER_FILL
    }
  }
  if (freeze && headerRows > 0) ws.views = [{ state: 'frozen', ySplit: headerRows }]
}

module.exports = { buildWorkbook, applyStandardStyle }

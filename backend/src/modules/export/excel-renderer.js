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
const SECTION_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FB' } } // nền dải nhóm (nhạt hơn)
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7EE' } }  // nền dòng tổng (xanh lá nhạt)

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
      views: [{ state: 'frozen', ySplit: Array.isArray(sheet.rawRows) ? 0 : 1 }], // đóng băng hàng tiêu đề
    })

    // ── Layout TỰ DO (bám màn hình): mảng hàng {cells, kind:'header'|'section'|'total'|'data', merges} ──
    if (Array.isArray(sheet.rawRows)) {
      if (Array.isArray(sheet.widths)) ws.columns = sheet.widths.map((w) => ({ width: Number(w) || 16 }))
      const H = { title: 30, section: 22, header: 20, total: 20, data: 18, spacer: 8 }
      const ncol = Array.isArray(sheet.widths) && sheet.widths.length ? sheet.widths.length : 1
      for (const rr of sheet.rawRows) {
        const cells = Array.isArray(rr) ? rr : (rr.cells || [])
        const kind = (Array.isArray(rr) ? 'data' : rr.kind) || 'data'
        const strong = ['title', 'header', 'section', 'total'].includes(kind) || (!Array.isArray(rr) && rr.bold)
        const fill = kind === 'header' ? HEADER_FILL : kind === 'section' ? SECTION_FILL : kind === 'total' ? TOTAL_FILL : null
        const row = ws.addRow(cells.map((v) => (v == null ? '' : v)))
        row.height = (!Array.isArray(rr) && rr.height) || H[kind] || 18
        // Style phủ ĐỦ bề rộng (ncol) để ô merge phần đuôi vẫn có viền/nền, nhìn liền mạch.
        for (let i = 1; i <= Math.max(cells.length, ncol); i++) {
          const cell = row.getCell(i)
          const val = cells[i - 1]
          cell.font = { ...STD_FONT, size: kind === 'title' ? 15 : 11, bold: !!strong, color: kind === 'title' ? { argb: 'FF1F4E79' } : undefined }
          if (kind !== 'spacer') cell.border = BORDER
          const hz = kind === 'title' ? 'center' : ((!Array.isArray(rr) && rr.align) || (typeof val === 'number' ? 'right' : 'left'))
          cell.alignment = { vertical: 'middle', horizontal: hz, wrapText: false, indent: kind === 'data' && typeof val !== 'number' ? 1 : 0 }
          if (fill) cell.fill = fill
          if (typeof val === 'number') cell.numFmt = '#,##0'
        }
        const merges = (!Array.isArray(rr) && Array.isArray(rr.merges)) ? rr.merges : []
        for (const m of merges) { try { ws.mergeCells(row.number, m[0], row.number, m[1]) } catch { /* bỏ qua merge lỗi */ } }
      }
      return
    }

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

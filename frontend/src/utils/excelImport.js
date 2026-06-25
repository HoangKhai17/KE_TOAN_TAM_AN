import * as XLSX from 'xlsx'

// Giới hạn kích thước file import — giảm thiểu ReDoS/DoS của xlsx (SheetJS chưa có bản vá).
// Xem docs/14_SECURITY_AUDIT.md (H3). Cách khắc phục triệt để: thay thư viện đọc Excel.
const MAX_IMPORT_BYTES = 5 * 1024 * 1024 // 5MB

// ── Date helpers ───────────────────────────────────────────────────────────────

function fmtDateIso(d) {
  if (!d) return null
  if (d instanceof Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const s = String(d).trim()
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  // Try native parse
  const parsed = new Date(s)
  if (!isNaN(parsed)) return fmtDateIso(parsed)
  return null
}

// ── Template download ──────────────────────────────────────────────────────────

/**
 * @param {Array<{key,label,required,type,example}>} fixedCols
 * @param {Array<{colName,colType}>} dynCols
 * @param {string} filename
 * @param {string} sheetName
 */
export function downloadImportTemplate(fixedCols, dynCols, filename, sheetName = 'Dữ liệu') {
  const allCols = [
    ...fixedCols,
    ...dynCols.map((c) => ({ key: `dyn__${c.colName}`, label: c.colName, required: false, type: c.colType, example: '' })),
  ]

  // Row 1: headers  (mark required with (*))
  const headers = allCols.map((c) => (c.required ? `${c.label} (*)` : c.label))

  // Row 2: example values
  const examples = allCols.map((c) => c.example ?? '')

  const ws = XLSX.utils.aoa_to_sheet([headers, examples])

  // Column widths
  ws['!cols'] = allCols.map((c) => ({ wch: Math.max(headers[allCols.indexOf(c)].length + 4, 18) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  // Instruction sheet
  const instrData = [
    ['HƯỚNG DẪN SỬ DỤNG FILE IMPORT'],
    [''],
    ['• Cột đánh dấu (*) là bắt buộc, không được để trống'],
    ['• Định dạng ngày: YYYY-MM-DD (VD: 2024-06-15) hoặc DD/MM/YYYY'],
    ['• Cột số: chỉ nhập số, không nhập ký tự đặc biệt'],
    ['• Dòng 1 trong sheet "Dữ liệu" là tiêu đề — KHÔNG xoá'],
    ['• Dòng 2 là dòng VD — có thể xoá trước khi điền thật'],
    ['• Điền dữ liệu từ dòng 3 trở đi'],
  ]
  const wsInstr = XLSX.utils.aoa_to_sheet(instrData)
  wsInstr['!cols'] = [{ wch: 60 }]
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Hướng dẫn')

  XLSX.writeFile(wb, filename)
}

// ── Parse file ─────────────────────────────────────────────────────────────────

/**
 * Parse an Excel file and map columns by Vietnamese label.
 * @param {File} file
 * @param {Array<{key,label,required,type}>} fixedCols
 * @param {Array<{colName,colType}>} dynCols
 * @returns {Promise<{rows: object[], parseErrors: string[]}>}
 */
export async function parseImportFile(file, fixedCols, dynCols = []) {
  if (file && file.size > MAX_IMPORT_BYTES) {
    return { rows: [], parseErrors: [`File quá lớn (tối đa ${MAX_IMPORT_BYTES / 1024 / 1024}MB). Vui lòng chia nhỏ file.`] }
  }
  const buffer = await file.arrayBuffer()
  const wb     = XLSX.read(buffer, { type: 'array', cellDates: true })
  const wsName = wb.SheetNames[0]
  const ws     = wb.Sheets[wsName]

  // raw: true keeps dates as Date objects (from cellDates:true), numbers as numbers
  const rawRows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' })

  if (rawRows.length === 0) return { rows: [], parseErrors: ['File không có dữ liệu'] }

  // Build label → column definition map  (strip "(*)")
  const allCols = [
    ...fixedCols,
    ...dynCols.map((c) => ({ key: `dyn__${c.colName}`, label: c.colName, required: false, type: c.colType })),
  ]
  const labelToCol = {}
  for (const col of allCols) {
    labelToCol[col.label]          = col
    labelToCol[`${col.label} (*)`] = col
  }

  const rows        = []
  const parseErrors = []

  for (let i = 0; i < rawRows.length; i++) {
    const raw    = rawRows[i]
    const rowNum = i + 2 // +2 because row 1 is header in sheet
    const obj    = {}
    let   valid  = true

    for (const col of allCols) {
      // Try both label variants (with and without (*))
      let rawVal = raw[col.label] ?? raw[`${col.label} (*)`] ?? ''

      // Coerce by type
      if (col.type === 'date') {
        rawVal = fmtDateIso(rawVal)
        if (rawVal === '' || rawVal === null) rawVal = null
      } else if (col.type === 'number') {
        rawVal = rawVal === '' || rawVal === null ? null : Number(rawVal)
        if (isNaN(rawVal)) rawVal = null
      } else if (col.type === 'integer') {
        rawVal = rawVal === '' || rawVal === null ? null : parseInt(rawVal, 10)
        if (isNaN(rawVal)) rawVal = null
      } else {
        rawVal = rawVal instanceof Date ? fmtDateIso(rawVal) : String(rawVal).trim() || null
      }

      if (col.required && !rawVal && rawVal !== 0) {
        parseErrors.push(`Dòng ${rowNum}: "${col.label}" là bắt buộc`)
        valid = false
      }

      obj[col.key] = rawVal
    }

    rows.push({ ...obj, _rowNum: rowNum, _valid: valid })
  }

  return { rows, parseErrors }
}

// ── Build body for API from a parsed row ───────────────────────────────────────

/**
 * Extract customFields from parsed row (dyn__ prefixed keys).
 */
export function extractCustomFields(row, dynCols) {
  const cf = {}
  for (const col of dynCols) {
    const v = row[`dyn__${col.colName}`]
    if (v !== null && v !== undefined && v !== '') cf[col.colName] = v
  }
  return cf
}

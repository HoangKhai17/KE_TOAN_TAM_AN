const DAY_MS = 86_400_000
const EXCEL_EPOCH_OFFSET = 25569

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Chuẩn ngày clipboard về YYYY-MM-DD. Ưu tiên tuyệt đối dd/mm/yyyy. */
export function parseClipboardDate(input) {
  const value = String(input ?? '').trim()
  if (!value) return null

  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const serial = Number(value)
    if (serial >= 1 && serial <= 2_958_465) {
      // Excel có ngày nhuận giả 29/02/1900; serial trước mốc 60 cần bù riêng.
      const epochOffset = serial < 60 ? EXCEL_EPOCH_OFFSET - 1 : EXCEL_EPOCH_OFFSET
      const date = new Date(Math.floor(serial - epochOffset) * DAY_MS)
      return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
    }
  }

  let match = value.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]))

  match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (match) return isoDate(Number(match[3]), Number(match[2]), Number(match[1]))

  return null
}

/** Đọc TSV/clipboard Excel, có hỗ trợ ô được quote và xuống dòng bên trong ô. */
export function parseClipboardGrid(text) {
  const rows = [[]]
  let cell = ''
  let quoted = false
  const source = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index += 1 }
      else quoted = !quoted
    } else if (char === '\t' && !quoted) {
      rows.at(-1).push(cell); cell = ''
    } else if (char === '\n' && !quoted) {
      rows.at(-1).push(cell); cell = ''; rows.push([])
    } else cell += char
  }
  rows.at(-1).push(cell)
  while (rows.length > 1 && rows.at(-1).every((value) => value === '')) rows.pop()
  return rows
}

export function normalizeClipboardValue(rawValue, column) {
  const raw = String(rawValue ?? '')
  const value = raw.trim()
  const type = column?.dataType || 'text'
  if (!value) return { value: null }

  if (type === 'date') {
    const date = parseClipboardDate(value)
    return date ? { value: date } : { error: `Ngày “${value}” không hợp lệ; dùng dd/mm/yyyy.` }
  }
  if (type === 'number') {
    const number = Number(value.replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(number) ? { value: number } : { error: `Số “${value}” không hợp lệ.` }
  }
  if (type === 'select') {
    const option = (column.options || []).find((item) => String(item).toLocaleLowerCase('vi') === value.toLocaleLowerCase('vi'))
    return option !== undefined ? { value: option } : { error: `“${value}” không thuộc danh sách của cột ${column.label}.` }
  }
  return { value: raw }
}

export function normalizeClipboardGrid(grid, columns) {
  const values = []
  const errors = []
  grid.forEach((row, rowIndex) => {
    const normalizedRow = []
    row.forEach((raw, columnIndex) => {
      const column = columns[columnIndex]
      if (!column) return
      const result = normalizeClipboardValue(raw, column)
      if (result.error) errors.push(`Dòng ${rowIndex + 1}, cột “${column.label}”: ${result.error}`)
      normalizedRow.push(result.value)
    })
    values.push(normalizedRow)
  })
  return { values, errors }
}

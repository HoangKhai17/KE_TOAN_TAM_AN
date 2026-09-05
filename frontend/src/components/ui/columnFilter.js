// ── columnFilter.js ─────────────────────────────────────────────────────────────
// Logic áp dụng bộ lọc header cột — TẬP TRUNG 1 chỗ để mọi trang dùng chung, nhờ đó
// nâng cấp tính năng (thêm operator…) chỉ sửa ở đây. Hỗ trợ CẢ shape cũ lẫn mới nên
// không vỡ trang đang dùng.
//
// Shape giá trị filter theo loại cột:
//   enum        : Set<string>                          — nhãn hiển thị ('' = ô trống)
//   dateRange   : { from, to }
//   text        : { conditions:[{op,value}], join }    (cũ: string = 'chứa')
//   numberRange : { conditions:[{op,value}], join }    (cũ: { min, max })

export const TEXT_OPS = [
  { key: 'contains',    label: 'Chứa' },
  { key: 'notContains', label: 'Không chứa' },
  { key: 'equals',      label: 'Bằng' },
  { key: 'notEquals',   label: 'Khác' },
  { key: 'startsWith',  label: 'Bắt đầu bằng' },
  { key: 'endsWith',    label: 'Kết thúc bằng' },
  { key: 'blank',       label: 'Là trống' },
  { key: 'notBlank',    label: 'Không trống' },
]
// Operator không cần nhập giá trị
const TEXT_NOVALUE = ['blank', 'notBlank']

export const NUM_OPS = [
  { key: 'eq',  label: '=  (bằng)' },
  { key: 'ne',  label: '≠  (khác)' },
  { key: 'gt',  label: '>  (lớn hơn)' },
  { key: 'gte', label: '≥  (lớn hơn hoặc bằng)' },
  { key: 'lt',  label: '<  (nhỏ hơn)' },
  { key: 'lte', label: '≤  (nhỏ hơn hoặc bằng)' },
]

function normText(v) { return String(v ?? '').toLocaleLowerCase('vi').trim() }

function condHasValue(op, value, noValueOps) {
  if (noValueOps.includes(op)) return true
  return String(value ?? '').trim() !== ''
}

// Các điều kiện "có hiệu lực" của một filter text/number
function activeConditions(value, noValueOps) {
  return (value?.conditions || []).filter((c) => condHasValue(c.op, c.value, noValueOps))
}

function matchTextOp(cell, op, value) {
  const c = normText(cell)
  const v = normText(value)
  switch (op) {
    case 'contains':    return c.includes(v)
    case 'notContains': return !c.includes(v)
    case 'equals':      return c === v
    case 'notEquals':   return c !== v
    case 'startsWith':  return c.startsWith(v)
    case 'endsWith':    return c.endsWith(v)
    case 'blank':       return c === ''
    case 'notBlank':    return c !== ''
    default:            return true
  }
}

function matchNumOp(cell, op, value) {
  if (cell == null || isNaN(cell)) return false
  const v = parseFloat(value)
  if (isNaN(v)) return true
  switch (op) {
    case 'eq':  return cell === v
    case 'ne':  return cell !== v
    case 'gt':  return cell > v
    case 'gte': return cell >= v
    case 'lt':  return cell < v
    case 'lte': return cell <= v
    default:    return true
  }
}

// Filter này có đang lọc gì không (để đếm badge, quyết định xoá khỏi state…)
export function isColFilterActive(value, type) {
  if (value == null) return false
  if (type === 'enum')      return value instanceof Set && value.size > 0
  if (type === 'dateRange') return Boolean(value.from || value.to)
  if (type === 'text') {
    if (typeof value === 'string') return value.trim() !== ''
    return activeConditions(value, TEXT_NOVALUE).length > 0
  }
  if (type === 'numberRange') {
    if (value.conditions) return activeConditions(value, []).length > 0
    // legacy { min, max }
    return (value.min !== '' && value.min != null) || (value.max !== '' && value.max != null)
  }
  return false
}

// So khớp 1 dòng với filter. cell = { label, number, date } tùy loại cột.
//   label  : nhãn hiển thị (enum/text)
//   number : giá trị số (numberRange)
//   date   : chuỗi ngày 'YYYY-MM-DD…' (dateRange)
export function matchColFilter(value, type, cell) {
  if (!isColFilterActive(value, type)) return true

  if (type === 'enum') return value.has(cell.label ?? '')

  if (type === 'dateRange') {
    const d = cell.date ? String(cell.date).substring(0, 10) : ''
    if (!d) return false
    if (value.from && d < value.from) return false
    if (value.to   && d > value.to)   return false
    return true
  }

  if (type === 'text') {
    if (typeof value === 'string') return matchTextOp(cell.label, 'contains', value)
    const conds = activeConditions(value, TEXT_NOVALUE)
    if (conds.length === 0) return true
    const results = conds.map((c) => matchTextOp(cell.label, c.op, c.value))
    return value.join === 'or' ? results.some(Boolean) : results.every(Boolean)
  }

  if (type === 'numberRange') {
    if (!value.conditions) {
      // legacy { min, max }
      const num = cell.number
      if (num == null || isNaN(num)) return false
      if (value.min !== '' && value.min != null && num < parseFloat(value.min)) return false
      if (value.max !== '' && value.max != null && num > parseFloat(value.max)) return false
      return true
    }
    const conds = activeConditions(value, [])
    if (conds.length === 0) return true
    const results = conds.map((c) => matchNumOp(cell.number, c.op, c.value))
    return value.join === 'or' ? results.some(Boolean) : results.every(Boolean)
  }

  return true
}

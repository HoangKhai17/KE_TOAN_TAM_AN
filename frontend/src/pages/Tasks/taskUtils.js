import { format, parseISO, isBefore, startOfDay, differenceInDays } from 'date-fns'

export const TASK_STATUSES = ['pending', 'in_progress', 'on_hold', 'pending_review', 'needs_revision', 'completed']

export const STATUS_LABELS = {
  pending:         'Chờ xử lý',
  in_progress:     'Đang thực hiện',
  on_hold:         'Tạm hoãn',
  pending_review:  'Chờ duyệt',
  needs_revision:  'Cần xem lại',
  completed:       'Hoàn thành',
}

export const STATUS_TRANSITIONS = {
  pending:         ['in_progress', 'on_hold'],
  in_progress:     ['on_hold', 'pending_review', 'completed'],
  on_hold:         ['in_progress', 'needs_revision'],
  pending_review:  ['completed', 'needs_revision'],
  needs_revision:  ['in_progress'],
  completed:       ['in_progress'],   // KH yêu cầu: cho mở lại công việc đã hoàn thành
}

export const PRIORITY_LABELS = {
  urgent: 'Khẩn cấp',
  high:   'Cao',
  medium: 'Trung bình',
  low:    'Thấp',
}

export const SOURCE_LABELS = {
  auto:   'Tự động',
  manual: 'Thủ công',
}

export const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }

export function isTaskOverdue(task) {
  if (!task.dueDate || task.status === 'completed') return false
  return isBefore(parseISO(task.dueDate), startOfDay(new Date()))
}

export function fmtDate(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'dd/MM/yyyy') } catch { return iso }
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'HH:mm dd/MM/yyyy') } catch { return iso }
}

// ── Kỳ lọc → khoảng ngày thật ────────────────────────────────────────────────
// Một nguồn duy nhất cho việc quy đổi "Năm/Tháng" ra ngày đầu–ngày cuối.
// Trước đây mỗi trang tự chép một bản; lệch nhau là chỗ hiển thị nói một đằng,
// truy vấn gửi xuống server một nẻo.
export function yearMonthToDates(year, month) {
  if (!year) return { from: '', to: '' }
  if (!month) return { from: `${year}-01-01`, to: `${year}-12-31` }
  const m = parseInt(month, 10)
  const lastDay = new Date(parseInt(year, 10), m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

// Khoảng ngày ĐANG THỰC SỰ áp dụng: khoảng tự chọn được ưu tiên, không có thì
// suy ra từ Năm/Tháng. Dùng cho CẢ phần hiển thị lẫn tham số gửi lên server.
export function resolvePeriodRange({ year, month, from, to }) {
  if (from || to) return { from: from || '', to: to || '' }
  return yearMonthToDates(year, month)
}

// Nhãn đọc được của khoảng ngày, vd "01/07/2026 – 31/07/2026"
export function periodRangeLabel(range) {
  const { from, to } = range
  if (!from && !to) return 'Tất cả thời gian'
  return `${from ? fmtDate(from) : '…'} – ${to ? fmtDate(to) : '…'}`
}

export function progressPct(task) {
  if (!task.checklistTotal) return null
  return Math.round((task.checklistDone / task.checklistTotal) * 100)
}

// Số ngày hoàn thành thực tế, tính INCLUSIVE (bắt đầu & hoàn thành cùng ngày = 1 ngày)
export function calcDays(task) {
  const base = task.startDate || task.createdAt
  if (!base) return null
  const start = parseISO(base)
  const end   = task.completedAt ? parseISO(task.completedAt) : new Date()
  return Math.max(0, differenceInDays(end, start)) + 1
}

// Số ngày kế hoạch = ngày hết hạn − ngày bắt đầu, tính INCLUSIVE (cùng ngày = 1 ngày)
export function calcPlannedDays(task) {
  const base = task.startDate || task.createdAt
  if (!base || !task.dueDate) return null
  return Math.max(0, differenceInDays(parseISO(task.dueDate), parseISO(base))) + 1
}

// ── Hoàn thành trước/trễ hạn (dẫn xuất từ completed_at vs due_date) ─────────────
// 'on_time' = hoàn thành đúng/trước hạn · 'late' = trễ hạn · null = chưa hoàn thành / không có hạn
export function completionKind(task) {
  if (!task || task.status !== 'completed' || !task.dueDate || !task.completedAt) return null
  const done = String(task.completedAt).slice(0, 10)
  const due  = String(task.dueDate).slice(0, 10)
  return done <= due ? 'on_time' : 'late'
}

// Nhãn trạng thái hiển thị: hoàn thành → tách "trước hạn" / "trễ hạn"
export function taskStatusLabel(task, getLabel) {
  if (task.status === 'completed') {
    const k = completionKind(task)
    if (k === 'on_time') return 'Hoàn thành trước hạn'
    if (k === 'late')    return 'Hoàn thành trễ hạn'
  }
  return getLabel
    ? getLabel('task_status', task.status, STATUS_LABELS[task.status] ?? task.status)
    : (STATUS_LABELS[task.status] ?? task.status)
}

// ── Checklist 2 tầng (level 0 = mục chính, 1 = mục phụ) ────────────────────────
// Mục "cha" = level 0 có mục con (level 1) ngay sau nó.
export function checklistIsParent(items, index) {
  const it = items[index]
  const next = items[index + 1]
  return it?.level === 0 && next?.level === 1
}
// Leaf = mọi mục KHÔNG phải cha → dùng để tính tiến độ.
export function checklistLeafCounts(items) {
  let total = 0, done = 0
  for (let i = 0; i < items.length; i++) {
    if (checklistIsParent(items, i)) continue
    total++
    if (items[i].isCompleted) done++
  }
  return { total, done, pct: total ? Math.round((done * 100) / total) : 0 }
}
// Cha "xong" (dẫn xuất) khi tất cả con của nó đã xong.
export function checklistParentDone(items, index) {
  let hasChild = false
  for (let j = index + 1; j < items.length && items[j].level === 1; j++) {
    hasChild = true
    if (!items[j].isCompleted) return false
  }
  return hasChild
}

// Ai được sửa NGÀY:
//  · Admin: luôn được, không giới hạn số lần.
//  · Nhân viên: CHỈ với task sinh từ LỊCH ĐỊNH KỲ (customerTaskScheduleId != null),
//    và mỗi ngày có LƯỢT RIÊNG — mỗi ngày chỉnh được ĐÚNG 1 LẦN.
//    Chỉnh Ngày bắt đầu KHÔNG khoá Ngày hết hạn, và ngược lại.
function canEditDateField(task, isAdmin, adjustedAt) {
  if (isAdmin) return true
  if (task?.customerTaskScheduleId == null) return false
  return !adjustedAt
}

export function canEditStartDate(task, isAdmin) {
  return canEditDateField(task, isAdmin, task?.staffStartAdjustedAt)
}

export function canEditDueDate(task, isAdmin) {
  return canEditDateField(task, isAdmin, task?.staffDueAdjustedAt)
}

// Lý do bị khoá — tooltip cho nhân viên hiểu vì sao không sửa được. field: 'start' | 'due'
export function dateLockReason(task, isAdmin, field = 'due') {
  const editable = field === 'start' ? canEditStartDate(task, isAdmin) : canEditDueDate(task, isAdmin)
  if (editable) return null
  if (task?.customerTaskScheduleId == null) {
    return 'Chỉ Quản trị viên được sửa ngày (công việc này không thuộc lịch định kỳ).'
  }
  const label = field === 'start' ? 'Ngày bắt đầu' : 'Ngày hết hạn'
  return `Bạn đã điều chỉnh ${label} 1 lần cho công việc này. Vui lòng báo Quản trị viên nếu cần đổi thêm.`
}

// Class CSS badge cho trạng thái (hoàn thành trễ hạn dùng biến thể riêng)
export function taskStatusCss(task) {
  if (task.status === 'completed' && completionKind(task) === 'late') return 'statusCompletedLate'
  return STATUS_CSS[task.status] ?? 'statusPending'
}

export const STATUS_CSS = {
  pending:        'statusPending',
  in_progress:    'statusInProgress',
  on_hold:        'statusOnHold',
  pending_review: 'statusPendingReview',
  needs_revision: 'statusNeedsRevision',
  completed:      'statusCompleted',
}

export const PRIORITY_CSS = {
  urgent: 'priUrgent',
  high:   'priHigh',
  medium: 'priMedium',
  low:    'priLow',
}

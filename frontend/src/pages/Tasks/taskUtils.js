import { format, parseISO, isBefore, startOfDay } from 'date-fns'

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
  completed:       [],
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

export function progressPct(task) {
  if (!task.checklistTotal) return null
  return Math.round((task.checklistDone / task.checklistTotal) * 100)
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

// Ai được sửa Ngày hết hạn: admin luôn được; staff chỉ được với task sinh từ LỊCH ĐỊNH KỲ
// (customerTaskScheduleId != null). Task nguồn khác (thủ công...) staff không sửa được.
export function canEditDueDate(task, isAdmin) {
  return !!isAdmin || (task?.customerTaskScheduleId != null)
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

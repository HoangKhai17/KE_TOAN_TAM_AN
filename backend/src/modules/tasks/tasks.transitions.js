const TRANSITIONS = {
  pending:        ['in_progress', 'on_hold'],
  in_progress:    ['on_hold', 'pending_review', 'completed'],
  on_hold:        ['in_progress', 'needs_revision'],
  pending_review: ['completed', 'needs_revision'],
  needs_revision: ['in_progress'],
  // KH yêu cầu: cho phép MỞ LẠI công việc đã hoàn thành → đưa về "Đang thực hiện".
  // Từ in_progress có thể đi tiếp mọi trạng thái khác nên chỉ cần 1 lối mở lại.
  completed:      ['in_progress'],
}

function canTransition(fromStatus, toStatus) {
  return (TRANSITIONS[fromStatus] || []).includes(toStatus)
}

module.exports = { TRANSITIONS, canTransition }

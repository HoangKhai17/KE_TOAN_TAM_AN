const TRANSITIONS = {
  pending:        ['in_progress', 'on_hold'],
  in_progress:    ['on_hold', 'pending_review', 'completed'],
  on_hold:        ['in_progress', 'needs_revision'],
  pending_review: ['completed', 'needs_revision'],
  needs_revision: ['in_progress'],
  completed:      [],
}

function canTransition(fromStatus, toStatus) {
  return (TRANSITIONS[fromStatus] || []).includes(toStatus)
}

module.exports = { TRANSITIONS, canTransition }

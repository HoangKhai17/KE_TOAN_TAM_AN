function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { message: 'Authentication required' } })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { message: 'Insufficient permissions' } })
    }
    next()
  }
}

// Allows access if the requester is an admin OR is accessing their own resource (:id param)
function requireSelfOrAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Authentication required' } })
  }
  if (req.user.role === 'admin' || req.user.id === req.params.id) {
    return next()
  }
  return res.status(403).json({ success: false, error: { message: 'Insufficient permissions' } })
}

module.exports = { requireRole, requireSelfOrAdmin }

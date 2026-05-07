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

module.exports = { requireRole }

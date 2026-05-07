function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: { message: `Route ${req.method} ${req.path} not found` },
    requestId: req.requestId,
  })
}

module.exports = notFound

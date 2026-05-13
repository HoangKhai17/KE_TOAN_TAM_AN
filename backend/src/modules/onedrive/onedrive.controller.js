'use strict'
const graph = require('../../config/graph')

async function getAuthUrl(req, res, next) {
  try {
    const url = graph.getAuthUrl()
    res.json({ success: true, data: { url } })
  } catch (err) { next(err) }
}

async function exchangeCode(req, res, next) {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ success: false, error: { message: 'Missing code' } })
    const result = await graph.exchangeCode(code)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function getStatus(req, res, next) {
  try {
    const status = await graph.getConnectionStatus()
    res.json({ success: true, data: status })
  } catch (err) { next(err) }
}

async function disconnectOneDrive(req, res, next) {
  try {
    await graph.disconnect()
    res.json({ success: true, data: { message: 'Đã ngắt kết nối OneDrive' } })
  } catch (err) { next(err) }
}

module.exports = { getAuthUrl, exchangeCode, getStatus, disconnectOneDrive }

'use strict'
const path = require('path')
const svc = require('./backup.service')

async function getOverview(req, res, next) {
  try {
    const config = await svc.getConfig()
    res.json({ success: true, data: { config, backups: svc.listBackups() } })
  } catch (err) { next(err) }
}

async function runBackup(req, res, next) {
  try {
    const result = await svc.createBackup()
    res.json({ success: true, data: result })
  } catch (err) {
    // Admin-only: trả lý do để dễ chẩn đoán
    res.status(500).json({ success: false, error: { message: `Sao lưu thất bại: ${err.message}` } })
  }
}

async function updateConfig(req, res, next) {
  try {
    const { enabled, time, retention } = req.body
    if (time !== undefined && !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(422).json({ success: false, error: { message: 'Giờ không hợp lệ (định dạng HH:mm)' } })
    }
    let ret
    if (retention !== undefined) {
      ret = parseInt(retention, 10)
      if (!Number.isFinite(ret) || ret < 1 || ret > 50) {
        return res.status(422).json({ success: false, error: { message: 'Số bản giữ phải từ 1 đến 50' } })
      }
    }
    const config = await svc.setConfig({ enabled, time, retention: ret }, req.user.id)
    res.json({ success: true, data: { config } })
  } catch (err) { next(err) }
}

async function download(req, res, next) {
  try {
    const p = svc.resolveSafe(req.params.file)
    if (!p) return res.status(404).json({ success: false, error: { message: 'Không tìm thấy file backup' } })
    res.download(p, path.basename(p))
  } catch (err) { next(err) }
}

async function remove(req, res, next) {
  try {
    const ok = svc.deleteBackup(req.params.file)
    if (!ok) return res.status(404).json({ success: false, error: { message: 'Không tìm thấy file backup' } })
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = { getOverview, runBackup, updateConfig, download, remove }

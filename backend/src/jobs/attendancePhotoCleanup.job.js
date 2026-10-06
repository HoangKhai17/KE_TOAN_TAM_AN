'use strict'
// Tự động dọn ảnh selfie chấm công cũ hơn số tháng đã cấu hình (giữ N tháng gần nhất).
// Chỉ xoá FILE ảnh + gỡ photo_path; KHÔNG đụng log giờ vào/ra hay bản ghi công.

const logger = require('../config/logger')
const photoSvc = require('../modules/attendance/photo.service')

async function runAttendancePhotoCleanup() {
  try {
    return await photoSvc.runRetentionCleanup()
  } catch (err) {
    logger.error('[PhotoCleanup] Dọn ảnh chấm công thất bại', { error: err.message })
    throw err
  }
}

module.exports = { runAttendancePhotoCleanup }

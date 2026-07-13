'use strict'
// ── Lưu trữ file DÙNG CHUNG cho mọi module ────────────────────────────────────
// Không biết gì về internal-docs/task/company — chỉ nhận `module` (chuỗi) rồi
// dựng đường dẫn <UPLOAD_ROOT>/<module>/<yyyy>/<mm>/<uuid>.<ext>.
//
// 3 lớp chặn file:
//   1. Đuôi file  (whitelist)
//   2. MIME type  (whitelist)
//   3. Magic bytes — vài byte đầu file, chống đổi tên virus.mp4 → baocao.pdf
//
// Whitelist chứ KHÔNG blacklist: mọi thứ ngoài danh sách (mp4, mp3, mkv, exe…)
// đều tự động bị loại, không phải liệt kê.

const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')
const multer = require('multer')
const logger = require('../config/logger')

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads')
const MAX_BYTES   = 5 * 1024 * 1024 // 5MB / file

// ext → MIME hợp lệ
const ALLOWED = {
  pdf:  ['application/pdf'],
  doc:  ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls:  ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt:  ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  csv:  ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  txt:  ['text/plain'],
  png:  ['image/png'],
  jpg:  ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  zip:  ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
  rar:  ['application/vnd.rar', 'application/x-rar-compressed', 'application/octet-stream'],
}

const ALLOWED_EXTS = Object.keys(ALLOWED)

// Chữ ký byte đầu file. Mỗi ext → danh sách chữ ký chấp nhận được.
// txt/csv không có chữ ký → bỏ qua bước magic bytes (đã chặn bằng ext + MIME).
const MAGIC = {
  pdf:  [[0x25, 0x50, 0x44, 0x46]],                          // %PDF
  png:  [[0x89, 0x50, 0x4e, 0x47]],                          // \x89PNG
  jpg:  [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  rar:  [[0x52, 0x61, 0x72, 0x21]],                          // Rar!
  zip:  [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]],
  // Office hiện đại (docx/xlsx/pptx) thực chất là file ZIP
  docx: [[0x50, 0x4b, 0x03, 0x04]],
  xlsx: [[0x50, 0x4b, 0x03, 0x04]],
  pptx: [[0x50, 0x4b, 0x03, 0x04]],
  // Office cũ (doc/xls/ppt) = OLE Compound File
  doc:  [[0xd0, 0xcf, 0x11, 0xe0]],
  xls:  [[0xd0, 0xcf, 0x11, 0xe0]],
  ppt:  [[0xd0, 0xcf, 0x11, 0xe0]],
  // webp = RIFF....WEBP (kiểm riêng bên dưới)
  webp: [[0x52, 0x49, 0x46, 0x46]],
}

const extOf = (name) => path.extname(name || '').slice(1).toLowerCase()

function badRequest(msg, code) {
  return Object.assign(new Error(msg), { status: 400, code })
}

// ── Lớp 1 + 2: đuôi file & MIME (chạy trước khi ghi đĩa) ──────────────────────
function fileFilter(req, file, cb) {
  const ext = extOf(file.originalname)
  if (!ALLOWED_EXTS.includes(ext)) {
    return cb(badRequest(
      `Định dạng ".${ext || '?'}" không được phép. Chỉ nhận: ${ALLOWED_EXTS.join(', ')}.`,
      'FILE_TYPE_NOT_ALLOWED'))
  }
  const mime = (file.mimetype || '').toLowerCase()
  if (!ALLOWED[ext].includes(mime)) {
    return cb(badRequest(
      `File ".${ext}" có kiểu nội dung không hợp lệ (${mime}).`,
      'FILE_MIME_MISMATCH'))
  }
  cb(null, true)
}

// ── Lớp 3: magic bytes (chạy SAU khi ghi đĩa; sai thì xoá file) ───────────────
function verifyMagic(absPath, ext) {
  const sigs = MAGIC[ext]
  if (!sigs) return true // txt/csv — không có chữ ký

  const fd = fs.openSync(absPath, 'r')
  const head = Buffer.alloc(12)
  try { fs.readSync(fd, head, 0, 12, 0) } finally { fs.closeSync(fd) }

  const ok = sigs.some((sig) => sig.every((b, i) => head[i] === b))
  if (!ok) return false
  // webp: RIFF ở byte 0-3, "WEBP" ở byte 8-11
  if (ext === 'webp' && head.slice(8, 12).toString('ascii') !== 'WEBP') return false
  return true
}

// ── multer: ghi thẳng ra đĩa theo <module>/<yyyy>/<mm>/<uuid>.<ext> ───────────
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const now = new Date()
    const dir = path.join(
      UPLOAD_ROOT,
      String(req.params.module || 'misc').replace(/[^a-z0-9_-]/gi, ''),
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
    )
    fs.mkdirSync(dir, { recursive: true }) // thư mục tự tạo, không cần có sẵn trong repo
    cb(null, dir)
  },
  // Tên lưu = UUID → chống trùng, chống path traversal, chống ký tự lạ.
  // Tên gốc được lưu riêng trong DB để hiển thị & đặt tên khi tải về.
  filename(req, file, cb) {
    cb(null, `${crypto.randomUUID()}.${extOf(file.originalname)}`)
  },
})

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_BYTES, files: 1 } })

// Middleware nhận 1 file field "file", kèm kiểm magic bytes.
function single(field = 'file') {
  const mw = upload.single(field)
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(badRequest(`File vượt quá ${MAX_BYTES / 1024 / 1024}MB.`, 'FILE_TOO_LARGE'))
        }
        return next(err)
      }
      if (!req.file) return next(badRequest('Chưa chọn file.', 'NO_FILE'))

      const ext = extOf(req.file.originalname)
      if (!verifyMagic(req.file.path, ext)) {
        removeFile(path.relative(UPLOAD_ROOT, req.file.path))
        return next(badRequest(
          `Nội dung file không khớp với đuôi ".${ext}" (nghi ngờ đổi tên đuôi).`,
          'FILE_CONTENT_MISMATCH'))
      }
      next()
    })
  }
}

// Đường dẫn tương đối (lưu DB) ⇄ tuyệt đối (đọc/xoá)
const toRelative = (absPath) => path.relative(UPLOAD_ROOT, absPath).split(path.sep).join('/')

function toAbsolute(relPath) {
  const abs = path.resolve(UPLOAD_ROOT, relPath)
  // Chặn path traversal: bắt buộc nằm trong UPLOAD_ROOT
  if (!abs.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) {
    throw Object.assign(new Error('Đường dẫn file không hợp lệ'), { status: 400 })
  }
  return abs
}

function removeFile(relPath) {
  if (!relPath) return
  try { fs.unlinkSync(toAbsolute(relPath)) }
  catch (err) {
    if (err.code !== 'ENOENT') logger.warn('[Storage] Không xoá được file', { relPath, error: err.message })
  }
}

module.exports = {
  single, toRelative, toAbsolute, removeFile,
  UPLOAD_ROOT, MAX_BYTES, ALLOWED_EXTS,
}

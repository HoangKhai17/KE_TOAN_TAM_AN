'use strict'
const { Router }       = require('express')
const { authenticate } = require('../../middleware/auth')
const storage          = require('../../lib/storage')
const { getModule }    = require('./attachments.registry')
const svc              = require('./attachments.service')

const router = Router()
const auth   = [authenticate]

// Chặn id/entityId không phải UUID ngay ở cửa → trả 400 gọn, tránh để Postgres
// ném "invalid input syntax for type uuid" thành 500. Cũng chặn luôn path traversal
// (../../etc) vì mọi ký tự lạ đều rớt ở đây.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function requireUuid(...names) {
  return (req, res, next) => {
    for (const n of names) {
      if (!UUID_RE.test(req.params[n] || '')) {
        return next(Object.assign(new Error(`Tham số "${n}" không hợp lệ`), { status: 400 }))
      }
    }
    next()
  }
}

// Tải xuống — BẮT BUỘC đăng nhập (đó là lý do không để nginx serve tĩnh thư mục uploads).
// PHẢI đặt trước '/:module/:entityId', nếu không 'download' bị bắt làm :module.
router.get('/download/:id', ...auth, requireUuid('id'), async (req, res, next) => {
  try {
    const { row, absPath } = await svc.getForDownload(req.params.id, req.user)
    res.download(absPath, row.file_name) // trả về đúng TÊN GỐC
  } catch (err) { next(err) }
})

// Danh sách file của một bản ghi
router.get('/:module/:entityId', ...auth, requireUuid('entityId'), async (req, res, next) => {
  try {
    const files = await svc.list(req.params.module, req.params.entityId, req.user)
    res.json({ success: true, data: { files } })
  } catch (err) { next(err) }
})

// Tải file lên. storage.single() đã lo: whitelist đuôi + MIME, giới hạn 5MB, magic bytes.
router.post('/:module/:entityId', ...auth, requireUuid('entityId'), async (req, res, next) => {
  try {
    const mod = getModule(req.params.module)
    // canWrite nhận CẢ entityId và có thể là hàm async: quyền ghi của module
    // 'company' phải tra CSDL xem nhân sự có phụ trách công ty đó không.
    // (Trước đây chỉ gọi canWrite(user) và không await — đủ cho internal_doc vì
    // nó luôn trả true, nhưng sẽ bỏ lọt quyền với module có kiểm tra thật.)
    const duocGhi = await mod.canWrite(req.user, req.params.entityId)
    if (!duocGhi) {
      return next(Object.assign(new Error('Bạn không có quyền tải file lên'), { status: 403 }))
    }
    next()
  } catch (err) { next(err) }
}, storage.single('file'), async (req, res, next) => {
  try {
    const file = await svc.create(
      req.params.module, req.params.entityId, req.file, req.body, req.user.id,
    )
    res.status(201).json({ success: true, data: { file } })
  } catch (err) { next(err) }
})

router.delete('/:id', ...auth, requireUuid('id'), async (req, res, next) => {
  try {
    await svc.remove(req.params.id, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
})

module.exports = router

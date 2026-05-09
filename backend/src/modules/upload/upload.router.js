const path = require('path')
const fs   = require('fs')
const router = require('express').Router()
const multer = require('multer')
const { authenticate } = require('../../middleware/auth')

const uploadDir = path.join(process.cwd(), 'uploads', 'avatars')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
    cb(null, name)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)
    if (ok) cb(null, true)
    else cb(Object.assign(new Error('Chỉ hỗ trợ ảnh JPEG, PNG, GIF, WebP'), { status: 422 }))
  },
})

router.post('/avatar', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(422).json({ error: { message: 'Không có file được tải lên' } })
  res.json({ url: `/uploads/avatars/${req.file.filename}` })
})

module.exports = router

const { z } = require('zod')

// Values must match the document_category PostgreSQL enum in 001_create_enums.sql
const ALLOWED_CATEGORIES = ['hop_dong', 'bao_cao_thue', 'so_sach', 'giay_phep', 'khac']

const addLinkSchema = z.object({
  name:        z.string().min(1, 'Tên tài liệu không được để trống').max(300),
  url:         z.string().url('URL không hợp lệ — phải bắt đầu bằng http:// hoặc https://'),
  category:    z.enum(ALLOWED_CATEGORIES).default('khac'),
  description: z.string().max(1000).optional().nullable(),
  taskId:      z.string().uuid().optional().nullable(),
})

const updateLinkSchema = z.object({
  name:        z.string().min(1).max(300).optional(),
  url:         z.string().url('URL không hợp lệ').optional(),
  category:    z.enum(ALLOWED_CATEGORIES).optional(),
  description: z.string().max(1000).optional().nullable(),
})

const attachDocumentSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
})

module.exports = { addLinkSchema, updateLinkSchema, attachDocumentSchema, ALLOWED_CATEGORIES }

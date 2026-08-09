const { z } = require('zod')

// Values must match the document_category PostgreSQL enum in 001_create_enums.sql
const ALLOWED_CATEGORIES = ['hop_dong', 'bao_cao_thue', 'so_sach', 'giay_phep', 'khac']

// Tài liệu là LINK hoặc FILE — phải có đúng một trong hai.
// File được tải lên trước qua /attachments/company/:companyId, rồi gửi id vào đây.
const addLinkSchema = z.object({
  name:         z.string().min(1, 'Tên tài liệu không được để trống').max(300),
  url:          z.string().url('URL không hợp lệ — phải bắt đầu bằng http:// hoặc https://').optional().nullable(),
  attachmentId: z.string().uuid().optional().nullable(),
  category:     z.string().min(1).max(50).default('khac'),   // danh mục động (document_category)
  description:  z.string().max(1000).optional().nullable(),
  period:       z.string().max(30).optional().nullable(),
  sortOrder:    z.number().int().min(0).optional(),
  taskId:       z.string().uuid().optional().nullable(),
}).refine((d) => !!d.url !== !!d.attachmentId, {
  message: 'Phải nhập đường dẫn HOẶC chọn file, không được cả hai và không được để trống',
  path: ['url'],
})

const updateLinkSchema = z.object({
  name:        z.string().min(1).max(300).optional(),
  url:         z.string().url('URL không hợp lệ').optional(),
  category:    z.string().min(1).max(50).optional(),   // danh mục động (document_category)
  description: z.string().max(1000).optional().nullable(),
  period:      z.string().max(30).optional().nullable(),
  sortOrder:   z.number().int().min(0).optional(),
})

const attachDocumentSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
})

module.exports = { addLinkSchema, updateLinkSchema, attachDocumentSchema, ALLOWED_CATEGORIES }

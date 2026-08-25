const { z } = require('zod')

// Cấu trúc rút gọn: chỉ Tên hồ sơ + Ghi chú (Ghi chú dạng rich-text HTML).
const createOriginalDocumentSchema = z.object({
  name:      z.string().min(1).max(200),
  note:      z.string().max(500_000).optional().nullable(),
  sortOrder: z.number().int().optional(),
})

const updateOriginalDocumentSchema = z.object({
  name:      z.string().min(1).max(200).optional(),
  note:      z.string().max(500_000).optional().nullable(),
  sortOrder: z.number().int().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

module.exports = { createOriginalDocumentSchema, updateOriginalDocumentSchema }

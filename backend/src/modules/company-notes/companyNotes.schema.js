const { z } = require('zod')

// severity nhận string tự do (giá trị lấy từ danh mục động note_severity)
const createNoteSchema = z.object({
  content:   z.string().min(1).max(2000),
  severity:  z.string().min(1).max(50).optional(),
  isPinned:  z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const updateNoteSchema = z.object({
  content:   z.string().min(1).max(2000).optional(),
  severity:  z.string().min(1).max(50).optional(),
  isPinned:  z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

module.exports = { createNoteSchema, updateNoteSchema }

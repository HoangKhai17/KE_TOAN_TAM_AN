const { z } = require('zod')

// Các cột phân loại (category/frequency/source) là text tự do — không enum.
const createDocumentTypeSchema = z.object({
  name:      z.string().min(1).max(200),
  category:  z.string().max(100).optional().nullable(),
  frequency: z.string().max(100).optional().nullable(),
  source:    z.string().max(100).optional().nullable(),
  note:      z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().optional(),
})

const updateDocumentTypeSchema = z.object({
  name:      z.string().min(1).max(200).optional(),
  category:  z.string().max(100).optional().nullable(),
  frequency: z.string().max(100).optional().nullable(),
  source:    z.string().max(100).optional().nullable(),
  note:      z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

module.exports = { createDocumentTypeSchema, updateDocumentTypeSchema }

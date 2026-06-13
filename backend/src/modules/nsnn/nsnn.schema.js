const { z } = require('zod')

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const createDebtSchema = z.object({
  documentType: z.string().min(1).max(300),
  category:     z.string().max(300).optional().nullable(),
  debtAmount:   z.number().optional().nullable(),
  updateDate:   z.string().regex(datePattern).optional().nullable(),
  repeatCount:  z.number().int().min(0).optional().nullable(),
  notes:        z.string().max(5000).optional().nullable(),
  customFields: z.record(z.string(), z.any()).optional().default({}),
})

const updateDebtSchema = createDebtSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'No fields to update' }
)

const createColumnSchema = z.object({
  colName: z.string().min(1).max(200),
  colType: z.enum(['text', 'number', 'date']).optional(),
})

module.exports = { createDebtSchema, updateDebtSchema, createColumnSchema }

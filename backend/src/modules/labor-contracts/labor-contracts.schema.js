const { z } = require('zod')

const createContractSchema = z.object({
  employeeName:   z.string().min(1).max(200),
  taxCode:        z.string().max(20).optional().nullable(),
  contractType:   z.string().max(150).optional().nullable(),
  contractNumber: z.string().max(100).optional().nullable(),
  contractDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional().nullable(),
  endDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional().nullable(),
  notes:          z.string().max(5000).optional().nullable(),
  // key = col_name, value = string value
  customFields:   z.record(z.string(), z.string().max(2000)).optional().default({}),
})

const updateContractSchema = createContractSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'No fields to update' }
)

const createColumnSchema = z.object({
  colName: z.string().min(1).max(100),
  colType: z.enum(['text', 'number', 'date']).default('text'),
})

module.exports = { createContractSchema, updateContractSchema, createColumnSchema }

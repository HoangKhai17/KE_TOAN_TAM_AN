const { z } = require('zod')

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const createContractSchema = z.object({
  contractParty:   z.string().max(100).optional().nullable(),
  partyName:       z.string().min(1).max(300),
  contractContent: z.string().max(500).optional().nullable(),
  contractNumber:  z.string().max(100).optional().nullable(),
  contractDate:    z.string().regex(datePattern).optional().nullable(),
  endDate:         z.string().regex(datePattern).optional().nullable(),
  notes:           z.string().max(5000).optional().nullable(),
  customFields:    z.record(z.string(), z.string().max(2000)).optional(),
})

const updateContractSchema = createContractSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'No fields to update' }
)

const createColumnSchema = z.object({
  colName: z.string().min(1).max(200),
  colType: z.enum(['text', 'number', 'date']).optional(),
})

module.exports = { createContractSchema, updateContractSchema, createColumnSchema }

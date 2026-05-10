const { z } = require('zod')

const createPeriodSchema = z.object({
  periodYear:  z.number().int().min(2020).max(2099),
  periodMonth: z.number().int().min(1).max(12),
  startDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:       z.string().max(1000).optional().nullable(),
})

const updatePeriodSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:     z.string().max(1000).optional().nullable(),
}).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

const upsertRecordSchema = z.object({
  userId:         z.string().uuid(),
  baseSalary:     z.number().int().min(0).default(0),
  allowances:     z.number().int().min(0).default(0),
  bonus:          z.number().int().min(0).default(0),
  bhxhEmployee:   z.number().int().min(0).default(0),
  bhytEmployee:   z.number().int().min(0).default(0),
  bhtnEmployee:   z.number().int().min(0).default(0),
  bhxhEmployer:   z.number().int().min(0).default(0),
  bhytEmployer:   z.number().int().min(0).default(0),
  bhtnEmployer:   z.number().int().min(0).default(0),
  pitDeduction:   z.number().int().min(0).default(0),
  otherDeductions:z.number().int().min(0).default(0),
  components:     z.record(z.any()).optional().nullable(),
  notes:          z.string().max(1000).optional().nullable(),
})

module.exports = { createPeriodSchema, updatePeriodSchema, upsertRecordSchema }

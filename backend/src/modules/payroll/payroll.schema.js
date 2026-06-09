const { z } = require('zod')

const allowanceItemSchema = z.object({
  name:    z.string().min(1).max(100),
  project: z.string().max(100).optional().default(''),
  amount:  z.number().int().min(0),
  note:    z.string().max(500).optional().default(''),
})

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
  userId:          z.string().uuid(),
  baseSalary:      z.number().int().min(0).default(0),
  allowanceItems:  z.array(allowanceItemSchema).optional().default([]),
  bonusItems:      z.array(allowanceItemSchema).optional().default([]),
  // Kept for backward compatibility — used only when items arrays are empty
  allowances:      z.number().int().min(0).optional(),
  bonus:           z.number().int().min(0).optional(),
  bhxhEmployee:    z.number().int().min(0).default(0),
  bhytEmployee:    z.number().int().min(0).default(0),
  bhtnEmployee:    z.number().int().min(0).default(0),
  bhxhEmployer:    z.number().int().min(0).default(0),
  bhytEmployer:    z.number().int().min(0).default(0),
  bhtnEmployer:    z.number().int().min(0).default(0),
  pitDeduction:    z.number().int().min(0).default(0),
  otherDeductions: z.number().int().min(0).default(0),
  components:      z.record(z.any()).optional().nullable(),
  notes:           z.string().max(1000).optional().nullable(),
})

module.exports = { createPeriodSchema, updatePeriodSchema, upsertRecordSchema }

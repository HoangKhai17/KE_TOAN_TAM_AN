'use strict'
const { z } = require('zod')
// LƯU Ý: các trường enum (kind/source/status/detectSource) để dạng string — service validate
// ĐỘNG qua lib/enums (không hardcode danh sách ở đây).

const ruleSchema = z.object({
  label:         z.string().min(1).max(200),
  kind:          z.string().max(40).optional(),
  defaultPoints: z.number().optional(),
  detectSource:  z.string().max(40).optional(),
  isActive:      z.boolean().optional(),
  sortOrder:     z.number().int().optional(),
})
const ruleUpdateSchema = ruleSchema.partial()

const entrySchema = z.object({
  userId:        z.string().uuid('Thiếu nhân viên'),
  occurredOn:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD'),
  ruleId:        z.string().uuid().optional().nullable(),
  kind:          z.string().max(40).optional(),
  categoryLabel: z.string().max(200).optional(),
  points:        z.number().optional(),
  note:          z.string().max(2000).optional().nullable(),
  source:        z.string().max(40).optional(),
  status:        z.string().max(40).optional(),
})
const entryUpdateSchema = z.object({
  userId:        z.string().uuid().optional(),
  occurredOn:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ruleId:        z.string().uuid().optional().nullable(),
  kind:          z.string().max(40).optional(),
  categoryLabel: z.string().max(200).optional(),
  points:        z.number().optional(),
  note:          z.string().max(2000).optional().nullable(),
  status:        z.string().max(40).optional(),
})

module.exports = { ruleSchema, ruleUpdateSchema, entrySchema, entryUpdateSchema }

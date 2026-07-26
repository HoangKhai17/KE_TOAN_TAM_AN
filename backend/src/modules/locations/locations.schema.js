const { z } = require('zod')

// Giá trị enum (location_type/status/accounting_form) do frontend gửi từ danh mục
// enum động → nhận string tự do, không hard-code danh sách ở đây.
const dateOpt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD').optional().nullable()

const createLocationSchema = z.object({
  locationType:   z.string().min(1).max(50),
  name:           z.string().max(200).optional().nullable(),
  address:        z.string().max(1000).optional().nullable(),
  taxCode:        z.string().max(20).optional().nullable(),
  accountingForm: z.string().max(50).optional().nullable(),
  taxAuthority:   z.string().max(200).optional().nullable(),
  status:         z.string().max(50).optional(),
  startDate:      dateOpt,
  endDate:        dateOpt,
  contactName:    z.string().max(100).optional().nullable(),
  contactPhone:   z.string().max(20).optional().nullable(),
  isPrimary:      z.boolean().optional(),
  sortOrder:      z.number().int().optional(),
  notes:          z.string().max(2000).optional().nullable(),
})

const updateLocationSchema = z.object({
  locationType:   z.string().min(1).max(50).optional(),
  name:           z.string().max(200).optional().nullable(),
  address:        z.string().max(1000).optional().nullable(),
  taxCode:        z.string().max(20).optional().nullable(),
  accountingForm: z.string().max(50).optional().nullable(),
  taxAuthority:   z.string().max(200).optional().nullable(),
  status:         z.string().max(50).optional(),
  startDate:      dateOpt,
  endDate:        dateOpt,
  contactName:    z.string().max(100).optional().nullable(),
  contactPhone:   z.string().max(20).optional().nullable(),
  isPrimary:      z.boolean().optional(),
  sortOrder:      z.number().int().optional(),
  notes:          z.string().max(2000).optional().nullable(),
}).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

module.exports = { createLocationSchema, updateLocationSchema }

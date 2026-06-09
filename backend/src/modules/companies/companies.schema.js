const { z } = require('zod')

const BUSINESS_TYPES = ['TNHH', 'CP', 'HKD', 'DN_TU_NHAN', 'KHAC']
const COMPANY_STATUSES = ['active', 'inactive', 'terminated']

const companyBaseSchema = z.object({
  name:             z.string().min(2).max(200),
  taxCode:          z.string().max(20).optional().nullable(),
  address:          z.string().optional().nullable(),
  businessType:     z.enum(BUSINESS_TYPES).default('TNHH'),
  industry:         z.string().max(150).optional().nullable(),
  legalRepName:     z.string().max(100).optional().nullable(),
  legalRepPhone:    z.string().max(20).optional().nullable(),
  contactName:      z.string().max(100).optional().nullable(),
  contactPhone:     z.string().max(20).optional().nullable(),
  contactEmail:     z.string().email().optional().nullable(),
  bankAccount:      z.string().max(30).optional().nullable(),
  bankName:         z.string().max(150).optional().nullable(),
  serviceStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional().nullable(),
  notes:            z.string().optional().nullable(),
  assignedStaffId:  z.string().uuid().optional().nullable(),
  avatarUrl:        z.union([
    z.string().url().max(2048),
    z.string().regex(/^data:image\//).max(300000),
  ]).optional().nullable(),
  customFields:     z.array(
    z.object({
      name:  z.string().max(200),
      value: z.string().max(2000).optional().default(''),
    })
  ).optional().default([]),
})

const createCompanySchema = companyBaseSchema

const updateCompanySchema = companyBaseSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'No fields to update' }
)

const updateCompanyStatusSchema = z.object({
  status: z.enum(COMPANY_STATUSES),
})

const assignStaffSchema = z.object({
  staffId:   z.string().uuid('Invalid staff ID'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
  notes:     z.string().optional().nullable(),
})

module.exports = {
  createCompanySchema,
  updateCompanySchema,
  updateCompanyStatusSchema,
  assignStaffSchema,
}

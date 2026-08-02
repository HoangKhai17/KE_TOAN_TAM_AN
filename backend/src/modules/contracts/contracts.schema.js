const { z } = require('zod')

const dateOpt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD').optional().nullable()

const base = {
  contractType:   z.string().max(50).optional().nullable(),   // enum contract_type (option_key)
  content:        z.string().max(5000).optional().nullable(),
  startDate:      dateOpt,
  endDate:        dateOpt,
  // Chỉ 2 trạng thái chọn tay; NULL = tự động tính. active/renew/expired KHÔNG lưu ở đây.
  statusOverride: z.enum(['renewed', 'stopped']).optional().nullable(),
  sortOrder:      z.number().int().optional(),
}

const createContractSchema = z.object(base)
const updateContractSchema = z.object(base).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

module.exports = { createContractSchema, updateContractSchema }

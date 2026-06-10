const { z } = require('zod')

const createYearSchema = z.object({
  year:  z.number().int().min(2000).max(2100),
  notes: z.string().max(2000).optional().nullable(),
})

const updateYearSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
})

const createDocSchema = z.object({
  documentType:    z.string().min(1).max(300),
  detail:          z.string().max(500).optional().nullable(),
  months:          z.record(z.string(), z.string().max(200)).optional(),
  notes:           z.string().max(5000).optional().nullable(),
  characteristics: z.string().max(300).optional().nullable(),
})

const updateDocSchema = createDocSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'No fields to update' }
)

const reorderSchema = z.array(
  z.object({
    id:       z.string().uuid(),
    position: z.number().int().min(0),
  })
).min(1)

module.exports = { createYearSchema, updateYearSchema, createDocSchema, updateDocSchema, reorderSchema }

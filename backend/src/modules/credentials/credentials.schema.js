const { z } = require('zod')

const createCredentialSchema = z.object({
  systemName: z.string().min(1).max(200),
  systemUrl:  z.string().url().optional().nullable(),
  username:   z.string().min(1).max(200),
  password:   z.string().min(1),
  notes:      z.string().max(1000).optional().nullable(),
  isActive:   z.boolean().default(true),
})

const updateCredentialSchema = z.object({
  systemName: z.string().min(1).max(200).optional(),
  systemUrl:  z.string().url().optional().nullable(),
  username:   z.string().min(1).max(200).optional(),
  password:   z.string().min(1).optional(),
  notes:      z.string().max(1000).optional().nullable(),
  isActive:   z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

module.exports = { createCredentialSchema, updateCredentialSchema }

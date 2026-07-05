const { z } = require('zod')

const createCredentialSchema = z.object({
  systemName: z.string().min(1).max(200),
  systemUrl:  z.string().url().optional().nullable(),
  // Tên đăng nhập & mật khẩu không bắt buộc (theo yêu cầu KH — nhiều hệ thống không có login)
  username:   z.string().max(200).optional().nullable(),
  password:   z.string().max(500).optional().nullable(),
  notes:      z.string().max(1000).optional().nullable(),
  isActive:   z.boolean().default(true),
})

const updateCredentialSchema = z.object({
  systemName: z.string().min(1).max(200).optional(),
  systemUrl:  z.string().url().optional().nullable(),
  username:   z.string().max(200).optional().nullable(),
  password:   z.string().max(500).optional().nullable(),
  notes:      z.string().max(1000).optional().nullable(),
  isActive:   z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

module.exports = { createCredentialSchema, updateCredentialSchema }

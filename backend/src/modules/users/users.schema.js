const { z } = require('zod')

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
  role: z.enum(['admin', 'staff']).default('staff'),
  phone: z.string().max(20).optional().nullable(),
  jobTitle: z.string().max(100).optional().nullable(),
})

const updateUserSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    phone: z.string().max(20).optional().nullable(),
    jobTitle: z.string().max(100).optional().nullable(),
    avatarUrl: z.union([
      z.string().url(),
      z.string().regex(/^data:image\//),
    ]).optional().nullable(),
    role: z.enum(['admin', 'staff']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

const updateStatusSchema = z.object({
  status: z.enum(['active', 'on_leave', 'resigned']),
})

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
})

module.exports = { createUserSchema, updateUserSchema, updateStatusSchema, resetPasswordSchema }

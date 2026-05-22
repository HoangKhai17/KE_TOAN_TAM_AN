'use strict'
const { z } = require('zod')

const createClientRequestSchema = z.object({
  companyId:    z.string().uuid('Invalid company ID'),
  taskId:       z.string().uuid('Invalid task ID').optional().nullable(),
  documentName: z.string().min(1).max(200),
  description:  z.string().max(2000).optional().nullable(),
  periodLabel:  z.string().max(20).optional().nullable(),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  remindedEmail: z.string().email().max(150).optional().nullable(),
  notes:        z.string().max(2000).optional().nullable(),
})

const updateClientRequestSchema = z.object({
  documentName: z.string().min(1).max(200).optional(),
  description:  z.string().max(2000).optional().nullable(),
  periodLabel:  z.string().max(20).optional().nullable(),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  taskId:       z.string().uuid().optional().nullable(),
  remindedEmail: z.string().email().max(150).optional().nullable(),
  notes:        z.string().max(2000).optional().nullable(),
}).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

const remindSchema = z.object({
  email:   z.string().email().max(150).optional(),
  message: z.string().max(1000).optional().nullable(),
})

const generateLinkSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90).optional(),
})

const submitPublicFormSchema = z.object({
  contactName: z.string().min(1).max(150),
  phone:       z.string().min(7).max(20),
  description: z.string().min(1).max(2000),
  sharedLink:  z.string().url('Invalid URL').max(500),
  notes:       z.string().max(1000).optional().nullable(),
})

module.exports = {
  createClientRequestSchema,
  updateClientRequestSchema,
  remindSchema,
  generateLinkSchema,
  submitPublicFormSchema,
}

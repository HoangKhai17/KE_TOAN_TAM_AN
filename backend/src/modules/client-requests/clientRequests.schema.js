'use strict'
const { z } = require('zod')

const createClientRequestSchema = z.object({
  companyId:    z.string().uuid('Invalid company ID'),
  taskId:       z.string().uuid('Invalid task ID').optional().nullable(),
  documentName: z.string().min(1).max(200),
  description:  z.string().max(2000).optional().nullable(),
  periodLabel:  z.string().max(20).optional().nullable(),
  startDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  remindedEmail: z.string().email().max(150).optional().nullable(),
  notes:        z.string().max(2000).optional().nullable(),
  collaboratorIds: z.array(z.string().uuid()).optional(),
})

const updateClientRequestSchema = z.object({
  documentName: z.string().min(1).max(200).optional(),
  description:  z.string().max(2000).optional().nullable(),
  periodLabel:  z.string().max(20).optional().nullable(),
  startDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  requestedBy:  z.string().uuid().optional(),
  taskId:       z.string().uuid().optional().nullable(),
  remindedEmail: z.string().email().max(150).optional().nullable(),
  notes:        z.string().max(2000).optional().nullable(),
  collaboratorIds: z.array(z.string().uuid()).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

const remindSchema = z.object({
  email:   z.string().email().max(150).optional(),
  message: z.string().max(1000).optional().nullable(),
})

const generateLinkSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90).optional(),
})

const manualSubmitSchema = z.object({
  contactName:  z.string().max(150).optional().nullable(),
  phone:        z.string().max(20).optional().nullable(),
  description:  z.string().max(2000).optional().nullable(),
  sharedLinks:  z.array(z.string().url('Invalid URL').max(500)).max(10).optional(),
  notes:        z.string().max(1000).optional().nullable(),
  markReceived: z.boolean().optional(),
})

const addCommentSchema = z.object({
  content: z.string().min(1, 'Nội dung không được trống').max(5000),
})

const updateCommentSchema = z.object({
  content: z.string().min(1).max(5000),
})

const addChecklistItemSchema = z.object({
  stepText: z.string().min(1, 'Nội dung không được trống').max(500),
})

const updateChecklistItemSchema = z.object({
  stepText:    z.string().min(1).max(500).optional(),
  isCompleted: z.boolean().optional(),
  level:       z.number().int().min(0).max(1).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' })

const reorderChecklistSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), stepOrder: z.number().int() })).min(1),
})

const submitPublicFormSchema = z.object({
  contactName:  z.string().min(1).max(150),
  phone:        z.string().min(7).max(20),
  description:  z.string().min(1).max(2000),
  sharedLinks:  z.array(z.string().url('Invalid URL').max(500)).min(1).max(10),
  notes:        z.string().max(1000).optional().nullable(),
})

module.exports = {
  createClientRequestSchema,
  updateClientRequestSchema,
  remindSchema,
  generateLinkSchema,
  submitPublicFormSchema,
  manualSubmitSchema,
  addCommentSchema,
  updateCommentSchema,
  addChecklistItemSchema,
  updateChecklistItemSchema,
  reorderChecklistSchema,
}

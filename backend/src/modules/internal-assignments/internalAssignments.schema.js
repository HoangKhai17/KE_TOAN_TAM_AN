'use strict'
const { z } = require('zod')

const PRIORITIES = ['low', 'normal', 'high', 'urgent']

const createSchema = z.object({
  title:        z.string().min(1, 'Tiêu đề không được để trống').max(200),
  description:  z.string().max(5000).optional().nullable(),
  companyId:    z.string().uuid().optional().nullable(),
  priority:     z.enum(PRIORITIES).default('normal'),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày không hợp lệ (YYYY-MM-DD)').optional().nullable(),
  assigneeIds:  z.array(z.string().uuid()).min(0).default([]),
})

const updateSchema = z.object({
  title:        z.string().min(1).max(200).optional(),
  description:  z.string().max(5000).optional().nullable(),
  companyId:    z.string().uuid().optional().nullable(),
  priority:     z.enum(PRIORITIES).optional(),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  addAssigneeIds:    z.array(z.string().uuid()).optional(),
  removeAssigneeIds: z.array(z.string().uuid()).optional(),
})

const noteSchema = z.object({
  note: z.string().min(1, 'Ghi chú không được để trống').max(2000),
})

const optionalNoteSchema = z.object({
  note: z.string().max(2000).optional().nullable(),
})

const commentSchema = z.object({
  content: z.string().min(1, 'Nội dung không được để trống').max(3000),
})

const addChecklistItemSchema = z.object({
  text: z.string().min(1, 'Nội dung không được để trống').max(500),
})

const updateChecklistItemSchema = z.object({
  text:   z.string().min(1).max(500).optional(),
  isDone: z.boolean().optional(),
})

const addLinkSchema = z.object({
  name:        z.string().min(1).max(200),
  url:         z.string().url('URL không hợp lệ'),
  description: z.string().max(500).optional().nullable(),
})

module.exports = {
  createSchema, updateSchema, noteSchema, optionalNoteSchema, commentSchema,
  addChecklistItemSchema, updateChecklistItemSchema, addLinkSchema,
}

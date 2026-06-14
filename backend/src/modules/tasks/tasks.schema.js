const { z } = require('zod')

const TASK_STATUSES  = ['pending', 'in_progress', 'on_hold', 'pending_review', 'needs_revision', 'completed']
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent']

const createTaskSchema = z.object({
  title:       z.string().min(1).max(300),
  description: z.string().optional().nullable(),
  companyId:   z.string().uuid('Invalid company ID'),
  taskTypeId:  z.string().uuid().optional().nullable(),
  assignedTo:  z.string().uuid().optional().nullable(),
  startDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  dueDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  priority:    z.enum(TASK_PRIORITIES).default('medium'),
  slaDays:     z.number().int().min(1).optional().nullable(),
  source:      z.string().min(1).max(40).optional().nullable(),
})

const updateTaskSchema = z.object({
  title:       z.string().min(1).max(300).optional(),
  description: z.string().optional().nullable(),
  assignedTo:  z.string().uuid().optional().nullable(),
  startDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dueDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  priority:    z.enum(TASK_PRIORITIES).optional(),
  slaDays:     z.number().int().min(1).optional().nullable(),
}).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

const changeStatusSchema = z.object({
  status:        z.enum(TASK_STATUSES),
  onHoldReason:  z.string().max(500).optional().nullable(),
  force:         z.boolean().default(false),
})

// --- Checklist ---
const addChecklistItemSchema = z.object({
  stepText: z.string().min(1).max(500),
})

const updateChecklistItemSchema = z.object({
  stepText:    z.string().min(1).max(500).optional(),
  isCompleted: z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'No fields to update' })

// --- Dependencies ---
const addDependencySchema = z.object({
  dependsOnTaskId: z.string().uuid('Invalid task ID'),
})

// --- Comments ---
const addCommentSchema = z.object({
  content: z.string().min(1).max(5000),
})

const updateCommentSchema = z.object({
  content: z.string().min(1).max(5000),
})

// --- Time logs ---
const addTimeLogSchema = z.object({
  hours:      z.number().positive().max(24),
  note:       z.string().max(500).optional().nullable(),
  loggedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// --- Custom fields ---
const upsertCustomFieldsSchema = z.object({
  fields: z.array(z.object({
    fieldKey: z.string().min(1).max(80),
    value:    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  })).min(1),
})

// --- Task links ---
const addTaskLinkSchema = z.object({
  name:        z.string().min(1).max(200),
  url:         z.string().url('URL không hợp lệ'),
  description: z.string().max(500).optional().nullable(),
})

module.exports = {
  createTaskSchema, updateTaskSchema, changeStatusSchema,
  addChecklistItemSchema, updateChecklistItemSchema,
  addDependencySchema,
  addCommentSchema, updateCommentSchema,
  addTimeLogSchema,
  upsertCustomFieldsSchema,
  addTaskLinkSchema,
}

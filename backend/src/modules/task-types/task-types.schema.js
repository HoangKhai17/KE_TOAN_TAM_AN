const { z } = require('zod')

const FIELD_DATA_TYPES = ['text', 'number', 'date', 'boolean', 'select']

const taskTypeBase = z.object({
  name:           z.string().min(2).max(200),
  groupName:      z.string().max(100).optional().nullable(),
  description:    z.string().optional().nullable(),
  defaultSlaDays: z.number().int().min(1).max(365).default(7),
  // Cỡ việc (KPI): giá trị = mã enum 'task_size' (1=Nhỏ, 2=Vừa, 3=Lớn…). Service validate theo enum.
  sizePoints:     z.number().int().min(1).default(2),
})

const createTaskTypeSchema = taskTypeBase

const updateTaskTypeSchema = taskTypeBase.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'No fields to update' }
)

const checklistStepSchema = z.object({
  stepText: z.string().min(1).max(2000),   // cho phép nhiều dòng
  level:    z.number().int().min(0).max(1).optional().default(0),  // 0 = mục chính, 1 = mục phụ
})

const updateChecklistStepSchema = z.object({
  stepText:  z.string().min(1).max(2000).optional(),
  stepOrder: z.number().int().min(1).optional(),
  level:     z.number().int().min(0).max(1).optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: 'Provide at least one field to update',
})

// Việc con định kỳ (tách riêng): chỉ tiêu đề + hạn (offset ngày).
const subtaskTemplateSchema = z.object({
  title:         z.string().min(1).max(300),
  dueOffsetDays: z.number().int().min(0).max(3650).optional().nullable(),
})

const updateSubtaskTemplateSchema = z.object({
  title:         z.string().min(1).max(300).optional(),
  dueOffsetDays: z.number().int().min(0).max(3650).optional().nullable(),
  sortOrder:     z.number().int().min(0).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' })

// Bước checklist của việc con định kỳ (2 cấp như checklist cha)
const subtaskStepSchema = z.object({
  stepText: z.string().min(1).max(300),
  level:    z.number().int().min(0).max(1).optional().default(0),
})
const updateSubtaskStepSchema = z.object({
  stepText:  z.string().min(1).max(300).optional(),
  stepOrder: z.number().int().min(1).optional(),
  level:     z.number().int().min(0).max(1).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' })

const reorderChecklistSchema = z.object({
  steps: z
    .array(z.object({
      id:        z.string().uuid(),
      stepOrder: z.number().int().min(1),
    }))
    .min(1),
})

const customFieldBase = z.object({
  fieldKey:     z.string().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case (e.g. my_field)'),
  label:        z.string().min(1).max(150),
  dataType:     z.enum(FIELD_DATA_TYPES),
  options:      z.array(z.string().min(1)).optional().nullable(),
  isRequired:   z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
})

const createCustomFieldSchema = customFieldBase.refine(
  (d) => d.dataType !== 'select' || (Array.isArray(d.options) && d.options.length >= 2),
  { message: 'select type requires at least 2 options', path: ['options'] }
)

const updateCustomFieldSchema = customFieldBase.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'No fields to update' }
)

module.exports = {
  createTaskTypeSchema,
  updateTaskTypeSchema,
  checklistStepSchema,
  updateChecklistStepSchema,
  reorderChecklistSchema,
  subtaskTemplateSchema,
  updateSubtaskTemplateSchema,
  subtaskStepSchema,
  updateSubtaskStepSchema,
  createCustomFieldSchema,
  updateCustomFieldSchema,
}

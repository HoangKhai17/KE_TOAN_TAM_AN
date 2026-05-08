const { z } = require('zod')

const FIELD_DATA_TYPES = ['text', 'number', 'date', 'boolean', 'select']

const taskTypeBase = z.object({
  name:           z.string().min(2).max(200),
  groupName:      z.string().max(100).optional().nullable(),
  description:    z.string().optional().nullable(),
  defaultSlaDays: z.number().int().min(1).max(365).default(7),
})

const createTaskTypeSchema = taskTypeBase

const updateTaskTypeSchema = taskTypeBase.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'No fields to update' }
)

const checklistStepSchema = z.object({
  stepText: z.string().min(1).max(300),
})

const updateChecklistStepSchema = z.object({
  stepText:  z.string().min(1).max(300).optional(),
  stepOrder: z.number().int().min(1).optional(),
}).refine((d) => d.stepText !== undefined || d.stepOrder !== undefined, {
  message: 'Provide stepText or stepOrder',
})

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
  createCustomFieldSchema,
  updateCustomFieldSchema,
}

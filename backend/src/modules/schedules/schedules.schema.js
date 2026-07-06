const { z } = require('zod')
const { validateRecurrenceConfig } = require('../../utils/recurrence.validator')

const RECURRENCE_TYPES = [
  'daily', 'weekly', 'monthly_by_date', 'monthly_by_weekday',
  'monthly_last_day', 'quarterly', 'yearly', 'custom_dates', 'once',
]

const createScheduleSchema = z.object({
  taskTypeId:         z.string().uuid('Invalid task type ID'),
  assignedStaffId:    z.string().uuid().optional().nullable(),
  recurrenceType:     z.enum(RECURRENCE_TYPES),
  recurrenceConfig:   z.record(z.any()).default({}),
  deadlineOffsetDays: z.number().int().min(0).default(0),
  overrideSlaDays:    z.number().int().min(1).optional().nullable(),
  excludedStepIds:    z.array(z.string().uuid()).optional().default([]),
  notes:              z.string().max(500).optional().nullable(),
}).superRefine((d, ctx) => {
  try {
    validateRecurrenceConfig(d.recurrenceType, d.recurrenceConfig)
  } catch (err) {
    ctx.addIssue({ code: 'custom', message: err.message, path: ['recurrenceConfig'] })
  }
})

const updateScheduleSchema = z.object({
  assignedStaffId:    z.string().uuid().optional().nullable(),
  recurrenceType:     z.enum(RECURRENCE_TYPES).optional(),
  recurrenceConfig:   z.record(z.any()).optional(),
  deadlineOffsetDays: z.number().int().min(0).optional(),
  overrideSlaDays:    z.number().int().min(1).optional().nullable(),
  excludedStepIds:    z.array(z.string().uuid()).optional(),
  notes:              z.string().max(500).optional().nullable(),
}).superRefine((d, ctx) => {
  if (d.recurrenceType !== undefined && d.recurrenceConfig !== undefined) {
    try {
      validateRecurrenceConfig(d.recurrenceType, d.recurrenceConfig)
    } catch (err) {
      ctx.addIssue({ code: 'custom', message: err.message, path: ['recurrenceConfig'] })
    }
  }
})

module.exports = { createScheduleSchema, updateScheduleSchema }

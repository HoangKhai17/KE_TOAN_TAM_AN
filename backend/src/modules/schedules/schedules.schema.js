const { z } = require('zod')
const { validateRecurrenceConfig } = require('../../utils/recurrence.validator')

const RECURRENCE_TYPES = [
  'daily', 'weekly', 'monthly_by_date', 'monthly_by_weekday',
  'monthly_last_day', 'quarterly', 'yearly', 'custom_dates', 'once',
]

// Offset việc con: map { <subtaskTemplateId>: { start, deadline } }, offset ≥ 0 và deadline ≥ start.
const subtaskOffsetsSchema = z.record(
  z.string().uuid(),
  z.object({
    start:    z.number().int().min(0).max(3650),
    deadline: z.number().int().min(0).max(3650),
  }).refine((o) => o.deadline >= o.start, { message: 'Hạn việc con không được nhỏ hơn ngày bắt đầu' })
)

const createScheduleSchema = z.object({
  taskTypeId:         z.string().uuid('Invalid task type ID'),
  title:              z.string().max(300).optional().nullable(),   // tên riêng (lịch thủ công)
  assignedStaffId:    z.string().uuid().optional().nullable(),
  recurrenceType:     z.enum(RECURRENCE_TYPES),
  recurrenceConfig:   z.record(z.any()).default({}),
  deadlineOffsetDays: z.number().int().min(0).default(0),
  overrideSlaDays:    z.number().int().min(1).optional().nullable(),
  excludedStepIds:    z.array(z.string().uuid()).optional().default([]),
  subtaskOffsets:     subtaskOffsetsSchema.optional().default({}),
  notes:              z.string().max(500).optional().nullable(),
  sortOrder:          z.number().int().min(0).optional(),
}).superRefine((d, ctx) => {
  try {
    validateRecurrenceConfig(d.recurrenceType, d.recurrenceConfig)
  } catch (err) {
    ctx.addIssue({ code: 'custom', message: err.message, path: ['recurrenceConfig'] })
  }
})

const updateScheduleSchema = z.object({
  title:              z.string().max(300).optional().nullable(),
  assignedStaffId:    z.string().uuid().optional().nullable(),
  recurrenceType:     z.enum(RECURRENCE_TYPES).optional(),
  recurrenceConfig:   z.record(z.any()).optional(),
  deadlineOffsetDays: z.number().int().min(0).optional(),
  overrideSlaDays:    z.number().int().min(1).optional().nullable(),
  excludedStepIds:    z.array(z.string().uuid()).optional(),
  subtaskOffsets:     subtaskOffsetsSchema.optional(),
  notes:              z.string().max(500).optional().nullable(),
  sortOrder:          z.number().int().min(0).optional(),
}).superRefine((d, ctx) => {
  if (d.recurrenceType !== undefined && d.recurrenceConfig !== undefined) {
    try {
      validateRecurrenceConfig(d.recurrenceType, d.recurrenceConfig)
    } catch (err) {
      ctx.addIssue({ code: 'custom', message: err.message, path: ['recurrenceConfig'] })
    }
  }
})

// Đặt trần "ngày N hàng tháng" cho 1 lịch (Luồng 2). null/'' = xoá trần.
const setMaxDueDaySchema = z.object({
  maxDueDay: z.union([
    z.number().int().min(1).max(31),
    z.literal(''),
    z.null(),
  ]),
})

// Sinh bù kỳ: danh sách ngày phát sinh 'yyyy-MM-dd' + cờ force (sinh lại kể cả kỳ đã có)
const backfillSchema = z.object({
  periods: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD'))
             .min(1, 'Chưa chọn kỳ nào')
             .max(60, 'Tối đa 60 kỳ mỗi lần'),
  force:   z.boolean().optional().default(false),
})

// Checklist RIÊNG của lịch (KPI v2) — độ khó validate ở service theo enum.
const scheduleChecklistItemSchema = z.object({
  stepText:    z.string().min(1).max(2000),
  level:       z.number().int().min(0).max(1).optional().default(0),
  difficulty:  z.string().max(20).optional(),
  points:      z.number().int().min(0).max(100).optional(),
  isImportant: z.boolean().optional(),
})
const updateScheduleChecklistItemSchema = z.object({
  stepText:    z.string().min(1).max(2000).optional(),
  stepOrder:   z.number().int().min(1).optional(),
  level:       z.number().int().min(0).max(1).optional(),
  difficulty:  z.string().max(20).optional(),
  points:      z.number().int().min(0).max(100).optional(),
  isImportant: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' })
const reorderScheduleChecklistSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), stepOrder: z.number().int().min(1) })).min(1),
})
// Ghi đè toàn bộ checklist của lịch (cho phép rỗng = xoá hết).
const replaceScheduleChecklistSchema = z.object({
  items: z.array(z.object({
    stepText:    z.string().min(1).max(2000),
    level:       z.number().int().min(0).max(1).optional(),
    difficulty:  z.string().max(20).optional(),
    points:      z.number().int().min(0).max(100).optional(),
    isImportant: z.boolean().optional(),
    sourceTemplateStepId: z.string().uuid().optional().nullable(),
  })).max(200),
})

module.exports = {
  createScheduleSchema, updateScheduleSchema, setMaxDueDaySchema, backfillSchema,
  scheduleChecklistItemSchema, updateScheduleChecklistItemSchema, reorderScheduleChecklistSchema,
  replaceScheduleChecklistSchema,
}

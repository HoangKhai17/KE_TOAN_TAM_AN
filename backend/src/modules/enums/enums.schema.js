const { z } = require('zod')

const updateOptionLabelSchema = z.object({
  label: z.string().min(1).max(200),
})

const addOptionSchema = z.object({
  optionKey: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/, 'Mã chỉ gồm chữ thường, số và dấu _'),
  label:     z.string().min(1).max(200),
})

module.exports = { updateOptionLabelSchema, addOptionSchema }

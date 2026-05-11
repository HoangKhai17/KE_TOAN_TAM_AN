const { z } = require('zod')

const updateOptionLabelSchema = z.object({
  label: z.string().min(1).max(200),
})

module.exports = { updateOptionLabelSchema }

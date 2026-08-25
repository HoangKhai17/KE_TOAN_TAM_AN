'use strict'
const { z } = require('zod')

// Mỗi quy trình giờ là MỘT TÀI LIỆU rich-text (HTML). Không còn nút/cạnh canvas.

const createProcessSchema = z.object({
  name:        z.string().min(1, 'Tên quy trình không được để trống').max(200),
  description: z.string().max(2000).optional().nullable(),
})

// Cập nhật: tên/mô tả/thứ tự HOẶC nội dung tài liệu.
// content giới hạn ~500KB để chặn lạm dụng (ảnh đã tách ra attachments nên HTML nhẹ).
const updateProcessSchema = z.object({
  name:              z.string().min(1).max(200).optional(),
  description:       z.string().max(2000).optional().nullable(),
  position:          z.number().int().optional(),
  content:           z.string().max(500_000).optional().nullable(),
  // Mốc thời gian client đang giữ — phát hiện 2 người cùng sửa (chống ghi đè)
  expectedUpdatedAt: z.string().optional().nullable(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Không có thay đổi nào' })

module.exports = {
  createProcessSchema,
  updateProcessSchema,
}

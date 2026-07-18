'use strict'
const { z } = require('zod')

// Hình hình học để người dùng vẽ tự do (không còn bó theo "loại bước nghiệp vụ").
// 'line' và 'arrow' là hình ĐỘC LẬP đặt tự do trên canvas — khác với đường nối 2 hình.
const NODE_TYPES = [
  'rectangle', 'square', 'circle', 'triangle', 'parallelogram', 'diamond', 'text',
  'line', 'arrow',
]
// Đầu mũi tên: 1 chiều · 2 chiều · không mũi tên
const EDGE_KINDS = ['arrow', 'double', 'line']
// Dáng đường nối: thẳng · cong · gấp khúc vuông góc
const EDGE_SHAPES = ['straight', 'curved', 'elbow']

const createProcessSchema = z.object({
  name:        z.string().min(1, 'Tên quy trình không được để trống').max(200),
  description: z.string().max(2000).optional().nullable(),
})

const updateProcessSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  position:    z.number().int().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Không có thay đổi nào' })

// Nút: id do CLIENT sinh (uuid) để giữ liên kết khi lưu đi lưu lại nhiều lần
const nodeSchema = z.object({
  id:       z.string().uuid(),
  code:     z.string().max(20).optional().nullable(),
  // KHÔNG bắt buộc có chữ: đường kẻ, mũi tên và hình trang trí vốn không có nhãn.
  // (Trước đây min(1) khiến CẢ sơ đồ không lưu được khi có 1 hình chưa ghi chữ.)
  title:    z.string().max(300).default(''),
  nodeType: z.enum(NODE_TYPES).default('rectangle'),
  actor:    z.string().max(100).optional().nullable(),
  note:     z.string().max(2000).optional().nullable(),
  posX:     z.number(),
  posY:     z.number(),
  width:    z.number().optional().nullable(),
  height:   z.number().optional().nullable(),
  // Kiểu hiển thị riêng của hình: { dashed: true } … (mở rộng sau không cần migration)
  style:    z.object({ dashed: z.boolean().optional() }).passthrough().optional().nullable(),
})

const edgeSchema = z.object({
  id:           z.string().uuid(),
  fromNodeId:   z.string().uuid(),
  toNodeId:     z.string().uuid(),
  label:        z.string().max(200).optional().nullable(),
  edgeKind:     z.enum(EDGE_KINDS).default('arrow'),
  edgeShape:    z.enum(EDGE_SHAPES).default('curved'),
  dashed:       z.boolean().optional(),
  sourceHandle: z.string().max(50).optional().nullable(),
  targetHandle: z.string().max(50).optional().nullable(),
  position:     z.number().int().optional().nullable(),
})

const saveGraphSchema = z.object({
  nodes: z.array(nodeSchema).max(300, 'Sơ đồ tối đa 300 bước'),
  edges: z.array(edgeSchema).max(600, 'Sơ đồ tối đa 600 mũi tên'),
  // Mốc thời gian client đang giữ — dùng phát hiện 2 người cùng sửa
  expectedUpdatedAt: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  // Trùng id nút → upsert sẽ ghi đè lẫn nhau, phải chặn sớm
  const nodeIds = new Set()
  for (const n of data.nodes) {
    if (nodeIds.has(n.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Trùng id bước: ${n.id}`, path: ['nodes'] })
    }
    nodeIds.add(n.id)
  }
  const edgeIds = new Set()
  for (const e of data.edges) {
    if (edgeIds.has(e.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Trùng id mũi tên: ${e.id}`, path: ['edges'] })
    }
    edgeIds.add(e.id)
    // Cạnh phải trỏ tới nút có trong sơ đồ
    if (!nodeIds.has(e.fromNodeId) || !nodeIds.has(e.toNodeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Có mũi tên nối tới bước không tồn tại trong sơ đồ',
        path: ['edges'],
      })
    }
  }
})

module.exports = {
  createProcessSchema,
  updateProcessSchema,
  saveGraphSchema,
  NODE_TYPES,
  EDGE_KINDS,
  EDGE_SHAPES,
}

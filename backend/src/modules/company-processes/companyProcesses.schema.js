'use strict'
const { z } = require('zod')

const NODE_TYPES = ['start', 'step', 'decision', 'end', 'document']
const EDGE_KINDS = ['normal', 'back']

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
  title:    z.string().min(1, 'Bước phải có tên').max(300),
  nodeType: z.enum(NODE_TYPES).default('step'),
  actor:    z.string().max(100).optional().nullable(),
  note:     z.string().max(2000).optional().nullable(),
  posX:     z.number(),
  posY:     z.number(),
})

const edgeSchema = z.object({
  id:           z.string().uuid(),
  fromNodeId:   z.string().uuid(),
  toNodeId:     z.string().uuid(),
  label:        z.string().max(200).optional().nullable(),
  edgeKind:     z.enum(EDGE_KINDS).default('normal'),
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
}

'use strict'
const { z } = require('zod')

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#64748b']

const createCategorySchema = z.object({
  name:      z.string().min(1, 'Tên không được để trống').max(100),
  color:     z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Màu không hợp lệ').optional(),
  sortOrder: z.number().int().min(0).optional(),
})

const updateCategorySchema = z.object({
  name:      z.string().min(1).max(100).optional(),
  color:     z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().int().min(0).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Không có gì để cập nhật' })

// Một mục là LINK (url) HOẶC FILE (attachmentId) — phải có đúng một trong hai.
const createLinkSchema = z.object({
  categoryId:   z.string().uuid().optional().nullable(),
  title:        z.string().min(1, 'Tiêu đề không được để trống').max(200),
  url:          z.string().url('URL không hợp lệ').max(2000).optional().nullable(),
  attachmentId: z.string().uuid().optional().nullable(),
  description:  z.string().max(1000).optional().nullable(),
}).refine((d) => !!d.url !== !!d.attachmentId, {
  message: 'Phải nhập URL hoặc chọn file (không được cả hai, không được bỏ trống)',
  path: ['url'],
})

const updateLinkSchema = z.object({
  categoryId:  z.string().uuid().optional().nullable(),
  title:       z.string().min(1).max(200).optional(),
  url:         z.string().url().max(2000).optional(),
  description: z.string().max(1000).optional().nullable(),
})

module.exports = { createCategorySchema, updateCategorySchema, createLinkSchema, updateLinkSchema, COLORS }

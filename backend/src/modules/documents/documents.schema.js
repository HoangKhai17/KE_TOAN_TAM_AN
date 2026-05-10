const { z } = require('zod')

const ALLOWED_CATEGORIES = ['ho_so', 'bao_cao', 'hop_dong', 'chung_tu', 'thue', 'bao_hiem', 'khac']

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png',
  'text/plain',
]

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.txt']

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

const uploadDocumentSchema = z.object({
  category: z.enum(ALLOWED_CATEGORIES).default('khac'),
  taskId:   z.string().uuid().optional().nullable(),
})

const attachDocumentSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
})

module.exports = {
  uploadDocumentSchema, attachDocumentSchema,
  ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE,
}

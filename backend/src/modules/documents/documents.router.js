const { Router } = require('express')
const multer     = require('multer')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const { attachDocumentSchema, MAX_FILE_SIZE } = require('./documents.schema')
const ctrl = require('./documents.controller')

// Mounted at /api/companies/:companyId/documents
const router = Router({ mergeParams: true })
const auth   = [authenticate]

// Store file in memory buffer for streaming to OneDrive
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_FILE_SIZE },
})

/**
 * @openapi
 * /companies/{companyId}/documents:
 *   get:
 *     tags: [Documents]
 *     summary: List documents for a company
 *     parameters:
 *       - { in: path,  name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: taskId,    schema: { type: string }, description: 'UUID để lọc theo task; "null" để lấy tài liệu chung (task_id IS NULL)' }
 *       - { in: query, name: category,  schema: { type: string, enum: [ho_so, bao_cao, hop_dong, chung_tu, thue, bao_hiem, khac] } }
 *       - { in: query, name: page,      schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,     schema: { type: integer, default: 30, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Document list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     documents:  { type: array, items: { $ref: '#/components/schemas/Document' } }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       404: { description: Company not found }
 *   post:
 *     tags: [Documents]
 *     summary: Upload a document to OneDrive
 *     description: |
 *       Multipart/form-data upload. File là required field "file".
 *       Allowed types: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, TXT (max 20MB).
 *       File được lưu tại `/TamAn_Documents/KH_{companyName}/{year}/{category}/` trên OneDrive.
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:     { type: string, format: binary }
 *               category: { type: string, enum: [ho_so, bao_cao, hop_dong, chung_tu, thue, bao_hiem, khac], default: khac }
 *               taskId:   { type: string, format: uuid, nullable: true, description: 'Đính kèm vào task ngay khi upload' }
 *     responses:
 *       201:
 *         description: Document uploaded and metadata saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     document: { $ref: '#/components/schemas/Document' }
 *       422: { description: Invalid file type, extension, or size }
 *       503: { description: OneDrive not configured or upload failed }
 */
router.get('/',  ...auth, ctrl.listDocuments)
router.post('/', ...auth, upload.single('file'), ctrl.uploadDocument)

/**
 * @openapi
 * /companies/{companyId}/documents/{id}/link:
 *   get:
 *     tags: [Documents]
 *     summary: Get (and refresh) the OneDrive web URL for a document
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Web URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     url: { type: string, format: uri }
 *       404: { description: Document not found }
 */
router.get('/:id/link', ...auth, ctrl.getLinkUrl)

/**
 * @openapi
 * /companies/{companyId}/documents/{id}/attach:
 *   post:
 *     tags: [Documents]
 *     summary: Attach a company document to a specific task
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [taskId]
 *             properties:
 *               taskId: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Document linked to task
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     document: { $ref: '#/components/schemas/Document' }
 *       404: { description: Document or task not found }
 */
router.post('/:id/attach', ...auth, validate(attachDocumentSchema), ctrl.attachToTask)

/**
 * @openapi
 * /companies/{companyId}/documents/{id}:
 *   delete:
 *     tags: [Documents]
 *     summary: Delete a document from OneDrive and DB (admin only)
 *     description: Best-effort OneDrive deletion — DB record is removed even if OneDrive delete fails.
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Document not found }
 */
router.delete('/:id', [authenticate, requireRole('admin')], ctrl.deleteDocument)

module.exports = router

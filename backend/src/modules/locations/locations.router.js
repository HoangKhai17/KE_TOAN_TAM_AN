const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const { createLocationSchema, updateLocationSchema } = require('./locations.schema')
const ctrl = require('./locations.controller')

// Mounted at /api/companies/:companyId/locations
// Quyền theo công ty phụ trách kiểm tra trong service (admin: toàn quyền; staff: cty của mình)
const router = Router({ mergeParams: true })
const auth  = [authenticate]

/**
 * @openapi
 * /companies/{companyId}/locations:
 *   get:
 *     tags: [Locations]
 *     summary: List locations of a company
 *     parameters:
 *       - { in: path,  name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: status,    schema: { type: string }, description: 'Lọc theo trạng thái địa điểm' }
 *     responses:
 *       200: { description: Location list }
 *       404: { description: Company not found }
 *   post:
 *     tags: [Locations]
 *     summary: Create a location
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Location created }
 *       404: { description: Company not found }
 */
router.get('/',  ...auth, ctrl.listLocations)
router.post('/', ...auth, validate(createLocationSchema), ctrl.createLocation)

/**
 * @openapi
 * /companies/{companyId}/locations/{id}:
 *   get:
 *     tags: [Locations]
 *     summary: Get a single location
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Location detail }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Locations]
 *     summary: Update a location
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 *   delete:
 *     tags: [Locations]
 *     summary: Delete a location permanently
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found }
 */
router.get('/:id',    ...auth, ctrl.getLocation)
router.patch('/:id',  ...auth, validate(updateLocationSchema), ctrl.updateLocation)
router.delete('/:id', ...auth, ctrl.deleteLocation)

module.exports = router

const swaggerJsdoc = require('swagger-jsdoc')

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Kế Toán Tâm An — API',
      version: '1.0.0',
      description: 'Internal management API for Ke Toan Tam An accounting firm.',
    },
    servers: [{ url: '/api', description: 'Development server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token (15 min). Obtain via POST /api/auth/login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page:       { type: 'integer', example: 1 },
            limit:      { type: 'integer', example: 20 },
            total:      { type: 'integer', example: 100 },
            totalPages: { type: 'integer', example: 5 },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Health',      description: 'System health check' },
      { name: 'Auth',        description: 'Authentication & session management' },
      { name: 'Users',       description: 'User & staff management' },
      { name: 'Companies',   description: 'Customer company profiles' },
      { name: 'Task Types',  description: 'Task type library (Layer 1)' },
      { name: 'Schedules',   description: 'Customer task schedules (Layer 2)' },
      { name: 'Tasks',       description: 'Task lifecycle management' },
      { name: 'Credentials', description: 'Encrypted credential vault' },
      { name: 'Payroll',     description: 'Payroll period management' },
      { name: 'Documents',   description: 'OneDrive document management' },
      { name: 'Notifications', description: 'In-app notifications' },
      { name: 'Reports',     description: 'Dashboard & reports' },
    ],
  },
  apis: ['./src/modules/**/*.router.js', './src/app.js'],
}

const swaggerSpec = swaggerJsdoc(options)

module.exports = swaggerSpec

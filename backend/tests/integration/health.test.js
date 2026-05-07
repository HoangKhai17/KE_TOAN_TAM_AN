const request = require('supertest')
const createApp = require('../../src/app')

// Mock db and redis for this test
jest.mock('../../src/config/db', () => ({
  testConnection: jest.fn().mockResolvedValue(true),
  query: jest.fn(),
  getClient: jest.fn(),
}))

jest.mock('../../src/config/redis', () => ({
  redis: { connect: jest.fn(), quit: jest.fn() },
  testConnection: jest.fn().mockResolvedValue(true),
}))

describe('GET /api/health', () => {
  let app

  beforeAll(() => {
    app = createApp()
  })

  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.db).toBe('ok')
    expect(res.body.redis).toBe('ok')
    expect(typeof res.body.uptime).toBe('number')
  })

  it('returns X-Request-ID header', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-request-id']).toBeDefined()
  })

  it('404 for unknown route', async () => {
    const res = await request(app).get('/api/unknown-route-xyz')
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })
})

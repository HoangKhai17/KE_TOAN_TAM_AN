// Minimal smoke test — logger should not throw during import
describe('Logger', () => {
  it('can be imported without error', () => {
    expect(() => require('../../src/config/logger')).not.toThrow()
  })

  it('has expected log methods', () => {
    const logger = require('../../src/config/logger')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })
})

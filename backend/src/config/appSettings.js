/**
 * In-memory application settings loaded from system_configs at startup.
 * Provides a single source of truth for runtime config without per-request DB reads.
 */

let _timezone = 'Asia/Ho_Chi_Minh'

function getTimezone() {
  return _timezone
}

function applyTimezone(tz) {
  _timezone = tz
  // Affects date-fns, new Date().toLocaleString(), etc.
  // Must be set before the first date operation; at startup this is always safe.
  process.env.TZ = tz
}

module.exports = { getTimezone, applyTimezone }

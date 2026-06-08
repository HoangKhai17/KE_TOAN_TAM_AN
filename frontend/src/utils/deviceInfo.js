// Collect structured device info for attendance check-in/out logs.
// Result JSON fits comfortably within the VARCHAR(200) device_info column (~80 chars max).

function parseUA(ua) {
  const isMobile = /Mobi|Android(?!.*Tablet)|iPhone/i.test(ua)
  const isTablet = /iPad|Android.*Tablet|Tablet.*Android/i.test(ua)

  let os = 'Unknown'
  if (/Android/.test(ua))                   os = 'Android'
  else if (/iPhone|iPad|iPod/.test(ua))     os = 'iOS'
  else if (/Windows NT/.test(ua))           os = 'Windows'
  else if (/Mac OS X/.test(ua))             os = 'macOS'
  else if (/Linux/.test(ua))                os = 'Linux'
  else if (/CrOS/.test(ua))                 os = 'ChromeOS'

  let browser = 'Unknown'
  if (/Edg\//.test(ua))                     browser = 'Edge'
  else if (/OPR\/|Opera/.test(ua))          browser = 'Opera'
  else if (/Firefox\//.test(ua))            browser = 'Firefox'
  else if (/Chrome\//.test(ua))             browser = 'Chrome'
  else if (/Safari\//.test(ua))             browser = 'Safari'
  else if (/SamsungBrowser/.test(ua))       browser = 'Samsung'

  let type = 'desktop'
  if (isTablet)      type = 'tablet'
  else if (isMobile) type = 'mobile'

  return { type, os, browser }
}

// Detect if running as installed PWA (added to home screen / standalone mode)
function detectPWA() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari PWA
  if (window.navigator.standalone === true) return true
  return false
}

// Battery API hint: distinguish laptop from desktop (Chrome/Edge only).
// Logic: desktops have no real battery (dischargingTime === Infinity at full charge).
// Laptops have a fluctuating battery. If both conditions hold it's likely a desktop.
async function detectLaptopVsDesktop() {
  if (typeof navigator === 'undefined') return 'desktop'
  if (typeof navigator.getBattery !== 'function') return 'desktop'
  try {
    const battery = await navigator.getBattery()
    // Real laptop battery: either not fully charged OR discharging time is finite
    const hasRealBattery = battery.level < 1 || battery.dischargingTime !== Infinity
    return hasRealBattery ? 'laptop' : 'desktop'
  } catch {
    return 'desktop'
  }
}

/**
 * Collects device info asynchronously.
 * Returns: { type, os, browser, isPWA }
 *   type: 'mobile' | 'tablet' | 'laptop' | 'desktop'
 */
export async function collectDeviceInfo() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const { type: baseType, os, browser } = parseUA(ua)
  const isPWA = detectPWA()

  let type = baseType
  if (type === 'desktop') {
    type = await detectLaptopVsDesktop()
  }

  return { type, os, browser, isPWA }
}

/**
 * Infer checkin_method from device type.
 * mobile/tablet → 'mobile' (maps to checkin_method enum)
 * laptop/desktop → 'web'
 */
export function detectMethod(deviceType) {
  return deviceType === 'mobile' || deviceType === 'tablet' ? 'mobile' : 'web'
}

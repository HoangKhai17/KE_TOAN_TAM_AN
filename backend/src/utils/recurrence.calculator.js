const { addDays, addMonths, getDaysInMonth, lastDayOfMonth, getDay, parseISO, format } = require('date-fns')

function toMidnight(d) {
  const result = new Date(d)
  result.setHours(0, 0, 0, 0)
  return result
}

function getNthWeekdayOfMonth(year, month, wd, n) {
  let count = 0
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    if (getDay(d) === wd) {
      count++
      if (count === n) return new Date(d)
    }
    d.setDate(d.getDate() + 1)
  }
  return null
}

// Returns next occurrence strictly AFTER afterDate, or null if no more occurrences
function getNextOccurrence(type, config, afterDate) {
  const after = toMidnight(afterDate)

  switch (type) {
    case 'daily': {
      return addDays(after, config.every_n_days)
    }

    case 'weekly': {
      const weekdays = [...config.weekdays].sort((a, b) => a - b)
      const afterDay = getDay(after)
      for (const wd of weekdays) {
        if (wd > afterDay) return addDays(after, wd - afterDay)
      }
      // Wrap to next week
      return addDays(after, 7 - afterDay + weekdays[0])
    }

    case 'monthly_by_date': {
      const day = config.day
      const startOfCurrentMonth = new Date(after.getFullYear(), after.getMonth(), 1)
      const actualDayCurrent = Math.min(day, getDaysInMonth(startOfCurrentMonth))
      const candidateCurrent = new Date(after.getFullYear(), after.getMonth(), actualDayCurrent)
      if (candidateCurrent > after) return candidateCurrent
      const nextMonthStart = addMonths(startOfCurrentMonth, 1)
      return new Date(nextMonthStart.getFullYear(), nextMonthStart.getMonth(), Math.min(day, getDaysInMonth(nextMonthStart)))
    }

    case 'monthly_by_weekday': {
      const { weekday, week } = config

      // Try current month
      const candidate = getNthWeekdayOfMonth(after.getFullYear(), after.getMonth(), weekday, week)
      if (candidate && candidate > after) return candidate

      // Search next months
      let m = after.getMonth() + 1
      let y = after.getFullYear()
      if (m > 11) { m = 0; y++ }
      for (let i = 0; i < 13; i++) {
        const c = getNthWeekdayOfMonth(y, m, weekday, week)
        if (c) return c
        m++
        if (m > 11) { m = 0; y++ }
      }
      return null
    }

    case 'monthly_last_day': {
      const lastOfCurrent = lastDayOfMonth(after)
      if (lastOfCurrent > after) return lastOfCurrent
      return lastDayOfMonth(addMonths(after, 1))
    }

    case 'quarterly': {
      const { month_in_quarter, day } = config
      const currentQuarter = Math.floor(after.getMonth() / 3)
      for (let qOffset = 0; qOffset <= 4; qOffset++) {
        const totalQ = currentQuarter + qOffset
        const y = after.getFullYear() + Math.floor(totalQ / 4)
        const q = totalQ % 4
        const month = q * 3 + (month_in_quarter - 1)
        const daysInMonth = getDaysInMonth(new Date(y, month, 1))
        const candidate = new Date(y, month, Math.min(day, daysInMonth))
        if (candidate > after) return candidate
      }
      return null
    }

    case 'yearly': {
      const { month, day } = config
      for (let y = after.getFullYear(); y <= after.getFullYear() + 2; y++) {
        const m = month - 1
        const daysInMonth = getDaysInMonth(new Date(y, m, 1))
        const candidate = new Date(y, m, Math.min(day, daysInMonth))
        if (candidate > after) return candidate
      }
      return null
    }

    case 'custom_dates': {
      const afterStr = format(after, 'yyyy-MM-dd')
      const future = [...config.dates].sort().filter(d => d > afterStr)
      if (!future.length) return null
      return parseISO(future[0])
    }

    case 'once': {
      const afterStr = format(after, 'yyyy-MM-dd')
      if (config.date > afterStr) return parseISO(config.date)
      return null
    }

    default:
      return null
  }
}

// Returns next N occurrences as YYYY-MM-DD strings starting from (inclusive) fromDate
function getNextOccurrences(type, config, fromDate, count = 10) {
  const results = []
  // Start one day before so fromDate itself can be included
  let cursor = addDays(toMidnight(fromDate), -1)
  let safety = count * 100

  while (results.length < count && safety-- > 0) {
    const next = getNextOccurrence(type, config, cursor)
    if (!next) break
    results.push(format(next, 'yyyy-MM-dd'))
    cursor = next
  }
  return results
}

// Used by scheduler (Phase 8): should we generate a task today?
function shouldGenerateToday(recurrenceType, recurrenceConfig, lastGeneratedAt) {
  const today = format(toMidnight(new Date()), 'yyyy-MM-dd')
  const referenceDate = lastGeneratedAt
    ? toMidnight(lastGeneratedAt)
    : addDays(toMidnight(new Date()), -1)

  const next = getNextOccurrence(recurrenceType, recurrenceConfig, referenceDate)
  if (!next) return { shouldGenerate: false, forDate: null }
  const nextStr = format(next, 'yyyy-MM-dd')
  return { shouldGenerate: nextStr <= today, forDate: next }
}

module.exports = { getNextOccurrence, getNextOccurrences, shouldGenerateToday }

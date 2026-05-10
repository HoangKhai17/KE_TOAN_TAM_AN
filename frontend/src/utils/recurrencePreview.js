import {
  addDays, addMonths, getDaysInMonth, lastDayOfMonth,
  getDay, parseISO, format,
} from 'date-fns'

function toMidnight(d) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
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

function getNextOccurrence(type, config, afterDate) {
  const after = toMidnight(afterDate)

  switch (type) {
    case 'daily': {
      if (!config.every_n_days || config.every_n_days < 1) return null
      return addDays(after, config.every_n_days)
    }

    case 'weekly': {
      const weekdays = [...(config.weekdays || [])].sort((a, b) => a - b)
      if (!weekdays.length) return null
      const afterDay = getDay(after)
      for (const wd of weekdays) {
        if (wd > afterDay) return addDays(after, wd - afterDay)
      }
      return addDays(after, 7 - afterDay + weekdays[0])
    }

    case 'monthly_by_date': {
      const day = config.day
      if (!day || day < 1) return null
      const som = new Date(after.getFullYear(), after.getMonth(), 1)
      const c = new Date(after.getFullYear(), after.getMonth(), Math.min(day, getDaysInMonth(som)))
      if (c > after) return c
      const next = addMonths(som, 1)
      return new Date(next.getFullYear(), next.getMonth(), Math.min(day, getDaysInMonth(next)))
    }

    case 'monthly_by_weekday': {
      const { weekday, week } = config
      if (weekday === undefined || !week) return null
      const c = getNthWeekdayOfMonth(after.getFullYear(), after.getMonth(), weekday, week)
      if (c && c > after) return c
      let m = after.getMonth() + 1
      let y = after.getFullYear()
      if (m > 11) { m = 0; y++ }
      for (let i = 0; i < 13; i++) {
        const x = getNthWeekdayOfMonth(y, m, weekday, week)
        if (x) return x
        m++
        if (m > 11) { m = 0; y++ }
      }
      return null
    }

    case 'monthly_last_day': {
      const last = lastDayOfMonth(after)
      if (last > after) return last
      return lastDayOfMonth(addMonths(after, 1))
    }

    case 'quarterly': {
      const { month_in_quarter, day } = config
      if (!month_in_quarter || !day) return null
      const curQ = Math.floor(after.getMonth() / 3)
      for (let qOff = 0; qOff <= 4; qOff++) {
        const totalQ = curQ + qOff
        const y = after.getFullYear() + Math.floor(totalQ / 4)
        const q = totalQ % 4
        const m = q * 3 + (month_in_quarter - 1)
        const c = new Date(y, m, Math.min(day, getDaysInMonth(new Date(y, m, 1))))
        if (c > after) return c
      }
      return null
    }

    case 'yearly': {
      const { month, day } = config
      if (!month || !day) return null
      for (let y = after.getFullYear(); y <= after.getFullYear() + 2; y++) {
        const m = month - 1
        const c = new Date(y, m, Math.min(day, getDaysInMonth(new Date(y, m, 1))))
        if (c > after) return c
      }
      return null
    }

    case 'custom_dates': {
      if (!config.dates || !config.dates.length) return null
      const afterStr = format(after, 'yyyy-MM-dd')
      const future = [...config.dates].sort().filter(d => d > afterStr)
      return future.length ? parseISO(future[0]) : null
    }

    case 'once': {
      if (!config.date) return null
      const afterStr = format(after, 'yyyy-MM-dd')
      return config.date > afterStr ? parseISO(config.date) : null
    }

    default:
      return null
  }
}

export function getNextOccurrences(type, config, fromDate = new Date(), count = 10) {
  if (!type || !config) return []
  const results = []
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

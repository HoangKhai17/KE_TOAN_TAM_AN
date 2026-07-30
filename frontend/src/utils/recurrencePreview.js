import {
  addDays, addMonths, getDaysInMonth, lastDayOfMonth,
  getDay, parseISO, format, differenceInCalendarDays,
} from 'date-fns'

// Ngày nghỉ = CN (getDay===0) hoặc trùng ngày lễ. Thứ 7 vẫn làm việc.
function isOffDay(date, holidaySet) {
  if (getDay(date) === 0) return true
  return holidaySet ? holidaySet.has(format(date, 'yyyy-MM-dd')) : false
}
function rollForwardToWorkday(date, holidaySet) {
  let d = date, guard = 0
  while (isOffDay(d, holidaySet) && guard++ < 366) d = addDays(d, 1)
  return d
}

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
      const n = config.every_n_days
      if (!n || n < 1) return null
      // Có ngày bắt đầu (anchor) → kỳ = start_date + k*N; kỳ đầu = start_date.
      if (config.start_date) {
        const start = toMidnight(parseISO(config.start_date))
        if (after < start) return start
        const k = Math.floor(differenceInCalendarDays(after, start) / n) + 1
        return addDays(start, k * n)
      }
      return addDays(after, n)
    }

    case 'weekly': {
      const weekdays = [...(config.weekdays || [])].sort((a, b) => a - b)
      if (!weekdays.length) return null
      let base = after
      if (config.start_date) {
        const sMinus1 = addDays(toMidnight(parseISO(config.start_date)), -1)
        if (base < sMinus1) base = sMinus1
      }
      const afterDay = getDay(base)
      for (const wd of weekdays) {
        if (wd > afterDay) return addDays(base, wd - afterDay)
      }
      return addDays(base, 7 - afterDay + weekdays[0])
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

// holidaySet (tùy chọn): Set 'yyyy-MM-dd' → ngày hiển thị được đẩy khỏi CN/lễ
// để khớp với ngày bắt đầu thực tế của task sinh ra. cursor vẫn đi theo kỳ GỐC.
export function getNextOccurrences(type, config, fromDate = new Date(), count = 10, holidaySet = null) {
  if (!type || !config) return []
  const results = []
  let cursor = addDays(toMidnight(fromDate), -1)
  let safety = count * 100

  while (results.length < count && safety-- > 0) {
    const next = getNextOccurrence(type, config, cursor)
    if (!next) break
    const shown = holidaySet ? rollForwardToWorkday(next, holidaySet) : next
    results.push(format(shown, 'yyyy-MM-dd'))
    cursor = next
  }
  return results
}

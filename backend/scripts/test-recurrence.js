/**
 * test-recurrence.js
 * Unit test cho recurrence.calculator.js — không cần DB, chạy độc lập.
 *
 * Chạy: node scripts/test-recurrence.js
 */

'use strict'
const { getNextOccurrence, getNextOccurrences, shouldGenerateToday } = require('../src/utils/recurrence.calculator')
const { format, addDays } = require('date-fns')

// ── helpers ────────────────────────────────────────────────────────────────────

const TODAY    = new Date()
const TODAY_STR = format(TODAY, 'yyyy-MM-dd')
const YESTERDAY = addDays(TODAY, -1)
const LAST_MONTH_END = (() => {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), 0) // ngày cuối tháng trước
  return d
})()

let passed = 0
let failed = 0

function check(label, actual, expected) {
  const ok = actual === expected
  const icon = ok ? '✅' : '❌'
  console.log(`  ${icon} ${label}`)
  if (!ok) console.log(`      expected: ${expected}\n      got:      ${actual}`)
  if (ok) passed++; else failed++
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

// ── Tests ──────────────────────────────────────────────────────────────────────

section('TODAY = ' + TODAY_STR + ' (dayOfWeek=' + TODAY.getDay() + ')')

// ── 1. daily ──────────────────────────────────────────────────────────────────
section('1. DAILY — every_n_days')

{
  const cfg = { every_n_days: 1 }
  const next = getNextOccurrence('daily', cfg, YESTERDAY)
  check('next after yesterday = today', format(next, 'yyyy-MM-dd'), TODAY_STR)

  const { shouldGenerate } = shouldGenerateToday('daily', cfg, null)
  check('shouldGenerateToday (lastGenAt=null) = true', String(shouldGenerate), 'true')

  // Next 5 occurrences
  const dates = getNextOccurrences('daily', cfg, TODAY, 5)
  check('5 next dates count', String(dates.length), '5')
  check('first = today', dates[0], TODAY_STR)
  console.log('    Next 5:', dates.join(', '))

  // every_n_days = 3
  const cfg3 = { every_n_days: 3 }
  const next3 = getNextOccurrence('daily', cfg3, TODAY)
  check('every 3 days: next after today', format(next3, 'yyyy-MM-dd'), format(addDays(TODAY, 3), 'yyyy-MM-dd'))
}

// ── 2. weekly ─────────────────────────────────────────────────────────────────
section('2. WEEKLY — weekdays array')

{
  const todayDow = TODAY.getDay()
  const tomorrowDow = addDays(TODAY, 1).getDay()

  // Fire today
  const cfgToday = { weekdays: [todayDow] }
  const nextToday = getNextOccurrence('weekly', cfgToday, YESTERDAY)
  check(`weekdays=[${todayDow}] (today's DoW): next after yesterday = today`, format(nextToday, 'yyyy-MM-dd'), TODAY_STR)

  const { shouldGenerate } = shouldGenerateToday('weekly', cfgToday, null)
  check('shouldGenerateToday = true', String(shouldGenerate), 'true')

  // Multi-day
  const cfgMulti = { weekdays: [1, 3, 5] } // Mon, Wed, Fri
  const nextMulti = getNextOccurrence('weekly', cfgMulti, YESTERDAY)
  console.log(`  ℹ  Mon+Wed+Fri: next from yesterday = ${format(nextMulti, 'yyyy-MM-dd')} (${nextMulti.getDay()})`)

  // 5 occurrences Mon+Wed+Fri
  const dates = getNextOccurrences('weekly', cfgMulti, TODAY, 6)
  console.log('    Next 6 (Mon/Wed/Fri):', dates.join(', '))
  const allValid = dates.every(d => [1,3,5].includes(new Date(d + 'T00:00:00').getDay()))
  check('All 6 dates are Mon/Wed/Fri', String(allValid), 'true')
}

// ── 3. monthly_by_date ────────────────────────────────────────────────────────
section('3. MONTHLY_BY_DATE — same day every month')

{
  const todayDate = TODAY.getDate()
  const cfg = { day: todayDate }
  const next = getNextOccurrence('monthly_by_date', cfg, YESTERDAY)
  check(`day=${todayDate}: next after yesterday = today`, format(next, 'yyyy-MM-dd'), TODAY_STR)

  const { shouldGenerate } = shouldGenerateToday('monthly_by_date', cfg, null)
  check('shouldGenerateToday = true', String(shouldGenerate), 'true')

  const dates = getNextOccurrences('monthly_by_date', cfg, TODAY, 4)
  console.log(`    Next 4 (day=${todayDate})`, dates.join(', '))

  // Edge case: day=31 in months with <31 days
  const cfg31 = { day: 31 }
  const dates31 = getNextOccurrences('monthly_by_date', cfg31, new Date('2026-01-01'), 6)
  console.log('    day=31 next 6:', dates31.join(', '))
  // Feb should be 28th, etc.
}

// ── 4. monthly_by_weekday ─────────────────────────────────────────────────────
section('4. MONTHLY_BY_WEEKDAY — Nth weekday of month')

{
  // 3rd Tuesday of any month (week=3, weekday=2)
  const cfg = { weekday: 2, week: 3 }
  const dates = getNextOccurrences('monthly_by_weekday', cfg, TODAY, 4)
  console.log('    3rd Tuesday next 4:', dates.join(', '))
  const allTuesday = dates.every(d => new Date(d + 'T00:00:00').getDay() === 2)
  check('All 4 dates are Tuesdays', String(allTuesday), 'true')

  // 1st Monday
  const cfgMon = { weekday: 1, week: 1 }
  const datesM = getNextOccurrences('monthly_by_weekday', cfgMon, TODAY, 4)
  console.log('    1st Monday next 4:', datesM.join(', '))
  const allMonday = datesM.every(d => new Date(d + 'T00:00:00').getDay() === 1)
  check('All 4 dates are Mondays', String(allMonday), 'true')

  // shouldGenerateToday with backdated lastGeneratedAt (simulate past month)
  // Set last_generated_at to 40 days ago → next 3rd Tuesday should be ≤ today or in past
  const past40 = addDays(TODAY, -40)
  const { shouldGenerate: sg, forDate } = shouldGenerateToday('monthly_by_weekday', cfg, past40)
  console.log(`    shouldGenerate (lastAt=40 days ago): ${sg}, forDate=${forDate ? format(forDate, 'yyyy-MM-dd') : null}`)
}

// ── 5. monthly_last_day ───────────────────────────────────────────────────────
section('5. MONTHLY_LAST_DAY — last day of each month')

{
  const cfg = {}
  const dates = getNextOccurrences('monthly_last_day', cfg, TODAY, 6)
  console.log('    Next 6 last-days:', dates.join(', '))
  // All should be end-of-month
  function isLastDay(dStr) {
    const d = new Date(dStr + 'T00:00:00')
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    next.setDate(next.getDate() - 1)
    return next.getDate() === d.getDate()
  }
  const allLastDay = dates.every(isLastDay)
  check('All 6 are last days of month', String(allLastDay), 'true')

  // shouldGenerateToday with last_generated_at = end of last month - 1 day
  // → next = end of last month → should be ≤ today
  const beforeLastMonthEnd = addDays(LAST_MONTH_END, -1)
  const { shouldGenerate, forDate } = shouldGenerateToday('monthly_last_day', cfg, beforeLastMonthEnd)
  check('shouldGenerate when lastAt = day before prev month-end', String(shouldGenerate), 'true')
  console.log(`    forDate = ${forDate ? format(forDate, 'yyyy-MM-dd') : null} (should be end of ${format(LAST_MONTH_END, 'MMMM')})`)
}

// ── 6. quarterly ──────────────────────────────────────────────────────────────
section('6. QUARTERLY — Nth month in quarter + day')

{
  // Q2 2026: April(1), May(2), June(3)
  // month_in_quarter=2, day=today's date → fires in May = this month
  const todayDate = TODAY.getDate()
  const todayMonth = TODAY.getMonth() + 1 // 1-12
  const quarterStart = Math.floor((todayMonth - 1) / 3) * 3 + 1 // first month of current quarter
  const monthInQuarter = todayMonth - quarterStart + 1 // position within quarter (1-3)
  const cfg = { month_in_quarter: monthInQuarter, day: todayDate }
  const next = getNextOccurrence('quarterly', cfg, YESTERDAY)
  check(
    `Q${Math.ceil(todayMonth/3)} month_in_quarter=${monthInQuarter} day=${todayDate}: next after yesterday = today`,
    format(next, 'yyyy-MM-dd'), TODAY_STR
  )

  const { shouldGenerate } = shouldGenerateToday('quarterly', cfg, null)
  check('shouldGenerateToday = true', String(shouldGenerate), 'true')

  const dates = getNextOccurrences('quarterly', cfg, TODAY, 5)
  console.log('    Next 5:', dates.join(', '))

  // Edge: last day of month in quarter
  const cfgLast = { month_in_quarter: 3, day: 31 }
  const datesLast = getNextOccurrences('quarterly', cfgLast, TODAY, 4)
  console.log('    month_in_quarter=3 day=31 next 4:', datesLast.join(', '))
}

// ── 7. yearly ─────────────────────────────────────────────────────────────────
section('7. YEARLY — month + day')

{
  const todayDate  = TODAY.getDate()
  const todayMonth = TODAY.getMonth() + 1
  const cfg = { month: todayMonth, day: todayDate }
  const next = getNextOccurrence('yearly', cfg, YESTERDAY)
  check(`month=${todayMonth} day=${todayDate}: next after yesterday = today`, format(next, 'yyyy-MM-dd'), TODAY_STR)

  const { shouldGenerate } = shouldGenerateToday('yearly', cfg, null)
  check('shouldGenerateToday = true', String(shouldGenerate), 'true')

  const dates = getNextOccurrences('yearly', cfg, TODAY, 3)
  console.log('    Next 3 years:', dates.join(', '))

  // Edge: Feb 29 in non-leap years
  const cfgLeap = { month: 2, day: 29 }
  const datesLeap = getNextOccurrences('yearly', cfgLeap, new Date('2026-01-01'), 5)
  console.log('    Feb 29 next 5 (non-leap → Feb 28):', datesLeap.join(', '))
}

// ── 8. custom_dates ───────────────────────────────────────────────────────────
section('8. CUSTOM_DATES — manual list of dates')

{
  const cfg = {
    dates: [TODAY_STR, format(addDays(TODAY, 30), 'yyyy-MM-dd'), format(addDays(TODAY, 90), 'yyyy-MM-dd')]
  }
  const next = getNextOccurrence('custom_dates', cfg, YESTERDAY)
  check('next after yesterday = today', format(next, 'yyyy-MM-dd'), TODAY_STR)

  const { shouldGenerate } = shouldGenerateToday('custom_dates', cfg, null)
  check('shouldGenerateToday = true', String(shouldGenerate), 'true')

  const dates = getNextOccurrences('custom_dates', cfg, TODAY, 10)
  check('only 3 dates in list', String(dates.length), '3')
  console.log('    All dates:', dates.join(', '))

  // After last date → null
  const nextAfterLast = getNextOccurrence('custom_dates', cfg, addDays(TODAY, 91))
  check('after last date → null', String(nextAfterLast), 'null')
}

// ── 9. once ───────────────────────────────────────────────────────────────────
section('9. ONCE — single future date')

{
  const cfg = { date: TODAY_STR }
  const next = getNextOccurrence('once', cfg, YESTERDAY)
  check('next after yesterday = today', format(next, 'yyyy-MM-dd'), TODAY_STR)

  const { shouldGenerate } = shouldGenerateToday('once', cfg, null)
  check('shouldGenerateToday = true', String(shouldGenerate), 'true')

  // After the date → null (no more occurrences)
  const nextAfter = getNextOccurrence('once', cfg, TODAY)
  check('next after today = null (one-time done)', String(nextAfter), 'null')

  const { shouldGenerate: sg2 } = shouldGenerateToday('once', cfg, TODAY)
  check('shouldGenerateToday after lastGenAt=today = false', String(sg2), 'false')
}

// ── Idempotency edge cases ─────────────────────────────────────────────────────
section('10. IDEMPOTENCY — shouldGenerateToday khi đã chạy hôm nay')

{
  const tests = [
    ['daily',            { every_n_days: 1 }],
    ['weekly',           { weekdays: [TODAY.getDay()] }],
    ['monthly_by_date',  { day: TODAY.getDate() }],
    ['monthly_last_day', {}],
    ['once',             { date: TODAY_STR }],
  ]
  for (const [type, cfg] of tests) {
    const { shouldGenerate } = shouldGenerateToday(type, cfg, TODAY)
    check(`${type}: shouldGenerate after lastGenAt=today = false`, String(shouldGenerate), 'false')
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log(`  KẾT QUẢ: ${passed} passed, ${failed} failed`)
console.log('═'.repeat(60))
if (failed > 0) process.exit(1)

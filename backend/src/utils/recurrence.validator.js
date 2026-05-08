function validateRecurrenceConfig(type, config) {
  if (typeof config !== 'object' || config === null) {
    throw new Error('recurrenceConfig must be an object')
  }

  switch (type) {
    case 'daily':
      if (!Number.isInteger(config.every_n_days) || config.every_n_days < 1)
        throw new Error('daily requires every_n_days (integer >= 1)')
      break

    case 'weekly':
      if (!Array.isArray(config.weekdays) || config.weekdays.length === 0)
        throw new Error('weekly requires weekdays (non-empty array)')
      if (!config.weekdays.every(d => Number.isInteger(d) && d >= 0 && d <= 6))
        throw new Error('weekly: weekdays elements must be integers 0–6 (0=Sun)')
      break

    case 'monthly_by_date':
      if (!Number.isInteger(config.day) || config.day < 1 || config.day > 31)
        throw new Error('monthly_by_date requires day (integer 1–31)')
      break

    case 'monthly_by_weekday':
      if (!Number.isInteger(config.weekday) || config.weekday < 0 || config.weekday > 6)
        throw new Error('monthly_by_weekday requires weekday (integer 0–6, 0=Sun)')
      if (!Number.isInteger(config.week) || config.week < 1 || config.week > 5)
        throw new Error('monthly_by_weekday requires week (integer 1–5)')
      break

    case 'monthly_last_day':
      // No required fields
      break

    case 'quarterly':
      if (!Number.isInteger(config.month_in_quarter) || config.month_in_quarter < 1 || config.month_in_quarter > 3)
        throw new Error('quarterly requires month_in_quarter (integer 1–3)')
      if (!Number.isInteger(config.day) || config.day < 1 || config.day > 31)
        throw new Error('quarterly requires day (integer 1–31)')
      break

    case 'yearly':
      if (!Number.isInteger(config.month) || config.month < 1 || config.month > 12)
        throw new Error('yearly requires month (integer 1–12)')
      if (!Number.isInteger(config.day) || config.day < 1 || config.day > 31)
        throw new Error('yearly requires day (integer 1–31)')
      break

    case 'custom_dates':
      if (!Array.isArray(config.dates) || config.dates.length === 0)
        throw new Error('custom_dates requires dates (non-empty array of ISO dates)')
      if (!config.dates.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))
        throw new Error('custom_dates: all dates must be YYYY-MM-DD format')
      break

    case 'once':
      if (!config.date || !/^\d{4}-\d{2}-\d{2}$/.test(config.date))
        throw new Error('once requires date (YYYY-MM-DD format)')
      break

    default:
      throw new Error(`Unknown recurrence type: ${type}`)
  }
}

module.exports = { validateRecurrenceConfig }

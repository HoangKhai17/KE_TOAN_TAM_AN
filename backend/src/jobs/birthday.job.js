'use strict'
const { query } = require('../config/db')
const { createAndEmit } = require('../lib/notify')
const { sendMail } = require('../utils/mailer')
const { getTemplate, renderTemplate } = require('../utils/emailTemplates')
const logger = require('../config/logger')

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

// Chạy hằng ngày: ai có sinh nhật hôm nay → email chúc mừng người đó + thông báo in-app cho cả công ty.
// Người sinh 29/02: năm KHÔNG nhuận thì chúc vào 28/02.
async function runBirthday() {
  logger.info('[Birthday] Starting job')
  try {
    const today = new Date()
    const m = today.getMonth() + 1
    const d = today.getDate()
    const includeFeb29 = (m === 2 && d === 28 && !isLeapYear(today.getFullYear()))

    const { rows: people } = await query(
      `SELECT id, name, email
         FROM users
        WHERE status = 'active' AND dob IS NOT NULL
          AND (
            (EXTRACT(MONTH FROM dob) = $1 AND EXTRACT(DAY FROM dob) = $2)
            ${includeFeb29 ? "OR (EXTRACT(MONTH FROM dob) = 2 AND EXTRACT(DAY FROM dob) = 29)" : ''}
          )`,
      [m, d]
    )

    if (people.length === 0) {
      logger.info('[Birthday] No birthdays today')
      return { birthdays: 0 }
    }

    // Toàn bộ user active để gửi thông báo in-app (gồm cả người sinh nhật)
    const { rows: allActive } = await query(`SELECT id FROM users WHERE status = 'active'`)
    const tpl = await getTemplate('email_tpl_birthday')

    for (const person of people) {
      // 1) Email chúc mừng → chính người sinh nhật (không spam email cả công ty)
      if (person.email) {
        const html = renderTemplate(tpl, { user_name: person.name })
        await sendMail({
          to: person.email,
          subject: '🎂 Chúc mừng sinh nhật bạn — Kế Toán Tâm An',
          html,
          text: `Chúc mừng sinh nhật ${person.name}! Tập thể Kế Toán Tâm An chúc bạn một tuổi mới nhiều sức khỏe và thành công.`,
        })
      }

      // 2) Thông báo in-app → chính người đó + tất cả người còn lại
      for (const u of allActive) {
        const isSelf = u.id === person.id
        await createAndEmit(
          u.id,
          'birthday',
          isSelf ? '🎂 Chúc mừng sinh nhật bạn!' : `🎂 Hôm nay là sinh nhật của ${person.name}`,
          isSelf
            ? 'Tập thể Kế Toán Tâm An chúc bạn một tuổi mới thật nhiều niềm vui và thành công!'
            : `Hôm nay là sinh nhật của ${person.name}. Cùng gửi lời chúc mừng nhé! 🎉`,
          null,
        )
      }
    }

    logger.info(`[Birthday] Sent greetings for ${people.length} person(s)`)
    return { birthdays: people.length }
  } catch (err) {
    logger.error('[Birthday] Job failed', { error: err.message })
    throw err
  }
}

module.exports = { runBirthday }

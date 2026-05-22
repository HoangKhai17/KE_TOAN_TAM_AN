'use strict'
const { query } = require('../config/db')
const { createAndEmit } = require('../lib/notify')
const logger = require('../config/logger')

async function runClientDocOverdueJob() {
  logger.info('[ClientDocOverdue] Starting job')
  try {
    const { rows: overdue } = await query(
      `SELECT cdr.id, cdr.document_name, cdr.deadline_date,
              cdr.requested_by, cdr.reminded_email,
              c.name AS company_name
       FROM client_document_requests cdr
       JOIN companies c ON c.id = cdr.company_id
       WHERE cdr.status = 'pending'
         AND cdr.deadline_date IS NOT NULL
         AND cdr.deadline_date < CURRENT_DATE`
    )

    if (!overdue.length) {
      logger.info('[ClientDocOverdue] No overdue requests found')
      return { processed: 0 }
    }

    logger.info(`[ClientDocOverdue] Marking ${overdue.length} requests as overdue`)

    const ids = overdue.map(r => r.id)
    await query(
      `UPDATE client_document_requests
       SET status = 'overdue', updated_at = NOW()
       WHERE id = ANY($1::uuid[])`,
      [ids]
    )

    for (const row of overdue) {
      const dueStr = new Date(row.deadline_date).toLocaleDateString('vi-VN')

      await createAndEmit(
        row.requested_by,
        'client_doc_overdue',
        `Tài liệu quá hạn: "${row.document_name}"`,
        `Tài liệu "${row.document_name}" (${row.company_name}) đã quá hạn ${dueStr}.`,
        row.id,
      ).catch(() => {})
    }

    logger.info(`[ClientDocOverdue] Processed ${overdue.length} overdue client document requests`)
    return { processed: overdue.length }
  } catch (err) {
    logger.error('[ClientDocOverdue] Job failed', { error: err.message })
    throw err
  }
}

module.exports = { runClientDocOverdueJob }

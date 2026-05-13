'use strict'
const nodemailer = require('nodemailer')
const { query } = require('../config/db')
const env = require('../config/env')
const logger = require('../config/logger')

async function getSmtpConfig() {
  try {
    const { rows } = await query(
      `SELECT key, value FROM system_configs WHERE key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from')`
    )
    const cfg = {}
    rows.forEach((r) => { cfg[r.key] = r.value })
    return {
      host: cfg.smtp_host || env.email.host,
      port: parseInt(cfg.smtp_port || env.email.port, 10),
      user: cfg.smtp_user || env.email.user || '',
      pass: cfg.smtp_pass || env.email.pass || '',
      from: cfg.smtp_from || env.email.from,
    }
  } catch {
    return {
      host: env.email.host,
      port: env.email.port,
      user: env.email.user || '',
      pass: env.email.pass || '',
      from: env.email.from,
    }
  }
}

function buildTransport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    tls: { rejectUnauthorized: false },
  })
}

async function sendMail({ to, subject, html, text }) {
  const cfg = await getSmtpConfig()
  if (!cfg.user || !cfg.pass) {
    logger.warn('[Mailer] SMTP credentials not configured — skipping email', { to })
    return false
  }
  const transport = buildTransport(cfg)
  try {
    await transport.sendMail({ from: cfg.from, to, subject, html, text })
    logger.info(`[Mailer] Email sent to ${to}: ${subject}`)
    return true
  } catch (err) {
    logger.error(`[Mailer] Failed to send email to ${to}`, { error: err.message })
    return false
  }
}

async function testSmtp(cfg) {
  const transport = buildTransport(cfg)
  await transport.verify()
  const info = await transport.sendMail({
    from: cfg.from,
    to: cfg.user,
    subject: 'Kiểm tra kết nối SMTP — Kế Toán Tâm An',
    html: '<p>Email test thành công từ hệ thống <strong>Kế Toán Tâm An</strong>.</p>',
    text: 'Email test thành công từ hệ thống Kế Toán Tâm An.',
  })
  return info
}

module.exports = { sendMail, testSmtp, getSmtpConfig }

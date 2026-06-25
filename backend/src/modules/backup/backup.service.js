'use strict'
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const cron = require('node-cron')
const { query } = require('../../config/db')
const env = require('../../config/env')
const logger = require('../../config/logger')

const BACKUP_DIR = path.join('/app', 'backup')   // volume mount (./backup trên host)
const FILE_RE = /^ktta-\d{8}-\d{6}\.dump$/        // chống path traversal khi tải/xoá
const DEFAULTS = { enabled: true, time: '02:00', retention: 10 }

let backupTask = null   // node-cron task hiện tại (để reschedule)

// ── Config (system_configs) ──────────────────────────────────────────────────

async function upsertConfig(key, value, userId = null) {
  await query(
    `INSERT INTO system_configs (key, value, updated_by, updated_at)
          VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, String(value), userId]
  )
}

async function getConfig() {
  const { rows } = await query(
    `SELECT key, value FROM system_configs
      WHERE key IN ('backup_enabled','backup_time','backup_retention','backup_last_run_at','backup_last_status')`
  )
  const m = {}
  rows.forEach((r) => { m[r.key] = r.value })
  return {
    enabled:    m.backup_enabled != null ? m.backup_enabled === 'true' : DEFAULTS.enabled,
    time:       m.backup_time || DEFAULTS.time,
    retention:  m.backup_retention ? parseInt(m.backup_retention, 10) : DEFAULTS.retention,
    lastRunAt:  m.backup_last_run_at || null,
    lastStatus: m.backup_last_status || null,
  }
}

async function setConfig({ enabled, time, retention }, userId) {
  if (enabled !== undefined)   await upsertConfig('backup_enabled', enabled ? 'true' : 'false', userId)
  if (time !== undefined)      await upsertConfig('backup_time', time, userId)
  if (retention !== undefined) await upsertConfig('backup_retention', String(retention), userId)
  await scheduleBackupCron()   // áp dụng lịch mới ngay
  return getConfig()
}

// ── Tạo backup (pg_dump) ─────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function runPgDump(filePath) {
  return new Promise((resolve, reject) => {
    const u = new URL(env.db.url)
    // Mật khẩu truyền qua PGPASSWORD (không nằm trong argv → không lộ qua `ps`)
    const childEnv = { ...process.env, PGPASSWORD: decodeURIComponent(u.password || '') }
    const args = [
      '-Fc', '--no-owner', '--no-privileges',
      '-h', u.hostname, '-p', u.port || '5432',
      '-U', decodeURIComponent(u.username || ''),
      '-d', u.pathname.slice(1),
      '-f', filePath,
    ]
    execFile('pg_dump', args, { env: childEnv, timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).toString().slice(0, 500)))
      resolve()
    })
  })
}

async function createBackup() {
  ensureDir()
  const filename = `ktta-${stamp()}.dump`
  const filePath = path.join(BACKUP_DIR, filename)
  logger.info(`[Backup] Creating ${filename}`)
  try {
    await runPgDump(filePath)
    const { size } = fs.statSync(filePath)
    await prune()
    await upsertConfig('backup_last_run_at', new Date().toISOString())
    await upsertConfig('backup_last_status', 'success')
    logger.info(`[Backup] Done ${filename} (${(size / 1024).toFixed(0)} KB)`)
    return { filename, size }
  } catch (err) {
    // Dọn file lỗi dở dang
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch { /* ignore */ }
    await upsertConfig('backup_last_run_at', new Date().toISOString())
    await upsertConfig('backup_last_status', `failed: ${err.message}`.slice(0, 200))
    logger.error('[Backup] Failed', { error: err.message })
    throw err
  }
}

// ── Liệt kê / xoá / retention ────────────────────────────────────────────────

function listBackups() {
  ensureDir()
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => FILE_RE.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f))
      return { name: f, size: st.size, createdAt: st.mtime.toISOString() }
    })
    .sort((a, b) => b.name.localeCompare(a.name))   // mới nhất trước (tên có timestamp)
}

function resolveSafe(name) {
  if (!FILE_RE.test(name)) return null
  const p = path.join(BACKUP_DIR, name)
  if (path.dirname(p) !== BACKUP_DIR) return null   // chặn traversal
  return fs.existsSync(p) ? p : null
}

function deleteBackup(name) {
  const p = resolveSafe(name)
  if (!p) return false
  fs.unlinkSync(p)
  return true
}

async function prune() {
  const cfg = await getConfig()
  const keep = Math.max(1, cfg.retention || DEFAULTS.retention)
  const files = listBackups()
  const toDelete = files.slice(keep)   // đã sort mới→cũ; phần dư là cũ
  for (const f of toDelete) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); logger.info(`[Backup] Pruned old ${f.name}`) }
    catch (e) { logger.warn('[Backup] Prune failed', { file: f.name, error: e.message }) }
  }
  return toDelete.length
}

// ── Cron (đổi giờ được, timezone VN) ─────────────────────────────────────────

async function scheduleBackupCron() {
  if (backupTask) { backupTask.stop(); backupTask = null }
  const cfg = await getConfig()
  if (!cfg.enabled) {
    logger.info('[Backup] Auto-backup disabled')
    return
  }
  const [hh, mm] = (cfg.time || DEFAULTS.time).split(':').map((x) => parseInt(x, 10))
  const expr = `${mm || 0} ${hh || 0} * * *`
  backupTask = cron.schedule(expr, async () => {
    try { await createBackup() } catch (err) { logger.error('[Backup] Scheduled run failed', { error: err.message }) }
  }, { timezone: 'Asia/Ho_Chi_Minh' })
  logger.info(`[Backup] Auto-backup scheduled at ${cfg.time} VN (giữ ${cfg.retention} bản)`)
}

module.exports = {
  BACKUP_DIR,
  getConfig, setConfig,
  createBackup, listBackups, deleteBackup, resolveSafe,
  scheduleBackupCron,
}

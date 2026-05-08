const bcrypt = require('bcrypt')
const { query } = require('../../config/db')
const audit = require('../../lib/audit')

function toDto(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    phone: row.phone ?? null,
    jobTitle: row.job_title ?? null,
    avatarUrl: row.avatar_url ?? null,
    mustChangePw: row.must_change_pw,
    loginAttempts: row.login_attempts ?? undefined,
    lockedUntil: row.locked_until ?? null,
    lastLoginAt: row.last_login_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  }
}

async function listUsers({ page = 1, limit = 20, role, status, search } = {}) {
  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const filterParams = []

  if (role) {
    filterParams.push(role)
    conditions.push(`role = $${filterParams.length}`)
  }
  if (status) {
    filterParams.push(status)
    conditions.push(`status = $${filterParams.length}`)
  }
  if (search) {
    filterParams.push(`%${search}%`)
    conditions.push(`(name ILIKE $${filterParams.length} OR email ILIKE $${filterParams.length})`)
  }

  const where = conditions.join(' AND ')
  const countRes = await query(`SELECT COUNT(*) FROM users WHERE ${where}`, filterParams)
  const total = parseInt(countRes.rows[0].count, 10)

  const dataParams = [...filterParams, limit, offset]
  const { rows } = await query(
    `SELECT id, name, email, role, status, phone, job_title, avatar_url,
            must_change_pw, login_attempts, locked_until, last_login_at, created_at, updated_at
     FROM users WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
    dataParams
  )

  return {
    users: rows.map(toDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

async function getUserById(id) {
  const { rows } = await query(
    `SELECT id, name, email, role, status, phone, job_title, avatar_url,
            must_change_pw, login_attempts, locked_until, last_login_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [id]
  )
  if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 })
  return toDto(rows[0])
}

async function createUser(data, actorId, ipAddress, userAgent) {
  const { name, email, password, role = 'staff', phone, jobTitle } = data

  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
  if (existing.rows.length) {
    throw Object.assign(new Error('Email already in use'), { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, phone, job_title, must_change_pw)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING id, name, email, role, status, phone, job_title, avatar_url, must_change_pw, created_at`,
    [name, email.toLowerCase(), passwordHash, role, phone ?? null, jobTitle ?? null]
  )

  await audit.log({
    userId: actorId,
    action: 'user.created',
    targetType: 'user',
    targetId: rows[0].id,
    meta: { name, email: email.toLowerCase(), role },
    ipAddress,
    userAgent,
  })

  return toDto(rows[0])
}

async function updateUser(id, data, actorId, ipAddress, userAgent) {
  const fieldMap = { name: 'name', phone: 'phone', jobTitle: 'job_title', avatarUrl: 'avatar_url', role: 'role' }
  const updates = []
  const params = []

  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      params.push(data[key])
      updates.push(`${col} = $${params.length}`)
    }
  }

  if (!updates.length) throw Object.assign(new Error('No fields to update'), { status: 400 })

  params.push(id)
  const { rows } = await query(
    `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING id, name, email, role, status, phone, job_title, avatar_url, must_change_pw, updated_at`,
    params
  )
  if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 })

  await audit.log({
    userId: actorId,
    action: 'user.updated',
    targetType: 'user',
    targetId: id,
    meta: data,
    ipAddress,
    userAgent,
  })

  return toDto(rows[0])
}

async function updateStatus(id, status, actorId, ipAddress, userAgent) {
  const { rows } = await query(
    `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2
     RETURNING id, name, email, role, status, phone, job_title, avatar_url, must_change_pw, updated_at`,
    [status, id]
  )
  if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 })

  await audit.log({
    userId: actorId,
    action: 'user.status_changed',
    targetType: 'user',
    targetId: id,
    meta: { status },
    ipAddress,
    userAgent,
  })

  return toDto(rows[0])
}

async function deleteUser(id, actorId, ipAddress, userAgent) {
  if (id === actorId) {
    throw Object.assign(new Error('Cannot delete your own account'), { status: 400 })
  }
  const { rows } = await query(
    `DELETE FROM users WHERE id = $1 RETURNING id, name, email`,
    [id]
  )
  if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 })

  await audit.log({
    userId: actorId,
    action: 'user.deleted',
    targetType: 'user',
    targetId: id,
    meta: { name: rows[0].name, email: rows[0].email },
    ipAddress,
    userAgent,
  })
}

async function resetUserPassword(id, newPassword, actorId, ipAddress, userAgent) {
  const passwordHash = await bcrypt.hash(newPassword, 12)
  const { rows } = await query(
    `UPDATE users SET password_hash = $1, must_change_pw = TRUE, updated_at = NOW()
     WHERE id = $2
     RETURNING id, name, email, role, status, phone, job_title, avatar_url, must_change_pw, updated_at`,
    [passwordHash, id]
  )
  if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 })

  await audit.log({
    userId: actorId,
    action: 'user.password_reset',
    targetType: 'user',
    targetId: id,
    meta: { resetBy: actorId },
    ipAddress,
    userAgent,
  })

  return toDto(rows[0])
}

module.exports = { listUsers, getUserById, createUser, updateUser, updateStatus, deleteUser, resetUserPassword }

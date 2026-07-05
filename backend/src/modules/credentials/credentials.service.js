const { query } = require('../../config/db')
const audit     = require('../../lib/audit')
const { encrypt, decrypt } = require('../../utils/encrypt')

function toDto(row, includePassword = false) {
  let plain = ''
  try { plain = decrypt(row.encrypted_password, row.iv) } catch { plain = '' }
  return {
    id:         row.id,
    companyId:  row.company_id,
    systemName: row.system_name,
    systemUrl:  row.system_url ?? null,
    username:   row.username ?? '',
    // Cho biết có mật khẩu hay không (không lộ mật khẩu) để UI hiển thị chính xác
    hasPassword: plain.length > 0,
    password:   includePassword ? plain : '***',
    notes:      row.notes ?? null,
    isActive:   row.is_active,
    createdBy:  row.created_by,
    updatedBy:  row.updated_by ?? null,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  }
}

// Admin: toàn quyền. Staff: chỉ tài khoản hệ thống của công ty MÌNH phụ trách.
async function assertCompanyAccess(companyId, user) {
  const { rows: [c] } = await query('SELECT assigned_staff_id FROM companies WHERE id = $1', [companyId])
  if (!c) throw Object.assign(new Error('Company not found'), { status: 404 })
  if (user && user.role !== 'admin' && c.assigned_staff_id !== user.id) {
    throw Object.assign(new Error('Bạn không có quyền truy cập tài khoản hệ thống của công ty này'), { status: 403 })
  }
}

async function listCredentials(companyId, { isActive } = {}, user) {
  await assertCompanyAccess(companyId, user)

  const conditions = ['company_id = $1']
  const params = [companyId]
  if (isActive !== undefined) {
    params.push(isActive === 'true' || isActive === true)
    conditions.push(`is_active = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT * FROM company_credentials WHERE ${conditions.join(' AND ')} ORDER BY system_name`,
    params
  )
  return rows.map(r => toDto(r, false))
}

async function getCredential(companyId, id, user) {
  await assertCompanyAccess(companyId, user)
  const { rows: [row] } = await query(
    'SELECT * FROM company_credentials WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!row) throw Object.assign(new Error('Credential not found'), { status: 404 })
  return toDto(row, false)
}

async function createCredential(companyId, data, user) {
  await assertCompanyAccess(companyId, user)
  const actorId = user.id
  const { systemName, systemUrl, username, password, notes, isActive = true } = data
  const { ciphertext, iv } = encrypt(password ?? '')

  const { rows: [row] } = await query(
    `INSERT INTO company_credentials
       (company_id, system_name, system_url, username, encrypted_password, iv, notes, is_active, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
     RETURNING *`,
    [companyId, systemName, systemUrl ?? null, username ?? '', ciphertext, iv, notes ?? null, isActive, actorId]
  )
  return toDto(row, false)
}

async function updateCredential(companyId, id, data, user) {
  await assertCompanyAccess(companyId, user)
  const actorId = user.id
  const { rows: [row] } = await query(
    'SELECT * FROM company_credentials WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!row) throw Object.assign(new Error('Credential not found'), { status: 404 })

  const updates  = ['updated_by = $1', 'updated_at = NOW()']
  const params   = [actorId]

  if (data.systemName !== undefined) { params.push(data.systemName); updates.push(`system_name = $${params.length}`) }
  if (data.systemUrl  !== undefined) { params.push(data.systemUrl ?? null); updates.push(`system_url = $${params.length}`) }
  if (data.username   !== undefined) { params.push(data.username ?? ''); updates.push(`username = $${params.length}`) }
  if (data.notes      !== undefined) { params.push(data.notes ?? null); updates.push(`notes = $${params.length}`) }
  if (data.isActive   !== undefined) { params.push(data.isActive); updates.push(`is_active = $${params.length}`) }

  if (data.password !== undefined) {
    const { ciphertext, iv } = encrypt(data.password ?? '')
    params.push(ciphertext); updates.push(`encrypted_password = $${params.length}`)
    params.push(iv);         updates.push(`iv = $${params.length}`)
  }

  params.push(id)
  const { rows: [updated] } = await query(
    `UPDATE company_credentials SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  )
  return toDto(updated, false)
}

async function deleteCredential(companyId, id, user, ipAddress, userAgent) {
  await assertCompanyAccess(companyId, user)
  const actorId = user.id
  const { rows: [row] } = await query(
    'SELECT id, system_name FROM company_credentials WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!row) throw Object.assign(new Error('Credential not found'), { status: 404 })

  await query('DELETE FROM company_credentials WHERE id = $1', [id])
  await audit.log({
    userId: actorId, action: 'credential.deleted',
    targetType: 'company_credentials', targetId: id,
    meta: { systemName: row.system_name, companyId }, ipAddress, userAgent,
  })
}

async function revealCredential(companyId, id, user, ipAddress, userAgent) {
  await assertCompanyAccess(companyId, user)
  const actorId = user.id
  const { rows: [row] } = await query(
    'SELECT * FROM company_credentials WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!row) throw Object.assign(new Error('Credential not found'), { status: 404 })

  await audit.log({
    userId: actorId, action: 'credential.revealed',
    targetType: 'company_credentials', targetId: id,
    meta: { systemName: row.system_name, companyId }, ipAddress, userAgent,
  })

  return { password: decrypt(row.encrypted_password, row.iv) }
}

module.exports = {
  listCredentials, getCredential, createCredential,
  updateCredential, deleteCredential, revealCredential,
}

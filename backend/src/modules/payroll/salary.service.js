'use strict'
// HỒ SƠ LƯƠNG nhân viên theo mốc hiệu lực. Làm bảng lương chỉ tham chiếu mức hiệu
// lực đúng kỳ (generatePeriodRecords). Enum loại điều chỉnh lấy ĐỘNG qua lib/enums.
const { query } = require('../../config/db')
const enums = require('../../lib/enums')
const payrollSvc = require('./payroll.service')

async function assertEnum(typeKey, value, field) {
  if (value == null || value === '') return
  const vals = await enums.getValues(typeKey)
  if (!vals.includes(value)) throw Object.assign(new Error(`Giá trị "${field}" không hợp lệ: ${value}`), { status: 422 })
}

function num(v) { return v != null ? Number(v) : 0 }

function salaryToDto(r) {
  if (!r || !r.id) return null
  const allowanceItems = Array.isArray(r.allowance_items) ? r.allowance_items : []
  const allowances = allowanceItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const gross = num(r.base_salary) + allowances
  const netBeforeReward = gross - num(r.bhxh_employee) - num(r.bhyt_employee) - num(r.bhtn_employee) - num(r.pit_deduction) - num(r.other_deductions)
  return {
    id: r.id, userId: r.user_id, effectiveFrom: r.effective_from,
    baseSalary: num(r.base_salary), allowanceItems, allowances, gross, netBeforeReward,
    bhxhEmployee: num(r.bhxh_employee), bhytEmployee: num(r.bhyt_employee), bhtnEmployee: num(r.bhtn_employee),
    bhxhEmployer: num(r.bhxh_employer), bhytEmployer: num(r.bhyt_employer), bhtnEmployer: num(r.bhtn_employer),
    pitDeduction: num(r.pit_deduction), otherDeductions: num(r.other_deductions),
    changeType: r.change_type, reason: r.reason ?? null, note: r.note ?? null,
    createdBy: r.created_by ?? null, createdAt: r.created_at,
  }
}

// Mức lương hiệu lực của 1 NV tại 1 ngày (phiên bản mới nhất có effective_from <= ngày).
async function effectiveSalaryFor(userId, asOfDate) {
  const { rows: [r] } = await query(
    `SELECT * FROM employee_salaries WHERE user_id = $1 AND effective_from <= $2
     ORDER BY effective_from DESC, created_at DESC LIMIT 1`, [userId, asOfDate])
  return r ? salaryToDto(r) : null
}

// Danh sách NV active + mức lương hiệu lực HÔM NAY (null nếu chưa có hồ sơ).
async function listCurrentSalaries() {
  const { rows } = await query(
    `SELECT s.*, u.id AS user_id, u.name AS user_name, u.job_title
       FROM users u
       LEFT JOIN LATERAL (
         SELECT * FROM employee_salaries es
          WHERE es.user_id = u.id AND es.effective_from <= CURRENT_DATE
          ORDER BY es.effective_from DESC, es.created_at DESC LIMIT 1
       ) s ON TRUE
      WHERE u.status = 'active'
      ORDER BY u.name`)
  return rows.map((r) => ({ userId: r.user_id, userName: r.user_name, jobTitle: r.job_title ?? null, salary: r.id ? salaryToDto(r) : null }))
}

async function getSalaryHistory(userId) {
  const { rows } = await query(
    `SELECT * FROM employee_salaries WHERE user_id = $1 ORDER BY effective_from DESC, created_at DESC`, [userId])
  return rows.map(salaryToDto)
}

async function createSalary(userId, data, actorId) {
  await assertEnum('salary_change_type', data.changeType, 'Loại điều chỉnh')
  if (!data.effectiveFrom) { const e = new Error('Thiếu ngày hiệu lực'); e.status = 422; throw e }
  const { rows: [r] } = await query(
    `INSERT INTO employee_salaries
       (user_id, effective_from, base_salary, allowance_items,
        bhxh_employee, bhyt_employee, bhtn_employee, bhxh_employer, bhyt_employer, bhtn_employer,
        pit_deduction, other_deductions, change_type, reason, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [userId, data.effectiveFrom, data.baseSalary ?? 0, JSON.stringify(data.allowanceItems ?? []),
     data.bhxhEmployee ?? 0, data.bhytEmployee ?? 0, data.bhtnEmployee ?? 0,
     data.bhxhEmployer ?? 0, data.bhytEmployer ?? 0, data.bhtnEmployer ?? 0,
     data.pitDeduction ?? 0, data.otherDeductions ?? 0, data.changeType || 'initial',
     data.reason ?? null, data.note ?? null, actorId])
  return salaryToDto(r)
}

async function updateSalary(id, data) {
  if (data.changeType !== undefined) await assertEnum('salary_change_type', data.changeType, 'Loại điều chỉnh')
  const map = {
    effectiveFrom: 'effective_from', baseSalary: 'base_salary',
    bhxhEmployee: 'bhxh_employee', bhytEmployee: 'bhyt_employee', bhtnEmployee: 'bhtn_employee',
    bhxhEmployer: 'bhxh_employer', bhytEmployer: 'bhyt_employer', bhtnEmployer: 'bhtn_employer',
    pitDeduction: 'pit_deduction', otherDeductions: 'other_deductions',
    changeType: 'change_type', reason: 'reason', note: 'note',
  }
  const sets = []; const params = []
  for (const [k, col] of Object.entries(map)) {
    if (data[k] !== undefined) { params.push(data[k]); sets.push(`${col} = $${params.length}`) }
  }
  if (data.allowanceItems !== undefined) { params.push(JSON.stringify(data.allowanceItems)); sets.push(`allowance_items = $${params.length}`) }
  if (!sets.length) { const e = new Error('Không có gì để cập nhật'); e.status = 400; throw e }
  params.push(id)
  const { rows: [r] } = await query(
    `UPDATE employee_salaries SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params)
  if (!r) { const e = new Error('Không tìm thấy hồ sơ lương'); e.status = 404; throw e }
  return salaryToDto(r)
}

async function deleteSalary(id) {
  const { rows } = await query('DELETE FROM employee_salaries WHERE id = $1 RETURNING id', [id])
  if (!rows.length) { const e = new Error('Không tìm thấy hồ sơ lương'); e.status = 404; throw e }
}

// Sinh payroll_records cho kỳ (draft) từ mức lương HIỆU LỰC của kỳ. Giữ nguyên
// bonusItems (thưởng/phạt tính sau) + attendance_summary (do sync chấm công).
async function generatePeriodRecords(periodId, actorId) {
  const period = await payrollSvc.getPeriod(periodId)
  if (period.status !== 'draft') throw Object.assign(new Error('Chỉ sinh được khi kỳ đang Nháp.'), { status: 409 })
  const { rows: activeUsers } = await query(`SELECT id, name FROM users WHERE status = 'active' ORDER BY name`)
  const existing = await payrollSvc.listRecords(periodId)
  const bonusByUser = new Map(existing.map((r) => [r.userId, r.bonusItems ?? []]))

  let generated = 0; const missingSalary = []
  for (const u of activeUsers) {
    const sal = await effectiveSalaryFor(u.id, period.endDate)
    if (!sal) { missingSalary.push(u.name); continue }
    await payrollSvc.upsertRecord(periodId, {
      userId: u.id, baseSalary: sal.baseSalary, allowanceItems: sal.allowanceItems,
      bonusItems: bonusByUser.get(u.id) ?? [],
      bhxhEmployee: sal.bhxhEmployee, bhytEmployee: sal.bhytEmployee, bhtnEmployee: sal.bhtnEmployee,
      bhxhEmployer: sal.bhxhEmployer, bhytEmployer: sal.bhytEmployer, bhtnEmployer: sal.bhtnEmployer,
      pitDeduction: sal.pitDeduction, otherDeductions: sal.otherDeductions,
    }, actorId)
    generated++
  }
  return { generated, missingSalary, considered: activeUsers.length }
}

module.exports = {
  effectiveSalaryFor, listCurrentSalaries, getSalaryHistory,
  createSalary, updateSalary, deleteSalary, generatePeriodRecords,
}

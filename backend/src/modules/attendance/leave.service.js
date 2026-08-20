const { query } = require('../../config/db')
const { createAndEmit } = require('../../lib/notify')
const { calculateAttendanceRecord } = require('./attendance.service')
const { assertEndNotBeforeStart } = require('../../utils/dateRange')
const { applyStandardStyle } = require('../export/excel-renderer')

// ── DTO ───────────────────────────────────────────────────────────────────────

function toDto(r) {
  return {
    id:            r.id,
    userId:        r.user_id,
    userName:      r.user_name     ?? undefined,
    leaveType:     r.leave_type,
    startDate:     r.start_date,
    endDate:       r.end_date,
    dayPart:       r.day_part ?? 'full',
    hours:         r.hours != null ? parseFloat(r.hours) : null,
    totalDays:     parseFloat(r.total_days),
    reason:        r.reason,
    status:        r.status,
    approvedBy:    r.approved_by,
    approverName:  r.approver_name ?? undefined,
    approvedAt:    r.approved_at,
    approvalNote:  r.approval_note  ?? undefined,
    rejectionNote: r.rejection_note ?? undefined,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Đếm số ngày công thực sự bị tiêu tốn trong khoảng [startDate, endDate].
//
// Phải khớp ĐÚNG với quy tắc của calculateAttendanceRecord, nếu không total_days
// của đơn sẽ lệch với số ngày attendance_records thực sự chuyển thành nghỉ:
//   - Chủ nhật: luôn nghỉ
//   - Thứ 7:    nghỉ CHỈ KHI chưa cấu hình attendance.saturday_shift_id
//               (trước đây hardcode `dow !== 6` → công ty làm T7 bị đếm THIẾU ngày)
//   - Ngày lễ:  không tính (đã được trả lương qua status='holiday')
//   - work_schedules: override riêng của từng nhân viên thắng mọi quy tắc trên
//
// Nạp tất cả dữ liệu cần thiết trong 3 truy vấn song song rồi lặp trong JS —
// không truy vấn theo từng ngày.
async function countWorkingDays(startDate, endDate, userId = null) {
  const ymd = (d) => {
    const o = d instanceof Date ? d : new Date(d)
    return `${o.getUTCFullYear()}-${String(o.getUTCMonth() + 1).padStart(2, '0')}-${String(o.getUTCDate()).padStart(2, '0')}`
  }

  const [holidayRes, cfgRes, wsRes] = await Promise.all([
    query(
      'SELECT holiday_date FROM public_holidays WHERE holiday_date BETWEEN $1 AND $2',
      [startDate, endDate]
    ),
    query(
      `SELECT key, value FROM system_configs
       WHERE key IN ('attendance.default_shift_id', 'attendance.saturday_shift_id')`
    ),
    userId
      ? query(
          `SELECT work_date, is_day_off FROM work_schedules
           WHERE user_id = $1 AND work_date BETWEEN $2 AND $3`,
          [userId, startDate, endDate]
        )
      : Promise.resolve({ rows: [] }),
  ])

  const holidays = new Set(holidayRes.rows.map((r) => ymd(r.holiday_date)))
  const cfg = Object.fromEntries(cfgRes.rows.map((r) => [r.key, r.value ?? '']))
  const saturdayIsWorkday = Boolean(cfg['attendance.saturday_shift_id'])
  const overrides = new Map(wsRes.rows.map((r) => [ymd(r.work_date), r.is_day_off]))

  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)

  let count = 0
  while (cur <= end) {
    const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    const dow = cur.getDay() // 0=CN, 6=T7

    let isWorkday
    if (overrides.has(dateStr)) {
      isWorkday = !overrides.get(dateStr)          // override của NV thắng
    } else if (dow === 0) {
      isWorkday = false                            // Chủ nhật
    } else if (dow === 6) {
      isWorkday = saturdayIsWorkday                // Thứ 7 theo cấu hình
    } else {
      isWorkday = true
    }

    if (isWorkday && !holidays.has(dateStr)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// Chặn đơn nghỉ chồng ngày với đơn đang chờ duyệt / đã duyệt của cùng nhân viên.
// Lý do: calculateAttendanceRecord chỉ lấy MỘT đơn cho mỗi ngày (ORDER BY created_at
// LIMIT 1) → hai đơn chồng nhau thì đơn sau bị bỏ qua âm thầm, và quỹ phép (GĐ2 nhóm C)
// sẽ bị trừ hai lần cho cùng một ngày.
async function assertNoOverlappingLeave(userId, startDate, endDate, dayPart = 'full') {
  const { rows } = await query(
    `SELECT l.id, l.leave_type, l.start_date, l.end_date, l.status, l.day_part
     FROM leave_requests l
     WHERE l.user_id = $1
       AND l.status IN ('pending', 'approved')
       AND l.start_date <= $3 AND l.end_date >= $2
     ORDER BY l.start_date`,
    [userId, startDate, endDate]
  )

  // Hai đơn nửa ngày KHÁC BUỔI trên cùng một ngày là hợp lệ (sáng phép năm +
  // chiều nghỉ bù). Mọi tổ hợp còn lại đều chồng lấn.
  const conflict = rows.find((c) => {
    if (dayPart === 'morning'   && c.day_part === 'afternoon') return false
    if (dayPart === 'afternoon' && c.day_part === 'morning')   return false
    return true
  })

  if (conflict) {
    const label = conflict.status === 'approved' ? 'đã duyệt' : 'đang chờ duyệt'
    throw Object.assign(
      new Error(
        `Khoảng ngày này trùng với một đơn nghỉ ${label} (${conflict.leave_type}: ` +
        `${toDateStr(conflict.start_date)} → ${toDateStr(conflict.end_date)}). ` +
        `Vui lòng huỷ hoặc thu hồi đơn cũ trước.`
      ),
      { status: 409 }
    )
  }
}

// Chính sách của một loại nghỉ. Loại chưa cấu hình → mặc định nghỉ có lương nguyên ngày.
async function getLeavePolicy(leaveType) {
  const { rows } = await query('SELECT * FROM leave_policies WHERE leave_type = $1', [leaveType])
  return rows[0] ?? {
    leave_type: leaveType, label: leaveType, is_paid: true, paid_rate: 1,
    allow_half_day: true, deduct_balance: false, counts_as_work: false,
    maps_to_status: 'on_leave',
  }
}

// Hệ số ngày công của một đơn theo thời lượng nghỉ.
// 'hours' quy đổi theo giờ chuẩn của ca — lấy từ ca mặc định hệ thống.
async function dayPartFactor(dayPart, hours) {
  if (dayPart === 'morning' || dayPart === 'afternoon') return 0.5
  if (dayPart === 'hours') {
    const { rows } = await query(
      `SELECT s.required_hours, s.start_time, s.end_time, s.break_minutes
       FROM system_configs c
       JOIN shifts s ON s.id::text = c.value
       WHERE c.key = 'attendance.default_shift_id'`
    )
    const s = rows[0]
    let req = s?.required_hours != null ? parseFloat(s.required_hours) : null
    if (!req && s?.start_time && s?.end_time) {
      const [sh, sm] = s.start_time.split(':').map(Number)
      const [eh, em] = s.end_time.split(':').map(Number)
      req = (eh * 60 + em - sh * 60 - sm) / 60 - (s.break_minutes ?? 60) / 60
    }
    return Math.min(1, (parseFloat(hours) || 0) / (req || 8))
  }
  return 1
}

async function notifyAdmins(title, body) {
  const { rows } = await query(
    `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
  )
  await Promise.all(rows.map((r) => createAndEmit(r.id, 'task_assigned', title, body, null)))
}

function toDateStr(d) {
  if (!d) return null
  const obj = d instanceof Date ? d : new Date(d)
  return `${obj.getUTCFullYear()}-${String(obj.getUTCMonth() + 1).padStart(2, '0')}-${String(obj.getUTCDate()).padStart(2, '0')}`
}

// Tính lại attendance_records cho mọi ngày trong [startDate, endDate].
// Dùng chung cho duyệt đơn (gắn ngày nghỉ) và thu hồi đơn (trả ngày về thực tế).
// Mỗi ngày độc lập nên chạy song song; lỗi một ngày không chặn các ngày còn lại.
async function recalcRange(userId, startDate, endDate) {
  const [sy, sm, sd] = toDateStr(startDate).split('-').map(Number)
  const [ey, em, ed] = toDateStr(endDate).split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  const dates = []
  while (cur <= end) {
    dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
    cur.setDate(cur.getDate() + 1)
  }
  // KHÔNG nuốt lỗi im lặng: trước đây `.catch(() => {})` khiến một lần tính lại
  // thất bại (vd vi phạm ràng buộc trần công) trông như đã thành công — đơn nghỉ
  // được duyệt nhưng bảng chấm công không đổi, và không ai biết.
  const results = await Promise.all(
    dates.map((d) =>
      calculateAttendanceRecord(userId, d)
        .then(() => null)
        .catch((err) => {
          console.error(`[recalcRange] Lỗi tính lại chấm công ${userId} ${d}: ${err.message}`)
          return d
        })
    )
  )
  const failed = results.filter(Boolean)
  if (failed.length) {
    throw Object.assign(
      new Error(`Không tính lại được chấm công cho ${failed.length}/${dates.length} ngày (${failed.join(', ')}). Vui lòng kiểm tra lại.`),
      { status: 500 }
    )
  }
  return dates.length
}

// ── Service functions ─────────────────────────────────────────────────────────

async function listLeaveRequests({ userId, status, leaveType, from, to, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const params = []

  const userIds  = Array.isArray(userId) ? userId : (userId ? [userId] : [])
  const statuses = Array.isArray(status) ? status : (status ? [status] : [])

  if (userIds.length > 0) {
    const start = params.length + 1
    userIds.forEach((id) => params.push(id))
    conditions.push(`l.user_id IN (${userIds.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (statuses.length > 0) {
    const start = params.length + 1
    statuses.forEach((s) => params.push(s))
    conditions.push(`l.status::text IN (${statuses.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (leaveType) { params.push(leaveType); conditions.push(`l.leave_type = $${params.length}`) }
  // Lọc theo KỲ = GIAO NHAU (overlap): đơn hiện ở tháng nào mà khoảng [start, end] có DÍNH vào
  // tháng đó → đơn vắt qua 2 tháng (vd 30/08–01/09) hiện ở CẢ hai. (start_date <= to AND end_date >= from)
  if (from && to) {
    params.push(from); const pf = params.length
    params.push(to);   const pt = params.length
    conditions.push(`l.start_date <= $${pt} AND l.end_date >= $${pf}`)
  } else if (from) {
    params.push(from); conditions.push(`l.end_date >= $${params.length}`)
  } else if (to) {
    params.push(to);   conditions.push(`l.start_date <= $${params.length}`)
  }

  const where = conditions.join(' AND ')

  // Single query with window COUNT — eliminates the separate COUNT(*) round-trip
  const { rows } = await query(
    `SELECT l.*, u.name AS user_name, a.name AS approver_name, COUNT(*) OVER() AS _total
     FROM leave_requests l
     JOIN  users u ON l.user_id    = u.id
     LEFT JOIN users a ON l.approved_by = a.id
     WHERE ${where}
     ORDER BY l.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )
  const total = parseInt(rows[0]?._total ?? 0, 10)
  return { requests: rows.map(toDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

async function createLeaveRequest({ userId, leaveType, startDate, endDate, reason, dayPart = 'full', hours = null }) {
  assertEndNotBeforeStart(startDate, endDate, 'Ngày kết thúc nghỉ không được nhỏ hơn ngày bắt đầu')

  const VALID_PARTS = ['full', 'morning', 'afternoon', 'hours']
  if (!VALID_PARTS.includes(dayPart)) {
    throw Object.assign(new Error('Thời lượng nghỉ không hợp lệ'), { status: 400 })
  }

  const policy = await getLeavePolicy(leaveType)
  if (dayPart !== 'full') {
    if (!policy.allow_half_day) {
      throw Object.assign(
        new Error(`"${policy.label}" không hỗ trợ nghỉ nửa ngày / theo giờ`),
        { status: 422 }
      )
    }
    if (String(startDate) !== String(endDate)) {
      throw Object.assign(
        new Error('Nghỉ nửa ngày hoặc theo giờ chỉ áp dụng cho đơn trong MỘT ngày'),
        { status: 422 }
      )
    }
    if (dayPart === 'hours' && !(parseFloat(hours) > 0)) {
      throw Object.assign(new Error('Vui lòng nhập số giờ nghỉ'), { status: 422 })
    }
  }

  await assertNoOverlappingLeave(userId, startDate, endDate, dayPart)

  const workingDays = await countWorkingDays(startDate, endDate, userId)
  if (workingDays === 0) {
    throw Object.assign(
      new Error('Khoảng ngày đã chọn không có ngày làm việc nào (chỉ gồm ngày nghỉ tuần hoặc ngày lễ)'),
      { status: 422 }
    )
  }

  // Đơn nửa ngày luôn gói trong 1 ngày (đã chặn ở trên) nên nhân hệ số là đủ.
  const factor    = await dayPartFactor(dayPart, hours)
  const totalDays = Math.round(workingDays * factor * 1000) / 1000

  const { rows } = await query(
    `INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, total_days, reason, day_part, hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [userId, leaveType, startDate, endDate, totalDays, reason ?? null,
     dayPart, dayPart === 'hours' ? parseFloat(hours) : null]
  )

  const userRes  = await query('SELECT name FROM users WHERE id = $1', [userId])
  const userName = userRes.rows[0]?.name ?? 'Nhân viên'
  await notifyAdmins(
    `Đơn nghỉ phép mới — ${userName}`,
    `${userName} đăng ký nghỉ (${leaveType}) từ ${startDate} đến ${endDate} (${totalDays} ngày công)`
  )

  return toDto(rows[0])
}

// Danh sách chính sách nghỉ đang hoạt động — nguồn cho dropdown ở giao diện,
// thay cho object LEAVE_TYPE hardcode ở 2 file frontend.
async function listLeavePolicies() {
  const { rows } = await query(
    `SELECT leave_type, label, is_paid, paid_rate, allow_half_day,
            deduct_balance, counts_as_work, maps_to_status, sort_order
     FROM leave_policies WHERE is_active ORDER BY sort_order, label`
  )
  return rows.map((r) => ({
    leaveType:     r.leave_type,
    label:         r.label,
    isPaid:        r.is_paid,
    paidRate:      parseFloat(r.paid_rate),
    allowHalfDay:  r.allow_half_day,
    deductBalance: r.deduct_balance,
    countsAsWork:  r.counts_as_work,
    mapsToStatus:  r.maps_to_status,
  }))
}

async function getLeaveBalance({ userId, year } = {}) {
  const yr = parseInt(year, 10) || new Date().getFullYear()
  const params = [yr]
  let cond = ''
  if (userId) { params.push(userId); cond = `AND user_id = $${params.length}` }
  const { rows } = await query(
    `SELECT user_id, user_name, year, entitled_days, used_days, remaining_days
     FROM v_leave_balance WHERE year = $1 ${cond} ORDER BY user_name`,
    params
  )
  return rows.map((r) => ({
    userId:        r.user_id,
    userName:      r.user_name,
    year:          r.year,
    entitledDays:  parseFloat(r.entitled_days),
    usedDays:      parseFloat(r.used_days),
    remainingDays: parseFloat(r.remaining_days),
  }))
}

async function approveLeaveRequest(id, approvedBy, approvalNote, { force = false } = {}) {
  // Chặn duyệt vượt quỹ phép — chỉ với loại nghỉ có deduct_balance (mặc định: phép năm).
  // Admin có thể ép duyệt bằng force=true, khi đó ghi rõ vào ghi chú để còn dấu vết.
  const { rows: pre } = await query(
    `SELECT lr.user_id, lr.total_days, lr.leave_type, lr.start_date,
            p.deduct_balance, p.label
     FROM leave_requests lr
     LEFT JOIN leave_policies p ON p.leave_type = lr.leave_type
     WHERE lr.id = $1 AND lr.status = 'pending'`,
    [id]
  )
  if (pre[0]?.deduct_balance) {
    const yr = new Date(pre[0].start_date).getUTCFullYear()
    const [bal] = await getLeaveBalance({ userId: pre[0].user_id, year: yr })
    const need = parseFloat(pre[0].total_days)
    if (bal && need > bal.remainingDays) {
      if (!force) {
        throw Object.assign(
          new Error(
            `Vượt quỹ ${pre[0].label ?? pre[0].leave_type} năm ${yr}: ` +
            `còn ${bal.remainingDays} ngày, đơn xin ${need} ngày.`
          ),
          { status: 409, code: 'LEAVE_BALANCE_EXCEEDED' }
        )
      }
      approvalNote = `[Duyệt vượt quỹ: còn ${bal.remainingDays}, xin ${need}] ${approvalNote ?? ''}`.trim()
    }
  }

  const { rows } = await query(
    `UPDATE leave_requests
     SET status = 'approved', approved_by = $1, approved_at = NOW(),
         approval_note = $3, updated_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [approvedBy, id, approvalNote ?? null]
  )
  if (!rows[0]) throw Object.assign(new Error('Leave request not found or already reviewed'), { status: 404 })
  const leave = rows[0]

  // Recalculate attendance for every day in the leave period
  await recalcRange(leave.user_id, leave.start_date, leave.end_date)

  await createAndEmit(
    leave.user_id, 'task_status_changed',
    'Đơn nghỉ phép được duyệt',
    `Đơn nghỉ ${leave.leave_type} từ ${toDateStr(leave.start_date)} đến ${toDateStr(leave.end_date)} đã được duyệt.`,
    null
  )

  return toDto(rows[0])
}

async function rejectLeaveRequest(id, { rejectionNote, reviewedBy }) {
  const { rows } = await query(
    `UPDATE leave_requests
     SET status = 'rejected', approved_by = $1, approved_at = NOW(),
         rejection_note = $2, updated_at = NOW()
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [reviewedBy, rejectionNote ?? null, id]
  )
  if (!rows[0]) throw Object.assign(new Error('Leave request not found or already reviewed'), { status: 404 })

  await createAndEmit(
    rows[0].user_id, 'task_status_changed',
    'Đơn nghỉ phép bị từ chối',
    `Đơn nghỉ ${rows[0].leave_type} từ ${toDateStr(rows[0].start_date)} đến ${toDateStr(rows[0].end_date)} bị từ chối. Lý do: ${rejectionNote ?? 'Không rõ'}`,
    null
  )

  return toDto(rows[0])
}

// Thu hồi một đơn ĐÃ DUYỆT (admin) — dành cho ca duyệt nhầm.
// reject/cancel chỉ áp dụng cho đơn 'pending' nên trước đây đơn đã duyệt là ngõ cụt.
// Dùng lại giá trị enum 'cancelled' sẵn có (không cần migration), phân biệt với
// "NV tự huỷ" bằng tiền tố [Thu hồi] trong rejection_note.
async function revokeLeaveRequest(id, { reason, actorId }) {
  if (!reason || !String(reason).trim()) {
    throw Object.assign(new Error('Vui lòng nhập lý do thu hồi đơn'), { status: 422 })
  }

  const { rows } = await query(
    `UPDATE leave_requests
     SET status = 'cancelled', approved_by = $1, approved_at = NOW(),
         rejection_note = $2, updated_at = NOW()
     WHERE id = $3 AND status = 'approved'
     RETURNING *`,
    [actorId, `[Thu hồi] ${String(reason).trim()}`, id]
  )
  if (!rows[0]) {
    throw Object.assign(new Error('Không tìm thấy đơn đã duyệt để thu hồi'), { status: 404 })
  }
  const leave = rows[0]

  // Trả các ngày trong khoảng đơn về trạng thái thực tế theo log chấm công
  await recalcRange(leave.user_id, leave.start_date, leave.end_date)

  await createAndEmit(
    leave.user_id, 'task_status_changed',
    'Đơn nghỉ phép bị thu hồi',
    `Đơn nghỉ ${leave.leave_type} từ ${toDateStr(leave.start_date)} đến ${toDateStr(leave.end_date)} đã bị thu hồi. Lý do: ${String(reason).trim()}`,
    null
  )

  return toDto(leave)
}

async function cancelLeaveRequest(id, userId) {
  const { rows } = await query(
    `UPDATE leave_requests SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [id, userId]
  )
  if (!rows[0]) throw Object.assign(new Error('Leave request not found or cannot be cancelled'), { status: 404 })
  return toDto(rows[0])
}

// Xóa HẲN đơn nghỉ — chỉ khi CHƯA duyệt (status='pending'); chủ đơn hoặc admin.
async function deleteLeaveRequest(id, user) {
  const { rows } = await query('SELECT id, user_id, status FROM leave_requests WHERE id = $1', [id])
  const r = rows[0]
  if (!r) throw Object.assign(new Error('Không tìm thấy đơn nghỉ phép'), { status: 404 })
  if (r.status !== 'pending') throw Object.assign(new Error('Chỉ xóa được đơn CHƯA duyệt'), { status: 400 })
  const isAdmin = user && user.role === 'admin'
  if (!isAdmin && r.user_id !== user.id) {
    throw Object.assign(new Error('Bạn chỉ được xóa đơn nghỉ của mình'), { status: 403 })
  }
  await query('DELETE FROM leave_requests WHERE id = $1', [id])
}

async function exportLeaveRecords({ from, to, status, userId, fields, res }) {
  const ExcelJS = require('exceljs')

  const userIds  = Array.isArray(userId) ? userId : (userId ? [userId] : [])
  const statuses = Array.isArray(status) ? status : (status ? [status] : [])

  const conditions = ['1=1']
  const params = []
  if (userIds.length > 0) {
    const start = params.length + 1
    userIds.forEach((id) => params.push(id))
    conditions.push(`l.user_id IN (${userIds.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (statuses.length > 0) {
    const start = params.length + 1
    statuses.forEach((s) => params.push(s))
    conditions.push(`l.status::text IN (${statuses.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (from)   { params.push(from);   conditions.push(`l.start_date >= $${params.length}`) }
  if (to)     { params.push(to);     conditions.push(`l.end_date   <= $${params.length}`) }
  const where = conditions.join(' AND ')

  const { rows } = await query(
    `SELECT l.*, u.name AS user_name, a.name AS approver_name
     FROM leave_requests l
     JOIN  users u ON l.user_id    = u.id
     LEFT JOIN users a ON l.approved_by = a.id
     WHERE ${where}
     ORDER BY u.name, l.start_date`,
    params
  )

  const STATUS_VI    = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', cancelled: 'Đã huỷ' }
  const LEAVE_TYPE_VI = {
    annual: 'Nghỉ phép năm', sick: 'Nghỉ ốm', compensatory: 'Nghỉ bù',
    unpaid: 'Nghỉ không lương', business_trip: 'Công tác', wfh: 'Làm từ xa',
  }

  const ALL_COLS = [
    { key: 'userName',      header: 'Họ tên',          width: 24, required: true },
    { key: 'leaveType',     header: 'Loại nghỉ',       width: 18, required: true },
    { key: 'startDate',     header: 'Ngày bắt đầu',    width: 14 },
    { key: 'endDate',       header: 'Ngày kết thúc',   width: 14 },
    { key: 'totalDays',     header: 'Số ngày',         width: 8  },
    { key: 'statusLabel',   header: 'Trạng thái',      width: 14 },
    { key: 'reason',        header: 'Lý do',           width: 28 },
    { key: 'approvalNote',  header: 'Ghi chú duyệt',   width: 24 },
    { key: 'rejectionNote', header: 'Lý do từ chối',   width: 24 },
    { key: 'approverName',  header: 'Người duyệt',     width: 20 },
  ]

  const fieldSet     = new Set(fields)
  const selectedCols = ALL_COLS.filter((c) => c.required || fieldSet.has(c.key))

  const fmtDate = (d) => {
    if (!d) return '—'
    const [y, m, dy] = String(d).slice(0, 10).split('-')
    return `${dy}/${m}/${y}`
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'KeToanTamAn'
  const sheet = workbook.addWorksheet('Nghỉ phép')

  sheet.columns = [
    { key: 'stt', header: 'STT', width: 5 },
    ...selectedCols.map((c) => ({ key: c.key, header: c.header, width: c.width })),
  ]

  const headerRow = sheet.getRow(1)
  headerRow.eachCell((cell) => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FF4B8EC8' } } }
  })
  headerRow.height = 22
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  // Group by employee
  const userGroups = new Map()
  rows.forEach((r) => {
    const name = r.user_name
    if (!userGroups.has(name)) userGroups.set(name, [])
    userGroups.get(name).push(r)
  })

  let sttIdx = 1
  let rowNum  = 2

  userGroups.forEach((userRows, userName) => {
    userRows.forEach((r) => {
      const rowData = { stt: sttIdx++ }
      selectedCols.forEach((c) => {
        switch (c.key) {
          case 'userName':      rowData[c.key] = r.user_name;                                    break
          case 'leaveType':     rowData[c.key] = LEAVE_TYPE_VI[r.leave_type] ?? r.leave_type;   break
          case 'startDate':     rowData[c.key] = fmtDate(r.start_date);                          break
          case 'endDate':       rowData[c.key] = fmtDate(r.end_date);                            break
          case 'totalDays':     rowData[c.key] = r.total_days != null ? parseFloat(r.total_days) : 0; break
          case 'statusLabel':   rowData[c.key] = STATUS_VI[r.status]   ?? r.status;             break
          case 'reason':        rowData[c.key] = r.reason               ?? '—';                 break
          case 'approvalNote':  rowData[c.key] = r.approval_note        ?? '—';                 break
          case 'rejectionNote': rowData[c.key] = r.rejection_note       ?? '—';                 break
          case 'approverName':  rowData[c.key] = r.approver_name        ?? '—';                 break
        }
      })
      const addedRow = sheet.addRow(rowData)
      const fgColor  = rowNum % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF'
      addedRow.eachCell((cell) => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } }
        cell.alignment = { vertical: 'middle' }
      })
      rowNum++
    })

    // Per-employee summary row — total approved leave days
    const approvedDays = userRows
      .filter((r) => r.status === 'approved')
      .reduce((s, r) => s + (r.total_days != null ? parseFloat(r.total_days) : 0), 0)

    const sumData = { stt: '' }
    selectedCols.forEach((c) => {
      if      (c.key === 'userName')  sumData[c.key] = `∑ Tổng — ${userName}`
      else if (c.key === 'totalDays') sumData[c.key] = parseFloat(approvedDays.toFixed(2))
      else                            sumData[c.key] = ''
    })

    const sumRow = sheet.addRow(sumData)
    sumRow.font = { bold: true }
    sumRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDE0F7' } }
    sumRow.eachCell((cell) => {
      cell.border    = { top: { style: 'thin', color: { argb: 'FF4B8EC8' } } }
      cell.alignment = { vertical: 'middle' }
    })
    rowNum++
  })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="leave_export.xlsx"')
  workbook.worksheets.forEach((ws) => applyStandardStyle(ws, { headerRows: 1 }))
  await workbook.xlsx.write(res)
  res.end()
}

module.exports = {
  listLeaveRequests, createLeaveRequest, approveLeaveRequest, rejectLeaveRequest,
  revokeLeaveRequest, cancelLeaveRequest, deleteLeaveRequest, exportLeaveRecords,
  listLeavePolicies, getLeaveBalance,
  // Export để script bảo trì / kiểm thử tính lại total_days của đơn cũ
  countWorkingDays,
}

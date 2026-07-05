// ── Company aggregate export (server-side) ─────────────────────────────────────
//
// Gom toàn bộ dữ liệu của nhiều công ty bằng vài câu SQL IN-list (mỗi section 1
// query cho TẤT CẢ công ty — không phụ thuộc số lượng công ty), dựng workbook
// Excel bằng exceljs, trả về buffer. Thay cho cách client-side bắn N×M request
// (gây 429 Too Many Requests).
//
// Hai cấu trúc:
//   • 'aggregate'   — 1 workbook, mỗi nội dung 1 sheet, mỗi dòng 1 bản ghi (kèm cột Công ty/MST).
//   • 'per_company' — mỗi công ty 1 workbook, nén thành .zip (archiver).

const ExcelJS  = require('exceljs')
const archiver = require('archiver')
const { query } = require('../../config/db')
const { decrypt } = require('../../utils/encrypt')

// ── Fixed sections ─────────────────────────────────────────────────────────────
const SECTION_LABELS = {
  overview:           'Tổng quan',
  tasks:              'Công việc',
  'client-requests':  'Yêu cầu KH',
  schedules:          'Lịch định kỳ',
  documents:          'Tài liệu',
  notes:              'Ghi chú',
  credentials:        'Tài khoản hệ thống',
}
const FIXED_SECTION_KEYS = Object.keys(SECTION_LABELS)

// ── Label fallbacks ─────────────────────────────────────────────────────────────
const COMPANY_STATUS_VI = { active: 'Hoạt động', inactive: 'Tạm dừng', terminated: 'Đã kết thúc' }
const BUSINESS_TYPE_VI  = { TNHH: 'Công ty TNHH', CP: 'Công ty Cổ phần', HKD: 'Hộ kinh doanh', DN_TU_NHAN: 'Doanh nghiệp tư nhân', KHAC: 'Khác' }
const TASK_STATUS_VI    = { pending: 'Chờ xử lý', in_progress: 'Đang thực hiện', on_hold: 'Tạm hoãn', pending_review: 'Chờ duyệt', needs_revision: 'Cần xem lại', completed: 'Hoàn thành' }
const TASK_PRIORITY_VI  = { urgent: 'Khẩn cấp', high: 'Cao', medium: 'Trung bình', low: 'Thấp' }
const TASK_SOURCE_VI    = { manual: 'Thủ công', auto: 'Tự động' }
const CDR_STATUS_VI     = { pending: 'Chờ nộp', overdue: 'Quá hạn', received: 'Đã nhận', not_required: 'Không yêu cầu', dismissed: 'Đã bỏ qua', submitted: 'Đã gửi' }
const RECURRENCE_VI     = { monthly: 'Hàng tháng', quarterly: 'Hàng quý', yearly: 'Hàng năm', weekly: 'Hàng tuần', custom: 'Tuỳ chỉnh' }

// ── Formatting helpers ──────────────────────────────────────────────────────────
function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(v) {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function stripHtml(html) {
  if (!html) return ''
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}
function safe(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return ''
  return v
}
function customFieldsText(fields) {
  if (!Array.isArray(fields)) return ''
  return fields.filter((f) => f && String(f.name || '').trim())
    .map((f) => `${f.name}: ${f.value ?? ''}`).join('\n')
}

// ── Computed engine (mirror of frontend CustomTableTab) ─────────────────────────
function todayISO() { return new Date().toISOString().substring(0, 10) }
function daysBetween(fromISO, toISO) {
  const a = new Date(String(fromISO).substring(0, 10))
  const b = new Date(String(toISO).substring(0, 10))
  if (isNaN(a) || isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}
function monthsBetween(fromISO, toISO) {
  const a = new Date(String(fromISO).substring(0, 10))
  const b = new Date(String(toISO).substring(0, 10))
  if (isNaN(a) || isNaN(b)) return null
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) m -= 1
  return m
}
function resolveBucket(cfg, src) {
  if (!cfg) return { label: '—' }
  if (src == null || src === '') return { label: cfg.null_label || '—' }
  let metric
  if (cfg.mode === 'days_until')      metric = daysBetween(todayISO(), src)
  else if (cfg.mode === 'days_since') metric = daysBetween(src, todayISO())
  else                                metric = Number(src)
  const buckets = cfg.buckets || []
  for (const b of buckets) {
    if (b.max === null || b.max === undefined || metric <= Number(b.max)) return { label: b.label }
  }
  const last = buckets[buckets.length - 1]
  return last ? { label: last.label } : { label: '—' }
}
// Giá trị 1 ô của generic table (col = company_table_columns row, data = row.data jsonb)
function genCell(col, data) {
  if (col.data_type === 'computed') {
    const src = data?.[col.computed_config?.source_col]
    if (col.computed_type === 'status_threshold') return resolveBucket(col.computed_config, src).label
    if (!src) return ''
    if (col.computed_type === 'days_until')   return daysBetween(todayISO(), src) ?? ''
    if (col.computed_type === 'days_since')   return daysBetween(src, todayISO()) ?? ''
    if (col.computed_type === 'months_since') return monthsBetween(src, todayISO()) ?? ''
    return ''
  }
  const v = data?.[col.col_key]
  return col.data_type === 'date' ? fmtDate(v) : (v ?? '')
}

// ── Enum label map from DB ──────────────────────────────────────────────────────
async function loadLbl() {
  let map = {}
  try {
    const { rows } = await query(`SELECT type_key, option_key, label FROM enum_options WHERE is_active = TRUE`)
    for (const r of rows) { (map[r.type_key] ??= {})[r.option_key] = r.label }
  } catch { map = {} }
  return (type, key, fb) => {
    if (!key) return ''
    return map[type]?.[key] ?? fb?.[key] ?? key
  }
}

// ── Column definitions per fixed section ────────────────────────────────────────
function columnsFor(key, lbl) {
  switch (key) {
    case 'overview':
      return [
        { header: 'Tên công ty',       get: (r) => safe(r.name) },
        { header: 'Tên viết tắt',      get: (r) => safe(r.short_name) },
        { header: 'Mã số thuế',        get: (r) => safe(r.tax_code) },
        { header: 'Loại hình',         get: (r) => lbl('business_type', r.business_type, BUSINESS_TYPE_VI) },
        { header: 'Ngành nghề',        get: (r) => safe(r.industry) },
        { header: 'Người đại diện PL', get: (r) => safe(r.legal_rep_name) },
        { header: 'SĐT đại diện',      get: (r) => safe(r.legal_rep_phone) },
        { header: 'Người liên hệ',     get: (r) => safe(r.contact_name) },
        { header: 'SĐT liên hệ',       get: (r) => safe(r.contact_phone) },
        { header: 'Email liên hệ',     get: (r) => safe(r.contact_email) },
        { header: 'Địa chỉ',           get: (r) => safe(r.address) },
        { header: 'Tên ngân hàng',     get: (r) => safe(r.bank_name) },
        { header: 'Số TK ngân hàng',   get: (r) => safe(r.bank_account) },
        { header: 'Ngày bắt đầu HĐ',   get: (r) => fmtDate(r.service_start_date) },
        { header: 'Nhân sự phụ trách', get: (r) => safe(r.assigned_staff_name) },
        { header: 'Trạng thái HĐ',     get: (r) => lbl('company_status', r.status, COMPANY_STATUS_VI) },
        { header: 'Thông tin bổ sung', get: (r) => customFieldsText(r.custom_fields) },
        { header: 'Ghi chú',           get: (r) => safe(r.notes) },
        { header: 'Ngày tạo',          get: (r) => fmtDate(r.created_at) },
      ]
    case 'tasks':
      return [
        { header: 'Tiêu đề',     get: (r) => safe(r.title) },
        { header: 'Trạng thái',  get: (r) => lbl('task_status', r.status, TASK_STATUS_VI) },
        { header: 'Ưu tiên',     get: (r) => lbl('task_priority', r.priority, TASK_PRIORITY_VI) },
        { header: 'Nguồn',       get: (r) => lbl('task_source', r.source, TASK_SOURCE_VI) },
        { header: 'Ngày tạo',    get: (r) => fmtDate(r.created_at) },
        { header: 'Hết hạn',     get: (r) => fmtDate(r.due_date) },
        { header: 'Kỳ',          get: (r) => safe(r.period_label) },
        { header: 'Phụ trách',   get: (r) => safe(r.assigned_to_name) },
        { header: 'Tiến độ (%)', get: (r) => (Number(r.checklist_total) > 0 ? Math.round((r.checklist_done / r.checklist_total) * 100) : '') },
      ]
    case 'client-requests':
      return [
        { header: 'Tài liệu',   get: (r) => safe(r.document_name) },
        { header: 'Kỳ',         get: (r) => safe(r.period_label) },
        { header: 'Hạn nộp',    get: (r) => fmtDate(r.deadline_date) },
        { header: 'Trạng thái', get: (r) => CDR_STATUS_VI[r.status] ?? safe(r.status) },
        { header: 'Email KH',   get: (r) => safe(r.reminded_email) },
        { header: 'Ngày nhận',  get: (r) => fmtDateTime(r.received_at) },
        { header: 'Ghi chú',    get: (r) => safe(r.notes) },
      ]
    case 'schedules':
      return [
        { header: 'Loại công việc', get: (r) => safe(r.task_type_name) },
        { header: 'Định kỳ',        get: (r) => RECURRENCE_VI[r.recurrence_type] ?? safe(r.recurrence_type) },
        { header: 'Phụ trách',      get: (r) => safe(r.assigned_staff_name) },
        { header: 'Hạn (số ngày)',  get: (r) => safe(r.deadline_offset_days) },
        { header: 'SLA (ngày)',     get: (r) => safe(r.override_sla_days) },
        { header: 'Trạng thái',     get: (r) => (r.is_active ? 'Đang hoạt động' : 'Tạm dừng') },
      ]
    case 'documents':
      return [
        { header: 'Tên tài liệu', get: (r) => safe(r.name) },
        { header: 'Danh mục',     get: (r) => safe(r.category) },
        { header: 'URL',          get: (r) => safe(r.url) },
        { header: 'Mô tả',        get: (r) => safe(r.description) },
        { header: 'Ngày tạo',     get: (r) => fmtDate(r.created_at) },
      ]
    case 'notes':
      return [
        { header: 'Nội dung',  get: (r) => stripHtml(r.content) },
        { header: 'Ghim',      get: (r) => (r.is_pinned ? 'Có' : '') },
        { header: 'Người tạo', get: (r) => safe(r.author_name) },
        { header: 'Ngày tạo',  get: (r) => fmtDateTime(r.created_at) },
        { header: 'Cập nhật',  get: (r) => fmtDateTime(r.updated_at) },
      ]
    case 'credentials':
      return [
        { header: 'Hệ thống',  get: (r) => safe(r.system_name) },
        { header: 'URL',       get: (r) => safe(r.system_url) },
        { header: 'Tài khoản', get: (r) => safe(r.username) },
        // __password chỉ có khi được phép nhúng (Excel). Chế độ xem → '***', tiết lộ theo yêu cầu.
        { header: 'Mật khẩu',  get: (r) => (r.__password !== undefined ? safe(r.__password) : '***') },
        { header: 'Ghi chú',   get: (r) => safe(r.notes) },
        { header: 'Cập nhật',  get: (r) => fmtDateTime(r.updated_at) },
      ]
    default:
      return []
  }
}

// ── Data fetchers (IN-list — 1 query per section, all companies) ─────────────────
async function fetchSection(key, companyIds, includeCredentials) {
  switch (key) {
    case 'tasks':
      return (await query(
        `SELECT t.company_id, t.title, t.status, t.priority, t.source, t.created_at, t.due_date, t.period_label,
                ua.name AS assigned_to_name,
                cl.checklist_total, cl.checklist_done
         FROM tasks t
         LEFT JOIN users ua ON ua.id = t.assigned_to
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS checklist_total,
                  COUNT(*) FILTER (WHERE ci.is_completed = TRUE) AS checklist_done
           FROM task_checklist_items ci WHERE ci.task_id = t.id
         ) cl ON TRUE
         WHERE t.company_id = ANY($1)
         ORDER BY t.company_id, t.due_date NULLS LAST, t.created_at DESC`,
        [companyIds],
      )).rows
    case 'client-requests':
      return (await query(
        `SELECT company_id, document_name, period_label, deadline_date, status, received_at, reminded_email, notes
         FROM client_document_requests
         WHERE company_id = ANY($1)
         ORDER BY company_id, deadline_date NULLS LAST, created_at DESC`,
        [companyIds],
      )).rows
    case 'schedules':
      return (await query(
        `SELECT s.company_id, tt.name AS task_type_name, s.recurrence_type, s.recurrence_config,
                u.name AS assigned_staff_name, s.deadline_offset_days, s.override_sla_days, s.is_active
         FROM customer_task_schedules s
         LEFT JOIN task_types tt ON tt.id = s.task_type_id
         LEFT JOIN users u ON u.id = s.assigned_staff_id
         WHERE s.company_id = ANY($1)
         ORDER BY s.company_id, tt.name`,
        [companyIds],
      )).rows
    case 'documents':
      return (await query(
        `SELECT company_id, name, category, url, description, created_at
         FROM documents WHERE company_id = ANY($1)
         ORDER BY company_id, created_at DESC`,
        [companyIds],
      )).rows
    case 'notes':
      return (await query(
        `SELECT n.company_id, n.content, n.is_pinned, n.created_at, n.updated_at, u.name AS author_name
         FROM company_notes n
         LEFT JOIN users u ON u.id = n.created_by
         WHERE n.company_id = ANY($1)
         ORDER BY n.company_id, n.is_pinned DESC, n.created_at DESC`,
        [companyIds],
      )).rows
    case 'credentials': {
      const rows = (await query(
        `SELECT id, company_id, system_name, system_url, username, encrypted_password, iv, notes, updated_at
         FROM company_credentials WHERE company_id = ANY($1)
         ORDER BY company_id, system_name`,
        [companyIds],
      )).rows
      if (includeCredentials) {
        for (const r of rows) {
          try { r.__password = decrypt(r.encrypted_password, r.iv) }
          catch { r.__password = '' }
        }
      }
      return rows
    }
    default:
      return []
  }
}

// ── Sheet helpers (exceljs) ─────────────────────────────────────────────────────
function sheetName(name, used) {
  let base = String(name || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').trim().substring(0, 28) || 'Sheet'
  let nm = base, i = 2
  while (used.has(nm.toLowerCase())) { nm = `${base.substring(0, 26)} ${i++}` }
  used.add(nm.toLowerCase())
  return nm
}
function addSheet(wb, name, used, header, dataRows) {
  const ws = wb.addWorksheet(sheetName(name, used))
  ws.addRow(header)
  ws.getRow(1).font = { bold: true }
  for (const r of dataRows) ws.addRow(r)
  // Auto-ish column widths
  ws.columns.forEach((col) => {
    let max = 10
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).split('\n')[0].length : 0
      if (len > max) max = len
    })
    col.width = Math.min(60, max + 2)
  })
  return ws
}
function safeFile(name, fallback) {
  return String(name || fallback || 'cong_ty').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').substring(0, 60)
}
function zipToBuffer(files) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } })
    const chunks = []
    archive.on('data', (c) => chunks.push(c))
    archive.on('warning', (e) => { if (e.code !== 'ENOENT') reject(e) })
    archive.on('error', reject)
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    for (const f of files) archive.append(f.buffer, { name: f.name })
    archive.finalize()
  })
}

// ── Main ─────────────────────────────────────────────────────────────────────────
// RBAC: staff chỉ được xem/xuất dữ liệu công ty mình phụ trách (giống rule danh sách công ty).
// Lọc companyIds về đúng phạm vi — admin giữ nguyên toàn quyền. Dùng chung cho export + overview.
async function filterCompanyIdsForUser(companyIds, user) {
  if (!user || user.role === 'admin') return companyIds
  const { rows } = await query(
    'SELECT id FROM companies WHERE id = ANY($1) AND assigned_staff_id = $2',
    [companyIds, user.id],
  )
  const allowed = new Set(rows.map((r) => r.id))
  const filtered = companyIds.filter((id) => allowed.has(id))
  if (filtered.length === 0) {
    throw Object.assign(
      new Error('Bạn chỉ được xem/xuất dữ liệu công ty do mình phụ trách'),
      { status: 403 },
    )
  }
  return filtered
}

async function exportCompanies({ companyIds, sections, defIds = [], includeCredentials = false, layout = 'aggregate', user = null }) {
  companyIds = await filterCompanyIdsForUser(companyIds, user)

  const lbl = await loadLbl()

  const fixedKeys = FIXED_SECTION_KEYS.filter(
    (k) => sections.includes(k) && (k !== 'credentials' || includeCredentials),
  )

  // Companies (overview source + name/MST lookup) — 1 query
  const companies = (await query(
    `SELECT c.*, u.name AS assigned_staff_name
     FROM companies c
     LEFT JOIN users u ON u.id = c.assigned_staff_id
     WHERE c.id = ANY($1)
     ORDER BY c.name`,
    [companyIds],
  )).rows
  const cInfo = new Map(companies.map((c) => [c.id, { name: c.name, taxCode: c.tax_code }]))

  // Fixed sections (except overview) — 1 query each, grouped by company
  const fixedRows = {}  // key -> rows[]
  for (const key of fixedKeys) {
    if (key === 'overview') continue
    fixedRows[key] = await fetchSection(key, companyIds, includeCredentials)
  }

  // Generic tables — defs + columns + rows
  let defs = []
  const defColumns = {}  // defId -> columns[]
  const defRows = {}     // defId -> rows[]
  if (defIds.length) {
    defs = (await query(
      `SELECT id, name, table_key FROM company_table_defs WHERE id = ANY($1) ORDER BY sort_order, name`,
      [defIds],
    )).rows
    const cols = (await query(
      `SELECT * FROM company_table_columns WHERE def_id = ANY($1) AND is_active IS NOT FALSE ORDER BY sort_order, created_at`,
      [defIds],
    )).rows
    for (const c of cols) (defColumns[c.def_id] ??= []).push(c)
    const rws = (await query(
      `SELECT def_id, company_id, data FROM company_table_rows
       WHERE def_id = ANY($1) AND company_id = ANY($2)
       ORDER BY def_id, company_id, position, created_at`,
      [defIds, companyIds],
    )).rows
    for (const r of rws) (defRows[r.def_id] ??= []).push(r)
  }

  const stamp = new Date().toISOString().slice(0, 10)

  // ── Build per layout ─────────────────────────────────────────────────────────
  if (layout === 'per_company') {
    const files = []
    const usedFiles = new Set()
    for (const company of companies) {
      const wb = new ExcelJS.Workbook()
      const used = new Set()
      for (const key of fixedKeys) {
        const cols = columnsFor(key, lbl)
        if (key === 'overview') {
          addSheet(wb, SECTION_LABELS[key], used, cols.map((c) => c.header), [cols.map((c) => c.get(company))])
          continue
        }
        const rows = (fixedRows[key] ?? []).filter((r) => r.company_id === company.id)
        const header = ['STT', ...cols.map((c) => c.header)]
        const body = rows.map((r, i) => [i + 1, ...cols.map((c) => c.get(r))])
        addSheet(wb, SECTION_LABELS[key], used, header, body)
      }
      for (const def of defs) {
        const cols = defColumns[def.id] ?? []
        const rows = (defRows[def.id] ?? []).filter((r) => r.company_id === company.id)
        const header = ['STT', ...cols.map((c) => c.label)]
        const body = rows.map((r, i) => [i + 1, ...cols.map((c) => safe(genCell(c, r.data)))])
        addSheet(wb, def.name, used, header, body)
      }
      const buffer = await wb.xlsx.writeBuffer()
      let fname = safeFile(company.name, company.id) + '.xlsx'
      let n = 2
      while (usedFiles.has(fname.toLowerCase())) { fname = safeFile(company.name, company.id) + `_${n++}.xlsx` }
      usedFiles.add(fname.toLowerCase())
      files.push({ name: fname, buffer: Buffer.from(buffer) })
    }
    const zipBuffer = await zipToBuffer(files)
    return { buffer: zipBuffer, filename: `HoSo_CongTy_${stamp}.zip`, contentType: 'application/zip' }
  }

  // layout === 'aggregate'
  const wb = new ExcelJS.Workbook()
  const used = new Set()
  for (const key of fixedKeys) {
    const cols = columnsFor(key, lbl)
    if (key === 'overview') {
      addSheet(wb, SECTION_LABELS[key], used, cols.map((c) => c.header), companies.map((c) => cols.map((col) => col.get(c))))
      continue
    }
    const header = ['STT', 'Công ty', 'MST', ...cols.map((c) => c.header)]
    const body = []
    let idx = 0
    for (const r of (fixedRows[key] ?? [])) {
      const info = cInfo.get(r.company_id) ?? {}
      body.push([++idx, info.name ?? '', info.taxCode ?? '', ...cols.map((c) => c.get(r))])
    }
    addSheet(wb, SECTION_LABELS[key], used, header, body)
  }
  for (const def of defs) {
    const cols = defColumns[def.id] ?? []
    const header = ['STT', 'Công ty', 'MST', ...cols.map((c) => c.label)]
    const body = []
    let idx = 0
    for (const r of (defRows[def.id] ?? [])) {
      const info = cInfo.get(r.company_id) ?? {}
      body.push([++idx, info.name ?? '', info.taxCode ?? '', ...cols.map((c) => safe(genCell(c, r.data)))])
    }
    addSheet(wb, def.name, used, header, body)
  }
  const buffer = await wb.xlsx.writeBuffer()
  return { buffer: Buffer.from(buffer), filename: `TongHop_CongTy_${stamp}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
}

// ── Overview (JSON để xem trên hệ thống) ────────────────────────────────────────
//
// Trả về đúng dữ liệu như bản Excel "aggregate" nhưng dạng JSON để render bảng.
// Mật khẩu KHÔNG nhúng ở đây (embedPasswords=false) → cột Mật khẩu = '***', kèm
// credentialId để front-end tiết lộ theo yêu cầu (ghi audit log qua endpoint reveal).
// Mỗi dòng có companyId để điều hướng sang chi tiết công ty.
async function assembleOverview({ companyIds, sections = [], defIds = [], includeCredentials = false, user = null }) {
  companyIds = await filterCompanyIdsForUser(companyIds, user)

  const lbl = await loadLbl()
  const fixedKeys = FIXED_SECTION_KEYS.filter(
    (k) => sections.includes(k) && (k !== 'credentials' || includeCredentials),
  )

  const companies = (await query(
    `SELECT c.*, u.name AS assigned_staff_name
     FROM companies c LEFT JOIN users u ON u.id = c.assigned_staff_id
     WHERE c.id = ANY($1) ORDER BY c.name`,
    [companyIds],
  )).rows
  const cInfo = new Map(companies.map((c) => [c.id, { name: c.name, taxCode: c.tax_code }]))

  // Fixed sections (trừ overview) — embedPasswords=false (không giải mã mật khẩu)
  const fixedRows = {}
  for (const key of fixedKeys) {
    if (key === 'overview') continue
    fixedRows[key] = await fetchSection(key, companyIds, false)
  }

  // Generic tables
  let defs = []
  const defColumns = {}
  const defRows = {}
  if (defIds.length) {
    defs = (await query(
      `SELECT id, name, table_key FROM company_table_defs WHERE id = ANY($1) ORDER BY sort_order, name`,
      [defIds],
    )).rows
    const cols = (await query(
      `SELECT * FROM company_table_columns WHERE def_id = ANY($1) AND is_active IS NOT FALSE ORDER BY sort_order, created_at`,
      [defIds],
    )).rows
    for (const c of cols) (defColumns[c.def_id] ??= []).push(c)
    const rws = (await query(
      `SELECT def_id, company_id, data FROM company_table_rows
       WHERE def_id = ANY($1) AND company_id = ANY($2)
       ORDER BY def_id, company_id, position, created_at`,
      [defIds, companyIds],
    )).rows
    for (const r of rws) (defRows[r.def_id] ??= []).push(r)
  }

  const out = []
  for (const key of fixedKeys) {
    const cols = columnsFor(key, lbl)
    if (key === 'overview') {
      out.push({
        key, label: SECTION_LABELS[key],
        columns: cols.map((c) => c.header),
        rows: companies.map((c) => ({ cells: cols.map((col) => col.get(c)), companyId: c.id })),
      })
      continue
    }
    const columns = ['Công ty', 'MST', ...cols.map((c) => c.header)]
    const rows = []
    for (const r of (fixedRows[key] ?? [])) {
      const info = cInfo.get(r.company_id) ?? {}
      const row = { cells: [info.name ?? '', info.taxCode ?? '', ...cols.map((c) => c.get(r))], companyId: r.company_id }
      if (key === 'credentials') row.credentialId = r.id  // để tiết lộ mật khẩu theo yêu cầu
      rows.push(row)
    }
    out.push({ key, label: SECTION_LABELS[key], columns, rows })
  }
  for (const def of defs) {
    const cols = defColumns[def.id] ?? []
    const columns = ['Công ty', 'MST', ...cols.map((c) => c.label)]
    const rows = []
    for (const r of (defRows[def.id] ?? [])) {
      const info = cInfo.get(r.company_id) ?? {}
      rows.push({ cells: [info.name ?? '', info.taxCode ?? '', ...cols.map((c) => safe(genCell(c, r.data)))], companyId: r.company_id })
    }
    out.push({ key: `def:${def.id}`, label: def.name, columns, rows })
  }

  return { companyCount: companies.length, sections: out }
}

module.exports = { exportCompanies, assembleOverview, FIXED_SECTION_KEYS }

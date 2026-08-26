'use strict'
// ── Đăng ký module được phép đính kèm file ────────────────────────────────────
// Muốn thêm chức năng mới (Task, Company…) → CHỈ cần thêm 1 mục ở đây.
// Không phải sửa storage.js, service, controller hay router.
//
//   entityTable : bảng chứa bản ghi cha (để kiểm tra entity_id có tồn tại)
//   canRead     : ai được XEM/TẢI file  ← chống IDOR (đoán id file của người khác)
//   canWrite    : ai được upload
//   canDelete   : ai được xoá  (uploader hoặc admin)
//
// ⚠️ canRead là BẮT BUỘC. Không có nó thì mọi user đăng nhập đều tải được mọi file
// của mọi module chỉ bằng cách biết id — kể cả file mật của công ty khác.
const { query } = require('../../config/db')

const isAdmin = (user) => user?.role === 'admin'

const MODULES = {
  // Tài liệu nội bộ — file gắn vào một DANH MỤC tài liệu.
  // Đây là kho dùng chung toàn công ty → mọi nhân sự đã đăng nhập đều được đọc.
  internal_doc: {
    entityTable: 'internal_doc_categories',
    canRead:   () => true,
    canWrite:  () => true,
    canDelete: (att, user) => isAdmin(user) || att.uploaded_by === user.id,
  },

  // Tài liệu của KHÁCH HÀNG — file gắn vào một công ty.
  // KHÁC hẳn internal_doc: đây là hồ sơ riêng của từng khách, KHÔNG được để
  // canRead: () => true, nếu không mọi nhân sự đều tải được tài liệu của mọi
  // công ty chỉ bằng cách biết id file.
  // Phạm vi bám đúng RBAC đang áp cho Companies/Tasks: admin xem hết, nhân viên
  // chỉ xem công ty MÌNH PHỤ TRÁCH. Xoá thì CHỈ admin — khớp với
  // DELETE /companies/:id/documents/:id vốn đã là adminOnly.
  company: {
    entityTable: 'companies',
    canRead:   async (att, user) => isAdmin(user) || phuTrachCongTy(att.entity_id, user?.id),
    canWrite:  async (user, entityId) => isAdmin(user) || phuTrachCongTy(entityId, user?.id),
    canDelete: (_att, user) => isAdmin(user),
  },

  // File đính kèm của một ĐỊA ĐIỂM (trụ sở/chi nhánh) — bám RBAC theo công ty của
  // địa điểm đó: admin xem hết, nhân viên chỉ công ty MÌNH PHỤ TRÁCH.
  company_location: {
    entityTable: 'company_locations',
    canRead:   async (att, user) => isAdmin(user) || phuTrachCongTyQuaDiaDiem(att.entity_id, user?.id),
    canWrite:  async (user, entityId) => isAdmin(user) || phuTrachCongTyQuaDiaDiem(entityId, user?.id),
    canDelete: (att, user) => isAdmin(user) || att.uploaded_by === user.id,
  },

  // File đính kèm của một HỢP ĐỒNG dịch vụ — bám RBAC theo công ty của hợp đồng.
  company_contract: {
    entityTable: 'company_service_contracts',
    canRead:   async (att, user) => isAdmin(user) || phuTrachCongTyQuaHopDong(att.entity_id, user?.id),
    canWrite:  async (user, entityId) => isAdmin(user) || phuTrachCongTyQuaHopDong(entityId, user?.id),
    canDelete: (att, user) => isAdmin(user) || att.uploaded_by === user.id,
  },

  // File đính kèm của một GHI CHÚ nội bộ (tab Ghi chú) — bám RBAC theo công ty của
  // ghi chú: admin xem/ghi hết, nhân viên chỉ công ty MÌNH PHỤ TRÁCH. Xoá = admin
  // hoặc người upload.
  company_note: {
    entityTable: 'company_notes',
    canRead:   async (att, user) => isAdmin(user) || phuTrachCongTyQuaNote(att.entity_id, user?.id),
    canWrite:  async (user, entityId) => isAdmin(user) || phuTrachCongTyQuaNote(entityId, user?.id),
    canDelete: (att, user) => isAdmin(user) || att.uploaded_by === user.id,
  },

  // File của một DÒNG trong Bảng tùy chỉnh (cột kiểu 'file') — entity_id = row id,
  // phân biệt cột bằng field_key. RBAC bám công ty của dòng: admin xem/ghi hết,
  // nhân viên chỉ công ty MÌNH PHỤ TRÁCH. Xoá = admin hoặc người upload.
  company_table_row: {
    entityTable: 'company_table_rows',
    canRead:   async (att, user) => isAdmin(user) || phuTrachCongTyQuaRow(att.entity_id, user?.id),
    canWrite:  async (user, entityId) => isAdmin(user) || phuTrachCongTyQuaRow(entityId, user?.id),
    canDelete: (att, user) => isAdmin(user) || att.uploaded_by === user.id,
  },
}

// Nhân sự có phụ trách công ty này không
async function phuTrachCongTy(companyId, userId) {
  if (!companyId || !userId) return false
  const { rows } = await query(
    'SELECT 1 FROM companies WHERE id = $1 AND assigned_staff_id = $2', [companyId, userId])
  return rows.length > 0
}

// Nhân sự có phụ trách công ty của ĐỊA ĐIỂM này không (entity_id = location id)
async function phuTrachCongTyQuaDiaDiem(locationId, userId) {
  if (!locationId || !userId) return false
  const { rows } = await query(
    `SELECT 1 FROM company_locations cl JOIN companies c ON c.id = cl.company_id
     WHERE cl.id = $1 AND c.assigned_staff_id = $2`, [locationId, userId])
  return rows.length > 0
}

// Nhân sự có phụ trách công ty của HỢP ĐỒNG này không (entity_id = contract id)
async function phuTrachCongTyQuaHopDong(contractId, userId) {
  if (!contractId || !userId) return false
  const { rows } = await query(
    `SELECT 1 FROM company_service_contracts sc JOIN companies c ON c.id = sc.company_id
     WHERE sc.id = $1 AND c.assigned_staff_id = $2`, [contractId, userId])
  return rows.length > 0
}

// Nhân sự có phụ trách công ty của GHI CHÚ này không (entity_id = company_notes.id)
async function phuTrachCongTyQuaNote(noteId, userId) {
  if (!noteId || !userId) return false
  const { rows } = await query(
    `SELECT 1 FROM company_notes n JOIN companies c ON c.id = n.company_id
     WHERE n.id = $1 AND c.assigned_staff_id = $2`, [noteId, userId])
  return rows.length > 0
}

// Nhân sự có phụ trách công ty của DÒNG này không (entity_id = company_table_rows.id)
async function phuTrachCongTyQuaRow(rowId, userId) {
  if (!rowId || !userId) return false
  const { rows } = await query(
    `SELECT 1 FROM company_table_rows r JOIN companies c ON c.id = r.company_id
     WHERE r.id = $1 AND c.assigned_staff_id = $2`, [rowId, userId])
  return rows.length > 0
}

function getModule(name) {
  const mod = MODULES[name]
  if (!mod) throw Object.assign(new Error(`Module "${name}" không hỗ trợ đính kèm file`), { status: 400 })
  return mod
}

// Bản ghi cha có tồn tại không (chặn upload vào entity_id bịa ra)
async function assertEntityExists(name, entityId) {
  const mod = getModule(name)
  const { rows } = await query(`SELECT id FROM ${mod.entityTable} WHERE id = $1`, [entityId])
  if (!rows[0]) throw Object.assign(new Error('Không tìm thấy bản ghi để đính kèm'), { status: 404 })
}

module.exports = { getModule, assertEntityExists }

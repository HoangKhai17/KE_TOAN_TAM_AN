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
}

// Nhân sự có phụ trách công ty này không
async function phuTrachCongTy(companyId, userId) {
  if (!companyId || !userId) return false
  const { rows } = await query(
    'SELECT 1 FROM companies WHERE id = $1 AND assigned_staff_id = $2', [companyId, userId])
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

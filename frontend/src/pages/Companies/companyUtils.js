// Helper dùng chung giữa CompanyDetail (khung) và các tab con.

export function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

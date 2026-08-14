// Danh sách section cố định cho chức năng Xuất tổng hợp công ty.
// Tách riêng (không kéo theo xlsx/jszip) để modal hiển thị checklist mà không
// phải nạp util nặng — util chỉ được import động khi người dùng bấm Xuất.
export const EXPORT_SECTIONS = [
  { key: 'overview',            label: 'Tổng quan' },
  { key: 'locations',           label: 'Địa điểm kinh doanh' },
  { key: 'contracts',           label: 'Hợp đồng dịch vụ' },
  { key: 'tasks',               label: 'Công việc' },
  { key: 'client-requests',     label: 'Yêu cầu KH' },
  { key: 'schedules',           label: 'Lịch định kỳ' },
  { key: 'documents',           label: 'Tài liệu' },
  { key: 'document-types',      label: 'Chứng từ phát sinh' },
  { key: 'original-documents',  label: 'KH lưu HS gốc tại Cty' },
  { key: 'notes',               label: 'Ghi chú nhanh' },
  { key: 'important-notes',     label: 'Điều cần lưu ý' },
  { key: 'credentials',         label: 'Tài khoản hệ thống', sensitive: true },
]

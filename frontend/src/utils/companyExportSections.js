// Danh sách section cố định cho chức năng Xuất tổng hợp công ty.
// Tách riêng (không kéo theo xlsx/jszip) để modal hiển thị checklist mà không
// phải nạp util nặng — util chỉ được import động khi người dùng bấm Xuất.
export const EXPORT_SECTIONS = [
  { key: 'overview',         label: 'Tổng quan' },
  { key: 'tasks',            label: 'Công việc' },
  { key: 'client-requests',  label: 'Yêu cầu KH' },
  { key: 'schedules',        label: 'Lịch định kỳ' },
  { key: 'documents',        label: 'Tài liệu' },
  { key: 'notes',            label: 'Ghi chú' },
  { key: 'credentials',      label: 'Tài khoản hệ thống', sensitive: true },
]

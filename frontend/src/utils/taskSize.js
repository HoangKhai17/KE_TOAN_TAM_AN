// Cỡ việc (KPI): độ lớn/phức tạp KHÁCH QUAN của công việc — nguồn CHUẨN là enum động 'task_size'
// (đọc qua useEnumsStore.getOptions('task_size')). MÃ enum (option_key) CHÍNH LÀ điểm: '1'/'2'/'3'…
// Fallback dưới đây CHỈ dùng khi enum chưa tải xong (giống cách task_priority fallback).
export const DEFAULT_TASK_SIZE = 2

export const TASK_SIZE_FALLBACK = [
  { key: '1', label: 'Nhỏ' },
  { key: '2', label: 'Vừa' },
  { key: '3', label: 'Lớn' },
]

// Trả danh sách option để render; rơi về fallback khi enum rỗng.
export function sizeOptionsOr(options) {
  return options && options.length ? options : TASK_SIZE_FALLBACK
}

// Nhãn theo giá trị số (v = size_points/effectiveSize), tra trong danh sách option enum.
export function taskSizeLabel(options, v) {
  return sizeOptionsOr(options).find((o) => String(o.key) === String(v))?.label ?? `Cỡ ${v ?? '?'}`
}

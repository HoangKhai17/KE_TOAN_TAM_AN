// KPI v2 · Độ khó + điểm cho bước checklist. Nguồn CHUẨN là enum động 'checklist_difficulty'
// (đọc qua useEnumsStore.getOptions('checklist_difficulty')). Fallback dưới đây chỉ dùng khi
// enum chưa tải xong (giống pattern task_priority / task_size).

// Điểm GỢI Ý theo độ khó (khớp map ở backend). Điểm cuối cùng do người dùng nhập tay.
export const DEFAULT_CHECKLIST_POINTS = { de: 2, trung_binh: 4, kho: 6 }

export const CHECKLIST_DIFF_FALLBACK = [
  { key: 'de',         label: 'Dễ' },
  { key: 'trung_binh', label: 'Trung bình' },
  { key: 'kho',        label: 'Khó' },
]

export function diffOptionsOr(options) {
  return options && options.length ? options : CHECKLIST_DIFF_FALLBACK
}

export function difficultyLabel(options, key) {
  return diffOptionsOr(options).find((o) => o.key === key)?.label ?? 'Trung bình'
}

export function defaultPointsFor(difficulty) {
  return DEFAULT_CHECKLIST_POINTS[difficulty] ?? 4
}

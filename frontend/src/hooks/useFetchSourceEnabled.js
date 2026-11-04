import { useQuery } from '@tanstack/react-query'
import { getPublicConfigs } from '../api/systemConfigs'

// Danh sách ID loại công việc (task-type) đã BẬT chế độ "Cách lấy". Lưu JSON array trong
// system_configs. Mặc định rỗng = mọi loại đều TẮT. Per-type, không migration.
export const FETCH_SOURCE_TYPES_KEY = 'checklist_fetch_source_type_ids'
export const PUBLIC_CONFIG_QK = ['public-configs']

function parseIds(v) {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.map(String) : [] }
  catch { return [] }
}

// Trả Set các task-type id đã bật "Cách lấy".
export function useFetchSourceTypeIds() {
  const { data } = useQuery({
    queryKey: PUBLIC_CONFIG_QK,
    queryFn: getPublicConfigs,
    staleTime: 5 * 60_000,
  })
  return new Set(parseIds(data?.[FETCH_SOURCE_TYPES_KEY]))
}

// Tiện: loại công việc `taskTypeId` có bật "Cách lấy" không.
export function useFetchSourceEnabledFor(taskTypeId) {
  const set = useFetchSourceTypeIds()
  return !!taskTypeId && set.has(String(taskTypeId))
}

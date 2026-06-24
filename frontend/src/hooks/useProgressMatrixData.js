// ── Progress-matrix reference hooks (React Query) ───────────────────────────────
// task-types / years / sources được fetch mỗi lần mở trang → cache để chỉ 1 request.

import { useQuery } from '@tanstack/react-query'
import { getTaskTypes, getYears, getSources } from '../api/progressMatrix'

const TEN_MIN = 10 * 60 * 1000

export function useProgressTaskTypes() {
  return useQuery({ queryKey: ['pm', 'task-types'], queryFn: getTaskTypes, staleTime: TEN_MIN })
}
export function useProgressYears() {
  return useQuery({ queryKey: ['pm', 'years'], queryFn: getYears, staleTime: TEN_MIN })
}
export function useProgressSources() {
  return useQuery({ queryKey: ['pm', 'sources'], queryFn: getSources, staleTime: TEN_MIN })
}

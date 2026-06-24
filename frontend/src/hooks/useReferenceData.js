// ── Reference-data hooks (React Query) ──────────────────────────────────────────
//
// Dữ liệu tham chiếu ít đổi, được NHIỀU trang fetch lại mỗi lần mở (công ty, nhân viên).
// Dùng các hook này để React Query CACHE + GỘP request: cùng key → 1 request dùng chung
// across mọi trang, không refetch khi còn "tươi" (staleTime).
//
// Đồng bộ sau khi tạo/sửa/xoá: gọi invalidateRefCompanies()/invalidateRefStaff() (xem dưới).

import { useQuery } from '@tanstack/react-query'
import { listCompanies } from '../api/companies'
import { listUserOptions } from '../api/users'

const FIVE_MIN = 5 * 60 * 1000

export const REF_KEYS = {
  companies: ['ref', 'companies'],
  staff:     ['ref', 'staff'],
}

// Danh sách công ty đang hoạt động — DÙNG CHUNG cache giữa các trang
export function useCompanyOptions(options = {}) {
  return useQuery({
    queryKey: REF_KEYS.companies,
    queryFn: () => listCompanies({ limit: 500, status: 'active' }),
    select: (d) => d.companies ?? [],
    staleTime: FIVE_MIN,
    ...options,
  })
}

// Danh sách nhân viên đang hoạt động — DÙNG CHUNG cache giữa các trang
export function useStaffOptions(options = {}) {
  return useQuery({
    queryKey: REF_KEYS.staff,
    queryFn: () => listUserOptions({ status: 'active' }),
    select: (d) => d.users ?? [],
    staleTime: FIVE_MIN,
    ...options,
  })
}

// Helpers invalidate (gọi sau mutation để dropdown cập nhật ngay)
export function invalidateRefCompanies(queryClient) {
  return queryClient.invalidateQueries({ queryKey: REF_KEYS.companies })
}
export function invalidateRefStaff(queryClient) {
  return queryClient.invalidateQueries({ queryKey: REF_KEYS.staff })
}

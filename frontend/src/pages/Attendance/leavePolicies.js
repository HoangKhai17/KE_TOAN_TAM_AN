// Nguồn DUY NHẤT cho danh sách loại nghỉ ở giao diện.
//
// Trước đây mỗi trang tự khai một object LEAVE_TYPE cứng — dẫn tới nhãn trôi khỏi
// dữ liệu thật (DB seed 'unpaid' = "Nghỉ không phép" trong khi UI ghi "Nghỉ không
// lương", hai nghĩa khác hẳn nhau). Nay lấy động từ bảng leave_policies.

import { useState, useEffect } from 'react'
import * as attendanceApi from '../../api/attendance'

export const DAY_PARTS = [
  { value: 'full',      label: 'Cả ngày'    },
  { value: 'morning',   label: 'Buổi sáng'  },
  { value: 'afternoon', label: 'Buổi chiều' },
  { value: 'hours',     label: 'Theo giờ'   },
]

export const dayPartLabel = (v) =>
  DAY_PARTS.find((d) => d.value === v)?.label ?? 'Cả ngày'

// Nhãn ngắn để chèn cạnh số ngày trong bảng — cả ngày thì không hiện gì cho gọn.
export function dayPartSuffix(dayPart, hours) {
  if (!dayPart || dayPart === 'full') return ''
  if (dayPart === 'hours') return ` (${Number(hours ?? 0)}h)`
  return ` (${dayPartLabel(dayPart).toLowerCase()})`
}

// Bảng tra nhãn dùng được ở cả hàm thường (không phải component nên không gọi hook
// được, vd hàm format ô của modal xuất Excel). Được điền khi useLeavePolicies chạy;
// mọi chỗ dùng đều có fallback về chính leaveType nên không vỡ khi chưa tải xong.
export const LEAVE_LABELS = {}

let cache = null   // chia sẻ giữa các lần mở modal trong cùng phiên

function fillLabels(list) {
  list.forEach((p) => { LEAVE_LABELS[p.leaveType] = p.label })
}
if (cache) fillLabels(cache)

export function useLeavePolicies() {
  const [policies, setPolicies] = useState(cache ?? [])
  const [loading,  setLoading]  = useState(!cache)

  useEffect(() => {
    if (cache) return
    let cancelled = false
    attendanceApi.listLeavePolicies()
      .then((data) => {
        if (cancelled) return
        cache = Array.isArray(data) ? data : []
        fillLabels(cache)
        setPolicies(cache)
      })
      .catch(() => { if (!cancelled) setPolicies([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const labelOf = (leaveType) =>
    policies.find((p) => p.leaveType === leaveType)?.label ?? leaveType
  const policyOf = (leaveType) =>
    policies.find((p) => p.leaveType === leaveType) ?? null

  return { policies, loading, labelOf, policyOf }
}

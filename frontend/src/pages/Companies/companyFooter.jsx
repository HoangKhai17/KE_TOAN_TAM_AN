import { createContext, useContext, useEffect } from 'react'
import PaginationFooter from '../../components/layout/PaginationFooter'

// Cho phép tab con trong Chi tiết khách hàng đẩy thanh phân trang lên FOOTER của trang
// (thay cho copyright), giống cách Companies/Tasks dùng AppLayout footer.
// CompanyDetail cung cấp setter; tab con gọi useCompanyFooter(props) để đăng ký.
export const CompanyFooterContext = createContext(null)

// props: object props cho PaginationFooter khi tab có phân trang; null = không hiện (về footer mặc định).
export function useCompanyFooter(props) {
  const setFooter = useContext(CompanyFooterContext)
  const enabled = !!props
  useEffect(() => {
    if (!setFooter) return undefined
    setFooter(enabled ? <PaginationFooter {...props} /> : null)
    return () => setFooter(null)   // rời tab / ẩn → trả footer về mặc định
  // Các setter (onPageChange/onPageSizeChange) ổn định nên chỉ theo dõi giá trị nguyên thủy.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFooter, enabled, props?.total, props?.from, props?.to, props?.page,
      props?.pageSize, props?.totalPages, props?.loading, props?.details, props?.itemLabel])
}

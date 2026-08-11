// Helper dùng chung giữa CompanyDetail (khung) và các tab con.
// fmtDate/parseDateInput đã chuyển sang util chung toàn hệ thống; re-export để
// mọi import cũ `from './companyUtils'` vẫn hoạt động.
export { fmtDate, parseDateInput } from '../../utils/dateFormat'

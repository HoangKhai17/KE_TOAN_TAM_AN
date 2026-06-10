# Tài Liệu Phân Tích Dự Án: Phần Mềm Quản Lý Nội Bộ Kế Toán Tâm An

## Mục Lục Tài Liệu

| # | File | Nội dung | Trạng thái |
|---|------|----------|------------|
| 01 | [01_TONGQUAN.md](./01_TONGQUAN.md) | Tổng quan dự án, bối cảnh nghiệp vụ, mục tiêu | ✅ Hoàn thành |
| 02 | [02_CHUCNANG.md](./02_CHUCNANG.md) | Danh sách chức năng, mô tả chi tiết từng module | ✅ Hoàn thành |
| 03 | [03_FLOW_QUYTRINH.md](./03_FLOW_QUYTRINH.md) | Luồng quy trình nghiệp vụ, sơ đồ hoạt động | ✅ Hoàn thành |
| 04 | [04_HOSTING_VANTAI.md](./04_HOSTING_VANTAI.md) | Phương án hosting, VPS, chi phí vận hành hàng năm | ✅ Hoàn thành |
| 05 | [05_DATABASE_SCHEMA.md](./05_DATABASE_SCHEMA.md) | Thiết kế CSDL — 31 bảng, ERD, indexes, triggers (bao gồm module chấm công) | ✅ Hoàn thành |
| 06 | [06_SECURITY.md](./06_SECURITY.md) | Thiết kế bảo mật — RBAC, AES-256, JWT, audit log | ✅ Hoàn thành |
| 07 | [07_DEBUGGING_OBSERVABILITY.md](./07_DEBUGGING_OBSERVABILITY.md) | Logging, error tracking, metrics, testing strategy | ✅ Hoàn thành |
| 08 | [08_COMPETITIVE_ANALYSIS.md](./08_COMPETITIVE_ANALYSIS.md) | Phân tích so sánh thị trường, điểm cải thiện, roadmap | ✅ Hoàn thành |
| 09 | [09_BUILD_PLAN.md](./09_BUILD_PLAN.md) | Kế hoạch xây dựng chi tiết — 16 phases, acceptance criteria | ✅ Hoàn thành |
| 12 | [12_ONEDRIVE_SETUP.md](./12_ONEDRIVE_SETUP.md) | Hướng dẫn kết nối OneDrive Personal — Azure App, OAuth2, xử lý sự cố | ✅ Hoàn thành |
| 13 | [013_CHAMCONG.md](./013_CHAMCONG.md) | Module Chấm Công Nội Bộ — nghiệp vụ, DB schema, API, UI spec, 10 phases | ✅ Hoàn thành |

---

## Thông Tin Dự Án

| Thông tin | Chi tiết |
|-----------|----------|
| **Tên khách hàng** | Kế Toán Tâm An |
| **Loại ứng dụng** | Phần mềm quản lý nội bộ (Internal Management System) |
| **Nghiệp vụ** | Công ty dịch vụ kế toán cho doanh nghiệp |
| **Phiên bản tài liệu** | v1.0 |
| **Ngày tạo** | 2026-05-04 |

---

## Tóm Tắt Yêu Cầu Cốt Lõi

```
Kế Toán Tâm An cần một hệ thống giúp:

1. QUẢN LÝ NHÂN SỰ       → Theo dõi nhân viên kế toán, phân công phụ trách khách hàng
2. QUẢN LÝ KHÁCH HÀNG    → Hồ sơ doanh nghiệp được phục vụ, giấy tờ liên quan
3. QUẢN LÝ CÔNG VIỆC     → Giao việc, theo dõi tiến độ, nhắc nhở deadline
4. CÔNG VIỆC LẶP LẠI     → Tự động sinh việc định kỳ (tháng/quý/tuần)
5. BÁO CÁO & THỐNG KÊ   → Trực quan hóa đầu việc, hiệu suất nhân sự, tình trạng KH
6. CHẤM CÔNG NỘI BỘ      → Check-in/out, nghỉ phép, OT, bảng lương — cho nhân viên Tâm An
```

---

## Phạm Vi Tài Liệu

Bộ tài liệu này bao gồm:
- Phân tích nghiệp vụ (Business Analysis)
- Danh sách chức năng (Feature List)
- Luồng quy trình (Process Flow)
- Phương án hosting & chi phí vận hành
- Thiết kế cơ sở dữ liệu (Database Design)

| 17 | [017_DEPLOYMENT.md](./017_DEPLOYMENT.md) | Hướng dẫn triển khai lên VPS — build, backup DB, upload, deploy, rollback | ✅ Hoàn thành |
| 18 | [018_COLUMN_HEADER_FILTER.md](./018_COLUMN_HEADER_FILTER.md) | Cơ chế bộ lọc trên header cột kiểu Excel — state, helpers, dropdown, CSS | ✅ Hoàn thành |

**Chưa bao gồm** (sẽ bổ sung giai đoạn sau):
- UI/UX Wireframe chi tiết

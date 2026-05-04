# 01 — Tổng Quan Dự Án

## 1. Giới Thiệu Khách Hàng

**Kế Toán Tâm An** là công ty cung cấp dịch vụ kế toán thuê ngoài (outsourced accounting) cho các doanh nghiệp vừa và nhỏ. Mô hình hoạt động: một nhóm nhân viên kế toán nội bộ phục vụ đồng thời nhiều công ty khách hàng, mỗi nhân viên phụ trách một nhóm công ty được phân công.

---

## 2. Bối Cảnh Nghiệp Vụ

### 2.1 Cấu Trúc Tổ Chức

```
Quản Lý (Manager)
    │
    ├─── Nhân Sự 1 ──► Công ty KH A, Công ty KH B, Công ty KH C
    ├─── Nhân Sự 2 ──► Công ty KH D, Công ty KH E
    └─── Nhân Sự N ──► Công ty KH ...
```

- **Quản lý** nắm toàn bộ danh sách khách hàng, quy trình, nhân sự.
- **Nhân viên** phụ trách một nhóm công ty cố định, thực hiện các công việc kế toán định kỳ cho từng công ty đó.
- Một khách hàng (doanh nghiệp) chỉ có **một nhân viên phụ trách chính** nhưng có thể được hỗ trợ bởi người khác.

### 2.2 Đặc Thù Nghiệp Vụ Kế Toán

Công việc kế toán có tính chất **lặp đi lặp lại theo chu kỳ** cố định:

| Loại công việc | Chu kỳ | Ví dụ điển hình |
|----------------|--------|-----------------|
| **Định kỳ theo quý** | Mỗi 3 tháng | Nộp báo cáo tài chính quý, quyết toán thuế GTGT quý |
| **Định kỳ theo tháng** | Mỗi tháng | Kê khai thuế GTGT, thuế TNCN, lập bảng lương |
| **Định kỳ theo tuần** | Mỗi tuần | Đối soát chứng từ, kiểm tra công nợ |
| **Thường xuyên** | Liên tục | Nhập liệu hóa đơn, kiểm tra giao dịch ngân hàng |
| **Không thường xuyên** | Phát sinh | Quyết toán năm, kiểm toán, thay đổi đăng ký kinh doanh |

> **Hệ quả thiết kế:** Hệ thống phải hỗ trợ **mẫu công việc định kỳ (task template)** để tự động sinh ra đầu việc theo lịch, tránh nhập liệu thủ công lặp lại.

---

## 3. Vấn Đề Hiện Tại (Pain Points)

| # | Vấn đề | Hệ quả |
|---|--------|--------|
| 1 | Theo dõi công việc qua Excel/Zalo | Dễ sót việc, khó kiểm soát tiến độ |
| 2 | Không có dashboard tổng quan | Quản lý không biết ai đang làm gì, công ty nào đang chậm |
| 3 | Công việc định kỳ phải nhớ tay | Rủi ro bỏ sót deadline nộp thuế → phạt khách hàng |
| 4 | Không lưu trữ tập trung giấy tờ | Tìm kiếm hồ sơ mất thời gian |
| 5 | Thiếu báo cáo hiệu suất | Không đánh giá được năng lực nhân sự theo dữ liệu |

---

## 4. Mục Tiêu Dự Án

### 4.1 Mục Tiêu Chính
1. **Tối ưu quy trình quản lý công việc** — Từ giao việc → thực hiện → hoàn thành được số hóa, minh bạch.
2. **Trực quan hóa đầu việc** — Quản lý nhìn thấy ngay tổng quan tiến độ toàn bộ công việc theo nhân sự và theo khách hàng.
3. **Tự động hóa công việc lặp lại** — Hệ thống tự sinh việc định kỳ, gửi nhắc nhở deadline.
4. **Báo cáo & thống kê** — Dữ liệu phục vụ ra quyết định quản lý.

### 4.2 Tiêu Chí Thành Công
- Giảm thời gian giao/nhận việc xuống dưới 5 phút/lần.
- 0% công việc định kỳ bị bỏ sót do quên.
- Quản lý có thể xem tình trạng toàn bộ công việc trong vòng 30 giây.
- Nhân viên biết rõ việc cần làm trong ngày/tuần/tháng.

---

## 5. Phạm Vi Hệ Thống

### Trong phạm vi (In Scope)
- Quản lý danh sách khách hàng (doanh nghiệp được phục vụ)
- Quản lý nhân sự nội bộ và phân công phụ trách
- Quản lý công việc: tạo, giao, theo dõi, hoàn thành
- Template công việc định kỳ (tháng/quý/tuần)
- Dashboard tổng quan cho quản lý
- Thống kê báo cáo cơ bản
- Lưu trữ và quản lý giấy tờ, tài liệu theo khách hàng

### Ngoài phạm vi (Out of Scope)
- Phần mềm kế toán (hạch toán, sổ sách) — Tâm An vẫn dùng phần mềm kế toán riêng
- Kết nối với cơ quan thuế / cổng dịch vụ công
- App mobile (có thể bổ sung giai đoạn sau)
- Tính năng chat nội bộ

---

## 6. Đối Tượng Sử Dụng

| Vai trò | Mô tả | Quyền chính |
|---------|-------|-------------|
| **Admin / Quản Lý** | Chủ công ty hoặc trưởng phòng | Toàn quyền: xem tất cả, giao việc, cấu hình hệ thống |
| **Nhân Viên Kế Toán** | Người thực hiện công việc | Xem và cập nhật công việc được giao; xem hồ sơ KH mình phụ trách |
| *(Tương lai)* **Khách Hàng** | Doanh nghiệp được phục vụ | Portal xem tiến độ công việc của mình |

---

## 7. Công Nghệ Đề Xuất (Gợi Ý)

> Phần này mang tính gợi ý, cần xác nhận với đội kỹ thuật.

| Thành phần | Công nghệ gợi ý | Lý do |
|------------|-----------------|-------|
| Frontend | Next.js / React | SPA hiệu suất cao, dễ build dashboard |
| Backend | Node.js (NestJS) hoặc Python (FastAPI) | Phổ biến, dễ tích hợp |
| Database | PostgreSQL | Dữ liệu quan hệ phức tạp (task, user, company) |
| Storage | Microsoft OneDrive (Graph API) | KH đang dùng Microsoft 365 — không cần thuê thêm storage server |
| File Metadata | PostgreSQL (cùng DB chính) | Lưu tên file, onedrive_item_id, web_url, category |
| Job Scheduler | Node-cron hoặc Bull Queue | Tự động sinh task định kỳ theo lịch Customer Task Schedule |
| Hosting | VPS hoặc cloud (Vercel + Railway) | Chi phí hợp lý cho SME |

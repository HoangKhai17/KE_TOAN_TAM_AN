# 026 — Hướng dẫn thiết lập & sử dụng KPI (checklist có điểm → KPI → xếp loại)

> Áp dụng cho bản cập nhật KPI v2 (Phase A→D). Kế hoạch kỹ thuật: [025_KPI_PLAN.md](025_KPI_PLAN.md).
> Ngày lập: 2026-09-29.

Sắp theo thứ tự nên làm: **Thiết lập (A)** → **Dùng hằng ngày (B)** → **Báo cáo (C)** → **KPI cuối tháng (D)**.

---

## A. THIẾT LẬP BAN ĐẦU (Admin — làm 1 lần)

> Không thiết lập thì hệ thống vẫn chạy, nhưng điểm sẽ **đồng đều** (mọi bước 4đ) và KPI/báo cáo chưa
> phản ánh đúng độ khó. Làm 4 bước:

### A1. Đặt độ khó/điểm cho checklist mẫu — **Cài đặt → Loại công việc**
1. Bấm mũi tên **bung 1 loại công việc**.
2. Ở phần **Checklist**, mỗi bước có: nút **★** · dropdown **độ khó** (Dễ/Trung bình/Khó) · ô **điểm**.
3. Đổi độ khó → **điểm tự gợi ý** (Dễ=2 / TB=4 / Khó=6), vẫn sửa tay được.
4. Bấm **★** cho các **bước then chốt** của quy trình (hiện mặc định ở báo cáo).

Đây là "bản mẫu" — lịch định kỳ copy xuống.

### A2. Checklist riêng + điểm cho từng công ty — **Khách hàng → [1 công ty] → tab Lịch định kỳ**
1. Thêm/Sửa một **lịch định kỳ**.
2. Kéo xuống phần **"Checklist của lịch"** — checklist **riêng của công ty đó** (đã copy từ mẫu).
3. Có thể: **thêm/sửa/xoá bước**, đổi **độ khó/điểm/★**, **lên–xuống** đổi thứ tự, thụt mục con, hoặc
   **"Khôi phục về mẫu"**.
4. Xem **Tổng điểm** của lịch ở tiêu đề — thêm việc → điểm tăng.

Công ty làm nhiều/khó hơn → checklist nhiều điểm hơn → khối lượng cao hơn.

### A3. Xếp loại & mốc điểm — **Điểm thưởng → tab "Quy đổi xếp loại"**
- **Bảng xếp loại** (trên): dải **Tổng điểm** → mã (E→S) → **tiền** thưởng/phạt.
- **Bảng "Mốc: % đúng hạn → điểm"** (dưới, mới): vd **≥90%: +10**, 80–89%: +5, <50%: −10 — quy
  **% đúng hạn** thành điểm để cộng vào xếp loại.

### A4. (Tùy chọn) Đổi nhãn — **Cài đặt → Danh mục hệ thống**
- Mục **"Độ khó checklist"** và **"Cỡ việc"** — sửa nhãn / thêm mức.

---

## B. SỬ DỤNG HẰNG NGÀY (Admin + Nhân viên)

- **Tạo công việc**: có ô **Cỡ việc** ("Theo loại" hoặc Nhỏ/Vừa/Lớn). **SLA đã ẩn** — tự theo loại CV.
- **Task định kỳ**: mỗi kỳ tự sinh, **mang sẵn checklist + điểm + ★** của lịch công ty.
- **Tick checklist**: mỗi bước hiện **điểm** + **★**; **% tiến độ** của task định kỳ tính **theo điểm**
  (bước khó nặng hơn), có nhãn **"theo điểm"**. Task thường vẫn đếm số bước như cũ.

---

## C. BÁO CÁO — **BC Tiến độ CV**
- Toggle **"Chỉ bước ★"** (bật mặc định): chỉ hiện **bước quan trọng**. Tắt để xem tất cả bước.
- Quy trình chưa đánh ★ bước nào → tự hiện tất cả (không để trống).

---

## D. KPI CUỐI THÁNG — **Điểm thưởng → tab "KPI"** (tab đầu tiên)

Chọn **Tháng/Năm** ở góc phải. 2 sub-tab:

### D1. Tiến độ
- **Điểm khối lượng** = tổng điểm các bước checklist NV **đã tick trong tháng**.
- **Đúng hạn** = task xong đúng hạn / được giao.
- Bấm 1 dòng NV → **chi tiết theo công ty / loại công việc**.

### D2. Xếp loại & thưởng
- Đúng hạn % → **Điểm KPI** (mốc A3) **+** Thưởng/phạt → **Tổng điểm** → **Xếp loại** → **Tiền**.

### D3. Chốt sổ tháng (admin)
- **Chốt sổ** → **khóa** số liệu tháng đó; đổi điểm/checklist về sau không ảnh hưởng tháng đã chốt.
- Cần sửa → **Mở lại sổ**.

---

## ⚠️ Lưu ý quan trọng
1. **Số liệu cũ**: task hoàn thành **trước khi có điểm** → điểm khối lượng = 0. KPI **tích lũy dần** khi
   task mới (đã có điểm) hoàn thành. **Đúng hạn %** có ngay (dựa trên hạn).
2. **Muốn KPI có ý nghĩa** → phải làm **A1 + A2**. Chưa đặt thì mọi bước 4đ (đồng đều).
3. **Chưa làm (chờ nghiệp vụ)**: tiền xếp loại **chưa tự vào Bảng lương** — cần chốt cách ráp rồi bật
   `payroll.applyRewardPenalty`.

---

## Vị trí nhanh
| Việc | Đường dẫn |
|---|---|
| Độ khó/điểm bước mẫu | Cài đặt → Loại công việc → bung loại |
| Checklist + điểm theo công ty | Khách hàng → công ty → Lịch định kỳ |
| Xếp loại + mốc % đúng hạn | Điểm thưởng → Quy đổi xếp loại |
| Tick việc, xem % theo điểm | Công việc → mở task → Checklist |
| Báo cáo bước ★ | BC Tiến độ CV → "Chỉ bước ★" |
| KPI + chốt sổ | Điểm thưởng → tab KPI |

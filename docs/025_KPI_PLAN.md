# 025 — Build Plan: KPI theo ĐIỂM CHECKLIST (bản v2 — đổi hướng)

> Trạng thái: **KẾ HOẠCH (v2) — chưa code phần mới.** Đọc để chốt hướng rồi mới triển khai.
> Cập nhật: 2026-09-29. Liên quan: `reward_penalty_module`, `salary_config_module`,
> `recurring_schedule_enhancements` (memory).
>
> **v1 → v2 (đổi hướng theo yêu cầu khách):** BỎ mô hình "cỡ việc ở LOẠI công việc" (Nhỏ/Vừa/Lớn
> gắn task). Thay bằng **ĐIỂM cho từng CHECKLIST item**, cấu hình **riêng theo Lịch định kỳ của từng
> công ty**. Tổng điểm checklist = khối lượng công việc của công ty (thêm checklist → tăng điểm, bớt
> → giảm). Đây là thước đo khối lượng công bằng, sát thực tế công ty kế toán (mỗi khách một lượng
> việc khác nhau).

---

## 1. Bối cảnh & vì sao đổi hướng

Công ty kế toán: mỗi **khách hàng** có bộ công việc thường xuyên (định kỳ) **khác nhau** — số lượng
checklist khác nhau, độ khó khác nhau. Mô hình v1 ("cỡ việc" gắn ở loại CV) không phản ánh được sự
khác biệt theo từng công ty. 

**Insight khách:** đo khối lượng/độ khó ở **mức checklist item**, cấu hình theo **lịch định kỳ của
từng công ty**. Vì lịch định kỳ ổn định (cấu hình 1 lần/công ty), việc đặt điểm per-checklist **không
còn rối/chủ quan** như khi gắn tay từng task lẻ. Task định kỳ sinh ra **tự kế thừa** điểm từ lịch.

**Ví dụ (theo ảnh khách gửi):**

| Checklist | Mức độ | Điểm |
|---|---|---|
| Kiểm tra HĐ đầu vào | Dễ | 2 |
| Nhập HĐ đầu vào | Dễ | 2 |
| Kiểm tra HĐ đầu ra | Trung bình | 3 |
| Nhập HĐ đầu ra | Dễ | 2 |
| Đối chiếu ngân hàng | Trung bình | 4 |
| Đối chiếu công nợ | Khó | 6 |
| Kiểm tra chi phí | Trung bình | 4 |
| Kiểm tra số dư cuối kỳ | Khó | 5 |

→ Điểm **không cố định cứng** theo mức độ (Trung bình có cả 3 và 4; Khó có cả 5 và 6). Suy ra: **điểm
nhập tay**, còn *mức độ* là **nhãn gợi ý** (có thể set điểm mặc định theo mức, cho sửa).

---

## 2. Nguyên tắc chốt

1. **Điểm gắn với CHECKLIST (công việc), không gắn NGƯỜI** — giữ nguyên tắc "đo theo việc". Người làm
   nhanh/đúng hạn thể hiện ở chỉ số khác (đúng hạn/tốc độ), không nhét vào điểm.
2. **Điểm cấu hình ở LỊCH ĐỊNH KỲ (per công ty)**, seed từ template loại CV rồi **sửa tự do**. Cấu
   hình 1 lần, ổn định.
3. **2 hệ tiến độ song song:**
   - Task **thường** (không từ lịch): % = số item xong / tổng item (GIỮ NGUYÊN hiện tại).
   - Task **từ lịch định kỳ**: % = **Σ điểm(item xong) / Σ điểm(tất cả item)** (có trọng số).
4. **Ổn định lịch sử = CHỐT SỔ THÁNG** (đã chốt v1): tick checklist → tự cộng điểm vào kết quả tháng;
   khi chốt sổ, snapshot số của tháng. Đổi điểm về sau chỉ ảnh hưởng tháng chưa chốt.
5. **Không hardcode enum** — mức độ khó dùng enum động `checklist_difficulty`.

---

## 3. Quyết định (ĐỀ XUẤT — cần bạn chốt)

| # | Vấn đề | Đề xuất |
|---|---|---|
| 1 | Điểm mỗi checklist tính sao? | **Nhập tay**; mức độ (Dễ/TB/Khó) là nhãn + set điểm **mặc định gợi ý** (vd 2/4/6), cho sửa số |
| 2 | "Cỡ việc ở loại CV" (v1 đã làm) | **Ngưng dùng cho KPI**; giữ tạm code (không hại) hoặc gỡ khi dọn. Enum độ khó chuyển xuống mức checklist |
| 3 | Checklist của lịch định kỳ | **Bảng riêng** `schedule_checklist_items` — copy từ template khi tạo lịch, rồi sửa tự do. Template mẫu giữ nguyên để tái dùng |
| 4 | Task định kỳ đã sinh trước đây | Chỉ áp cho task **sinh mới**; cung cấp nút "đồng bộ lại" checklist/điểm cho task cũ đang mở (tùy chọn) |
| 5 | "Bảng kết quả tự tính" là gì | Chính là **module KPI tháng** (Phase C) — tick checklist → auto cộng điểm vào kết quả |
| 6 | Task thường (ad-hoc) | **Giữ đếm-item** như cũ, không điểm |

---

## 4. Kiến trúc & Data model

### 4.1 Enum động
- `checklist_difficulty`: `de` (Dễ), `trung_binh` (Trung bình), `kho` (Khó). Kèm **điểm mặc định gợi
  ý** (map ở code hoặc thêm cột — xem [4.5]). Đọc qua `lib/enums` / `useEnumsStore`.

### 4.2 Template checklist (tái dùng) — `task_type_checklist_templates`
Thêm cột: `difficulty` (enum), `points SMALLINT`, `is_important BOOLEAN` (đánh dấu \*). Đây là **giá
trị GỢI Ý mặc định** để lịch copy xuống.

### 4.3 Checklist của Lịch định kỳ — BẢNG MỚI `schedule_checklist_items`
```
id, schedule_id FK customer_task_schedules(id) ON DELETE CASCADE,
step_order, step_text, level (0/1),
difficulty (enum), points SMALLINT NOT NULL DEFAULT 0,
is_important BOOLEAN DEFAULT FALSE,
source_template_step_id UUID NULL,   -- vết template gốc (để đối chiếu), NULL = item tự thêm
created_at
```
- Khi **tạo lịch**: copy toàn bộ checklist của loại CV → bảng này (kèm difficulty/points/important).
- Sau đó admin **sửa tự do** cho công ty đó: thêm/bớt/sửa text, đổi độ khó/điểm, gắn \*.
- Thay thế cơ chế `excluded_step_ids` cũ (ẩn/hiện) bằng edit đầy đủ. `excluded_step_ids` giữ lại cho
  tương thích ngược (lịch cũ) hoặc migrate sang bảng mới.

### 4.4 Task sinh ra — `task_checklist_items`
Thêm cột: `points SMALLINT DEFAULT 0`, `is_important BOOLEAN DEFAULT FALSE`.
- Task **từ lịch**: generator copy từ `schedule_checklist_items` (kèm points/important).
- Task **thường**: points = 0 (không dùng), tiến độ đếm item như cũ.

### 4.5 Cần chốt kỹ thuật nhỏ
- Điểm mặc định theo độ khó để ở **map code** (dễ đổi) hay **cột trong enum_options**? *(enum_options
  chỉ có key/label/sort_order — nếu muốn lưu điểm mặc định trong DB phải thêm cột, hoặc map ở code.)*
  → Đề xuất: **map code** cho điểm-gợi-ý, vì điểm cuối cùng là nhập tay ở checklist.

---

> ✅ **B1 XONG (2026-09-29)** — BE tính % theo điểm. `tasks.service.js`: 2 LATERAL checklist cộng
> `checklist_points_total/done`; DTO trả `checklistPointsTotal/Done`; cột `progress` rẽ nhánh
> (Σđiểm>0 → theo điểm, else đếm bước). Smoke: điểm đồng đều → bằng đếm bước; điểm khác nhau (2 dễ
> xong, 1 khó chưa) → theo bước 25% vs theo điểm 12% (đúng). FE vẫn hiện theo bước tới B2.
>
> ✅ **B2 XONG (2026-09-29)** — FE hiển thị % theo điểm. `taskUtils.js`: `progressPct` +
> `checklistLeafCounts` rẽ nhánh theo điểm (trả thêm weighted/pointsTotal/pointsDone). Danh sách +
> board tự đổi qua `progressPct`. TaskDetail (thanh panel + thanh header qua onCountChange truyền pct)
> và QuickView: % theo điểm + text "X/Yđ (pct%) · theo điểm" khi có trọng số. Build FE pass.
>
> ✅ **B3 + B4 XONG (2026-09-29)** — mỗi dòng checklist trong TaskDetail + QuickView hiện **★** (nếu
> quan trọng) + **badge điểm** (nếu points>0). Nhãn phân biệt "theo điểm" (B4) đã gộp ở B2. Build FE
> pass.
>
> ✅ **B5 XONG (2026-09-29)** — Ma trận tiến độ lọc theo bước ★. BE `progress-matrix.service.getMatrix`:
> đọc `is_important` của template, thêm param `importantOnly` (mặc định true) → **mặc định chỉ hiện
> cột bước ★**; nếu quy trình chưa có ★ nào thì fallback hiện tất cả (không rỗng, cờ
> `importantFilterApplied`). Controller/export nhận param. FE `ProgressMatrix.jsx`: toggle **"Chỉ bước
> ★"** (mặc định bật). Smoke: false→15 cột, true(chưa ★)→15 (fallback), true(★2 bước)→2 cột. Build FE
> pass.
>
> **➡ PHASE B HOÀN TẤT (B1–B5).** % theo điểm + hiển thị điểm/★ + báo cáo lọc ★ đã xong.
> Follow-up (nhỏ): báo cáo dùng `is_important` của TEMPLATE (bước then chốt của quy trình); text/bước
> tự-thêm-riêng của lịch vẫn theo cơ chế cũ (badge "bước riêng"). Kế tiếp: **Phase C** (KPI tháng + chốt sổ).

## 5. Hai hệ tính tiến độ

- Xác định hệ: `task.customer_task_schedule_id IS NOT NULL` **và** task có item `points > 0` → dùng
  **hệ điểm**; ngược lại → **hệ đếm item** (hiện tại).
- Hệ điểm: `pct = round(100 * Σ points(item leaf đã xong) / NULLIF(Σ points(item leaf), 0))`.
- Sửa nơi tính: FE `checklistLeafCounts` (`TaskDetail.jsx`) + BE `TASK_COLUMNS_SQL.progress`
  (`tasks.service.js`) — thêm nhánh weighted khi task thuộc lịch.
- Hiển thị: badge/nhãn cho biết task đang đo theo **điểm** hay theo **item** (tránh nhầm).

---

## 6. Báo cáo tiến độ công việc

- Hiện đang hiển thị **cha–con**. Thêm chế độ **theo checklist**:
  - Mặc định chỉ hiện các checklist đánh dấu **\*** (quan trọng).
  - Các checklist còn lại: **optional** (bật thêm khi cần).
- Áp cho báo cáo tiến độ + (tùy) danh sách task.

---

## 7. Bảng kết quả KPI tháng (auto từ checklist) — Phase C

- **Tick checklist → tự cộng điểm** vào kết quả tháng (thay vì nhập tay). "Liên kết đến table chỉnh
  ra kết quả".
- Mỗi NV / mỗi công ty, theo tháng:
  - **Điểm khối lượng** = Σ điểm checklist đã hoàn thành (theo `completed_at` trong tháng).
  - **Đúng hạn %** = task xong đúng hạn / được giao (theo `due_date` trong tháng).
  - **Theo công ty / loại CV** = gom nhóm.
- **Chốt sổ tháng** → snapshot số, khóa lịch sử.

---

## 8. Hiệu suất nhân viên (kết quả cuối) — Phase D

Tổng hợp nhiều tham số → 1 kết quả:
- **Vi phạm nội quy** (module hiện có / cần bổ sung).
- **Tiến độ công việc** (điểm checklist, đúng hạn — từ Phase C).
- **Lương / thưởng phạt** (Điểm thưởng E→S + Bảng lương).
→ Gắn với `reward_penalty_module` + `salary_config_module` (giai đoạn ráp cuối).

---

## 9. Lộ trình đề xuất

**Tiến độ:** ✅ **A1 XONG (2026-09-29)** — migration `154` (enum `checklist_difficulty` de/trung_binh/kho
+ cột `difficulty/points/is_important` cho `task_type_checklist_templates`); BE `task-types.service`
(DTO + add/update bước nhận độ khó/điểm/★, tự điền điểm mặc định Dễ=2/TB=4/Khó=6, validate enum);
FE `utils/checklistDifficulty.js` + editor checklist ở Settings loại CV (dropdown độ khó · ô điểm ·
nút ★, commit điểm on-blur). Smoke đạt.
>
> ✅ **A2 XONG (2026-09-29)** — migration `155` (bảng `schedule_checklist_items` + **backfill 123/123
> lịch cũ** từ template−excluded, mang theo độ khó/điểm/★). BE `schedules.service` (seed khi tạo lịch;
> CRUD list/add/update/delete/reorder/reset; `getScheduleById` trả kèm `checklist`) + controller +
> router `GET/POST/PATCH/DELETE /schedules/:id/checklist…` + schema. Smoke đạt (backfill 17 bước,
> thêm Khó→6đ+★, xóa OK).
>
> ✅ **A3 XONG (2026-09-29)** — BE thêm `PUT /schedules/:id/checklist` (ghi đè toàn bộ) + service
> `replaceScheduleChecklist`. FE: `api/schedules` (getScheduleChecklist, replaceScheduleChecklist);
> **làm lại màn cấu hình Lịch** ([SchedulesTab.jsx](../frontend/src/pages/Companies/SchedulesTab.jsx)) —
> gỡ khối "tick chọn bước" (excludedStepIds), thay bằng **editor checklist đầy đủ**: thêm/sửa/xoá,
> lên/xuống, thụt mục con, độ khó (tự gợi ý điểm), điểm tay, ★ quan trọng, "Khôi phục về mẫu", tổng
> điểm. Tạo lịch → seed mặc định rồi ghi đè theo bản sửa; sửa lịch → nạp checklist của lịch. Smoke
> replace/restore đạt, build FE pass.
>
> ✅ **A4 XONG (2026-09-29)** — migration `156` (cột `points` + `is_important` cho `task_checklist_items`,
> mặc định 0/false). Generator ([taskGenerator.job.js](../backend/src/jobs/taskGenerator.job.js)) đổi
> nguồn copy checklist cha **từ `schedule_checklist_items`** (mang điểm/★; bỏ đọc `excluded_step_ids`,
> hierarchy theo `level`). `createTask` (task tay từ loại) copy điểm/★ từ template. Checklist DTO
> ([checklist.service.js](../backend/src/modules/tasks/checklist.service.js)) trả `points/isImportant`.
> Smoke: sinh task định kỳ → checklist có điểm, tổng 68đ (17 bước). **% vẫn đếm-item (đổi cách tính =
> Phase B).** · A5 chờ.

```
Phase A — Checklist có điểm ở Template + Lịch định kỳ (nền tảng data + cấu hình)
   → nghiệm thu
Phase B — Hai hệ tiến độ + hiển thị + báo cáo theo checklist *
   → nghiệm thu
Phase C — Bảng kết quả KPI tháng (auto từ checklist) + chốt sổ tháng
   → nghiệm thu
Phase D — Hiệu suất NV cuối (ráp vi phạm + tiến độ + lương/thưởng)
```

**Phần v1 đã làm (giữ/đổi vai):**
- Enum `task_size` + cột `size_points` (task/loại) + UI cỡ việc (Settings/Tạo/QuickView/cột/bộ lọc):
  **ngưng dùng cho KPI**. Giữ tạm (không hại) hoặc gỡ ở bước dọn dẹp — xem [3.#2].
- Bài học migration đặt default → dữ liệu cũ đồng loạt 1 giá trị: áp dụng tương tự khi thêm
  points/difficulty (default an toàn, không phá dữ liệu).

---

## 10. Cần chốt trước khi vào Phase A

1–6 ở [mục 3]. Ngoài ra:
- **7.** Ai được sửa checklist/điểm của lịch định kỳ? *(đề xuất: admin — như cấu hình lịch hiện tại.)*
- **8.** Báo cáo "checklist \*": áp cho báo cáo tiến độ hiện có hay là màn mới? *(đề xuất: bổ sung chế
  độ vào báo cáo hiện có.)*
- **9.** Vi phạm nội quy (Phase D) đã có dữ liệu/module chưa, hay cần thiết kế mới?

---

## 11. Rủi ro & lưu ý

- **2 hệ tiến độ dễ gây nhầm** → luôn ghi rõ task đang đo theo điểm hay theo item.
- **Bảng riêng cho checklist lịch** = thay đổi cấu trúc lớn; cần migrate cẩn thận từ `excluded_step_ids`
  (giữ tương thích ngược cho lịch cũ).
- **Điểm nhập tay** → có thể "vẽ số"; giảm rủi ro bằng: điểm ở **lịch (per công ty, admin đặt)** +
  mức độ gợi ý + audit khi sửa.
- **Ổn định KPI** dựa vào **chốt sổ tháng**, không đóng dấu điểm vào task.
- **Enum động + timezone VN** theo chuẩn dự án.

---

## Tham khảo (v1)
- Story Points — Atlassian: https://www.atlassian.com/agile/project-management/estimation
- 9 Bad Practices for Story Points — Agile Insider: https://medium.com/agileinsider/9-bad-practices-for-using-story-points-ae210ad1d06c

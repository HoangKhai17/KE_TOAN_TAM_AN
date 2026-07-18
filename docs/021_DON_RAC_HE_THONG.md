# 021 — Dọn Rác Hệ Thống (Data Retention & Cleanup)

> **Trạng thái**: 📝 Đề xuất — chưa triển khai. Sẽ setup sau khi hoàn thiện các tính năng đang làm.
> **Ngày khảo sát**: 2026-07-18 · **Dữ liệu khảo sát**: production restore (7 người dùng, 38 khách hàng)

---

## 1. Bối cảnh

Hệ thống chạy càng lâu, dữ liệu càng tích tụ. Tài liệu này xác định **cái gì thực sự phình**, **cái gì được giữ**, và **cách dọn an toàn**.

**Kết luận khảo sát**: dữ liệu *nghiệp vụ* tăng rất chậm và không phải vấn đề. Cái phình là các **bảng vận hành không có cơ chế dọn**.

---

## 2. Chẩn đoán (số liệu thật, 2026-07-18)

| Bảng | Số dòng | Dung lượng | Bản chất | Có dọn tự động? |
|---|---:|---:|---|---|
| **refresh_tokens** | **3.169** | 1.408 kB | Rác đăng nhập (73% đã hết hạn) | ❌ Không |
| **audit_logs** | 1.347 | 984 kB | Log kiểm toán, tăng vĩnh viễn | ❌ Không |
| **notifications** | 416 | 352 kB | Thông báo, chỉ xoá tay từng cái | ❌ Không |
| **task_activity_logs** | 613 | 248 kB | Log hoạt động task, tăng vĩnh viễn | ❌ Không |
| scheduler_run_logs | 21 | 96 kB | Log chạy cron | ❌ Không |
| tasks | 124 | 312 kB | **Nghiệp vụ — phải giữ** | — |
| companies | 38 | 232 kB | **Nghiệp vụ — phải giữ** | — |
| company_table_rows | 325 | 216 kB | **Nghiệp vụ — phải giữ** | — |

### Điểm nóng: `refresh_tokens`

```
Tổng:         3.169 dòng   (chỉ 7 người dùng → ~450 token/người)
Đã hết hạn:   2.313 (73%)  ← rác thuần túy
Còn hiệu lực:   856
Token cũ nhất: 2026-07-01  → tích trong ~17 ngày
```

**Tốc độ tích**: ~186 dòng/ngày → **~68.000 dòng/năm** với 7 người dùng.
Quy mô 30 nhân viên → **~290.000 dòng/năm**, gần như toàn bộ là token đã hết hạn.

### Hiện trạng cơ chế dọn

Đã rà toàn bộ `backend/src` — **chưa có bất kỳ job dọn dẹp nào** cho `refresh_tokens`, `audit_logs`, `task_activity_logs`, `notifications`.
Chỉ **file backup** có retention (giữ 10 bản gần nhất — `backup.service.js`, `DEFAULTS.retention = 10`).

---

## 3. Mức độ nghiêm trọng — nói thẳng

**Đây KHÔNG phải khủng hoảng.** Toàn bộ DB hiện ~5 MB; PostgreSQL xử lý hàng triệu dòng vẫn bình thường. Không có nguy cơ sập hay chậm ngay.

**Tác hại thật khi để lâu không dọn:**
1. File backup phình dần (backup **hằng ngày × giữ 10 bản** → rác được nhân lên 10 lần).
2. `pg_dump` / restore chậm dần (ảnh hưởng quy trình deploy & khôi phục).
3. Truy vấn xác thực (`refresh_tokens`) phải quét qua ngày càng nhiều dòng chết.
4. Rác tích **vô hạn** — không tự dừng.

→ Xếp loại: **việc nên làm, không gấp**. Chi phí triển khai thấp, lợi ích lâu dài.

---

## 4. Phân loại dữ liệu

| Nhóm | Bảng | Nguyên tắc |
|---|---|---|
| 🗑️ **Rác thuần** | `refresh_tokens` (hết hạn/thu hồi) | Xoá thẳng, không cần lưu |
| 📋 **Log vận hành** | `task_activity_logs`, `scheduler_run_logs` | Giữ N tháng rồi xoá |
| ⚖️ **Log kiểm toán** | `audit_logs` | **Cần quyết định** — có thể phải giữ lâu vì pháp lý/đối soát → ưu tiên *archive* thay vì xoá |
| 🔔 **Thông báo** | `notifications` | Xoá cái **đã đọc** và đủ cũ |
| 💼 **Nghiệp vụ** | `tasks`, `companies`, `company_table_rows`, `client_document_requests`, chấm công, lương… | **KHÔNG xoá.** Tối ưu bằng index + phân trang |

---

## 5. Đề xuất triển khai

### ① `refresh_tokens` — Ưu tiên cao nhất

Xoá token đã hết hạn hoặc đã thu hồi quá **7 ngày**:

```sql
DELETE FROM refresh_tokens
WHERE (expires_at < NOW() - INTERVAL '7 days')
   OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days');
```

- **Rủi ro**: ~0 — token hết hạn không còn giá trị sử dụng.
- **Hiệu quả tức thì**: cắt ~73% bảng lớn nhất.
- **Tần suất**: hằng ngày.

### ② `task_activity_logs` — giữ 12–24 tháng

```sql
DELETE FROM task_activity_logs
WHERE created_at < NOW() - INTERVAL '18 months';
```

### ③ `notifications` — xoá cái đã đọc, đủ cũ

```sql
DELETE FROM notifications
WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '90 days';
```

> Chỉ xoá `is_read = TRUE`. Thông báo **chưa đọc** giữ lại dù cũ.

### ④ `scheduler_run_logs` — giữ 3–6 tháng

```sql
DELETE FROM scheduler_run_logs
WHERE created_at < NOW() - INTERVAL '6 months';
```

### ⑤ `audit_logs` — ⚠️ cần quyết định trước khi làm

Hai phương án:

| Phương án | Cách làm | Ưu / Nhược |
|---|---|---|
| **A. Archive rồi xoá** (khuyến nghị) | Xuất log cũ hơn N tháng ra file `.csv.gz` lưu cùng backup → rồi xoá khỏi DB | Giữ được bằng chứng kiểm toán, DB vẫn gọn. Phức tạp hơn chút |
| **B. Xoá thẳng** | `DELETE ... WHERE created_at < NOW() - INTERVAL '24 months'` | Đơn giản. **Mất vĩnh viễn** dấu vết kiểm toán |

**Không tự ý xoá `audit_logs`** khi chưa xác nhận yêu cầu lưu trữ của Tâm An.

---

## 6. Cách triển khai (khi setup)

Theo đúng quy ước jobs sẵn có (`node-cron`, giờ VN → UTC):

**Bước 1** — Tạo `backend/src/jobs/cleanup.job.js`, export `runCleanup()`:
- Chạy lần lượt các câu `DELETE` ở mục 5 (theo cấu hình bật/tắt từng nhóm).
- Ghi log số dòng đã xoá mỗi bảng (`logger.info`).
- Bọc `try/catch` từng bảng — một bảng lỗi không chặn các bảng còn lại.

**Bước 2** — Đăng ký trong `backend/src/jobs/index.js`:
- Import `runCleanup`, tạo `cron.schedule` với `vnTimeToUtcCron()` — đề xuất **03:00 giờ VN** (sau backup 02:00, tránh giờ làm việc).

**Bước 3** — Cấu hình thời gian lưu trong `system_configs` (giống `backup_retention`) để chỉnh được từ Cài đặt mà không cần deploy:
```
cleanup_enabled              = true
cleanup_refresh_token_days   = 7
cleanup_activity_log_months  = 18
cleanup_notification_days    = 90
cleanup_scheduler_log_months = 6
cleanup_audit_log_months     = (chốt sau)
```

**Bước 4** — Chạy `VACUUM ANALYZE` sau đợt xoá lớn đầu tiên để trả lại dung lượng đĩa:
```sql
VACUUM ANALYZE refresh_tokens;
```
(Các lần sau autovacuum của PostgreSQL tự lo.)

**Bước 5** — Kiểm chứng: chạy thủ công 1 lần trên môi trường local (đã có bản restore), đối chiếu số dòng trước/sau, xác nhận đăng nhập vẫn bình thường.

---

## 7. ⚠️ Vấn đề sẽ "cảm thấy" TRƯỚC cả chuyện phình DB

Đây là điểm quan trọng cần ghi nhớ: **giao diện sẽ chậm trước khi DB kịp phình.**

Nhiều trang đang tải **"working set" lớn rồi lọc/sắp/phân trang phía client**:

| Trang | Hiện tại |
|---|---|
| Công việc (`Tasks.jsx`) | `limit: 500` |
| Yêu cầu KH (`AdminClientRequests.jsx`) | `limit: 500` |

Hiện dữ liệu ít nên mượt. Khi công việc lên vài nghìn dòng, trang sẽ **tải nặng và chậm** — dù DB vẫn "nhỏ".

**Hướng xử lý (việc lớn hơn, làm khi thật sự thấy chậm):** chuyển sang **phân trang + lọc + sắp xếp phía server**, thay vì tải 500 dòng rồi xử lý ở trình duyệt.

> Ghi chú: dọn rác ở mục 5 **không** giải quyết vấn đề này — đây là hai chuyện khác nhau.

---

## 8. Việc cần chốt trước khi triển khai

- [ ] **`audit_logs` giữ bao lâu?** Và chọn phương án A (archive) hay B (xoá thẳng)?
- [ ] **Thông báo đã đọc** giữ 60 hay 90 ngày?
- [ ] **`task_activity_logs`** giữ 12 hay 24 tháng?
- [ ] Xác nhận `refresh_tokens` xoá sau **7 ngày** hết hạn (đề xuất mặc định).

---

## 9. Tóm tắt

| Việc | Ưu tiên | Rủi ro | Hiệu quả |
|---|---|---|---|
| Dọn `refresh_tokens` | 🔴 Cao | Rất thấp | Cắt ngay ~73% bảng lớn nhất |
| Retention `notifications` | 🟡 Trung bình | Thấp | Vừa |
| Retention `task_activity_logs` | 🟡 Trung bình | Thấp | Vừa |
| Retention `scheduler_run_logs` | 🟢 Thấp | Rất thấp | Nhỏ |
| Xử lý `audit_logs` | 🟡 Trung bình | **Cần cân nhắc pháp lý** | Lớn (bảng lớn thứ 2) |
| Phân trang server-side | 🟠 Theo dõi | Trung bình | Lớn về trải nghiệm |

**Nguyên tắc xuyên suốt**: chỉ dọn **rác vận hành**, **không bao giờ** đụng dữ liệu nghiệp vụ.

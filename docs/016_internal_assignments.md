# 016 — Phiếu Giao Việc Nội Bộ (Internal Assignments)

> Phiên bản: 1.1 | Ngày tạo: 2026-05-24
> Mục tiêu: Quản lý luồng bàn giao công việc nội bộ giữa Admin → Staff, hoàn toàn tách biệt với module Tasks.
> Cập nhật v1.1: Admin được sửa nội dung khi đang active; Staff có thể từ chối phiếu.

---

## 1. Bối cảnh & Mục tiêu

### Vấn đề cần giải quyết

Hiện tại hệ thống có 2 luồng công việc:
1. **Yêu cầu khách hàng** (`client_document_requests`) — KH cung cấp tài liệu
2. **Task công việc** (`tasks`) — Nhân viên thực hiện công việc cho KH

Còn thiếu luồng thứ 3:
- **Admin có việc cần giao** → chọn nhân sự → nhân sự tiếp nhận (hoặc từ chối) → thực hiện → báo hoàn thành → admin đóng phiếu

### Phạm vi module này
- Tạo và quản lý phiếu giao việc nội bộ
- 1 phiếu có thể giao cho **nhiều nhân sự** cùng lúc (mỗi người status riêng)
- Staff có thể **từ chối** phiếu kèm lý do
- Admin được **sửa nội dung** cả khi phiếu đang active
- Có luồng **thảo luận / comment** trên phiếu
- **Không tích hợp với module Tasks** — 2 hệ thống song song, độc lập hoàn toàn
- `company_id` là tùy chọn — có thể là việc nội bộ công ty không gắn KH

---

## 2. Database Design

### 2.1 Enums mới

```sql
-- 052_create_internal_assignment_enums.sql

CREATE TYPE assignment_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TYPE assignment_status AS ENUM (
  'draft',       -- Admin tạo, chưa gửi
  'active',      -- Đã gửi, đang chờ / đang thực hiện
  'done',        -- Admin đóng phiếu
  'cancelled'    -- Admin hủy
);

CREATE TYPE assignee_status AS ENUM (
  'pending',      -- Được giao, chưa phản hồi
  'accepted',     -- Đã bấm Tiếp nhận
  'in_progress',  -- Đang thực hiện
  'done',         -- Đã báo hoàn thành
  'rejected'      -- Đã từ chối (kèm lý do)
);
```

### 2.2 Bảng chính

```sql
-- 053_create_internal_assignments.sql

CREATE TABLE internal_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(200) NOT NULL,
  description   TEXT,                   -- Nội dung yêu cầu chi tiết
  company_id    UUID REFERENCES companies(id) ON DELETE SET NULL,  -- nullable
  priority      assignment_priority NOT NULL DEFAULT 'normal',
  deadline_date DATE,
  status        assignment_status NOT NULL DEFAULT 'draft',
  created_by    UUID NOT NULL REFERENCES users(id),
  sent_at       TIMESTAMP,              -- Khi admin bấm "Gửi phiếu"
  closed_at     TIMESTAMP,              -- Khi admin đóng / hủy
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ia_created_by ON internal_assignments(created_by);
CREATE INDEX idx_ia_company    ON internal_assignments(company_id);
CREATE INDEX idx_ia_status     ON internal_assignments(status);
CREATE INDEX idx_ia_deadline   ON internal_assignments(deadline_date);
```

### 2.3 Bảng assignees (junction — per-person status)

```sql
CREATE TABLE internal_assignment_assignees (
  assignment_id UUID NOT NULL REFERENCES internal_assignments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        assignee_status NOT NULL DEFAULT 'pending',
  accepted_at   TIMESTAMP,    -- Khi staff bấm Tiếp nhận
  completed_at  TIMESTAMP,    -- Khi staff bấm Báo hoàn thành
  rejected_at   TIMESTAMP,    -- Khi staff bấm Từ chối
  note          TEXT,         -- Ghi chú khi hoàn thành hoặc lý do từ chối

  PRIMARY KEY (assignment_id, user_id)
);

CREATE INDEX idx_iaa_user_id ON internal_assignment_assignees(user_id);
CREATE INDEX idx_iaa_status  ON internal_assignment_assignees(user_id, status);
```

### 2.4 Bảng comments / thảo luận

```sql
CREATE TABLE internal_assignment_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES internal_assignments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  content       TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_iac_assignment ON internal_assignment_comments(assignment_id);
```

### 2.5 Sơ đồ quan hệ

```
companies ──(optional)──< internal_assignments >──── users (created_by)
                                 │
                     ┌───────────┴───────────┐
                     │                       │
    internal_assignment_assignees     internal_assignment_comments
      user_id FK → users                 user_id FK → users
      status riêng từng người            ai cũng comment được
      (pending/accepted/in_progress
       /done/rejected)
```

### 2.6 Status Flow

```
PHIẾU (assignment_status):

  draft ──[Gửi phiếu]──> active ──[Đóng phiếu]──> done
    │                       │
    │                  [Hủy phiếu]
    │                       │
    └────[Hủy phiếu]──> cancelled


ASSIGNEE (assignee_status — mỗi người 1 luồng độc lập):

  pending ──[Tiếp nhận]──> accepted ──[Bắt đầu]──> in_progress ──[Báo xong]──> done
     │
     └──[Từ chối + lý do]──> rejected
                                │
                         (Admin thấy lý do,
                          có thể giao lại)
```

### 2.7 Quy tắc nghiệp vụ trạng thái

| Tình huống | Hành vi |
|---|---|
| Tất cả assignee từ chối | Phiếu vẫn `active`, admin nhận thông báo "Tất cả nhân sự đã từ chối" |
| Một số từ chối, một số chấp nhận | Phiếu tiếp tục `active` bình thường với người còn lại |
| Admin sửa nội dung khi `active` | Cho phép sửa `title`, `description`, `priority`, `deadline_date` |
| Admin thêm assignee mới khi `active` | Cho phép — INSERT thêm vào junction, notify người mới |
| Admin xóa assignee đang `pending` | Cho phép — DELETE khỏi junction |
| Admin xóa assignee đang `accepted/in_progress` | Không cho phép — phải hủy phiếu nếu muốn |
| Staff từ chối rồi được admin giao lại | Reset `rejected → pending`, `rejected_at = null`, notify lại |

---

## 3. Backend Design

### 3.1 Cấu trúc module

```
backend/src/modules/internal-assignments/
  ├── internalAssignments.router.js
  ├── internalAssignments.controller.js
  ├── internalAssignments.service.js
  └── internalAssignments.schema.js
```

### 3.2 Endpoints

| Method | Route | Quyền | Mô tả |
|--------|-------|-------|-------|
| `GET` | `/api/internal-assignments` | auth | Danh sách — admin thấy tất cả, staff thấy của mình |
| `GET` | `/api/internal-assignments/meta/stats` | auth | Thống kê nhanh (dùng cho dashboard + badge sidebar) |
| `POST` | `/api/internal-assignments` | admin | Tạo phiếu mới (status = draft) |
| `GET` | `/api/internal-assignments/:id` | auth | Chi tiết phiếu + assignees + comments |
| `PATCH` | `/api/internal-assignments/:id` | admin | Sửa phiếu — **draft hoặc active** (title/desc/priority/deadline/assignees) |
| `DELETE` | `/api/internal-assignments/:id` | admin | Xóa vĩnh viễn (chỉ khi status = draft) |
| `POST` | `/api/internal-assignments/:id/send` | admin | Gửi phiếu: draft → active + notify assignees |
| `POST` | `/api/internal-assignments/:id/cancel` | admin | Hủy phiếu (draft hoặc active) + notify |
| `POST` | `/api/internal-assignments/:id/close` | admin | Đóng phiếu: active → done |
| `POST` | `/api/internal-assignments/:id/accept` | staff | Tiếp nhận: pending → accepted |
| `POST` | `/api/internal-assignments/:id/progress` | staff | Bắt đầu: accepted → in_progress |
| `POST` | `/api/internal-assignments/:id/complete` | staff | Báo hoàn thành (+ note): → done |
| `POST` | `/api/internal-assignments/:id/reject` | staff | Từ chối (+ lý do bắt buộc): → rejected + notify admin |
| `POST` | `/api/internal-assignments/:id/comments` | auth | Thêm comment |
| `DELETE` | `/api/internal-assignments/:id/comments/:cid` | auth | Xóa comment của mình |

### 3.3 Request schemas

**Tạo / sửa phiếu:**
```json
{
  "title": "Kiểm tra hồ sơ pháp lý Q2",
  "description": "Rà soát lại toàn bộ hồ sơ đăng ký kinh doanh...",
  "companyId": "uuid | null",
  "priority": "high",
  "deadlineDate": "2026-06-30",
  "assigneeIds": ["uuid-1", "uuid-2"]
}
```

> `PATCH` khi đang `active`: chỉ cho sửa `title`, `description`, `priority`, `deadlineDate`.
> Sửa `assigneeIds` khi `active`: chỉ được thêm mới hoặc xóa người đang `pending`.

**Báo hoàn thành:**
```json
{ "note": "Đã hoàn thành, lưu ý: phát hiện 2 HĐ thiếu chữ ký" }
```

**Từ chối (note bắt buộc):**
```json
{ "note": "Em đang phụ trách gấp dự án khác, nhờ anh/chị assign cho người khác" }
```

### 3.4 Response DTO (chi tiết phiếu)

```json
{
  "id": "uuid",
  "title": "Báo cáo thuế Q2/2026",
  "description": "...",
  "company": { "id": "...", "name": "Công ty ABC" },
  "priority": "high",
  "deadlineDate": "2026-06-30",
  "status": "active",
  "createdBy": { "id": "...", "name": "Khải" },
  "sentAt": "2026-05-24T10:00:00Z",
  "closedAt": null,
  "assignees": [
    {
      "userId": "...", "name": "Nguyễn Văn Minh",
      "status": "in_progress",
      "acceptedAt": "2026-05-24T11:00:00Z",
      "completedAt": null, "rejectedAt": null, "note": null
    },
    {
      "userId": "...", "name": "Trần Thị Lan",
      "status": "rejected",
      "acceptedAt": null,
      "completedAt": null,
      "rejectedAt": "2026-05-24T10:30:00Z",
      "note": "Em đang bận dự án khác"
    }
  ],
  "assigneeStats": {
    "total": 2, "pending": 0, "accepted": 0,
    "inProgress": 1, "done": 0, "rejected": 1
  },
  "comments": [
    {
      "id": "...",
      "user": { "id": "...", "name": "Khải" },
      "content": "Ưu tiên hoàn thành trước 25/06 nhé",
      "createdAt": "2026-05-24T10:05:00Z"
    }
  ],
  "createdAt": "...", "updatedAt": "..."
}
```

### 3.5 Logic nghiệp vụ quan trọng

**`send()` — gửi phiếu:**
- Validate: phải có ít nhất 1 `assigneeIds`
- INSERT `internal_assignment_assignees` cho từng user (status = pending)
- UPDATE `status = active`, `sent_at = NOW()`
- Tạo notification cho từng assignee: *"Bạn có phiếu giao việc mới: [title]"*

**`patch()` khi active — sửa nội dung:**
- Cho phép sửa: `title`, `description`, `priority`, `deadline_date`
- Khi thêm assignee mới: INSERT thêm vào junction + notify người đó
- Khi xóa assignee: chỉ xóa được nếu status của người đó là `pending` hoặc `rejected`
- Notify các assignee hiện tại: *"Nội dung phiếu [title] đã được cập nhật"*

**`reject()` — từ chối:**
- Validate: user phải là assignee với status `pending` hoặc `accepted`
- UPDATE `status = rejected`, `rejected_at = NOW()`, `note = lý do`
- Notify admin: *"[Tên staff] đã từ chối phiếu: [title]. Lý do: [note]"*
- Nếu tất cả assignee đều `rejected`: thêm thông báo đặc biệt cho admin

**`cancel()` — hủy phiếu:**
- UPDATE `status = cancelled`, `closed_at = NOW()`
- Notify tất cả assignee chưa `done` / chưa `rejected`: *"Phiếu [title] đã bị hủy"*

**`listAssignments()` — phân quyền:**
- Admin: thấy tất cả, filter theo `status / company / priority / assignee / deadline / search`
- Staff: `JOIN internal_assignment_assignees WHERE user_id = req.user.id`
  - Filter thêm `myStatus` (trạng thái của bản thân trong phiếu)

**Quyền xem chi tiết:**
- Admin: luôn được xem
- Staff: chỉ được xem nếu là assignee của phiếu đó

---

## 4. Frontend Design

### 4.1 Menu sidebar

```
📋 Công việc nội bộ     /internal-assignments
```
Badge đỏ số (staff): số phiếu đang `pending` (chờ tiếp nhận).

### 4.2 Trang danh sách `/internal-assignments`

**Admin view:**
```
┌─ Phiếu Giao Việc Nội Bộ ──────────────────── [+ Tạo phiếu] ─┐
│                                                               │
│  [📝 Nháp: 2]  [🟡 Đang thực hiện: 5]  [✅ Xong: 12]  [❌ Hủy: 1] │
│                                                               │
│  Filter: [Trạng thái ▼] [Ưu tiên ▼] [Công ty ▼] [Nhân sự ▼] │
│          [Deadline từ──đến] [🔍 Tìm tiêu đề...]              │
│                                                               │
│  Tiêu đề           KH        Ưu tiên  Deadline   Tiến độ  ST │
│  ──────────────────────────────────────────────────────────── │
│  Báo cáo Q2/2026   Cty ABC   🔴Cao    30/06     1✅ 1❌ 1⏳  🟡│
│  Kiểm tra hồ sơ    (nội bộ)  🟡TB     15/06     2✅ 0❌ 0⏳  🟢│
│  Hóa đơn tháng 5   Cty XYZ   🔵Thấp   20/06     0✅ 0❌ 1⏳  🔵│
│  ──────────────────────────────────────────────────────────── │
│                                            [← 1 2 3 →]       │
└───────────────────────────────────────────────────────────────┘
```

**Cột "Tiến độ":** `1✅ 1❌ 1⏳` = 1 done / 1 rejected / 1 in_progress

**Staff view** (chỉ thấy phiếu của mình):
```
│  Tiêu đề           KH        Ưu tiên  Deadline  Trạng thái của tôi     │
│  Báo cáo Q2/2026   Cty ABC   🔴Cao    30/06     🟡 Đang thực hiện      │
│  Kiểm tra hồ sơ    (nội bộ)  🟡TB     15/06     🔵 Chờ tiếp nhận [Nhận]│
```

Filter bổ sung cho staff: `[Trạng thái của tôi ▼]` (pending / accepted / in_progress / done / rejected)

### 4.3 Slide-in panel — Chi tiết phiếu

```
┌─ Báo cáo thuế Q2/2026 ──────── [✏ Sửa] [❌ Hủy] [✅ Đóng] ─┐
│  🏢 Công ty ABC  │ 🔴 Ưu tiên cao  │ 📅 Hạn: 30/06/2026      │
│  👤 Giao bởi: Khải  │  📤 Gửi: 24/05/2026                    │
│  Trạng thái: [🟡 Đang thực hiện]                              │
├─────────────────────────────────────────────────────────────┤
│  📝 Nội dung yêu cầu                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Tổng hợp báo cáo thuế Q2, bao gồm:                  │    │
│  │ - Kiểm tra hóa đơn đầu vào tháng 4-6               │    │
│  │ - Đối chiếu sao kê ngân hàng                        │    │
│  │ - Lập BC GTGT, TNDN                                 │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  👥 Nhân sự thực hiện (3 người)                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🟢 Nguyễn Văn Minh   Đang làm      Nhận: 24/05     │    │
│  │ ❌ Trần Thị Lan       Từ chối       24/05           │    │
│  │    💬 "Em đang bận dự án khác, nhờ assign lại"      │    │
│  │ 🔵 Lê Văn Hùng        Chờ tiếp nhận                │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  💬 Thảo luận                                                │
│  Khải (24/05): "Ưu tiên trước 25/06 nhé các bạn"           │
│  Minh (24/05): "OK anh, em bắt đầu từ HĐ tháng 4"          │
│                                                             │
│  [_____ Nhập bình luận... _______________________] [Gửi]   │
├─────────────────────────────────────────────────────────────┤
│  Hành động (Staff — hiển thị theo status của chính mình):   │
│                                                             │
│  Nếu pending:     [✔ Tiếp nhận]  [✖ Từ chối]               │
│  Nếu accepted:    [🚀 Bắt đầu làm]                          │
│  Nếu in_progress: [📋 Báo hoàn thành]                       │
│  Nếu done/rejected: (không có nút hành động)                │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Modal tạo / sửa phiếu

```
┌─ Tạo phiếu giao việc ─────────────────────────────────────┐
│                                                            │
│  Tiêu đề *          [_________________________________]    │
│                                                            │
│  Nội dung yêu cầu   [_________________________________]    │
│                     [_________________________________]    │
│                     [_________________________________]    │
│                                                            │
│  Công ty            [Chọn khách hàng... ▼] (tùy chọn)     │
│                                                            │
│  Ưu tiên  [Normal ▼]   Deadline  [__/__/____]              │
│                                                            │
│  Giao cho *  [🔍 Tìm nhân sự...]                           │
│  ┌──────────────────────────────────────────┐             │
│  │ ☑ Nguyễn Văn Minh   (đang hoạt động)    │             │
│  │ ☑ Trần Thị Lan       (đang hoạt động)    │             │
│  │ ☐ Lê Văn Hùng        (đang hoạt động)    │             │
│  └──────────────────────────────────────────┘             │
│                                                            │
│         [Lưu nháp]          [Gửi phiếu ngay]             │
└────────────────────────────────────────────────────────────┘
```

> Khi mở modal **sửa phiếu đang active**:
> - Được sửa: tiêu đề, nội dung, ưu tiên, deadline
> - Phần "Giao cho": chỉ hiện checkbox cho người đang `pending` hoặc `rejected` (có thể bỏ/thêm)
> - Người đang `accepted / in_progress / done` → hiển thị readonly, không bỏ được

### 4.5 Modal từ chối (Staff)

```
┌─ Từ chối phiếu giao việc ──────────────────────────────┐
│                                                         │
│  ⚠️  Bạn đang từ chối phiếu:                           │
│  "Báo cáo thuế Q2/2026"                                │
│                                                         │
│  Lý do từ chối *                                        │
│  [____________________________________________]         │
│  [____________________________________________]         │
│  (Bắt buộc — admin sẽ nhận được lý do này)             │
│                                                         │
│               [Huỷ]      [Xác nhận từ chối]            │
└─────────────────────────────────────────────────────────┘
```

### 4.6 Modal báo hoàn thành (Staff)

```
┌─ Báo hoàn thành ───────────────────────────────────────┐
│                                                         │
│  ✅ Báo hoàn thành phiếu:                              │
│  "Báo cáo thuế Q2/2026"                                │
│                                                         │
│  Ghi chú kết quả (tùy chọn)                            │
│  [____________________________________________]         │
│  [____________________________________________]         │
│  VD: kết quả, lưu ý, tài liệu liên quan...             │
│                                                         │
│          [Huỷ]      [✅ Xác nhận hoàn thành]           │
└─────────────────────────────────────────────────────────┘
```

### 4.7 Badge sidebar và Dashboard

**Badge sidebar (Staff):**
- Số phiếu đang status `pending` (chờ tiếp nhận) của bản thân
- Hiển thị dạng badge đỏ, tương tự notification

**Card thống kê Dashboard — Admin:**
```
[📝 Nháp: 2]  [🟡 Đang chạy: 5]  [⚠ Toàn từ chối: 1]
```

**Card thống kê Dashboard — Staff:**
```
[🔵 Chờ tiếp nhận: 2]  [🟢 Đang thực hiện: 3]
```

---

## 5. Migrations cần tạo

| File | Nội dung |
|------|----------|
| `052_create_internal_assignment_enums.sql` | 3 ENUM: `assignment_priority`, `assignment_status`, `assignee_status` (gồm `rejected`) |
| `052_create_internal_assignment_enums.down.sql` | DROP các ENUM trên |
| `053_create_internal_assignments.sql` | 3 bảng + indexes: `internal_assignments`, `internal_assignment_assignees`, `internal_assignment_comments` |
| `053_create_internal_assignments.down.sql` | DROP 3 bảng trên |
| `054_add_enum_metadata_internal_assignments.sql` | INSERT vào `enum_metadata` (labels tiếng Việt cho priority & status) |

> **Không có ALTER TABLE tasks** — module hoàn toàn độc lập.

---

## 6. Files cần tạo / sửa

### Backend (mới)
```
backend/migrations/
  052_create_internal_assignment_enums.sql       (+ .down.sql)
  053_create_internal_assignments.sql            (+ .down.sql)
  054_add_enum_metadata_internal_assignments.sql

backend/src/modules/internal-assignments/
  internalAssignments.router.js
  internalAssignments.controller.js
  internalAssignments.service.js
  internalAssignments.schema.js

backend/src/app.js   ← đăng ký route /api/internal-assignments
```

### Frontend (mới)
```
frontend/src/api/
  internalAssignments.js

frontend/src/pages/InternalAssignments/
  InternalAssignments.jsx            ← trang danh sách + filter + stats
  AssignmentDetailPanel.jsx          ← slide-in panel chi tiết
  CreateEditAssignmentModal.jsx      ← modal tạo / sửa phiếu
  RejectAssignmentModal.jsx          ← modal từ chối (staff)
  CompleteAssignmentModal.jsx        ← modal báo hoàn thành (staff)
  internalAssignments.module.css     ← styles
```

### Sửa file hiện có
```
frontend/src/components/Sidebar/Sidebar.jsx      ← thêm menu item + badge
frontend/src/App.jsx (hoặc router config)        ← thêm route /internal-assignments
```

---

## 7. Acceptance Criteria

```
□ Admin tạo phiếu nháp → staff chưa thấy, không có notification
□ Admin gửi phiếu → staff nhận notification, phiếu xuất hiện trong danh sách staff
□ Staff tiếp nhận → status: pending → accepted
□ Staff bắt đầu → status: accepted → in_progress
□ Staff báo hoàn thành (+note) → status: in_progress → done
□ Staff từ chối (+lý do bắt buộc) → status: rejected, admin nhận notification kèm lý do
□ Tất cả assignee từ chối → admin nhận notification đặc biệt "Tất cả đã từ chối"
□ Admin thấy tiến độ "1✅ 1❌ 1⏳" ngay trên danh sách
□ Admin sửa tiêu đề / nội dung khi phiếu đang active → các assignee nhận notification cập nhật
□ Admin thêm assignee mới khi active → người mới nhận notification
□ Admin không xóa được assignee đang in_progress
□ Admin hủy phiếu → staff chưa done nhận notification hủy
□ Admin đóng phiếu → phiếu done, không thao tác được nữa
□ Staff chỉ thấy phiếu có mình trong assignees
□ Cả admin và staff đều comment được
□ Badge sidebar hiển thị đúng số phiếu pending của staff
□ Filter theo trạng thái / công ty / deadline hoạt động đúng
```

---

## 8. Ghi chú thiết kế

| Điểm | Quyết định |
|------|-----------|
| Tích hợp Tasks | ❌ Không — 2 module độc lập, không FK ràng buộc |
| Sửa khi active | ✅ Cho phép sửa title/desc/priority/deadline; thêm/xóa assignee pending |
| Staff từ chối | ✅ Có — lý do bắt buộc, admin được notify |
| Re-assign sau từ chối | ✅ Admin edit phiếu, thêm lại người đã từ chối → reset pending |
| Notification | Toast + badge sidebar (đơn giản). Khi Phase 12 (Notifications) hoàn thành sẽ tích hợp in-app notification đầy đủ |
| Audit | Mọi thay đổi status ghi vào `audit_logs` hiện có |

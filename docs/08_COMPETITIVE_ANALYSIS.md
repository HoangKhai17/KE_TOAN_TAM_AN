# 08 — Phân Tích & Cải Thiện So Với Thị Trường
> Phiên bản: 1.0 | Ngày tạo: 2026-05-07

---

## Bối Cảnh Phân Tích

Hệ thống Kế Toán Tâm An được xây dựng để thay thế cách làm hiện tại của một công ty dịch vụ kế toán nội bộ — nơi công việc đang được quản lý chủ yếu bằng **Excel + Zalo + nhắc nhở miệng**. Phân tích này so sánh với các giải pháp thị trường để xác định lợi thế cạnh tranh và điểm cần cải thiện.

---

## Đối Tượng So Sánh

| Giải pháp | Loại | Mức độ dùng tại VN |
|-----------|------|--------------------|
| Excel / Google Sheets | Spreadsheet thủ công | ⭐⭐⭐⭐⭐ (phổ biến nhất) |
| ClickUp | Project management SaaS | ⭐⭐⭐⭐ |
| Notion | All-in-one workspace | ⭐⭐⭐⭐ |
| Trello | Kanban đơn giản | ⭐⭐⭐ |
| MISA AMIS | Phần mềm quản lý VN | ⭐⭐⭐⭐ |
| Jira | Enterprise task management | ⭐⭐⭐ |
| **Hệ thống Kế Toán Tâm An** | Internal — xây dựng riêng | — |

---

## Bảng So Sánh Chi Tiết

```
TÍNH NĂNG                              Excel  ClickUp  Notion  Trello  MISA   KẾ TOÁN TÂM AN
─────────────────────────────────────  ─────  ───────  ──────  ──────  ─────  ──────────────
Quản lý task + deadline                ⚠️      ✅       ✅       ✅       ⚠️      ✅
Giao việc cho nhân viên                ⚠️      ✅       ✅       ✅       ✅      ✅
Nhắc nhở deadline tự động             ❌      ✅       ⚠️       ⚠️       ✅      ✅

Template lặp lại theo KH              ❌      ✅       ⚠️       ❌       ❌      ✅ ĐỘC ĐÁO
9 chế độ lặp tùy chỉnh theo KH       ❌      ✅       ❌       ❌       ❌      ✅ ĐỘC ĐÁO
Gắn KH cụ thể cho từng task lặp       ❌      ⚠️       ❌       ❌       ❌      ✅ ĐỘC ĐÁO

Lưu hồ sơ giấy tờ KH                 ⚠️      ❌       ✅       ❌       ✅      ✅
Tích hợp OneDrive (M365 sẵn có)      ❌      ❌       ❌       ❌       ❌      ✅ LỢI THẾ
Lưu tài khoản hệ thống KH (mã hóa)   ⚠️      ❌       ❌       ❌       ❌      ✅ ĐỘC ĐÁO

Quản lý lương/thưởng nhân viên        ⚠️      ❌       ❌       ❌       ✅      ✅ TÍCH HỢP
Báo cáo nhân sự + SLA                 ⚠️      ✅       ⚠️       ❌       ✅      ✅
Forecast tải công việc                ❌      ✅       ❌       ❌       ❌      ✅

Audit log bất biến                    ❌      ❌       ❌       ❌       ✅      ✅
Phân quyền linh hoạt                  ⚠️      ✅       ✅       ⚠️       ✅      ✅
Giao diện tiếng Việt                  ✅      ❌       ❌       ❌       ✅      ✅ BẢN ĐỊA

Chi phí hàng tháng (10 users)         ~0     ~$100    ~$80    ~$50    ~$100   ~400K/tháng
Không cần thẻ quốc tế                ✅      ❌       ❌       ❌       ❌      ✅
Data lưu tại Việt Nam                ✅      ❌       ❌       ❌       ✅      ✅
```

---

## Điểm Mạnh Hệ Thống Kế Toán Tâm An

### 1. Template Lặp Lại Theo Từng Khách Hàng — Lợi Thế Lớn Nhất

```
Vấn đề thực tế:
Mỗi khách hàng có lịch nộp thuế, đóng BH, lập lương... khác nhau
→ Không thể dùng template chung

ClickUp:    Có recurring task nhưng không gắn riêng cho từng KH
Notion:     Không có recurring task thực sự
Trello:     Không có

Kế Toán Tâm An:
├─ Lớp 1: Thư viện loại công việc dùng chung (Task Type Library)
├─ Lớp 2: Lịch lặp riêng từng KH (Customer Task Schedule)
│           - KH ABC: nộp GTGT ngày 20 hàng tháng
│           - KH XYZ: nộp GTGT ngày 15 (gia hạn đặc biệt)
│           - KH DEF: nộp GTGT theo quý (khai quý)
└─ 9 chế độ lặp: daily / weekly / monthly_date / monthly_weekday /
                  monthly_last / quarterly / yearly / custom_dates / once
```

### 2. Lưu Tài Khoản Hệ Thống KH (Credential Vault) — Tính Năng Không Có Trên Thị Trường

```
Nhu cầu thực tế hàng ngày của nhân viên kế toán:
├─ Vào eTax để kê khai thuế cho KH A
├─ Vào VssID để khai báo lao động cho KH B
├─ Vào MISA của KH C để nhập chứng từ
└─ Hiện tại: lưu trong Excel / note giấy → không an toàn, dễ mất

Hệ thống này:
├─ Lưu mã hóa AES-256-GCM — không ai kể cả admin xem raw password trong DB
├─ Giao diện 1-click: click link → mở hệ thống KH, click copy → lấy password
├─ Audit trail: biết ai đã xem mật khẩu nào, lúc nào
└─ Không phát sinh chi phí thêm (đã tích hợp vào hệ thống)
```

### 3. Tích Hợp OneDrive — Không Phát Sinh Chi Phí Storage

```
Tâm An đã trả tiền M365 → có OneDrive 1TB+
→ Hệ thống dùng OneDrive làm backend lưu file KH
→ Không phát sinh thêm chi phí storage (S3, Cloudinary...)
→ File luôn có thể truy cập trực tiếp từ OneDrive Web nếu cần

ClickUp, Notion: lưu file trên server riêng → tính phí theo storage
```

### 4. Bản Địa Hóa Hoàn Toàn

```
├─ Giao diện 100% tiếng Việt
├─ Nghiệp vụ Việt Nam: GTGT, TNCN, BHXH/BHYT/BHTN, quyết toán...
├─ VPS tại Việt Nam (Vietnix) → độ trễ thấp (~5ms)
├─ Thanh toán VND, không cần thẻ quốc tế
└─ Hỗ trợ kỹ thuật tiếng Việt
```

### 5. Chi Phí Thấp Hơn Đáng Kể

```
So sánh 5 năm cho 10 người dùng:

ClickUp (Business):      $12/user/month × 10 × 60 tháng = $7,200 ≈ 180 triệu VND
Notion (Plus):           $8/user/month × 10 × 60 tháng  = $4,800 ≈ 120 triệu VND
MISA AMIS:               ~4 triệu/năm × 5 năm           = 20 triệu VND

Kế Toán Tâm An:
├─ Chi phí phát triển: 33 triệu VND (một lần)
├─ VPS + domain: ~4.8 triệu VND/năm × 5 năm = 24 triệu VND
└─ Tổng 5 năm: ~57 triệu VND — tiết kiệm 63-123 triệu so với SaaS
```

---

## Điểm Cần Cải Thiện — So Với Các Giải Pháp Tốt Nhất

### Mức Độ Cao (Ưu tiên xem xét bổ sung)

#### IMP-01: Mobile App / PWA

```
Vấn đề hiện tại:
Hệ thống là web app → khó dùng trên điện thoại khi ra ngoài

ClickUp / Notion: Có mobile app native
Kế Toán Tâm An: Chỉ web

Giải pháp đề xuất: Progressive Web App (PWA)
├─ Không cần publish lên App Store
├─ Cài như app trên điện thoại từ trình duyệt
├─ Offline mode cơ bản (xem task đã cache)
└─ Push notification (nhắc deadline)

Chi phí bổ sung: Thấp — thêm manifest.json + service worker vào React app
```

#### IMP-02: Notification Đa Kênh

```
Hiện tại: Thông báo trong app + email

Cải tiến: Tích hợp thêm
├─ Telegram Bot: gửi nhắc nhở deadline trực tiếp vào Telegram cá nhân
│   → Nhân viên không cần mở app để biết task sắp đến hạn
└─ Zalo OA: phù hợp với nhân viên quen dùng Zalo

Chi phí bổ sung: Trung bình — cần tích hợp API Telegram/Zalo
```

#### IMP-03: Bộ Lọc & Tìm Kiếm Nâng Cao

```
Hiện tại: Tìm kiếm full-text cơ bản

ClickUp: Filter cực mạnh — lọc kết hợp nhiều điều kiện, lưu filter
Kế Toán Tâm An: Cần bổ sung saved filters

Giải pháp: Lưu preset filter cho dashboard
├─ "Task của tôi quá hạn tháng này"
├─ "Tất cả task KH ABC còn mở"
└─ Tùy chỉnh và lưu filter riêng cho từng người
```

---

### Mức Độ Trung Bình (V2 — sau khi ổn định MVP)

#### IMP-04: API / Webhook Tích Hợp Ngoài

```
Notion / ClickUp: Có public API → kết nối Zapier, Make.com
Kế Toán Tâm An: Chưa có

Ứng dụng tương lai:
├─ Kết nối với phần mềm kế toán KH (MISA) để tự động tạo task khi deadline
└─ Xuất data sang Power BI / Google Data Studio để báo cáo phức tạp hơn
```

#### IMP-05: Giao Tiếp Khách Hàng (Client Portal)

```
Tiến xa hơn: Cổng thông tin cho chính các doanh nghiệp KH
├─ KH đăng nhập → xem task đang được thực hiện cho mình
├─ Upload tài liệu trực tiếp lên hệ thống
└─ Xem báo cáo kế toán hàng tháng

→ Tăng giá trị dịch vụ, không cần giao file qua Zalo/email nữa
```

#### IMP-06: Auto-populate Task từ Lịch Thuế Nhà Nước

```
Sáng kiến độc đáo:
├─ Tích hợp lịch khai thuế chuẩn của Bộ Tài Chính (công khai)
├─ Khi onboarding KH mới → gợi ý tự động lịch task phù hợp
└─ Cập nhật khi có thay đổi quy định mới

→ Giảm công cấu hình thủ công cho mỗi KH mới
```

---

### Mức Độ Thấp (Tương lai xa — V3+)

#### IMP-07: AI Tóm Tắt & Phân Tích

```
→ Tóm tắt tình trạng KH bằng ngôn ngữ tự nhiên: "KH ABC có 3 task trễ, nguyên nhân chủ yếu là thiếu tài liệu đầu vào"
→ Dự đoán task nào có nguy cơ trễ dựa trên lịch sử
→ Đề xuất phân công tự động khi có nhân viên nghỉ
```

#### IMP-08: Multi-tenant (Phục Vụ Nhiều Công Ty Kế Toán)

```
→ Nếu sản phẩm này thành công tại Tâm An → có thể SaaS hóa
→ Mỗi công ty kế toán là 1 tenant riêng, dữ liệu hoàn toàn cách biệt
→ Đây là hướng scale dài hạn nếu muốn thương mại hóa
```

---

## Roadmap Cải Tiến Đề Xuất

```
MVP — Giai đoạn 1                V1.1 — Giai đoạn 2         V2 — Tương lai
─────────────────────────────    ─────────────────────────  ──────────────────────
✅ Quản lý KH + nhân viên        ⬜ IMP-01: PWA Mobile       ⬜ IMP-04: Public API
✅ Task + 9 chế độ lặp           ⬜ IMP-02: Telegram notify  ⬜ IMP-05: Client portal
✅ Credential vault (AES-256)    ⬜ IMP-03: Saved filters    ⬜ IMP-06: Auto lịch thuế
✅ Lương/thưởng nhân viên        ⬜ E2E tests (Playwright)   ⬜ IMP-07: AI summary
✅ Dashboard + Báo cáo           ⬜ PWA push notification    ⬜ IMP-08: Multi-tenant
✅ OneDrive file storage
✅ Bảo mật nền tảng
✅ Audit log
```

---

## Kết Luận

```
┌─────────────────────────────────────────────────────────┐
│                  ĐÁNH GIÁ TỔNG THỂ                      │
│                                                         │
│  Hệ thống Kế Toán Tâm An có lợi thế rõ ràng ở:        │
│  ✅ Nghiệp vụ kế toán Việt Nam — bản địa hóa 100%      │
│  ✅ Template lặp 2 lớp riêng theo KH — thị trường chưa  │
│  ✅ Credential vault tích hợp — giải quyết pain point   │
│  ✅ Chi phí 5 năm thấp hơn SaaS 63–123 triệu VND        │
│  ✅ Data tại Việt Nam — tuân thủ NĐ 13/2023             │
│                                                         │
│  Cần bổ sung sau MVP để cạnh tranh tốt hơn:            │
│  🔑 PWA Mobile     → Dùng mọi lúc mọi nơi             │
│  🔑 Telegram notify → Nhắc deadline không cần mở app   │
│                                                         │
│  Lợi thế dài hạn (moat):                               │
│  🏆 Nghiệp vụ kế toán VN embedded sâu trong sản phẩm  │
│  🏆 Data KH + lịch sử task = switching cost cao        │
│  🏆 Có thể SaaS hóa phục vụ toàn ngành kế toán dịch vụ│
└─────────────────────────────────────────────────────────┘
```

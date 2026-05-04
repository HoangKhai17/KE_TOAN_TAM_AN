# 04 — Phương Án Vận Hành & Hosting

## 1. Tổng Quan Kiến Trúc Triển Khai

```
[Người dùng - trình duyệt]
         │
         ▼
[Vietnix VPS NVME 2]  ←── toàn bộ hệ thống trên 1 máy chủ
         │
         └── Nginx (SSL + reverse proxy)
                  │
                  ├── /          ──► React.js (static files, build sẵn)
                  └── /api/*     ──► Node.js  (API backend)
                                          │
                                     ├── PostgreSQL (database)
                                     └── Redis      (cache / session)
         │
         ▼
[OneDrive - Microsoft 365]
(file tài liệu được serve thẳng từ OneDrive → trình duyệt, không qua VPS)
```

**Cách Nginx phân luồng request:**
- Truy cập `https://app.ketoan-taman.vn` → Nginx trả về file React build (HTML/JS/CSS)
- Gọi `https://app.ketoan-taman.vn/api/...` → Nginx proxy đến Node.js container nội bộ

---

## 2. Gói VPS Được Chọn — Vietnix VPS NVME 2

> Nhà cung cấp: **Vietnix** (vietnix.vn) — Data center đặt tại Việt Nam

| Thông số | Chi tiết |
|----------|----------|
| **CPU** | 2 vCPU AMD EPYC |
| **RAM** | 4 GB |
| **Ổ cứng** | 40 GB NVMe |
| **Băng thông nội địa** | 400 Mbps |
| **Băng thông quốc tế** | 400 Mbps Inbound / 10 Mbps Outbound |
| **Data Transfer** | Không giới hạn |
| **Giá niêm yết** | 460,000 VND/tháng |
| **Giá sau chiết khấu 1 năm (−15%)** | **391,000 VND/tháng** |
| **Giá sau mã DE05 (thêm −5%)** | **~371,000 VND/tháng** |

### Tại Sao Chọn Gói Này

| Yếu tố | Đánh giá |
|--------|---------|
| **Đủ tài nguyên** | Node.js + React static + PostgreSQL + Redis + Nginx + OS dùng ~1.5GB RAM → còn 2.5GB dự phòng |
| **NVMe** | Tốc độ đọc/ghi cao, PostgreSQL hoạt động mượt hơn HDD/SSD thường |
| **Băng thông nội địa 400 Mbps** | Rất nhanh cho người dùng trong Việt Nam |
| **Data center trong nước** | Độ trễ thấp (~5–10ms), không phụ thuộc đường truyền quốc tế |
| **Hỗ trợ tiếng Việt** | Dễ xử lý sự cố, không cần barrier ngôn ngữ |
| **Thanh toán VND** | Không cần thẻ quốc tế, không biến động tỷ giá |

---

## 3. Chi Phí Vận Hành Hàng Năm

| Hạng mục | Nhà cung cấp | Chi phí/năm | Ghi chú |
|----------|-------------|-------------|---------|
| **VPS NVME 2** | Vietnix | ~4,500,000 VND | Thanh toán 1 năm, dùng mã DE05 |
| **Domain** (tên miền `.vn`) | Vietnix / TENTEN | ~300,000 VND | Ví dụ: `ketoan-taman.vn` |
| **SSL Certificate** | Let's Encrypt | **Miễn phí** | Tự động gia hạn qua Certbot |
| **File storage** | OneDrive (Microsoft 365) | **Đã có sẵn** | Không phát sinh thêm |
| **Email thông báo (SMTP)** | Microsoft 365 có sẵn | **Đã có sẵn** | Dùng account M365 hiện tại |
| **Tổng cộng** | | **~4,800,000 VND/năm** | **≈ 400,000 VND/tháng** |

> **Tương đương ~16 USD/tháng** — mức chi phí rất hợp lý cho phần mềm quản lý nội bộ.

---

## 4. Phân Bổ Tài Nguyên VPS

> Ước tính sử dụng tài nguyên khi hệ thống hoạt động bình thường (~20 người dùng đồng thời).

| Service | RAM ước tính | CPU | Ghi chú |
|---------|-------------|-----|---------|
| Nginx | ~30–50 MB | <5% | Serve React static + reverse proxy + SSL |
| React.js (static files) | 0 MB | 0% | Build thành HTML/JS/CSS tĩnh, Nginx serve thẳng |
| Node.js (API backend) | ~300–400 MB | ~15–20% | Xử lý request API |
| PostgreSQL | ~400–600 MB | ~10–20% | Database chính |
| Redis | ~50–80 MB | <5% | Cache session, queue |
| Ubuntu OS | ~400–500 MB | ~5% | Hệ điều hành |
| **Tổng sử dụng** | **~1.2–1.6 GB** | **~35–50%** | Còn ~2.4–2.8 GB dự phòng |

**Kết luận:** Tài nguyên dư thoải mái — hệ thống không bị nghẽn ngay cả khi có thêm tính năng mới.

---

## 5. Kiến Trúc Docker Compose Trên VPS

```yaml
# Minh hoạ cấu trúc docker-compose.yml

services:
  nginx:      # Serve React static files + proxy /api/* → backend
  backend:    # Node.js API server
  postgres:   # PostgreSQL database
  redis:      # Redis cache / session
```

Tất cả container chạy trên 1 VPS, quản lý bằng Docker Compose. React được build thành static files và mount vào Nginx — không cần container riêng cho frontend.

---

## 6. Sao Lưu & An Toàn Dữ Liệu

| Hạng mục | Phương án | Chi tiết |
|----------|-----------|---------|
| **Backup database** | Cron job tự động | Dump PostgreSQL hàng ngày, lưu vào OneDrive |
| **Snapshot VPS** | Vietnix snapshot | Chụp toàn bộ VPS định kỳ hàng tuần (tính phí thêm nhỏ) |
| **SSL tự động gia hạn** | Let's Encrypt + Certbot | Không cần can thiệp thủ công |
| **Tài liệu/file** | OneDrive | Đã có cơ chế backup sẵn của Microsoft |

---

## 7. Khả Năng Nâng Cấp

Khi hệ thống phát triển và số lượng KH, nhân viên tăng lên, có thể nâng cấp linh hoạt:

| Giai đoạn | Hành động | Chi phí bổ sung |
|-----------|-----------|-----------------|
| **Hiện tại** | VPS NVME 2 (4GB RAM) | 4.5 triệu/năm |
| **Khi >50 user** | Nâng lên VPS NVME 3 (6GB RAM) | ~7 triệu/năm |
| **Khi >100 user** | Tách DB ra VPS riêng | ~12–15 triệu/năm |

> Việc nâng cấp không mất dữ liệu — Vietnix hỗ trợ resize VPS trực tiếp.

---

## 8. Điểm Lưu Ý Khi Triển Khai

- **React build process**: Khi deploy, chạy `npm run build` sinh ra thư mục `dist/` → copy vào volume Nginx. Nginx serve static files cực nhanh, không tốn RAM.
- **Outbound quốc tế 10 Mbps** không ảnh hưởng vì người dùng đều ở Việt Nam (dùng băng thông nội địa 400 Mbps), file tài liệu được OneDrive serve trực tiếp đến trình duyệt (không qua VPS).
- **Tên miền** nên đăng ký cùng Vietnix để quản lý tập trung, dễ trỏ DNS.

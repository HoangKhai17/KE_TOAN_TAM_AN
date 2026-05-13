# 12 — Hướng Dẫn Kết Nối OneDrive Personal

> **Phiên bản áp dụng:** Phase 11 — Document Management  
> **Loại tài khoản:** Microsoft Personal (Hotmail / Outlook.com)  
> **Thời gian thực hiện:** ~20 phút  
> **Thực hiện bởi:** Admin hệ thống

---

## 1. Tổng Quan

Hệ thống dùng **Microsoft Graph API** để lưu trữ tài liệu khách hàng lên OneDrive. Với tài khoản **OneDrive Personal** (miễn phí), cần thực hiện một lần xác thực ban đầu gọi là **Delegated OAuth2 Flow**.

```
Luồng xác thực một lần:

  Admin → Bấm "Kết nối OneDrive" trong Settings
       → Chuyển đến trang đăng nhập Microsoft
       → Bấm "Đồng ý cấp quyền"
       → Quay về Settings → Trạng thái: "Đã kết nối"

Sau đó hệ thống tự động:
  Mỗi giờ: dùng refresh_token → lấy access_token mới
  Mỗi lần dùng: refresh_token tự gia hạn → gần như vô thời hạn
```

### 1.1 So Sánh với OneDrive for Business

| | OneDrive Personal | OneDrive for Business |
|---|---|---|
| Tài khoản | @hotmail.com / @outlook.com | @congty.com (Microsoft 365) |
| Chi phí | Miễn phí (5 GB) | ~6 USD/tháng |
| Xác thực | Delegated — admin đăng nhập 1 lần | Client Credentials — app tự đăng nhập |
| Triển khai | Phức tạp hơn một chút | Đơn giản hơn |
| Rủi ro | Nếu refresh_token expire → mất kết nối | Rất ổn định |

---

## 2. Yêu Cầu Trước Khi Bắt Đầu

- Tài khoản Microsoft cá nhân (Hotmail / Outlook.com / Live.com) đang hoạt động
- Truy cập được vào **portal.azure.com** (miễn phí, chỉ cần tài khoản Microsoft)
- Quyền Admin trên hệ thống Kế Toán Tâm An
- Quyền chỉnh sửa file `.env` trên server

---

## 3. Bước 1 — Đăng Ký Azure App

### 3.1 Truy cập Azure Portal

1. Mở trình duyệt, vào **https://portal.azure.com**
2. Đăng nhập bằng tài khoản Microsoft của khách hàng (cùng tài khoản OneDrive)

### 3.2 Tạo App Registration

1. Thanh tìm kiếm phía trên → gõ **"App registrations"** → chọn kết quả đầu tiên
2. Click **"New registration"** (nút ở góc trái trên)

### 3.3 Điền thông tin đăng ký

```
Name:                     KeToanTamAn
Supported account types:  ● Accounts in any organizational directory
                            (Any Microsoft Entra ID tenant - Multitenant)
                            and personal Microsoft accounts
                            (e.g. Skype, Xbox)
                          ← Chọn tùy chọn này (hỗ trợ personal account)

Redirect URI:
  Platform:  Web
  URL:       http://localhost:5173/settings        ← môi trường dev
           hoặc
             https://your-domain.com/settings      ← môi trường production
```

> ⚠️ **Lưu ý Redirect URI:** URL này phải **khớp chính xác** với giá trị `MICROSOFT_REDIRECT_URI` trong file `.env`. Sai một ký tự cũng sẽ lỗi.

4. Click **Register**

### 3.4 Lưu Application (client) ID

Sau khi đăng ký thành công, trang **Overview** hiển thị:

```
Application (client) ID:  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ← Lưu lại
Directory (tenant) ID:    (không cần dùng với personal account)
```

---

## 4. Bước 2 — Tạo Client Secret

1. Trong app vừa tạo, menu bên trái → **"Certificates & secrets"**
2. Tab **"Client secrets"** → click **"New client secret"**
3. Điền:
   ```
   Description:  production
   Expires:      730 days (24 months)
   ```
4. Click **Add**

> ⚠️ **QUAN TRỌNG:** Cột **"Value"** chỉ hiển thị **một lần duy nhất**.  
> Sao chép và lưu ngay vào file `.env`. Sau khi rời trang này, giá trị sẽ bị ẩn vĩnh viễn.

```
Client Secret Value:  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  ← Copy ngay
```

---

## 5. Bước 3 — Cấp Quyền API

1. Menu bên trái → **"API permissions"**
2. Click **"Add a permission"**
3. Chọn **"Microsoft Graph"**
4. Chọn **"Delegated permissions"** (không phải Application permissions)
5. Tìm và tick **3 quyền** sau:

| Quyền | Mục đích |
|-------|----------|
| `Files.ReadWrite` | Upload, đọc, xoá file trên OneDrive |
| `offline_access` | Duy trì kết nối qua refresh_token (bắt buộc) |
| `User.Read` | Đọc thông tin tài khoản (để lấy Drive ID tự động) |

6. Click **"Add permissions"**
7. Kết quả cuối cùng:

```
Microsoft Graph (3)
  ✓ Files.ReadWrite      Delegated  Granted
  ✓ offline_access       Delegated  Granted
  ✓ User.Read            Delegated  Granted
```

> ℹ️ Với Personal account, **không cần** bấm "Grant admin consent".

---

## 6. Bước 4 — Cập Nhật File .env

Mở file `.env` trên server, thêm/cập nhật 3 dòng sau:

```env
# Microsoft OneDrive — Personal Account
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MICROSOFT_REDIRECT_URI=http://localhost:5173/settings
```

> **Production:** đổi `MICROSOFT_REDIRECT_URI` thành URL thật:
> ```
> MICROSOFT_REDIRECT_URI=https://app.ketoan-taman.vn/settings
> ```
> Và phải thêm URL này vào danh sách Redirect URI trong Azure App (Bước 1.3) nếu chưa có.

Sau đó restart backend:

```bash
# Docker
docker-compose restart backend

# Hoặc PM2
pm2 restart backend
```

---

## 7. Bước 5 — Kết Nối Trong Hệ Thống

1. Đăng nhập hệ thống bằng tài khoản **Admin**
2. Vào **Settings** → menu bên trái → **"Kết nối OneDrive"**
3. Trạng thái hiển thị: ⭕ **Chưa kết nối**
4. Click **"Kết nối OneDrive"**

```
Trình duyệt chuyển đến trang Microsoft:
  "KeToanTamAn wants to:"
  ✓ Read and write files in your OneDrive
  ✓ Maintain access to data you have given it access to
  ✓ Sign you in and read your profile

  [ Cancel ]  [ Accept ]
              ↑ Bấm Accept
```

5. Trang tự động quay về Settings
6. Trạng thái cập nhật: ✅ **Đã kết nối**
7. Drive ID được hiển thị và lưu tự động vào database

---

## 8. Bước 6 — Kiểm Tra Kết Nối

1. Vào trang bất kỳ **Khách hàng** → tab **"Tài liệu"**
2. Upload thử một file PDF nhỏ
3. Nếu thành công: file xuất hiện trong danh sách, có link mở trên OneDrive
4. Mở OneDrive của tài khoản Microsoft → kiểm tra folder:
   ```
   OneDrive/
   └── TamAn_Documents/
       └── KH_TenCongTy/
           └── 2026/
               └── khac/
                   └── ten-file.pdf  ✓
   ```

---

## 9. Xử Lý Sự Cố

### 9.1 Lỗi "redirect_uri_mismatch"

```
AADSTS50011: The redirect URI specified in the request does not match
the redirect URIs configured for the application.
```

**Nguyên nhân:** `MICROSOFT_REDIRECT_URI` trong `.env` không khớp với URL đã đăng ký trong Azure.

**Cách sửa:**
1. Vào Azure Portal → App Registration → **Authentication**
2. Kiểm tra danh sách **Redirect URIs**
3. Đảm bảo URL trong `.env` giống **100%** (kể cả có/không có dấu `/` cuối)

---

### 9.2 Lỗi "OneDrive chưa được kết nối"

```
503: OneDrive chưa được kết nối. Vui lòng xác thực trong Cài đặt → OneDrive.
```

**Nguyên nhân:** Refresh token chưa có trong database hoặc đã hết hạn.

**Cách sửa:** Vào Settings → Kết nối OneDrive → làm lại Bước 5.

---

### 9.3 Refresh Token Hết Hạn

Refresh token của Microsoft có hiệu lực **90 ngày kể từ lần dùng cuối**. Nếu hệ thống không upload/xoá file nào trong 90 ngày, token sẽ expire.

**Dấu hiệu:** Tab Tài liệu báo lỗi 503 khi upload.

**Cách sửa:** Vào Settings → Kết nối OneDrive → nhấn **Ngắt kết nối** → nhấn **Kết nối lại** → đăng nhập Microsoft một lần nữa.

**Phòng ngừa:** Hệ thống tự động gia hạn token mỗi khi có request — miễn là sử dụng tính năng tài liệu ít nhất 1 lần trong 90 ngày.

---

### 9.4 Lỗi "invalid_client"

```
AADSTS7000215: Invalid client secret provided.
```

**Nguyên nhân:** Client Secret đã hết hạn (24 tháng) hoặc copy sai giá trị.

**Cách sửa:**
1. Vào Azure Portal → App Registration → **Certificates & secrets**
2. Xoá secret cũ → tạo secret mới
3. Cập nhật `MICROSOFT_CLIENT_SECRET` trong `.env`
4. Restart backend → kết nối lại OneDrive

---

### 9.5 Lỗi "MICROSOFT_REDIRECT_URI not set"

```
Error: MICROSOFT_REDIRECT_URI not set
```

**Nguyên nhân:** Thiếu biến môi trường trong `.env`.

**Cách sửa:** Thêm `MICROSOFT_REDIRECT_URI` vào `.env` và restart backend.

---

## 10. Lịch Gia Hạn Secret

> ⚠️ **Nhắc nhở quan trọng:** Client Secret hết hạn sau **24 tháng** kể từ ngày tạo.  
> Ghi chú lịch gia hạn để không bị gián đoạn dịch vụ.

| Mốc thời gian | Hành động |
|---|---|
| Tháng 22–23 sau khi tạo | Tạo Client Secret mới (song song với cái cũ) |
| Cập nhật `.env` | Thay `MICROSOFT_CLIENT_SECRET` bằng secret mới |
| Restart backend | `docker-compose restart backend` |
| Tháng 24 | Secret cũ tự hết hạn — không ảnh hưởng vì đã dùng secret mới |

---

## 11. Kiến Trúc Kỹ Thuật (Tham Khảo)

```
Luồng upload file:

  User chọn file (frontend)
       │
       ▼
  POST /api/companies/:id/documents  (multipart/form-data)
       │
       ▼
  Backend (documents.service.js)
  ├── Validate: mime type, extension, size ≤ 20MB
  ├── Build path: /root:/TamAn_Documents/KH_{name}/{year}/{category}:/{filename}:/content
  └── graph.graphRequest('PUT', path, { data: fileBuffer })
             │
             ▼
        graph.js: getAccessToken()
        ├── Còn hạn → dùng cache
        └── Hết hạn → gọi Microsoft token endpoint với refresh_token
                   → lưu refresh_token mới vào system_configs
                   → trả về access_token mới
             │
             ▼
        PUT https://graph.microsoft.com/v1.0/drives/{driveId}/{path}
             │
             ▼
        OneDrive lưu file → trả về { id, webUrl }
       │
       ▼
  Lưu metadata vào PostgreSQL (documents table)
  { onedrive_item_id, web_url, file_name, category, ... }
       │
       ▼
  Trả về thông tin file cho frontend
```

### Biến môi trường liên quan

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `MICROSOFT_CLIENT_ID` | ✅ | Application ID từ Azure App Registration |
| `MICROSOFT_CLIENT_SECRET` | ✅ | Client Secret Value (hết hạn 24 tháng) |
| `MICROSOFT_REDIRECT_URI` | ✅ | URL callback sau khi đăng nhập Microsoft |
| `MICROSOFT_DRIVE_ID` | ❌ | Tự động lưu vào DB khi kết nối lần đầu |

### Dữ liệu lưu trong database (system_configs)

| Key | Mô tả |
|-----|-------|
| `onedrive_refresh_token` | Refresh token — tự gia hạn mỗi lần dùng |
| `onedrive_drive_id` | Drive ID — lấy tự động khi kết nối lần đầu |

---

## 12. Checklist Xác Nhận Hoàn Thành

```
□  Đã đăng ký Azure App với "Personal Microsoft accounts"
□  Redirect URI trong Azure khớp với MICROSOFT_REDIRECT_URI trong .env
□  Đã tạo Client Secret và lưu giá trị Value
□  Đã cấp 3 quyền: Files.ReadWrite + offline_access + User.Read
□  Đã cập nhật .env với CLIENT_ID, CLIENT_SECRET, REDIRECT_URI
□  Đã restart backend sau khi cập nhật .env
□  Settings → Kết nối OneDrive → trạng thái "Đã kết nối"
□  Upload thử file → thành công
□  Kiểm tra file xuất hiện trên OneDrive cá nhân
□  Ghi chú ngày hết hạn Client Secret để gia hạn kịp thời
```

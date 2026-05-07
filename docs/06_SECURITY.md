# 06 — Thiết Kế Bảo Mật
> Chuẩn tham chiếu: OWASP Top 10, ISO 27001, Nghị định 13/2023/NĐ-CP (PDPD Việt Nam)
> Phiên bản: 1.0 | Ngày tạo: 2026-05-07 | Stack: Node.js + React + PostgreSQL

---

## Nguyên Tắc Bảo Mật Nền Tảng

```
┌─────────────────────────────────────────────────────────┐
│             CIA TRIAD — Tam giác bảo mật                │
│                                                         │
│   Confidentiality   Chỉ người có quyền mới được        │
│   (Bảo mật)         xem dữ liệu khách hàng             │
│                                                         │
│   Integrity         Dữ liệu công việc, lương, tài       │
│   (Toàn vẹn)        khoản KH không bị sửa trái phép    │
│                                                         │
│   Availability      Hệ thống luôn sẵn sàng trong       │
│   (Khả dụng)        giờ làm việc (8h–18h)              │
└─────────────────────────────────────────────────────────┘
```

---

## Kiến Trúc Bảo Mật Tổng Quan

```
INTERNET
    │
    ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 1 — NETWORK SECURITY                               │
│  ├─ Let's Encrypt SSL/TLS 1.3 (HTTPS bắt buộc)           │
│  ├─ Nginx: Rate Limiting (100 req/min per IP)             │
│  └─ HTTP → HTTPS redirect tự động                        │
└───────────────────┬───────────────────────────────────────┘
                    │ HTTPS (TLS 1.3)
                    ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 2 — AUTHENTICATION & AUTHORIZATION                 │
│  ├─ JWT Access Token (15 phút) + Refresh Token (7 ngày)  │
│  ├─ Refresh Token Rotation + Family ID (chống reuse)     │
│  └─ RBAC: Admin / Staff (2 vai trò)                       │
└───────────────────┬───────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 3 — APPLICATION SECURITY                           │
│  ├─ Input Validation (Joi / Zod — tất cả API endpoint)   │
│  ├─ SQL Injection Prevention (Parameterized Query — pg)   │
│  ├─ XSS Prevention (helmet.js + CSP header)              │
│  └─ CORS Policy (whitelist domain cụ thể)                │
└───────────────────┬───────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 4 — DATA SECURITY                                  │
│  ├─ Credential Encryption: AES-256-GCM (application)     │
│  ├─ Password Hashing: bcrypt (cost factor 12)            │
│  ├─ Encryption in Transit: TLS 1.3 end-to-end            │
│  └─ File Access: OneDrive Signed URL (hết hạn 1h)        │
└───────────────────┬───────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 5 — AUDIT & COMPLIANCE                             │
│  ├─ Audit Log mọi thao tác nhạy cảm (immutable)          │
│  ├─ Ghi log khi xem mật khẩu KH (credential_viewed)      │
│  └─ Tuân thủ Nghị định 13/2023/NĐ-CP                    │
└───────────────────────────────────────────────────────────┘
```

---

## AUTHENTICATION (Xác Thực)

### Luồng Đăng Nhập

```
Người dùng               Node.js Backend               PostgreSQL
     │                         │                              │
     ├─ POST /api/auth/login   │                              │
     │   { email, password } ─►│                              │
     │                         ├─ Tìm user by email ─────────►│
     │                         ├─ bcrypt.compare(pw, hash)    │
     │                         ├─ Tạo Access Token (JWT 15m)  │
     │                         ├─ Tạo Refresh Token (7 ngày)  │
     │                         ├─ Lưu SHA-256(refresh) ──────►│
     │◄── { access_token,      │                              │
     │      refresh_token }    │                              │
     │                         │                              │
     │  [15 phút sau]          │                              │
     ├─ POST /api/auth/refresh ►│                              │
     │   { refresh_token }     ├─ Verify + Rotate token ─────►│
     │◄── { new_access_token } │                              │
     │     new_refresh_token } │                              │
```

> **Refresh Token Rotation:** Mỗi lần dùng refresh token thì phát token mới và thu hồi token cũ. Nếu phát hiện token cũ được dùng lại → thu hồi toàn bộ `family_id` → buộc đăng nhập lại (phòng chống token theft).

### JWT Token Design

```js
// Access Token Payload (Node.js / jsonwebtoken)
{
  "sub": "user-uuid",
  "role": "admin",          // "admin" | "staff"
  "iat": 1748000000,
  "exp": 1748000900,        // 15 phút
  "jti": "unique-token-id"  // Chống replay attack
}
```

### Password Policy

| Yêu cầu | Quy định |
|---------|---------|
| Độ dài | Tối thiểu 8 ký tự |
| Phức tạp | Chữ hoa + chữ thường + số |
| Thất bại | Khóa 30 phút sau 5 lần sai liên tiếp |
| Đổi mật khẩu | Bắt buộc đổi lần đầu đăng nhập (`must_change_pw = TRUE`) |
| Lưu trữ | bcrypt hash (cost factor 12) — không bao giờ lưu plain text |

---

## AUTHORIZATION — RBAC (Phân Quyền)

```
┌─────────────────────────────────────────────────────────┐
│              ROLE-BASED ACCESS CONTROL                  │
│                                                         │
│  ROLE: admin                                            │
│  ├─ Toàn quyền hệ thống                                │
│  ├─ Quản lý users, cấu hình, Task Type Library         │
│  ├─ Xem và xác nhận bảng lương                         │
│  ├─ Xem audit log                                      │
│  └─ Xem tài khoản hệ thống KH (kể cả decrypt pw)      │
│                                                         │
│  ROLE: staff (Nhân viên kế toán)                        │
│  ├─ Xem/cập nhật tasks được giao cho mình              │
│  ├─ Xem hồ sơ KH đang phụ trách                       │
│  ├─ Xem tài khoản hệ thống KH phụ trách (decrypt pw)  │
│  └─ KHÔNG xem dữ liệu lương, audit log, user khác     │
└─────────────────────────────────────────────────────────┘
```

### Permission Matrix

| Action | admin | staff |
|--------|-------|-------|
| Xem tasks của mình | ✅ | ✅ |
| Xem tất cả tasks | ✅ | ❌ |
| Tạo/sửa task thủ công | ✅ | ✅ |
| Xóa task | ✅ | ❌ |
| Xem hồ sơ KH | ✅ | ✅ (chỉ KH phụ trách) |
| Thêm/sửa KH | ✅ | ❌ |
| Xem tài khoản hệ thống KH | ✅ | ✅ (chỉ KH phụ trách) |
| Thêm/sửa credential KH | ✅ | ❌ |
| Xem bảng lương | ✅ | ❌ |
| Quản lý users | ✅ | ❌ |
| Cấu hình hệ thống | ✅ | ❌ |
| Xem audit log | ✅ | ❌ |

---

## MÃ HÓA TÀI KHOẢN KHÁCH HÀNG (Credential Encryption)

> Đây là điểm bảo mật quan trọng nhất — mật khẩu hệ thống KH là dữ liệu cực nhạy cảm.

### Thuật Toán: AES-256-GCM

```
AES-256-GCM được chọn vì:
├─ Authenticated Encryption: vừa mã hóa vừa xác thực toàn vẹn
├─ GCM mode: không cần padding, phù hợp dữ liệu ngắn (password)
└─ IV ngẫu nhiên mỗi lần encrypt: cùng password → ciphertext khác nhau
```

### Luồng Mã Hóa / Giải Mã (Node.js)

```js
const crypto = require('crypto');

const ALGORITHM  = 'aes-256-gcm';
const KEY        = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, 'hex'); // 32 bytes

// Mã hóa khi lưu
function encrypt(plaintext) {
  const iv         = crypto.randomBytes(12);          // 96-bit IV cho GCM
  const cipher     = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag    = cipher.getAuthTag();              // 16-byte authentication tag

  return {
    encrypted_password: Buffer.concat([authTag, encrypted]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

// Giải mã khi hiển thị (chỉ khi user bấm "Hiện mật khẩu")
function decrypt(encryptedBase64, ivBase64) {
  const data       = Buffer.from(encryptedBase64, 'base64');
  const iv         = Buffer.from(ivBase64, 'base64');
  const authTag    = data.subarray(0, 16);
  const ciphertext = data.subarray(16);

  const decipher   = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}
```

### Quản Lý Encryption Key

```bash
# .env (KHÔNG commit lên git — thêm vào .gitignore)
# Sinh key ngẫu nhiên: node -e "console.log(crypto.randomBytes(32).toString('hex'))"
CREDENTIAL_ENCRYPTION_KEY=a3f8c2...64b (64 hex chars = 32 bytes)

# Key rotation (khi cần đổi key):
# 1. Đọc tất cả records → decrypt bằng old key → encrypt lại bằng new key
# 2. Script migration chạy trong transaction
```

### API Flow Khi Xem Mật Khẩu

```
Nhân viên bấm "Hiện mật khẩu"
      │
      ├─ GET /api/credentials/:id/reveal
      │         │
      │         ├─ Kiểm tra quyền (chỉ admin hoặc staff phụ trách KH đó)
      │         ├─ Giải mã AES-256-GCM
      │         ├─ Ghi audit_log: action='credential_viewed', target_id=credential_id
      │         │
      │◄── { password: "plain_text" }   ← Chỉ trả về 1 lần, không cache
      │
      └─ Password tự ẩn lại sau 30 giây (frontend timer)
```

---

## DATA ENCRYPTION — Các Lớp Mã Hóa

```
Encryption in Transit
├─ TLS 1.3 (Let's Encrypt) — toàn bộ traffic HTTPS
└─ Nginx enforce: HSTS header, HTTP → HTTPS redirect

Encryption at Rest
├─ Volume OS: NVMe disk trên Vietnix VPS
│   → Không tự mã hóa ở cấp OS (giống hầu hết VPS thông thường)
│   → Bù lại bằng application-level encryption cho dữ liệu nhạy cảm
├─ Passwords nhân viên: bcrypt hash (irreversible)
├─ Credential KH: AES-256-GCM (reversible, có kiểm soát)
└─ Refresh tokens: lưu SHA-256 hash — không lưu token gốc

File Storage (OneDrive)
├─ Encryption at Rest: Microsoft quản lý (AES-256 mặc định)
├─ Truy cập qua Microsoft Graph API (OAuth 2.0)
└─ Không expose file URL trực tiếp — generate link qua Graph API
```

---

## SECURITY HEADERS (Node.js / Helmet.js)

```js
// Express middleware — helmet.js
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "https://*.sharepoint.com"],
      connectSrc:  ["'self'", "https://graph.microsoft.com"],
      frameSrc:    ["'none'"],
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// CORS — chỉ cho phép domain app
app.use(cors({
  origin: process.env.FRONTEND_URL,   // https://app.ketoan-taman.vn
  credentials: true,
}));

// Rate limiting — tránh brute force
const rateLimit = require('express-rate-limit');
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use('/api/',      rateLimit({ windowMs: 1  * 60 * 1000, max: 100 }));
```

---

## INPUT VALIDATION

```js
// Dùng Zod hoặc Joi cho tất cả request body/params
// Ví dụ: validate khi tạo task
const createTaskSchema = z.object({
  title:      z.string().min(1).max(300),
  company_id: z.string().uuid(),
  due_date:   z.string().date().optional(),
  priority:   z.enum(['low', 'medium', 'high', 'urgent']),
});

// Parameterized query — không bao giờ interpolate string SQL
const result = await db.query(
  'SELECT * FROM companies WHERE tax_code = $1 AND status = $2',
  [taxCode, 'active']
);
```

---

## AUDIT LOG

> Mọi thao tác nhạy cảm đều được ghi vào `audit_logs` — bảng này IMMUTABLE (chỉ INSERT, không UPDATE/DELETE).

| action | Khi nào ghi |
|--------|------------|
| `login` | Đăng nhập thành công |
| `login_failed` | Đăng nhập sai mật khẩu |
| `account_locked` | Tài khoản bị khóa do sai quá số lần |
| `logout` | Đăng xuất |
| `credential_viewed` | Nhân viên xem mật khẩu hệ thống KH |
| `credential_created` | Thêm tài khoản hệ thống KH mới |
| `credential_updated` | Cập nhật tài khoản hệ thống KH |
| `payroll_confirmed` | Admin xác nhận bảng lương |
| `task_deleted` | Xóa công việc |
| `user_role_changed` | Thay đổi vai trò người dùng |
| `user_locked` | Khóa tài khoản nhân viên |

```sql
-- Enforce immutability ở database level
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
```

---

## TUÂN THỦ NGHỊ ĐỊNH 13/2023/NĐ-CP (PDPD Việt Nam)

| Yêu cầu pháp lý | Cách triển khai |
|----------------|----------------|
| Lưu trữ dữ liệu trong nước | VPS Vietnix — data center đặt tại Việt Nam |
| Giới hạn thu thập | Chỉ thu thập dữ liệu cần thiết cho nghiệp vụ kế toán |
| Mã hóa dữ liệu cá nhân nhạy cảm | AES-256-GCM cho credential KH; bcrypt cho mật khẩu NV |
| Quyền xóa dữ liệu | Admin xóa tài khoản KH + purge liên quan (soft-delete trước) |
| Thông báo vi phạm | Quy trình phản ứng sự cố: alert trong vòng 72h |
| Kiểm soát truy cập | RBAC + audit log toàn bộ thao tác nhạy cảm |

---

## ENV CONFIGURATION

```bash
# .env.example (commit lên git — không có giá trị thật)
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/ktta_db
JWT_SECRET=
JWT_REFRESH_SECRET=
CREDENTIAL_ENCRYPTION_KEY=    # 64 hex chars (32 bytes) — sinh bằng: openssl rand -hex 32
FRONTEND_URL=http://localhost:5173
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
SENTRY_DSN=

# .env (KHÔNG commit — thêm vào .gitignore)
# Chứa giá trị thật cho môi trường tương ứng
```

---

## SECURITY CHECKLIST TRƯỚC KHI GO-LIVE

```
Xác thực & Phân quyền
□ JWT secret đủ entropy (>= 32 bytes ngẫu nhiên)
□ Refresh token rotation hoạt động đúng
□ RBAC test đủ các case: staff không xem được dữ liệu ngoài phạm vi
□ Rate limiting đã cấu hình cho /api/auth/

Mã hóa
□ CREDENTIAL_ENCRYPTION_KEY không hardcode trong code
□ Key không commit lên git (.env trong .gitignore)
□ Test encrypt/decrypt round-trip cho credential
□ bcrypt cost factor = 12 (cân bằng bảo mật và tốc độ)

Application
□ Tất cả API có input validation (Zod/Joi)
□ Parameterized query — không có string interpolation trong SQL
□ helmet.js + CORS chỉ cho phép frontend domain
□ Error response không lộ stack trace / SQL query

Network
□ HTTPS enforced — HTTP redirect sang HTTPS
□ HSTS header đã cấu hình
□ Database không expose port ra ngoài (chỉ trong Docker network)

Audit & Monitoring
□ audit_logs REVOKE UPDATE/DELETE đã áp dụng
□ Hành động credential_viewed ghi log đầy đủ
□ Log không chứa password hoặc token

Backup & Recovery
□ Backup PostgreSQL tự động hàng ngày (cron + OneDrive)
□ Test restore backup thành công
□ Encryption key backup ở nơi an toàn riêng
```

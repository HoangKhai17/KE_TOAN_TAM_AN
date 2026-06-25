# 14 — Báo cáo Security Audit (lỗ hổng + dependency)

> Ngày: 2026-06-25 · Phạm vi: **lỗ hổng bảo mật + lỗ hổng package** (KHÔNG bao gồm rà soát logic phân quyền/nghiệp vụ).
> Tham chiếu thiết kế: [docs/06_SECURITY.md](06_SECURITY.md) · Chuẩn: OWASP Top 10.

---

## Tóm tắt

Phần bảo mật **tự viết tay rất chắc** (auth, crypto, secrets, SQL, headers đều đạt). Rủi ro thực tế nằm ở **2 nhóm**: dependency và 1 lỗ hổng XSS (đã fix).

| Mức | Số lượng | Trạng thái |
|---|---|---|
| 🔴 High | 3 nhóm | XSS **đã fix**; dependency **đang xử lý** |
| 🟡 Low/Hardening | 2 | Tuỳ chọn |
| ✅ Đạt | 9 hạng mục | Không cần sửa |

---

## 🔴 HIGH

### H1 — Lỗ hổng dependency (npm audit)
| | Backend | Frontend |
|---|---|---|
| Tổng | 38 (6 low, 22 mod, **10 high**) | 16 (3 low, 5 mod, **8 high**) |

**Backend high (có bản vá):** `axios` (SSRF), `express` (XSS qua `res.redirect`), `body-parser` (DoS), `form-data` (CRLF injection), `path-to-regexp` (ReDoS), `tar` (ghi file tuỳ ý), `tmp` (path traversal), `nodemailer`, `bcrypt`, `@mapbox/node-pre-gyp`.
**Frontend high:** `axios`, `react-router`/`react-router-dom` (open-redirect/XSS), `vite` (DOM clobbering), `ws` (DoS / lộ memory), `form-data` — **có bản vá**; **`xlsx` (SheetJS): prototype pollution + ReDoS — KHÔNG có bản vá** (xem H3).

**Khắc phục:** `npm audit fix` (non-force) cho cả hai; tránh `--force` (sẽ nâng major gây breaking: react-router v7, vite major). Build + test lại. Backend phải **rebuild image** sau khi cập nhật package.

### H2 — Stored XSS ở Ghi chú công ty ✅ ĐÃ FIX
- **Vị trí:** `frontend/src/pages/Companies/NotesTab.jsx:137` — render rich-text `note.content` (Quill HTML) qua `dangerouslySetInnerHTML` **không sanitize**; toàn frontend không có thư viện sanitize.
- **Khai thác:** lưu `<img src=x onerror="…document.cookie…">` vào ghi chú → chạy trong phiên của bất kỳ ai xem (kể cả admin) → đánh cắp phiên / hành động thay admin.
- **Khắc phục (đã làm):** thêm `dompurify`, sanitize `displayHtml = DOMPurify.sanitize(rawHtml)` trước khi render. Đây là sink `dangerouslySetInnerHTML` **duy nhất** trong frontend.

### H3 — `xlsx` parse file upload
- **Vị trí:** `frontend/src/utils/excelImport.js:82` `XLSX.read(buffer)` đọc file người dùng tải lên (import Excel).
- **Rủi ro:** kết hợp với H1 (xlsx không có bản vá) → đường khai thác prototype-pollution / ReDoS thật qua file `.xlsx` độc.
- **Khắc phục:** không có patch chính thức → giảm thiểu bằng (a) **giới hạn kích thước file** trước khi parse, (b) cân nhắc thay thư viện đọc (vd `exceljs` cho cả đọc) ở giai đoạn sau.

---

## 🟡 LOW / Hardening (không gấp)

- **L1 — JWT verify không pin thuật toán:** `backend/src/middleware/auth.js:13` `jwt.verify(token, secret)` nên thêm `{ algorithms: ['HS256'] }` để phòng alg-confusion (rủi ro thấp vì dùng HMAC khoá đối xứng).
- **L2 — CSP `styleSrc 'unsafe-inline'`:** phổ biến, chấp nhận được; siết được thì tốt nhưng không bắt buộc.

---

## ✅ Đã kiểm tra & ĐẠT

| Hạng mục | Kết quả |
|---|---|
| **Secrets** | `env.js` bắt buộc `JWT_SECRET`/`JWT_REFRESH_SECRET`/`CREDENTIAL_ENCRYPTION_KEY` (throw nếu thiếu, validate 64-hex). Không hardcode fallback. `.env` gitignored + không track. |
| **Mã hoá credential** | AES-256-GCM + authTag (`utils/encrypt.js`); key từ env; **reveal có audit** `credential.revealed`. |
| **Mật khẩu** | bcrypt; khoá tài khoản sau nhiều lần sai; `must_change_pw`; **`password_hash` không lọt response**. |
| **Session** | JWT + refresh rotation + family + lưu **SHA-256**; cookie **httpOnly + secure(prod) + sameSite:strict**. |
| **Frontend token** | access token trong memory (Zustand), **không localStorage**. |
| **SQL injection** | tất cả parameterized; `WHERE/SET/ORDER BY` động dùng **whitelist server** (`SORT_COLS`, `fieldMap`). |
| **Headers** | helmet CSP đầy đủ (`scriptSrc 'self'`), HSTS, referrerPolicy; CSP chỉ tắt cho `/api/docs` (Swagger). |
| **CORS / Rate-limit** | CORS whitelist (không `*`); rate-limit login 10/15ph + phân tầng đọc/ghi. |
| **Error handling** | prod không lộ stack/SQL; không log password/token. |

---

## Tiến độ khắc phục (2026-06-25)

- [x] **H2 — Stored XSS**: thêm `dompurify`, sanitize ở `NotesTab.jsx` (sink duy nhất). Build OK.
- [x] **H1 — Frontend deps**: 16 → 7 vuln, **0 high runtime**. Đã vá: `axios`→1.18.1, `react-router-dom`→6.30.4 (vẫn v6), `vite`→5.4.21, `ws`/`form-data` (transitive). Còn lại: `vite` (bản vá là v8 MAJOR — lỗ hổng chỉ ở **dev-server**, prod phục vụ `dist` tĩnh nên không có bề mặt) + `xlsx` (no-fix → xem H3).
- [x] **H1 — Backend deps**: 37 → 26 vuln, **0 high/critical**. Đã vá: `axios`→1.18.1, `express`→4.22.2 (kèm body-parser + path-to-regexp), `socket.io`→4.8.3 (kèm ws), `nodemailer`→9.0.1, `bcrypt`→6.0.0 (kèm tar + node-pre-gyp). **Rebuild image + verify**: boot sạch, bcrypt hash/compare đúng, nodemailer load OK.
- [x] **H3 — xlsx**: thêm giới hạn 5MB ở `excelImport.js` trước `XLSX.read` (chặn ReDsoS). *Triệt để: thay thư viện đọc Excel — để giai đoạn sau.*
- [ ] L1 — pin `algorithms: ['HS256']` (tuỳ chọn, rủi ro thấp).

> **Lưu ý vận hành:** vuln moderate còn lại (FE 7, BE 26) đa số là **tooling/transitive build-time** (vite dev-server, esbuild…), không nằm trên đường request runtime ở production. `xlsx` còn 1 high không vá được — đã giảm thiểu bằng size-limit; nên thay thư viện ở vòng sau.

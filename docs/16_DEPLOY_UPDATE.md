# 16 — Hướng dẫn cập nhật (deploy update) lên server đã có DATA THẬT

> ⚠️ Server đang có dữ liệu thật. Các bước dưới **chỉ cập nhật CODE + CẤU TRÚC (migration)**, **KHÔNG đụng/không đè dữ liệu**. Vẫn **backup trước** cho chắc.
> Chạy trên máy chủ, ở thư mục deploy (nơi có `docker-compose.prod.yml`).

## 0. Backup DB trước (an toàn)
```bash
mkdir -p backup
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -Fc -d "$POSTGRES_DB" > backup/pre-update-$(date +%Y%m%d).dump
```
*(Nếu chưa export biến, thay `$POSTGRES_USER`/`$POSTGRES_DB` bằng giá trị trong `.env.production`.)*

## 1. Lấy code mới
```bash
git pull
```

## 2. Rebuild BACKEND (Dockerfile đổi: thêm pg_dump; code + migration mới nằm trong image)
```bash
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend   # đồng thời áp volume ./backup mới
```

## 3. Chạy MIGRATION (chỉ đổi cấu trúc, GIỮ nguyên data)
```bash
# Xem trước sẽ chạy gì
docker compose -f docker-compose.prod.yml exec backend node src/db/migrate.js status
# Áp dụng (079 quick_notes, 080 birthday/CDR enum, 081 checklist TEXT, …)
docker compose -f docker-compose.prod.yml exec backend node src/db/migrate.js up
```

## 4. Cập nhật FRONTEND (build dist → đưa vào volume `nginx_static`)
```bash
# 4a. Build dist (BuildKit xuất ra ./fe-dist/dist)
DOCKER_BUILDKIT=1 docker build --target export --output type=local,dest=./fe-dist ./frontend

# 4b. Tìm tên volume (thường <project>_nginx_static)
docker volume ls | grep nginx_static      # ví dụ: ke_toan_tam_an_nginx_static

# 4c. Ghi dist vào volume (thay <VOLUME> bằng tên ở 4b)
docker run --rm \
  -v <VOLUME>:/target \
  -v "$(pwd)/fe-dist/dist":/src:ro \
  alpine sh -c "rm -rf /target/* && cp -r /src/. /target/"

# 4d. Nạp lại nginx
docker compose -f docker-compose.prod.yml restart nginx
```
> Nếu bạn có sẵn quy trình build frontend riêng khi deploy lần đầu, dùng lại quy trình đó (kết quả: dist mới nằm trong `nginx_static`).

## 5. Kiểm tra
```bash
docker compose -f docker-compose.prod.yml ps                       # tất cả healthy
docker compose -f docker-compose.prod.yml exec backend pg_dump --version   # có pg_dump (backup UI chạy được)
docker compose -f docker-compose.prod.yml logs backend --tail=20   # boot sạch
```
Sau đó **Ctrl+F5** trên trình duyệt để nạp frontend mới.

---

## ⚠️ TUYỆT ĐỐI KHÔNG chạy trên server có data thật
- **KHÔNG** `npm run seed -- --demo` (và **KHÔNG** đặt `SEED_DEMO=true`) → chèn users/companies/payroll/tasks demo (rác).
  - Từ nay `seed.js` đã tách: `npm run seed` (không cờ) **chỉ** nạp seed NỀN (admin, cấu hình, loại công việc) và an toàn; demo nằm ở `backend/seeds/demo/` chỉ chạy khi có `--demo`, và bị **chặn hẳn** khi `NODE_ENV=production`.
- **KHÔNG** `migrate.js down` → rollback có thể phá/cắt dữ liệu.
- `migrate up` cũng đã được vá: chỉ chạy migration đánh số `NNN_*.sql`, **không** còn nuốt nhầm `seed_*.sql`.
- Nếu server đã lỡ dính demo: backup rồi chạy `backend/scripts/cleanup_demo_data.sql` để dọn theo prefix UUID demo (không đụng data thật).

## Vì sao migrate KHÔNG đè data
- Migration = DDL (CREATE/ALTER) đổi **cấu trúc**, không chứa dữ liệu local.
- Chạy tăng dần: chỉ áp file **chưa** có trong bảng `schema_migrations` của server.
- 3 migration mới đều "cộng thêm" (thêm bảng / thêm enum / nới VARCHAR→TEXT) → **giữ nguyên** dữ liệu.
- Local DB và Server DB tách biệt hoàn toàn — `git pull`/`migrate` không đẩy data local lên server.

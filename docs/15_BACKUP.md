# 15 — Sao lưu & Khôi phục Cơ sở dữ liệu

> Sao lưu DB tự động/thủ công, lưu **local** trên máy chủ tại `./backup`. (Off-site như Google Drive sẽ bổ sung sau.)

## Tổng quan
- **Định dạng:** `pg_dump -Fc` (custom format, đã nén) → file `ktta-YYYYMMDD-HHmmss.dump`.
- **Nơi lưu:** thư mục `./backup` ở gốc dự án (mount vào container backend tại `/app/backup`).
- **Lịch mặc định:** 02:00 (giờ VN) hằng ngày, bật sẵn.
- **Retention:** giữ **10 bản** gần nhất; sau mỗi lần sao lưu, bản cũ tự xoá.
- **Phân quyền:** chỉ **admin**.

## Quản lý qua giao diện
**Cài đặt › Sao lưu dữ liệu**:
- Bật/tắt sao lưu tự động, đổi **giờ chạy**, đổi **số bản giữ**.
- Nút **Sao lưu ngay** (thủ công).
- Danh sách bản sao lưu: **Tải về** / **Xoá**. Xem lần chạy gần nhất + trạng thái.

## API (admin)
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/admin/backup` | Cấu hình + danh sách bản sao lưu |
| POST | `/api/admin/backup/run` | Sao lưu thủ công ngay |
| PATCH | `/api/admin/backup/config` | `{ enabled, time, retention }` |
| GET | `/api/admin/backup/:file/download` | Tải 1 bản |
| DELETE | `/api/admin/backup/:file` | Xoá 1 bản |

## Khôi phục (Restore)
> ⚠️ Restore **GHI ĐÈ** dữ liệu hiện tại. Không có nút restore trên UI (để tránh nhầm). Dùng script:

```bash
bash scripts/restore.sh ktta-20260625-020000.dump
```
Script sẽ: copy file vào container postgres → `pg_restore --clean --if-exists` → dọn file tạm. Hỏi xác nhận `yes` trước khi chạy.

Khôi phục thủ công (không dùng script):
```bash
docker compose cp ./backup/<file>.dump postgres:/tmp/r.dump
docker compose exec -T postgres pg_restore --clean --if-exists --no-owner --no-privileges -U ktta_user -d ktta_db /tmp/r.dump
```

## Lưu ý
- **Local-only:** server/ổ đĩa hỏng → mất backup. Nên định kỳ tải 1 bản về máy khác, hoặc bổ sung đích off-site sau.
- File `.dump` **không mã hoá** (chứa dữ liệu nhạy cảm) → đảm bảo quyền truy cập máy chủ + thư mục `./backup`.
- Hạ tầng: backend image có `postgresql16-client` (pg_dump/pg_restore khớp Postgres 16); thư mục `./backup` được `.gitignore`.

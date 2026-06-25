#!/usr/bin/env bash
# Khôi phục PostgreSQL từ một bản backup .dump (do chức năng Sao lưu tạo ra).
# ⚠️  CẢNH BÁO: thao tác này GHI ĐÈ toàn bộ dữ liệu hiện tại. Hãy sao lưu trước khi chạy.
#
# Dùng (chạy ở thư mục gốc dự án):
#   bash scripts/restore.sh ktta-YYYYMMDD-HHmmss.dump
set -euo pipefail

FILE="${1:?Cần tên file backup. Ví dụ: bash scripts/restore.sh ktta-20260625-020000.dump}"
BACKUP_DIR="./backup"
DB="${POSTGRES_DB:-ktta_db}"
DBUSER="${POSTGRES_USER:-ktta_user}"

if [ ! -f "$BACKUP_DIR/$FILE" ]; then
  echo "❌ Không tìm thấy $BACKUP_DIR/$FILE"
  exit 1
fi

echo "⚠️  Sẽ KHÔI PHỤC DB '$DB' từ '$FILE'."
echo "    Toàn bộ dữ liệu hiện tại sẽ bị GHI ĐÈ."
read -r -p "Gõ 'yes' để tiếp tục: " ok
[ "$ok" = "yes" ] || { echo "Đã huỷ."; exit 1; }

# Đưa file vào container postgres rồi pg_restore (--clean --if-exists: drop & tạo lại object)
docker compose cp "$BACKUP_DIR/$FILE" postgres:/tmp/restore.dump
docker compose exec -T postgres pg_restore \
  --clean --if-exists --no-owner --no-privileges \
  -U "$DBUSER" -d "$DB" /tmp/restore.dump
docker compose exec -T postgres rm -f /tmp/restore.dump

echo "✅ Khôi phục hoàn tất từ $FILE"

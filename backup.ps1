# ============================================================
#  backup.ps1 — Tạo backup PostgreSQL tương thích cross-platform
#  Chạy: .\backup.ps1
#  Yêu cầu: pg_dump có trong PATH (cài PostgreSQL hoặc chỉ client tools)
# ============================================================

# ── Đọc biến môi trường từ backend\.env ──────────────────────
$envFile = Join-Path $PSScriptRoot "backend\.env"
if (-not (Test-Path $envFile)) {
    Write-Error "Không tìm thấy file $envFile"
    exit 1
}

$envVars = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        $envVars[$matches[1].Trim()] = $matches[2].Trim()
    }
}

$DB_HOST = $envVars['POSTGRES_HOST'] ?? 'localhost'
$DB_PORT = $envVars['POSTGRES_PORT'] ?? '5432'
$DB_NAME = $envVars['POSTGRES_DB']   ?? 'ktta_db'
$DB_USER = $envVars['POSTGRES_USER'] ?? 'ktta_user'
$DB_PASS = $envVars['POSTGRES_PASSWORD']

if (-not $DB_PASS) {
    # Thử parse từ DATABASE_URL nếu không có POSTGRES_PASSWORD riêng
    if ($envVars['DATABASE_URL'] -match 'postgresql://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)') {
        $DB_USER = $matches[1]
        $DB_PASS = $matches[2]
        $DB_HOST = $matches[3]
        $DB_PORT = if ($matches[4]) { $matches[4] } else { '5432' }
        $DB_NAME = $matches[5]
    }
}

# ── Tạo thư mục output ────────────────────────────────────────
$timestamp  = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir  = Join-Path $PSScriptRoot "backups"
$sqlFile    = Join-Path $backupDir "backup_${timestamp}.sql"
$zipFile    = Join-Path $PSScriptRoot "backup_${timestamp}.zip"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "  Database : $DB_NAME @ $DB_HOST:$DB_PORT"
Write-Host "  Output   : $sqlFile"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Set password cho pg_dump (không hỏi mật khẩu) ────────────
$env:PGPASSWORD = $DB_PASS

# ── Chạy pg_dump với -f flag (QUAN TRỌNG: tránh UTF-16 của PS) ──
#
#  Giải thích các flag:
#    -f        : ghi thẳng vào file (pg_dump tự xử lý, UTF-8 chuẩn)
#    --format=plain : plain SQL, dễ đọc và import bằng psql
#    --encoding=UTF8 : đảm bảo encoding UTF-8 trong file
#    --no-password   : không hỏi password (đã set PGPASSWORD)
#    --clean         : thêm DROP trước CREATE (tiện khi restore vào db đã có bảng)
#    --if-exists     : đi kèm --clean để tránh lỗi nếu object chưa tồn tại
#    --no-owner      : không ghi câu lệnh ALTER OWNER (tránh lỗi permission trên server khác)
#    --no-acl        : không ghi GRANT/REVOKE (tránh lỗi permission trên server khác)
#
pg_dump `
    --host=$DB_HOST `
    --port=$DB_PORT `
    --username=$DB_USER `
    --dbname=$DB_NAME `
    --format=plain `
    --encoding=UTF8 `
    --no-password `
    --clean `
    --if-exists `
    --no-owner `
    --no-acl `
    -f "$sqlFile"

if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump thất bại (exit code $LASTEXITCODE)"
    $env:PGPASSWORD = $null
    exit 1
}

# Xoá password khỏi môi trường
$env:PGPASSWORD = $null

# Kiểm tra file đầu ra hợp lệ (UTF-8, không phải UTF-16)
$firstBytes = [System.IO.File]::ReadAllBytes($sqlFile) | Select-Object -First 3
$isUTF16LE  = ($firstBytes[0] -eq 0xFF -and $firstBytes[1] -eq 0xFE)
$isUTF16BE  = ($firstBytes[0] -eq 0xFE -and $firstBytes[1] -eq 0xFF)
if ($isUTF16LE -or $isUTF16BE) {
    Write-Error "CẢNH BÁO: File vẫn là UTF-16! Kiểm tra lại lệnh pg_dump."
    exit 1
}

Write-Host "[OK] pg_dump hoan thanh — $('{0:N0}' -f (Get-Item $sqlFile).Length) bytes"

# ── Nén thành ZIP ─────────────────────────────────────────────
Compress-Archive -Path $sqlFile -DestinationPath $zipFile -Force
Remove-Item $sqlFile  # Xoá file sql thô, giữ lại zip

$zipSize = [math]::Round((Get-Item $zipFile).Length / 1KB, 1)
Write-Host "[OK] Da nen: $zipFile ($zipSize KB)"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""
Write-Host "  Lệnh restore trên Ubuntu server:"
Write-Host ""
Write-Host "    # 1. Giải nén"
Write-Host "    unzip backup_${timestamp}.zip"
Write-Host ""
Write-Host "    # 2. Tạo database nếu chưa có"
Write-Host "    createdb -U ktta_user ktta_db"
Write-Host ""
Write-Host "    # 3. Import"
Write-Host "    psql -U ktta_user -d ktta_db -f backup_${timestamp}.sql"
Write-Host ""
Write-Host "    # Hoặc một lệnh:"
Write-Host "    unzip -p backup_${timestamp}.zip | psql -U ktta_user -d ktta_db"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

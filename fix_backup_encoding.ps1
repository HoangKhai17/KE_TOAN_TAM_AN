# fix_backup_encoding.ps1
# Chuyen file SQL tu UTF-16 LE sang UTF-8 khong BOM
# Chay: .\fix_backup_encoding.ps1 .\backup_20260527_093536.zip

param(
    [Parameter(Mandatory=$true)]
    [string]$ZipPath
)

if (-not (Test-Path $ZipPath)) {
    Write-Error "Khong tim thay file: $ZipPath"
    exit 1
}

$zipName    = [System.IO.Path]::GetFileNameWithoutExtension($ZipPath)
$dir        = [System.IO.Path]::GetDirectoryName((Resolve-Path $ZipPath))
$extractDir = Join-Path $dir "${zipName}_extracted"
$fixedSql   = Join-Path $dir "${zipName}_utf8.sql"
$fixedZip   = Join-Path $dir "${zipName}_utf8.zip"

Write-Host "Dang giai nen $ZipPath ..."
Expand-Archive -Path $ZipPath -DestinationPath $extractDir -Force

$sqlFile = Get-ChildItem -Path $extractDir -Filter "*.sql" | Select-Object -First 1
if (-not $sqlFile) {
    Write-Error "Khong tim thay file .sql trong zip"
    Remove-Item -Recurse -Force $extractDir
    exit 1
}

Write-Host "Tim thay: $($sqlFile.Name) ($([math]::Round($sqlFile.Length/1KB,1)) KB)"

# Doc voi encoding tu dong (nhan dien UTF-16), ghi lai UTF-8 khong BOM
$content   = [System.IO.File]::ReadAllText($sqlFile.FullName)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($fixedSql, $content, $utf8NoBom)

# Kiem tra ket qua
$bytes = [System.IO.File]::ReadAllBytes($fixedSql) | Select-Object -First 4
if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    Write-Error "Van con UTF-16 LE BOM. That bai."
    Remove-Item -Recurse -Force $extractDir; Remove-Item -Force $fixedSql
    exit 1
}
if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    # Co UTF-8 BOM - xoa di
    $raw = [System.IO.File]::ReadAllBytes($fixedSql)
    [System.IO.File]::WriteAllBytes($fixedSql, ($raw | Select-Object -Skip 3))
    Write-Host "Da xoa UTF-8 BOM."
}

$fixedSize = [math]::Round((Get-Item $fixedSql).Length / 1KB, 1)
Write-Host "[OK] Encoding da duoc chuyen: $fixedSize KB (UTF-8)"

# Nen lai thanh zip moi
Compress-Archive -Path $fixedSql -DestinationPath $fixedZip -Force
Remove-Item -Recurse -Force $extractDir
Remove-Item -Force $fixedSql

$zipKB = [math]::Round((Get-Item $fixedZip).Length / 1KB, 1)
Write-Host "[OK] Da tao: $fixedZip ($zipKB KB)"
Write-Host ""
Write-Host ">>> Lenh import tren Ubuntu:"
Write-Host "    unzip $([System.IO.Path]::GetFileName($fixedZip))"
Write-Host "    psql -U ktta_user -d ktta_db -f $([System.IO.Path]::GetFileName($fixedZip) -replace '\.zip$','.sql')"

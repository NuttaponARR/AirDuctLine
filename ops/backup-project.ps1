$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $projectRoot "backups"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipPath = Join-Path $backupRoot "office-mes-project-$stamp.zip"

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$items = @(
  "index.html",
  "app.js",
  "styles.css",
  "server.js",
  "ops",
  "scripts",
  "data",
  "uploads",
  "exports"
)

$existingItems = $items |
  ForEach-Object { Join-Path $projectRoot $_ } |
  Where-Object { Test-Path $_ }

Compress-Archive -Path $existingItems -DestinationPath $zipPath -Force

Write-Host "Full project backup created: $zipPath"

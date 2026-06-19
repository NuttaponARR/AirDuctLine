$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$port = if ($env:PORT) { $env:PORT } else { "8765" }
$hostName = if ($env:HOST) { $env:HOST } else { "0.0.0.0" }
$logDir = Join-Path $projectRoot "logs"
$pidFile = Join-Path $logDir "office-mes.pid"
$healthUrl = "http://127.0.0.1:$port/api/health"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (-not (Test-Path $nodePath)) {
  throw "Node runtime not found: $nodePath"
}

if (Test-Path $pidFile) {
  $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existingPid -and (Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue)) {
    Write-Host "Office MES is already running. PID: $existingPid"
    exit 0
  }
}

try {
  $existingHealth = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
  if ($existingHealth.StatusCode -eq 200) {
    Write-Host "Office MES is already responding at $healthUrl"
    Write-Host "Local URL: http://localhost:$port/"
    Write-Host "LAN URL: use this server IP, for example http://<server-ip>:$port/"
    exit 0
  }
} catch {
  $portOwner = Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($portOwner) {
    throw "Port $port is already in use by PID $($portOwner.OwningProcess), but it did not answer $healthUrl. Stop that process first, then run this script again."
  }
}

$process = [System.Diagnostics.Process]::new()

$oldPort = $env:PORT
$oldHost = $env:HOST
$env:PORT = $port
$env:HOST = $hostName
try {
  $process = Start-Process -FilePath $nodePath -ArgumentList "server.js" -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
} finally {
  if ($null -eq $oldPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $env:PORT = $oldPort }
  if ($null -eq $oldHost) { Remove-Item Env:HOST -ErrorAction SilentlyContinue } else { $env:HOST = $oldHost }
}
Set-Content -Path $pidFile -Value $process.Id

Start-Sleep -Milliseconds 800
$statusCode = (Invoke-WebRequest -Uri $healthUrl -UseBasicParsing).StatusCode

Write-Host "Office MES started. PID: $($process.Id)"
Write-Host "Local URL: http://localhost:$port/"
if ($env:LIFF_ID) {
  Write-Host "LIFF ID: $env:LIFF_ID"
}
if ($env:LINE_APP_URL) {
  Write-Host "LINE LIFF URL: $($env:LINE_APP_URL.TrimEnd('/'))/line.html"
}
Write-Host "LAN URL: use this server IP, for example http://<server-ip>:$port/"
Write-Host "Health: $healthUrl -> $statusCode"

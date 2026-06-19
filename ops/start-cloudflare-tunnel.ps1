param(
  [int]$Port = 8765,
  [string]$CloudflaredPath = "cloudflared"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot "logs"
$logFile = Join-Path $logDir "cloudflared-tunnel.log"
$errFile = Join-Path $logDir "cloudflared-tunnel.err.log"
$pidFile = Join-Path $logDir "cloudflared-tunnel.pid"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$command = Get-Command $CloudflaredPath -ErrorAction SilentlyContinue
if (-not $command) {
  throw "cloudflared was not found. Install Cloudflare Tunnel first, then run this script again."
}

if (Test-Path $pidFile) {
  $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existingPid -and (Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue)) {
    Write-Host "Cloudflare tunnel is already running. PID: $existingPid"
    Write-Host "Log: $logFile"
    exit 0
  }
}

Remove-Item -Path $logFile, $errFile -ErrorAction SilentlyContinue

$args = @("tunnel", "--url", "http://127.0.0.1:$Port", "--no-autoupdate")
$process = Start-Process -FilePath $command.Source -ArgumentList $args -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $errFile -PassThru
Set-Content -Path $pidFile -Value $process.Id

Write-Host "Cloudflare tunnel started. PID: $($process.Id)"
Write-Host "Waiting for public URL..."

$deadline = (Get-Date).AddSeconds(20)
$url = ""
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 700
  if (Test-Path $logFile) {
    $content = @()
    if (Test-Path $logFile) { $content += Get-Content $logFile -ErrorAction SilentlyContinue }
    if (Test-Path $errFile) { $content += Get-Content $errFile -ErrorAction SilentlyContinue }
    $match = $content | Select-String -Pattern "https://[-a-z0-9]+\.trycloudflare\.com" | Select-Object -Last 1
    if ($match) {
      $url = $match.Matches[0].Value
      break
    }
  }
}

if ($url) {
  Write-Host "Public HTTPS URL: $url"
  Write-Host "LINE LIFF Endpoint URL: $url/line.html"
  Write-Host "Set LINE_APP_URL=$url in .env.line"
} else {
  Write-Host "Tunnel started, but public URL was not found yet."
  Write-Host "Check log: $logFile"
}

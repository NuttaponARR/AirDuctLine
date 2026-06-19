param(
  [string]$EnvFile = (Join-Path (Split-Path -Parent $PSScriptRoot) ".env.line"),
  [string]$LiffId,
  [string]$LineAppUrl,
  [string]$Port,
  [string]$HostName
)

$ErrorActionPreference = "Stop"

function Import-LineEnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }
    $parts = $line -split "=", 2
    if ($parts.Count -ne 2) {
      return
    }
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if ($name) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

Import-LineEnvFile -Path $EnvFile

if ($LiffId) { $env:LIFF_ID = $LiffId }
if ($LineAppUrl) { $env:LINE_APP_URL = $LineAppUrl.TrimEnd("/") }
if ($Port) { $env:PORT = $Port }
if ($HostName) { $env:HOST = $HostName }

if (-not $env:LIFF_ID) {
  throw "Missing LIFF_ID. Fill .env.line or pass -LiffId."
}

if ($env:LIFF_ID -eq "PUT_YOUR_LIFF_ID_HERE" -or $env:LIFF_ID -eq "your-liff-id") {
  throw "Replace the LIFF_ID placeholder in .env.line with the real LIFF ID from LINE Developers."
}

if (-not $env:LINE_APP_URL) {
  throw "Missing LINE_APP_URL. Fill .env.line or pass -LineAppUrl with an HTTPS public URL."
}

if (-not $env:LINE_APP_URL.StartsWith("https://")) {
  throw "LINE_APP_URL must start with https:// for real LINE LIFF."
}

Write-Host "Starting Office MES for LINE LIFF..."
Write-Host "  LIFF ID: $env:LIFF_ID"
Write-Host "  Endpoint URL: $($env:LINE_APP_URL.TrimEnd('/'))/line.html"

& (Join-Path $PSScriptRoot "start-office-mes.ps1")

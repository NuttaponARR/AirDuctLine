param(
  [int]$Port = 18765,
  [string]$Secret = "codex-webhook-secret"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$node = "C:\Users\chokepisit\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path -LiteralPath $node)) { $node = "node" }

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers = @{},
    [string]$Body = ""
  )

  Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers -ContentType "application/json" -Body $Body
}

function New-LineSignature {
  param([string]$Body, [string]$Secret)

  $secretBytes = [Text.Encoding]::UTF8.GetBytes($Secret)
  $bodyBytes = [Text.Encoding]::UTF8.GetBytes($Body)
  $hmac = [System.Security.Cryptography.HMACSHA256]::new($secretBytes)
  try {
    [Convert]::ToBase64String($hmac.ComputeHash($bodyBytes))
  } finally {
    $hmac.Dispose()
  }
}

$oldPort = $env:PORT
$oldHost = $env:HOST
$oldSecret = $env:LINE_CHANNEL_SECRET
$oldToken = $env:LINE_CHANNEL_ACCESS_TOKEN
$process = $null

try {
  $env:PORT = [string]$Port
  $env:HOST = "127.0.0.1"
  $env:LINE_CHANNEL_SECRET = $Secret
  $env:LINE_CHANNEL_ACCESS_TOKEN = "codex-test-token"

  $process = Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $root -WindowStyle Hidden -PassThru

  $healthUri = "http://127.0.0.1:$Port/api/health"
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      Invoke-RestMethod -Method Get -Uri $healthUri | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $ready) {
    throw "Temporary server did not become ready on port $Port"
  }

  $webhookHealth = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/api/line/webhook/health"
  if (-not $webhookHealth.ok -or -not $webhookHealth.signatureRequired) {
    throw "Webhook health did not report signature verification enabled"
  }

  $eventId = "codex-webhook-test-$([Guid]::NewGuid().ToString("N"))"
  $bodyObject = @{
    destination = "UcodexDestination"
    events = @(
      @{
        type = "message"
        mode = "active"
        webhookEventId = $eventId
        timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        source = @{
          type = "user"
          userId = "UcodexWebhookUser"
        }
        message = @{
          type = "text"
          id = "codex-message-1"
          text = "CODX webhook verification"
        }
      }
    )
  }
  $body = $bodyObject | ConvertTo-Json -Depth 10 -Compress
  $signature = New-LineSignature -Body $body -Secret $Secret
  $result = Invoke-Json -Method Post -Uri "http://127.0.0.1:$Port/api/line/webhook" -Headers @{ "X-Line-Signature" = $signature } -Body $body
  if (-not $result.ok -or $result.received -ne 1) {
    throw "Webhook did not accept signed LINE event"
  }

  $diagnostics = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/api/line/webhook/diagnostics"
  if (-not $diagnostics.ok -or $diagnostics.items.Count -lt 1) {
    throw "Webhook diagnostics did not record the accepted request"
  }
  if ($diagnostics.items[0].status -ne 200 -or -not $diagnostics.items[0].signatureOk -or $diagnostics.items[0].eventCount -ne 1) {
    throw "Webhook diagnostics did not summarize the accepted request correctly"
  }

  $badSignature = New-LineSignature -Body $body -Secret "wrong-secret"
  try {
    Invoke-Json -Method Post -Uri "http://127.0.0.1:$Port/api/line/webhook" -Headers @{ "X-Line-Signature" = $badSignature } -Body $body | Out-Null
    throw "Webhook accepted an invalid signature"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -ne 401) {
      throw "Invalid signature returned unexpected status: $status"
    }
  }

  $diagnostics = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/api/line/webhook/diagnostics"
  if ($diagnostics.items[0].status -ne 401 -or $diagnostics.items[0].signatureOk) {
    throw "Webhook diagnostics did not record the rejected signature"
  }

  "line webhook verification passed"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  $env:PORT = $oldPort
  $env:HOST = $oldHost
  $env:LINE_CHANNEL_SECRET = $oldSecret
  $env:LINE_CHANNEL_ACCESS_TOKEN = $oldToken
}

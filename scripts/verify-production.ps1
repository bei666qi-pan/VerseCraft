param(
  [string]$BaseUrl = "https://game.versecraft.cn",
  [string]$ExpectedCommit = ""
)

$ErrorActionPreference = "Stop"

$outputDir = Join-Path (Get-Location) ".runtime-data/production-verify"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$root = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 30
if ($root.StatusCode -lt 200 -or $root.StatusCode -ge 400) {
  throw "Root URL returned HTTP $($root.StatusCode)."
}

$health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 30
if (($health | ConvertTo-Json -Compress) -notmatch "ok") {
  throw "Health endpoint did not report ok."
}

$buildInfo = Invoke-RestMethod -Uri "$BaseUrl/api/build-info" -TimeoutSec 30
if ($ExpectedCommit -and (($buildInfo | ConvertTo-Json -Compress) -notmatch [regex]::Escape($ExpectedCommit))) {
  throw "Build info does not contain expected commit $ExpectedCommit."
}

[pscustomobject]@{
  ok = $true
  baseUrl = $BaseUrl
  health = $health
  buildInfo = $buildInfo
  outputDir = $outputDir
} | ConvertTo-Json -Depth 8

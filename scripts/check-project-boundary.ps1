param(
  [string]$ExpectedNamePattern = "(versecraft-game|game-versecraft|VerseCraft)"
)

$ErrorActionPreference = "Stop"

$top = (& git rev-parse --show-toplevel 2>$null).Trim()
if (-not $top) {
  throw "Not inside a Git repository."
}

$repoName = Split-Path -Leaf $top
$remote = (& git remote get-url origin 2>$null).Trim()

if ($repoName -notmatch $ExpectedNamePattern -and $remote -notmatch "VerseCraft|versecraft") {
  throw "Repository boundary check failed: $top / $remote"
}

[pscustomobject]@{
  ok = $true
  repoRoot = $top
  branch = (& git branch --show-current).Trim()
  remotePresent = [bool]$remote
} | ConvertTo-Json -Compress

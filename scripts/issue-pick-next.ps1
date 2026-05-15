param(
  [string]$Repo = ""
)

$ErrorActionPreference = "Stop"

$repoArgs = @()
if ($Repo) {
  $repoArgs = @("--repo", $Repo)
}

$working = gh issue list @repoArgs --state open --label "codex:working" --limit 20 --json number,title,labels,updatedAt | ConvertFrom-Json
if ($working.Count -gt 0) {
  $working | Sort-Object updatedAt | Select-Object -First 1 | ConvertTo-Json -Compress
  exit 0
}

$ready = gh issue list @repoArgs --state open --label "codex:ready" --label "agent:approved" --limit 50 --json number,title,labels,updatedAt | ConvertFrom-Json
$ranked = $ready | Sort-Object @{
  Expression = {
    $names = $_.labels.name
    if ($names -contains "priority:P0") { 0 }
    elseif ($names -contains "priority:P1") { 1 }
    else { 2 }
  }
}, updatedAt

$ranked | Select-Object -First 1 | ConvertTo-Json -Compress

param(
  [string]$Repo = ""
)

$ErrorActionPreference = "Stop"

$issueJson = & "$PSScriptRoot/issue-worker-detect.ps1" -Repo $Repo
if (-not $issueJson) {
  "No codex:working or agent:approved + codex:ready issue found."
  exit 0
}

$issue = $issueJson | ConvertFrom-Json
"Next issue: #$($issue.number) $($issue.title)"
& "$PSScriptRoot/issue-generate-codex-prompt.ps1" -IssueNumber $issue.number -Repo $Repo

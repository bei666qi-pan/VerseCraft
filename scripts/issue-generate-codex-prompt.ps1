param(
  [Parameter(Mandatory = $true)]
  [int]$IssueNumber,
  [string]$Repo = ""
)

$ErrorActionPreference = "Stop"

$repoArgs = @()
if ($Repo) {
  $repoArgs = @("--repo", $Repo)
}

$issue = gh issue view $IssueNumber @repoArgs --json number,title,body,labels,url | ConvertFrom-Json
$labels = ($issue.labels | ForEach-Object { $_.name }) -join ", "

@"
Issue #$($issue.number): $($issue.title)
URL: $($issue.url)
Labels: $labels

Read before editing:
- AGENTS.md
- docs/ACCEPTANCE.md
- docs/ISSUE_WORKER.md

Issue body:
$($issue.body)
"@

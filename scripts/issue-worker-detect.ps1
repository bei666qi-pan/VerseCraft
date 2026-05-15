param(
  [string]$Repo = ""
)

$ErrorActionPreference = "Stop"

& "$PSScriptRoot/check-project-boundary.ps1" | Out-Null
& "$PSScriptRoot/issue-pick-next.ps1" -Repo $Repo

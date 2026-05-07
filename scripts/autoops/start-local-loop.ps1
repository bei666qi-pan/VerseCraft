param(
  [int]$IntervalMs = 300000,
  [switch]$PushMain,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

$pnpmArgs = @("autoops:local-loop", "--", "--interval-ms", "$IntervalMs")

if ($PushMain) {
  $pnpmArgs += "--push-main"
}

if ($DryRun) {
  $pnpmArgs += "--dry-run"
}

pnpm @pnpmArgs

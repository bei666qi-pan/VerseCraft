$ErrorActionPreference = "Stop"

& "$PSScriptRoot/check-project-boundary.ps1" | Out-Null
npx eslint .
pnpm build
"Project health checks passed."

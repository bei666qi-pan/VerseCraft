param(
  [string[]]$Paths = @(".")
)

$ErrorActionPreference = "Stop"

$patterns = @(
  "sk-[A-Za-z0-9]{32,}",
  "sk-(proj|svcacct|admin)-[A-Za-z0-9_-]{20,}",
  "ghp_[A-Za-z0-9_]{20,}",
  "github_pat_[A-Za-z0-9_]{20,}",
  "xox[baprs]-[A-Za-z0-9-]{20,}",
  "AKIA[0-9A-Z]{16}",
  "-----BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----"
)

$excludeDirs = @("\.git\", "\node_modules\", "\.next\", "\.pnpm-store\", "\.runtime-data\")
$files = foreach ($path in $Paths) {
  Get-ChildItem -Path $path -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object {
      $full = $_.FullName
      -not ($excludeDirs | Where-Object { $full -match [regex]::Escape($_) })
    }
}

$matches = foreach ($file in $files) {
  foreach ($pattern in $patterns) {
    Select-String -Path $file.FullName -Pattern $pattern -ErrorAction SilentlyContinue |
      ForEach-Object {
        [pscustomobject]@{
          file = Resolve-Path -Relative $_.Path
          line = $_.LineNumber
          pattern = $pattern
        }
      }
  }
}

if ($matches) {
  $matches | ConvertTo-Json
  throw "Potential secret leak detected."
}

"No secret-like values detected."

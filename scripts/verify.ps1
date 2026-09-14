$ErrorActionPreference = 'Continue'
$projectPath = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectPath
try {
  New-Item -ItemType Directory -Force -Path artifacts | Out-Null
  $failed = @()
  foreach ($gate in @('typecheck', 'test', 'format:check', 'build', 'test:database')) {
    $filename = $gate.Replace(':', '-')
    & npm.cmd run $gate 2>&1 | Tee-Object -FilePath "artifacts/$filename.txt"
    if ($LASTEXITCODE -ne 0) { $failed += $gate }
  }
  & docker compose --env-file .env.example config --quiet 2>&1 | Tee-Object -FilePath artifacts/compose.txt
  $composeExit = $LASTEXITCODE
  Write-Output "Compose config exit code: $composeExit" | Tee-Object -FilePath artifacts/compose.txt -Append
  if ($composeExit -ne 0) { $failed += 'compose' }
  if ($failed.Count) { throw "Failed gates: $($failed -join ', ')" }
  Write-Output 'Quality gates completed. Inspect skipped DB tests; this is not Supabase evidence.'
} finally { Pop-Location }

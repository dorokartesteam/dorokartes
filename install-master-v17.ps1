$ErrorActionPreference = "Stop"
$project = "D:\dorokartes"
$source = Join-Path $PSScriptRoot "scripts\audit\master-catalog-reconciliation-v17.ts"
$destDir = Join-Path $project "scripts\audit"
$dest = Join-Path $destDir "master-catalog-reconciliation-v17.ts"

if (!(Test-Path $source)) { throw "Source file not found: $source" }
if (!(Test-Path $project)) { throw "Project not found: $project" }

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item -Force $source $dest

Write-Host "Installed:" $dest
Write-Host "Run preview:"
Write-Host "  cd D:\dorokartes"
Write-Host "  npx tsx scripts/audit/master-catalog-reconciliation-v17.ts"

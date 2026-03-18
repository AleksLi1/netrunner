$dest = "$env:USERPROFILE\.claude\commands\nr.md"
$src = Join-Path $PSScriptRoot "nr.md"

New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item $src $dest -Force
Write-Host "Netrunner installed at $dest"
Write-Host "Use /nr <query> in any Claude Code project."
Write-Host "Use /nr init to build a context file for the current repo."

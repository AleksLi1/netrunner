$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$NrDir = Join-Path $ClaudeDir "netrunner"

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host " NR ► Installing Netrunner"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create directories
$CommandsDir = Join-Path $ClaudeDir "commands"
$NrCommandsDir = Join-Path $CommandsDir "nr"
$AgentsDir = Join-Path $ClaudeDir "agents"

foreach ($dir in @($NrCommandsDir, $AgentsDir,
    (Join-Path $NrDir "bin"), (Join-Path $NrDir "workflows"),
    (Join-Path $NrDir "templates"), (Join-Path $NrDir "references"),
    (Join-Path $NrDir "overlays"))) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

# Commands (3 only)
Copy-Item (Join-Path $ScriptDir "commands\nr.md") (Join-Path $CommandsDir "nr.md") -Force
Copy-Item (Join-Path $ScriptDir "commands\nr\run.md") (Join-Path $NrCommandsDir "run.md") -Force
Copy-Item (Join-Path $ScriptDir "commands\nr\update.md") (Join-Path $NrCommandsDir "update.md") -Force

# Remove old commands that no longer exist
$oldCommands = @("scope.md", "plan.md", "execute.md", "verify.md", "debug.md",
    "progress.md", "resume.md", "map-codebase.md", "do.md")
foreach ($old in $oldCommands) {
    $oldPath = Join-Path $NrCommandsDir $old
    if (Test-Path $oldPath) { Remove-Item $oldPath -Force }
}

# Workflows
Get-ChildItem (Join-Path $ScriptDir "workflows\*.md") | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $NrDir "workflows" | Join-Path -ChildPath $_.Name) -Force
}

# Agents
Get-ChildItem (Join-Path $ScriptDir "agents\nr-*.md") | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $AgentsDir $_.Name) -Force
}

# CLI tools
Get-ChildItem (Join-Path $ScriptDir "bin\*") | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $NrDir "bin" | Join-Path -ChildPath $_.Name) -Force
}

# Templates
$templatesSrc = Join-Path $ScriptDir "templates"
if (Test-Path $templatesSrc) {
    Get-ChildItem (Join-Path $templatesSrc "*") | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $NrDir "templates" | Join-Path -ChildPath $_.Name) -Force
    }
}

# References
$referencesSrc = Join-Path $ScriptDir "references"
if (Test-Path $referencesSrc) {
    Get-ChildItem (Join-Path $referencesSrc "*") | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $NrDir "references" | Join-Path -ChildPath $_.Name) -Force
    }
}

# Overlays (if present)
$overlaysSrc = Join-Path $ScriptDir "overlays"
if (Test-Path $overlaysSrc) {
    Get-ChildItem (Join-Path $overlaysSrc "*") -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $NrDir "overlays" | Join-Path -ChildPath $_.Name) -Force
    }
}

# Examples (if present)
$examplesSrc = Join-Path $ScriptDir "examples"
if (Test-Path $examplesSrc) {
    $examplesDest = Join-Path $NrDir "examples"
    New-Item -ItemType Directory -Force -Path $examplesDest | Out-Null
    Get-ChildItem (Join-Path $examplesSrc "*") | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $examplesDest $_.Name) -Force
    }
}

# Version file
$versionFile = Join-Path $ScriptDir "VERSION"
if (Test-Path $versionFile) {
    Copy-Item $versionFile (Join-Path $NrDir "VERSION") -Force
}

# Package file (for npm deps if any)
$packageFile = Join-Path $ScriptDir "package.json"
if (Test-Path $packageFile) {
    Copy-Item $packageFile (Join-Path $NrDir "package.json") -Force
    Push-Location $NrDir
    try { npm install --production --silent 2>$null } catch {}
    Pop-Location
}

$workflowCount = (Get-ChildItem (Join-Path $NrDir "workflows\*.md") -ErrorAction SilentlyContinue).Count
$agentCount = (Get-ChildItem (Join-Path $AgentsDir "nr-*.md") -ErrorAction SilentlyContinue).Count

Write-Host ""
Write-Host " Commands:  3 (nr, nr:run, nr:update)"
Write-Host " Workflows: $workflowCount"
Write-Host " Agents:    $agentCount"
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host " NR ► Installation complete"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""
Write-Host " Get started: /nr:run 'describe your project'"

# Netrunner installer — thin wrapper around scripts/postinstall.cjs.
#
# The canonical install logic lives in scripts/postinstall.cjs (so
# `npm install netrunner-cc` and manual `.\install.ps1` share the same
# code path). This script exists so users can install from a git clone
# without needing to know the node invocation.

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "'node' is required but was not found in PATH. Install Node.js >= 18 from https://nodejs.org and try again."
    exit 1
}

& node (Join-Path $ScriptDir "scripts\postinstall.cjs")
exit $LASTEXITCODE

#!/usr/bin/env bash
# Netrunner installer — thin wrapper around scripts/postinstall.cjs.
#
# The canonical install logic lives in scripts/postinstall.cjs (so `npm
# install netrunner-cc` and manual `bash install.sh` share the same code
# path). This script exists so users can install from a git clone without
# needing to know the node invocation.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: 'node' is required but was not found in PATH."
  echo "Install Node.js >= 18 from https://nodejs.org and try again."
  exit 1
fi

exec node "$SCRIPT_DIR/scripts/postinstall.cjs"

#!/usr/bin/env bash
# Netrunner remote installer
# Usage: curl -sL https://raw.githubusercontent.com/netrunner-cc/netrunner/main/scripts/remote-install.sh | bash
set -e

REPO="https://github.com/netrunner-cc/netrunner.git"
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " NR ► Remote Install"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check prerequisites
if ! command -v node &>/dev/null; then
  echo "Error: Node.js >= 18 is required. Install from https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js >= 18 required (found v$(node -v))"
  exit 1
fi

# Try npm first (preferred)
if command -v npm &>/dev/null; then
  echo " Using npm..."
  npm install -g netrunner-cc
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " NR ► Installed via npm"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
fi

# Fallback: git clone + install.sh
if ! command -v git &>/dev/null; then
  echo "Error: Either npm or git is required"
  exit 1
fi

echo " Cloning repository..."
git clone --depth 1 "$REPO" "$TMP_DIR/netrunner" 2>/dev/null

echo " Installing..."
cd "$TMP_DIR/netrunner"
bash install.sh

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " NR ► Installed via git clone"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo " To update later: /nr:update"

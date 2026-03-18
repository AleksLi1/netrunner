#!/usr/bin/env bash
set -e

DEST="$HOME/.claude/commands/nr.md"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$HOME/.claude/commands"
cp "$SCRIPT_DIR/nr.md" "$DEST"
echo "Netrunner installed at $DEST"
echo "Use /nr <query> in any Claude Code project."
echo "Use /nr init to build a context file for the current repo."

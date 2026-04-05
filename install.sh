#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
NR_DIR="$CLAUDE_DIR/netrunner"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " NR ► Installing Netrunner"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create directories
mkdir -p "$NR_DIR"/{bin,workflows,templates,references,examples}
mkdir -p "$CLAUDE_DIR/commands/nr"
mkdir -p "$CLAUDE_DIR/agents"

# Commands (3 only)
cp "$SCRIPT_DIR/commands/nr.md" "$CLAUDE_DIR/commands/nr.md"
cp "$SCRIPT_DIR/commands/nr/run.md" "$CLAUDE_DIR/commands/nr/run.md"
cp "$SCRIPT_DIR/commands/nr/update.md" "$CLAUDE_DIR/commands/nr/update.md"

# Remove old commands that no longer exist
for old_cmd in scope.md plan.md execute.md verify.md debug.md progress.md resume.md map-codebase.md do.md; do
  rm -f "$CLAUDE_DIR/commands/nr/$old_cmd"
done

# Workflows
cp "$SCRIPT_DIR/workflows/"*.md "$NR_DIR/workflows/"

# Agents
for f in "$SCRIPT_DIR/agents/nr-"*.md; do
  [ -f "$f" ] && cp "$f" "$CLAUDE_DIR/agents/"
done

# CLI tools
cp "$SCRIPT_DIR/bin/"* "$NR_DIR/bin/"
chmod +x "$NR_DIR/bin/"* 2>/dev/null || true

# Templates (recursive — has subdirectories)
cp -r "$SCRIPT_DIR/templates/"* "$NR_DIR/templates/" 2>/dev/null || true

# References
cp "$SCRIPT_DIR/references/"* "$NR_DIR/references/" 2>/dev/null || true

# Examples (if present)
if [ -d "$SCRIPT_DIR/examples" ]; then
  mkdir -p "$NR_DIR/examples"
  cp "$SCRIPT_DIR/examples/"* "$NR_DIR/examples/" 2>/dev/null || true
fi

# Version file
if [ -f "$SCRIPT_DIR/VERSION" ]; then
  cp "$SCRIPT_DIR/VERSION" "$NR_DIR/VERSION"
fi

# Package file (for npm deps if any)
if [ -f "$SCRIPT_DIR/package.json" ]; then
  cp "$SCRIPT_DIR/package.json" "$NR_DIR/package.json"
  cd "$NR_DIR" && npm install --production --silent 2>/dev/null || true
fi

echo ""
echo " Commands: 3 (nr, nr:run, nr:update)"
echo " Workflows: $(ls "$NR_DIR/workflows/"*.md 2>/dev/null | wc -l | tr -d ' ')"
echo " Agents:    $(ls "$CLAUDE_DIR/agents/"nr-*.md 2>/dev/null | wc -l | tr -d ' ')"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " NR ► Installation complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo " Get started: /nr:run \"describe your project\""

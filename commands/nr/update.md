# Netrunner Update — Self-Update

<purpose>
Check for updates to the Netrunner package and upgrade the installed version. Compares the local installation against the latest version from the repository, shows what changed, and applies the update with user confirmation.
</purpose>

<process>

## Step 1 — Detect Installation

Locate the Netrunner installation:

```bash
NR_DIR="$HOME/.claude/netrunner"
if [ ! -d "$NR_DIR" ]; then
  echo "Netrunner not found at $NR_DIR"
  exit 1
fi
```

Read current version:
```bash
CURRENT_VERSION=$(cat "$NR_DIR/VERSION" 2>/dev/null || echo "unknown")
```

## Step 2 — Check for Updates

Fetch the latest version from the remote repository:

```bash
cd "$NR_DIR"
git fetch origin main --quiet 2>/dev/null
```

Compare local vs remote:
```bash
LOCAL_HEAD=$(git rev-parse HEAD 2>/dev/null)
REMOTE_HEAD=$(git rev-parse origin/main 2>/dev/null)
```

**If already up to date** (`LOCAL_HEAD` == `REMOTE_HEAD`):
```
Netrunner is up to date (version: $CURRENT_VERSION).
```
Exit.

## Step 3 — Analyze Changes

Get the diff between current and latest:
```bash
cd "$NR_DIR"
git log --oneline HEAD..origin/main
```

Read both the installed and latest versions of changed files. Produce a human-readable summary:
- New features or commands added
- Behavioral changes (classification types, question flows, etc.)
- Bug fixes or removed functionality
- Keep it to 3-8 bullet points

## Step 4 — Confirm Update

Present changes and ask for confirmation:

```
A newer version of Netrunner is available.

Current: [current version/commit]
Latest: [latest version/commit]

Changes:
- [change 1]
- [change 2]
- [change 3]

Options:
1. Update now — Install the latest version (current version backed up)
2. Show full diff — Display complete diff before deciding
3. Skip — Keep current version
```

Use AskUserQuestion if available, otherwise present as text and wait for response.

### On "Update now":

Proceed to Step 5.

### On "Show full diff":

```bash
cd "$NR_DIR"
git diff HEAD..origin/main
```

Display the diff, then re-ask: "Update now or skip?"

### On "Skip":

```
Update skipped. Current version retained.
Run /nr:update anytime to check again.
```
Exit.

## Step 5 — Apply Update

### Backup current version:
```bash
BACKUP_DIR="$NR_DIR/.backup/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r "$NR_DIR/nr.md" "$BACKUP_DIR/" 2>/dev/null
cp -r "$NR_DIR/bin/" "$BACKUP_DIR/" 2>/dev/null
cp -r "$NR_DIR/VERSION" "$BACKUP_DIR/" 2>/dev/null
```

### Pull latest:
```bash
cd "$NR_DIR"
git pull origin main
```

### Install dependencies (if applicable):
```bash
cd "$NR_DIR"
if [ -f "package.json" ]; then
  npm install --production 2>/dev/null
fi
```

### Run install script (if exists):
```bash
if [ -f "$NR_DIR/install.sh" ]; then
  bash "$NR_DIR/install.sh"
elif [ -f "$NR_DIR/install.ps1" ]; then
  echo "Windows detected — run install.ps1 manually if needed"
fi
```

## Step 6 — Verify Update

```bash
NEW_VERSION=$(cat "$NR_DIR/VERSION" 2>/dev/null || echo "unknown")
```

Verify key files exist:
```bash
[ -f "$NR_DIR/nr.md" ] && echo "nr.md OK" || echo "nr.md MISSING"
[ -f "$NR_DIR/bin/nr-tools.cjs" ] && echo "nr-tools.cjs OK" || echo "nr-tools.cjs MISSING"
```

## Step 7 — Report

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Previous: [old version]
 Current: [new version]

 Changes applied:
 - [change 1]
 - [change 2]
 - [change 3]

 Backup: [backup directory]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Restart your Claude Code session to use the new version.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### On failure:

```
Update failed. Restoring backup...

[restore from backup directory]

Previous version restored. Please report this issue.
```

</process>

<success_criteria>
- [ ] Current version detected
- [ ] Remote version checked
- [ ] Changes summarized in human-readable format
- [ ] User confirmation obtained before updating
- [ ] Backup created before applying update
- [ ] Update applied cleanly
- [ ] Key files verified after update
- [ ] User informed to restart session
</success_criteria>

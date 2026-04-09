# Netrunner Update — Self-Update

<purpose>
Check for updates to the Netrunner package and upgrade the installed version. Compares the installed version against the latest from the upstream repository, shows what changed, and applies the update with user confirmation.
</purpose>

<install_model>
Netrunner is installed as a **file copy**, not a git clone:
- Source: https://github.com/AleksLi1/netrunner (repo) or `netrunner-cc` on npm
- Install target: `~/.claude/netrunner/` — just a destination, **never** a git repo
- `install.sh` / `install.ps1` / `scripts/postinstall.cjs` all copy files from a source directory into the target

The update flow must therefore:
1. Read the **installed** version from `~/.claude/netrunner/VERSION`
2. Fetch the **remote** version via GitHub raw URL (no git in install dir)
3. On confirm: clone the repo to a **temp directory**, then run its installer to copy files into place
4. Clean up the temp directory

Do **not** attempt `git fetch` / `git pull` inside `~/.claude/netrunner/` — it is not a git repository.
</install_model>

<process>

## Step 1 — Detect Installation

```bash
NR_DIR="$HOME/.claude/netrunner"
if [ ! -d "$NR_DIR" ]; then
  echo "Netrunner not found at $NR_DIR"
  echo "Install from https://github.com/AleksLi1/netrunner"
  exit 1
fi

CURRENT_VERSION=$(cat "$NR_DIR/VERSION" 2>/dev/null || echo "unknown")
echo "Installed version: $CURRENT_VERSION"
```

## Step 2 — Check Remote Version

Fetch the latest `VERSION` file directly from GitHub raw. Try `master` first, then `main`:

```bash
REPO_URL="https://github.com/AleksLi1/netrunner.git"
RAW_BASE="https://raw.githubusercontent.com/AleksLi1/netrunner"

REMOTE_VERSION=""
DEFAULT_BRANCH=""
for branch in master main; do
  v=$(curl -fsSL "$RAW_BASE/$branch/VERSION" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$v" ]; then
    REMOTE_VERSION="$v"
    DEFAULT_BRANCH="$branch"
    break
  fi
done

if [ -z "$REMOTE_VERSION" ]; then
  echo "Could not reach GitHub to check for updates."
  echo "Check your network connection and try again."
  exit 1
fi

echo "Remote version:    $REMOTE_VERSION (branch: $DEFAULT_BRANCH)"
```

**If already up to date** (`CURRENT_VERSION` == `REMOTE_VERSION`):
```
Netrunner is up to date (version: $CURRENT_VERSION).
```
Exit.

## Step 3 — Clone Source to Temp Directory

To show a changelog and apply the update, clone the repo shallowly to a temp dir:

```bash
TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t 'nr-update')
git clone --depth 50 --branch "$DEFAULT_BRANCH" --quiet "$REPO_URL" "$TMP_DIR" || {
  echo "Failed to clone $REPO_URL"
  rm -rf "$TMP_DIR"
  exit 1
}
```

## Step 4 — Summarize Changes

Show recent commits and, if possible, a diff summary against the installed version. Since the install dir has no git history, use the VERSION strings and recent commit log as a changelog proxy:

```bash
cd "$TMP_DIR"
git log --oneline -20
```

Read the most recent commits and any `CHANGELOG.md` / `README.md` sections describing the new version, and produce a human-readable summary (3–8 bullet points):
- New features or commands added
- Behavioral changes (classification, agents, workflows)
- Bug fixes or removed functionality
- Any migration notes

## Step 5 — Confirm Update

Present changes and ask for confirmation. Prefer `AskUserQuestion`:

```
A newer version of Netrunner is available.

Current: $CURRENT_VERSION
Latest:  $REMOTE_VERSION

Changes:
- [change 1]
- [change 2]
- [change 3]

Options:
1. Update now — install the latest version (current files backed up)
2. Show full diff — display the recent commit diffs before deciding
3. Skip — keep current version
```

### On "Show full diff":

```bash
cd "$TMP_DIR"
git log -p -10
```

Then re-ask: "Update now or skip?"

### On "Skip":

```
Update skipped. Current version retained.
```

Clean up and exit:
```bash
rm -rf "$TMP_DIR"
```

## Step 6 — Backup Current Installation

Before overwriting, snapshot the current install so we can restore on failure:

```bash
BACKUP_DIR="$NR_DIR/.backup/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r "$NR_DIR/bin"        "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$NR_DIR/workflows"  "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$NR_DIR/templates"  "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$NR_DIR/references" "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$NR_DIR/examples"   "$BACKUP_DIR/" 2>/dev/null || true
cp    "$NR_DIR/VERSION"    "$BACKUP_DIR/" 2>/dev/null || true
# Also back up the installed command and agent files that live outside NR_DIR:
cp    "$HOME/.claude/commands/nr.md"     "$BACKUP_DIR/commands-nr.md"     2>/dev/null || true
cp -r "$HOME/.claude/commands/nr"        "$BACKUP_DIR/commands-nr"        2>/dev/null || true
# (Agents are overwritten by the installer but not removed — no backup needed unless you want one.)

echo "Backup written to: $BACKUP_DIR"
```

## Step 7 — Apply Update

Run the installer **from the temp clone**. It will copy files into `~/.claude/netrunner/` and `~/.claude/commands/`, `~/.claude/agents/`, etc.

Prefer the shell installer (works on macOS, Linux, Windows git-bash):

```bash
if [ -f "$TMP_DIR/install.sh" ]; then
  bash "$TMP_DIR/install.sh"
elif [ -f "$TMP_DIR/scripts/postinstall.cjs" ]; then
  # Fallback: run the npm postinstall script directly.
  # It uses __dirname to locate the package root, so run it from the temp clone.
  (cd "$TMP_DIR" && node "$TMP_DIR/scripts/postinstall.cjs")
else
  echo "No installer found in the downloaded package."
  rm -rf "$TMP_DIR"
  exit 1
fi
```

On Windows **without** bash available, fall back to PowerShell:

```bash
if command -v powershell >/dev/null 2>&1 && [ -f "$TMP_DIR/install.ps1" ]; then
  powershell -NoProfile -ExecutionPolicy Bypass -File "$TMP_DIR/install.ps1"
fi
```

## Step 8 — Verify

```bash
NEW_VERSION=$(cat "$NR_DIR/VERSION" 2>/dev/null || echo "unknown")

# Spot-check key files:
[ -f "$NR_DIR/bin/nr-tools.cjs" ]        && echo "nr-tools.cjs OK"        || echo "nr-tools.cjs MISSING"
[ -f "$HOME/.claude/commands/nr.md" ]    && echo "commands/nr.md OK"      || echo "commands/nr.md MISSING"
[ -f "$HOME/.claude/commands/nr/run.md" ] && echo "commands/nr/run.md OK" || echo "commands/nr/run.md MISSING"
```

If `NEW_VERSION` does not equal `REMOTE_VERSION`, something went wrong — go to the failure path in Step 10.

## Step 9 — Clean Up & Report

```bash
rm -rf "$TMP_DIR"
```

Report success:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Previous: $CURRENT_VERSION
 Current:  $NEW_VERSION

 Changes applied:
 - [change 1]
 - [change 2]
 - [change 3]

 Backup:   $BACKUP_DIR

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Restart your Claude Code session to use the new version.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Step 10 — Failure Recovery

If the installer errored, or key files are missing, restore from backup:

```bash
echo "Update failed. Restoring from $BACKUP_DIR..."
cp -r "$BACKUP_DIR/bin"        "$NR_DIR/" 2>/dev/null || true
cp -r "$BACKUP_DIR/workflows"  "$NR_DIR/" 2>/dev/null || true
cp -r "$BACKUP_DIR/templates"  "$NR_DIR/" 2>/dev/null || true
cp -r "$BACKUP_DIR/references" "$NR_DIR/" 2>/dev/null || true
cp -r "$BACKUP_DIR/examples"   "$NR_DIR/" 2>/dev/null || true
cp    "$BACKUP_DIR/VERSION"    "$NR_DIR/" 2>/dev/null || true
cp    "$BACKUP_DIR/commands-nr.md"  "$HOME/.claude/commands/nr.md" 2>/dev/null || true
cp -r "$BACKUP_DIR/commands-nr"/*   "$HOME/.claude/commands/nr/"   2>/dev/null || true

rm -rf "$TMP_DIR"
echo "Previous version restored."
echo "Please report this issue: https://github.com/AleksLi1/netrunner/issues"
```

</process>

<success_criteria>
- [ ] Installed version read from `~/.claude/netrunner/VERSION`
- [ ] Remote version fetched via GitHub raw URL (no git operation in install dir)
- [ ] If versions match, report up-to-date and exit
- [ ] Source cloned to temp directory for changelog + installer
- [ ] Recent changes summarized in human-readable format
- [ ] User confirmation obtained before updating
- [ ] Backup created before applying update
- [ ] Installer run from the temp clone (`install.sh` preferred, `postinstall.cjs` fallback, `install.ps1` on Windows without bash)
- [ ] Temp directory cleaned up
- [ ] Key files verified after update
- [ ] On failure, backup restored and user informed
</success_criteria>

<anti_patterns>
- **Do NOT run `git fetch` / `git pull` / `git rev-parse` inside `~/.claude/netrunner/`** — it is a file-copy destination, not a git clone. This is what broke the previous version of this command for every non-developer user.
- **Do NOT ask the user to reinstall Netrunner as a git clone** to "enable updates." The install model is deliberately a file copy; the update flow must work with that model.
- **Do NOT copy files out of the current working directory** assuming it's a Netrunner source checkout. Always clone fresh to a temp dir so the update is reproducible regardless of where the command is run from.
</anti_patterns>

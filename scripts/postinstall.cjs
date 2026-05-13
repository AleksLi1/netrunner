#!/usr/bin/env node

/**
 * Netrunner postinstall script
 * Copies commands, agents, and support files to ~/.claude/
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const NR_DIR = path.join(CLAUDE_DIR, 'netrunner');
const COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands');
const AGENTS_DIR = path.join(CLAUDE_DIR, 'agents');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
const PKG_DIR = path.dirname(__dirname);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Installing Netrunner...');

// 1. Commands -> ~/.claude/commands/
ensureDir(path.join(COMMANDS_DIR, 'nr'));

// Clean stale command files — only keep files that exist in source commands/nr/
const installedNrDir = path.join(COMMANDS_DIR, 'nr');
const sourceNrDir = path.join(PKG_DIR, 'commands', 'nr');
const sourceFiles = new Set(fs.existsSync(sourceNrDir) ? fs.readdirSync(sourceNrDir) : []);
for (const file of fs.readdirSync(installedNrDir)) {
  if (file.endsWith('.md') && !sourceFiles.has(file)) {
    fs.unlinkSync(path.join(installedNrDir, file));
    console.log(`  Cleaned stale command: nr/${file}`);
  }
}

copyFile(path.join(PKG_DIR, 'commands', 'nr.md'), path.join(COMMANDS_DIR, 'nr.md'));
if (fs.existsSync(sourceNrDir)) {
  for (const file of fs.readdirSync(sourceNrDir)) {
    copyFile(path.join(sourceNrDir, file), path.join(COMMANDS_DIR, 'nr', file));
  }
}

// 2. Agents -> ~/.claude/agents/
ensureDir(AGENTS_DIR);
const agentsDir = path.join(PKG_DIR, 'agents');
if (fs.existsSync(agentsDir)) {
  for (const file of fs.readdirSync(agentsDir)) {
    if (file.startsWith('nr-')) {
      copyFile(path.join(agentsDir, file), path.join(AGENTS_DIR, file));
    }
  }
}

// 3. Support files -> ~/.claude/netrunner/
ensureDir(NR_DIR);
copyDir(path.join(PKG_DIR, 'bin'), path.join(NR_DIR, 'bin'));
copyDir(path.join(PKG_DIR, 'workflows'), path.join(NR_DIR, 'workflows'));
copyDir(path.join(PKG_DIR, 'templates'), path.join(NR_DIR, 'templates'));
copyDir(path.join(PKG_DIR, 'references'), path.join(NR_DIR, 'references'));
copyDir(path.join(PKG_DIR, 'examples'), path.join(NR_DIR, 'examples'));
copyFile(path.join(PKG_DIR, 'VERSION'), path.join(NR_DIR, 'VERSION'));

// 4. Make nr-tools.cjs executable
const nrTools = path.join(NR_DIR, 'bin', 'nr-tools.cjs');
if (fs.existsSync(nrTools)) {
  try { fs.chmodSync(nrTools, '755'); } catch (e) { /* Windows */ }
}

// 5. Install all hooks -> ~/.claude/hooks/
//    Stamp each hook's nr-hook-version tag with the current VERSION so the
//    staleness check in nr-check-update.js won't false-positive.
ensureDir(HOOKS_DIR);
const hooksSourceDir = path.join(PKG_DIR, 'hooks');
const currentVersion = fs.existsSync(path.join(PKG_DIR, 'VERSION'))
  ? fs.readFileSync(path.join(PKG_DIR, 'VERSION'), 'utf8').trim()
  : null;
if (fs.existsSync(hooksSourceDir)) {
  for (const file of fs.readdirSync(hooksSourceDir)) {
    if (file.startsWith('nr-') && file.endsWith('.js')) {
      const dest = path.join(HOOKS_DIR, file);
      copyFile(path.join(hooksSourceDir, file), dest);
      // Stamp version tag to match installed version
      if (currentVersion) {
        try {
          let content = fs.readFileSync(dest, 'utf8');
          content = content.replace(
            /\/\/ nr-hook-version: .+/,
            `// nr-hook-version: ${currentVersion}`
          );
          fs.writeFileSync(dest, content);
        } catch (e) {}
      }
      console.log(`  Installed hook: ${file}`);
    }
  }
}
const destHook = path.join(HOOKS_DIR, 'nr-check-update.js');

// 6. Register hooks + permissions in ~/.claude/settings.json (idempotent)
const settingsFile = path.join(CLAUDE_DIR, 'settings.json');
try {
  let settings = {};
  if (fs.existsSync(settingsFile)) {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  }
  let settingsChanged = false;

  // --- 6a. Hook registration ---
  settings.hooks = settings.hooks || {};

  // Helper: register a hook for an event (idempotent by marker string)
  function registerHook(event, hookFile, marker) {
    if (!Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = [];
    }
    const alreadyRegistered = settings.hooks[event].some(group => {
      if (!group || !Array.isArray(group.hooks)) return false;
      return group.hooks.some(h => h && typeof h.command === 'string' && h.command.includes(marker));
    });
    if (!alreadyRegistered) {
      const hp = path.join(HOOKS_DIR, hookFile).replace(/\\/g, '/');
      settings.hooks[event].push({
        hooks: [{ type: 'command', command: `node "${hp}"` }]
      });
      console.log(`  Registered ${event} hook: ${hookFile}`);
      settingsChanged = true;
    }
  }

  // SessionStart: update checker
  if (fs.existsSync(destHook)) {
    registerHook('SessionStart', 'nr-check-update.js', 'nr-check-update');
  }

  // Stop: auto-save context state at end of each turn
  const ctxSaveHook = path.join(HOOKS_DIR, 'nr-context-save.js');
  if (fs.existsSync(ctxSaveHook)) {
    registerHook('Stop', 'nr-context-save.js', 'nr-context-save');
  }

  // PreToolUse: safety gate for destructive commands
  const safetyHook = path.join(HOOKS_DIR, 'nr-safety-gate.js');
  if (fs.existsSync(safetyHook)) {
    registerHook('PreToolUse', 'nr-safety-gate.js', 'nr-safety-gate');
  }

  // PreToolUse: wrap-up blocker (intercepts premature session-end attempts during extended sessions)
  const wrapUpHook = path.join(HOOKS_DIR, 'nr-wrap-up-blocker.js');
  if (fs.existsSync(wrapUpHook)) {
    registerHook('PreToolUse', 'nr-wrap-up-blocker.js', 'nr-wrap-up-blocker');
  }

  // PostToolUse: deep work monitor (depth coaching + extended-session enforcement)
  const deepWorkHook = path.join(HOOKS_DIR, 'nr-deep-work.js');
  if (fs.existsSync(deepWorkHook)) {
    registerHook('PostToolUse', 'nr-deep-work.js', 'nr-deep-work');
  }

  // --- 6c. Statusline configuration ---
  // Register nr-statusline.js as the statusLine (replaces GSD's if present).
  // This makes NR independent of GSD for the statusline + bridge file.
  const nrStatuslineHook = path.join(HOOKS_DIR, 'nr-statusline.js');
  if (fs.existsSync(nrStatuslineHook)) {
    const nrStatuslineCmd = `node "${nrStatuslineHook.replace(/\\/g, '/')}"`;
    const currentStatusline = settings.statusLine;
    const isNrStatusline = currentStatusline
      && typeof currentStatusline.command === 'string'
      && currentStatusline.command.includes('nr-statusline');
    if (!isNrStatusline) {
      settings.statusLine = { type: 'command', command: nrStatuslineCmd };
      console.log('  Configured nr-statusline.js as statusLine');
      settingsChanged = true;
    }
  }

  // --- 6d. Clean up superseded hooks ---
  // Remove old deep-work-monitor.js (manual install) from PostToolUse — replaced by nr-deep-work.js
  if (settings.hooks.PostToolUse) {
    const beforeLen = settings.hooks.PostToolUse.length;
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(group => {
      if (!group || !Array.isArray(group.hooks)) return true;
      return !group.hooks.some(h => h && typeof h.command === 'string'
        && h.command.includes('deep-work-monitor') && !h.command.includes('nr-deep-work'));
    });
    if (settings.hooks.PostToolUse.length < beforeLen) {
      console.log('  Replaced deep-work-monitor.js with nr-deep-work.js');
      settingsChanged = true;
    }

    // Also remove nr-context-monitor.js if registered (removed in v2.3.1)
    const beforeCtxLen = settings.hooks.PostToolUse.length;
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(group => {
      if (!group || !Array.isArray(group.hooks)) return true;
      return !group.hooks.some(h => h && typeof h.command === 'string'
        && h.command.includes('nr-context-monitor'));
    });
    if (settings.hooks.PostToolUse.length < beforeCtxLen) {
      console.log('  Removed nr-context-monitor.js (superseded)');
      settingsChanged = true;
    }
  }

  // --- 6e. Permission auto-configuration ---
  settings.permissions = settings.permissions || {};
  if (!Array.isArray(settings.permissions.allow)) {
    settings.permissions.allow = [];
  }

  const NR_PERMISSIONS_MARKER = '## nr-auto';
  const nrPermissions = [
    // Core: brain CLI calls (every agent invokes this)
    'Bash(node *nr-tools.cjs*)',
    // Read-only git operations (agents check status/log/diff constantly)
    'Bash(git status*)',
    'Bash(git log*)',
    'Bash(git diff*)',
    'Bash(git branch*)',
    'Bash(git show*)',
    // Directory operations
    'Bash(ls *)',
    'Bash(mkdir *)',
    // Common build/test runners
    'Bash(npm run *)',
    'Bash(npm test*)',
    'Bash(npx *)',
    'Bash(python -m pytest*)',
    'Bash(pip install*)',
  ];

  // Check if we've already added our permissions (look for marker)
  const hasNrPerms = settings.permissions.allow.some(
    p => typeof p === 'string' && p.includes(NR_PERMISSIONS_MARKER)
  );

  if (!hasNrPerms) {
    // Add marker entry + all permissions
    settings.permissions.allow.push(`${NR_PERMISSIONS_MARKER}`);
    for (const perm of nrPermissions) {
      // Don't add if user already has a broader or matching rule
      const alreadyHas = settings.permissions.allow.some(
        existing => typeof existing === 'string' && existing === perm
      );
      if (!alreadyHas) {
        settings.permissions.allow.push(perm);
      }
    }
    console.log(`  Added ${nrPermissions.length} baseline permissions (nr-auto)`);
    settingsChanged = true;
  }

  if (settingsChanged) {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  }
} catch (e) {
  console.log(`  (could not patch settings.json: ${e.message})`);
}

// 7. Patch gsd-statusline.js to read nr cache (idempotent, only if GSD statusline exists)
const statuslineFile = path.join(HOOKS_DIR, 'gsd-statusline.js');
if (fs.existsSync(statuslineFile)) {
  try {
    const content = fs.readFileSync(statuslineFile, 'utf8');
    // Idempotent guard: marker tells us we've already patched.
    if (!content.includes('nr-update-check.json')) {
      // Inject our block AFTER the GSD update block so GSD's `gsdUpdate = ...`
      // reassignment doesn't clobber the nr prefix.
      // Anchor on the end of GSD's cache-read block (the closing `} catch (e) {}}`
      // that ends the `if (fs.existsSync(cacheFile))` block).
      const anchor = `    if (fs.existsSync(cacheFile)) {
      try {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (cache.update_available) {
          gsdUpdate = '\\x1b[33m⬆ /gsd:update\\x1b[0m │ ';
        }
        if (cache.stale_hooks && cache.stale_hooks.length > 0) {
          gsdUpdate += '\\x1b[31m⚠ stale hooks — run /gsd:update\\x1b[0m │ ';
        }
      } catch (e) {}
    }`;
      if (content.includes(anchor)) {
        const nrBlock = anchor + `
    // nr-statusline-patch: prepend Netrunner update badge (runs AFTER gsd block
    // so it doesn't get clobbered by the gsd reassignment above).
    const nrCacheFile = path.join(claudeDir, 'cache', 'nr-update-check.json');
    try {
      const nrCache = JSON.parse(fs.readFileSync(nrCacheFile, 'utf8'));
      if (nrCache.stale_hooks && nrCache.stale_hooks.length > 0) {
        gsdUpdate = '\\x1b[31m⚠ stale nr hooks — run /nr:update\\x1b[0m │ ' + gsdUpdate;
      }
      if (nrCache.update_available) {
        gsdUpdate = '\\x1b[36m⬆ /nr:update\\x1b[0m │ ' + gsdUpdate;
      }
    } catch (e) {}`;
        const patched = content.replace(anchor, nrBlock);
        fs.writeFileSync(statuslineFile, patched);
        console.log('  Patched gsd-statusline.js to show /nr:update badge');
      } else {
        console.log('  (gsd-statusline.js structure unrecognized — skipping patch)');
      }
    }
  } catch (e) {
    console.log(`  (could not patch statusline: ${e.message})`);
  }
}

console.log('');
console.log('Netrunner installed successfully!');
console.log('');
console.log('Commands:');
console.log('  /nr <query>   — Diagnostic Q&A with full context');
console.log('  /nr:run       — Brain-driven autonomous execution (chain reaction engine)');
console.log('  /nr:update    — Self-update');
console.log('');
console.log('Extended session: /nr:run overnight | /nr:run for 3 hours');
console.log('');
console.log('Get started: /nr:run "describe your project"');

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

// 5. Install update-check hook -> ~/.claude/hooks/
ensureDir(HOOKS_DIR);
const srcHook = path.join(PKG_DIR, 'hooks', 'nr-check-update.js');
const destHook = path.join(HOOKS_DIR, 'nr-check-update.js');
if (fs.existsSync(srcHook)) {
  copyFile(srcHook, destHook);
  console.log('  Installed hook: nr-check-update.js');
}

// 6. Register SessionStart hook in ~/.claude/settings.json (idempotent)
const settingsFile = path.join(CLAUDE_DIR, 'settings.json');
if (fs.existsSync(destHook)) {
  try {
    let settings = {};
    if (fs.existsSync(settingsFile)) {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
    settings.hooks = settings.hooks || {};
    if (!Array.isArray(settings.hooks.SessionStart)) {
      settings.hooks.SessionStart = [];
    }

    // Cross-platform command format (forward slashes work on Windows node).
    const hookPath = destHook.replace(/\\/g, '/');
    const hookCmd = `node "${hookPath}"`;

    // Check if any existing SessionStart hook entry already runs our check.
    const alreadyRegistered = settings.hooks.SessionStart.some(group => {
      if (!group || !Array.isArray(group.hooks)) return false;
      return group.hooks.some(h => h && typeof h.command === 'string' && h.command.includes('nr-check-update'));
    });

    if (!alreadyRegistered) {
      settings.hooks.SessionStart.push({
        hooks: [{ type: 'command', command: hookCmd }]
      });
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
      console.log('  Registered SessionStart hook in settings.json');
    }
  } catch (e) {
    console.log(`  (could not patch settings.json: ${e.message})`);
  }
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

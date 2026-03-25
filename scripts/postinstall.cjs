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
copyFile(path.join(PKG_DIR, 'commands', 'nr.md'), path.join(COMMANDS_DIR, 'nr.md'));
const nrCommandsDir = path.join(PKG_DIR, 'commands', 'nr');
if (fs.existsSync(nrCommandsDir)) {
  for (const file of fs.readdirSync(nrCommandsDir)) {
    copyFile(path.join(nrCommandsDir, file), path.join(COMMANDS_DIR, 'nr', file));
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

// 4. Make nr-tools.cjs executable
const nrTools = path.join(NR_DIR, 'bin', 'nr-tools.cjs');
if (fs.existsSync(nrTools)) {
  try { fs.chmodSync(nrTools, '755'); } catch (e) { /* Windows */ }
}

console.log('');
console.log('Netrunner installed successfully!');
console.log('');
console.log('Commands:');
console.log('  /nr <query>        — Diagnostic Q&A with full context');
console.log('  /nr:scope <intent> — Generate full project plan');
console.log('  /nr:run            — Brain-driven autonomous execution');
console.log('  /nr:plan <N>       — Plan a specific phase');
console.log('  /nr:execute <N>    — Execute a planned phase');
console.log('  /nr:verify <N>     — Verify phase results');
console.log('  /nr:progress       — Project assessment');
console.log('  /nr:do <text>      — Route freeform intent');
console.log('  /nr:debug          — Diagnostic debugging');
console.log('  /nr:resume         — Restore session state');
console.log('  /nr:map-codebase   — Analyze existing codebase');
console.log('  /nr:update         — Self-update');
console.log('');
console.log('Get started: /nr:scope "describe your project"');

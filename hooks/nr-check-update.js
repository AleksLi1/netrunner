#!/usr/bin/env node
// nr-hook-version: 2.1.1
// Check for Netrunner updates in background, write result to cache.
// Called by SessionStart hook — runs once per session.
//
// Pattern mirrors get-shit-done's gsd-check-update.js: the expensive
// network check happens once in a detached background process; the
// statusline reads a cheap local JSON cache on every refresh.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const homeDir = os.homedir();

// Respect CLAUDE_CONFIG_DIR for custom config directory setups.
const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude');
const nrDir = path.join(claudeDir, 'netrunner');
const versionFile = path.join(nrDir, 'VERSION');
const cacheDir = path.join(claudeDir, 'cache');
const cacheFile = path.join(cacheDir, 'nr-update-check.json');

// Silently exit if Netrunner isn't installed.
if (!fs.existsSync(nrDir)) {
  process.exit(0);
}

// TTL guard: skip the check if the cache is still fresh. The expensive part
// is the `npm view` spawn inside the background child — we don't want to run
// it on every SessionStart, only once every few hours.
const CACHE_TTL_SECS = 6 * 3600; // 6 hours
try {
  const existing = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const age = Math.floor(Date.now() / 1000) - (existing.checked || 0);
  if (age >= 0 && age < CACHE_TTL_SECS) {
    process.exit(0);
  }
} catch (e) {}

// Ensure cache directory exists.
try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}

// Detached background check so we never block session startup.
const child = spawn(process.execPath, ['-e', `
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');

  const cacheFile = ${JSON.stringify(cacheFile)};
  const versionFile = ${JSON.stringify(versionFile)};
  const nrDir = ${JSON.stringify(nrDir)};

  let installed = '0.0.0';
  try {
    if (fs.existsSync(versionFile)) {
      installed = fs.readFileSync(versionFile, 'utf8').trim();
    }
  } catch (e) {}

  // Detect stale hooks by comparing header versions against installed VERSION.
  let staleHooks = [];
  const hooksDir = path.join(path.dirname(nrDir), 'hooks');
  try {
    if (fs.existsSync(hooksDir)) {
      const hookFiles = fs.readdirSync(hooksDir).filter(f => f.startsWith('nr-') && f.endsWith('.js'));
      for (const hookFile of hookFiles) {
        try {
          const content = fs.readFileSync(path.join(hooksDir, hookFile), 'utf8');
          const versionMatch = content.match(/\\/\\/ nr-hook-version:\\s*(.+)/);
          if (versionMatch) {
            const hookVersion = versionMatch[1].trim();
            if (hookVersion !== installed && !hookVersion.includes('{{')) {
              staleHooks.push({ file: hookFile, hookVersion, installedVersion: installed });
            }
          } else {
            staleHooks.push({ file: hookFile, hookVersion: 'unknown', installedVersion: installed });
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  // Fetch latest version from npm. timeout prevents hang on offline machines.
  let latest = null;
  try {
    latest = execSync('npm view netrunner-cc version', {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true
    }).trim();
  } catch (e) {}

  const result = {
    update_available: latest && installed !== latest,
    installed,
    latest: latest || 'unknown',
    checked: Math.floor(Date.now() / 1000),
    stale_hooks: staleHooks.length > 0 ? staleHooks : undefined
  };

  try {
    fs.writeFileSync(cacheFile, JSON.stringify(result));
  } catch (e) {}
`], {
  stdio: 'ignore',
  windowsHide: true,
  detached: true
});

child.unref();

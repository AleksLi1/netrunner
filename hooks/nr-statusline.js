#!/usr/bin/env node
// nr-hook-version: 2.3.0
// Netrunner Statusline — independent of GSD
// Registered as the statusLine config entry. Fires on every UI refresh.
//
// Shows: [update badges] │ Model │ [NR phase] │ Current Task │ dir [context bar]
//
// Also writes context metrics to a bridge file that nr-context-monitor.js reads
// to inject agent-facing warnings when context is low.

const fs = require('fs');
const path = require('path');
const os = require('os');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const dir = data.workspace?.current_dir || process.cwd();
    const session = data.session_id || '';
    const remaining = data.context_window?.remaining_percentage;
    const homeDir = os.homedir();
    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude');

    // --- Context window ---
    const AUTO_COMPACT_BUFFER_PCT = 16.5;
    let ctx = '';
    if (remaining != null) {
      const usableRemaining = Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100);
      const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));

      // Write bridge file for nr-context-monitor.js
      if (session) {
        try {
          const bridgePath = path.join(os.tmpdir(), `claude-ctx-${session}.json`);
          fs.writeFileSync(bridgePath, JSON.stringify({
            session_id: session,
            remaining_percentage: remaining,
            used_pct: used,
            timestamp: Math.floor(Date.now() / 1000)
          }));
        } catch (e) {}
      }

      const filled = Math.floor(used / 10);
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);

      if (used < 50) {
        ctx = ` \x1b[32m${bar} ${used}%\x1b[0m`;
      } else if (used < 65) {
        ctx = ` \x1b[33m${bar} ${used}%\x1b[0m`;
      } else if (used < 80) {
        ctx = ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
      } else {
        ctx = ` \x1b[5;31m\u{1F480} ${bar} ${used}%\x1b[0m`;
      }
    }

    // --- NR phase info ---
    let nrPhase = '';
    try {
      const snapshotPath = path.join(dir, '.planning', '.context-snapshot.json');
      const statePath = path.join(dir, '.planning', 'STATE.md');
      const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');

      let currentPhase = null;
      let totalPhases = null;

      // Read STATE.md for current phase (quick regex)
      if (fs.existsSync(statePath)) {
        const stateContent = fs.readFileSync(statePath, 'utf8');
        const phaseMatch = stateContent.match(/current_phase[:\s]*(\d+)/i)
          || stateContent.match(/\*\*Current Phase:\*\*\s*(\d+)/i)
          || stateContent.match(/phase[:\s]*(\d+)/i);
        if (phaseMatch) currentPhase = parseInt(phaseMatch[1]);

        const statusMatch = stateContent.match(/status[:\s]*(complete|active|planned|executed)/i);
        if (statusMatch && statusMatch[1].toLowerCase() === 'complete') {
          nrPhase = '\x1b[32mDONE\x1b[0m';
          currentPhase = null; // Skip phase/total display
        }
      }

      // Count total phases from ROADMAP.md
      if (currentPhase && fs.existsSync(roadmapPath)) {
        const roadmap = fs.readFileSync(roadmapPath, 'utf8');
        const phaseLines = roadmap.match(/^##\s+Phase\s+\d+/gmi);
        if (phaseLines) totalPhases = phaseLines.length;
      }

      if (currentPhase && totalPhases) {
        nrPhase = `\x1b[36mP${currentPhase}/${totalPhases}\x1b[0m`;
      } else if (currentPhase) {
        nrPhase = `\x1b[36mP${currentPhase}\x1b[0m`;
      } else if (!nrPhase && fs.existsSync(path.join(dir, '.planning'))) {
        // Has .planning but no parseable state — show NR active indicator
        nrPhase = '\x1b[36mNR\x1b[0m';
      }
    } catch (e) {}

    // --- Current task from todos ---
    let task = '';
    const todosDir = path.join(claudeDir, 'todos');
    if (session && fs.existsSync(todosDir)) {
      try {
        const files = fs.readdirSync(todosDir)
          .filter(f => f.startsWith(session) && f.includes('-agent-') && f.endsWith('.json'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime);
        if (files.length > 0) {
          const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
          const inProgress = todos.find(t => t.status === 'in_progress');
          if (inProgress) task = inProgress.activeForm || '';
        }
      } catch (e) {}
    }

    // --- Update badges ---
    let badges = '';

    // NR update badge
    const nrCacheFile = path.join(claudeDir, 'cache', 'nr-update-check.json');
    try {
      const nrCache = JSON.parse(fs.readFileSync(nrCacheFile, 'utf8'));
      if (nrCache.stale_hooks && nrCache.stale_hooks.length > 0) {
        badges += '\x1b[31m\u26A0 stale nr hooks \u2014 run /nr:update\x1b[0m \u2502 ';
      }
      if (nrCache.update_available) {
        badges += '\x1b[36m\u2B06 /nr:update\x1b[0m \u2502 ';
      }
    } catch (e) {}

    // GSD update badge (show if GSD is also installed)
    const gsdCacheFile = path.join(claudeDir, 'cache', 'gsd-update-check.json');
    try {
      const gsdCache = JSON.parse(fs.readFileSync(gsdCacheFile, 'utf8'));
      if (gsdCache.update_available) {
        badges += '\x1b[33m\u2B06 /gsd:update\x1b[0m \u2502 ';
      }
      if (gsdCache.stale_hooks && gsdCache.stale_hooks.length > 0) {
        badges += '\x1b[31m\u26A0 stale hooks \u2014 run /gsd:update\x1b[0m \u2502 ';
      }
    } catch (e) {}

    // --- Assemble output ---
    const dirname = path.basename(dir);
    const parts = [badges, `\x1b[2m${model}\x1b[0m`];
    if (nrPhase) parts.push(nrPhase);
    if (task) parts.push(`\x1b[1m${task}\x1b[0m`);
    parts.push(`\x1b[2m${dirname}\x1b[0m`);

    // Join with │ separator, then append context bar
    process.stdout.write(parts.join(' \u2502 ') + ctx);
  } catch (e) {
    // Silent fail — never break the statusline
  }
});

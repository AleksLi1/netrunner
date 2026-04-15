#!/usr/bin/env node
// nr-hook-version: 2.3.0
// Context Monitor — PostToolUse hook
//
// Reads context metrics from the statusline bridge file and injects warnings
// into additionalContext when context usage is high. This makes the AGENT aware
// of context limits (the statusline only shows the user).
//
// Two-hook pipeline:
//   1. nr-statusline.js writes metrics to $TMPDIR/claude-ctx-{session}.json
//   2. This hook reads those metrics after each tool use
//
// Thresholds:
//   WARNING  (remaining <= 35%): Agent should wrap up current task
//   CRITICAL (remaining <= 25%): Agent should stop immediately and save state
//
// Debounce: 5 tool uses between warnings to avoid spam
// Severity escalation bypasses debounce (WARNING -> CRITICAL fires immediately)

const fs = require('fs');
const os = require('os');
const path = require('path');

const WARNING_THRESHOLD = 35;
const CRITICAL_THRESHOLD = 25;
const STALE_SECONDS = 60;
const DEBOUNCE_CALLS = 5;

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id;
    if (!sessionId) process.exit(0);

    // Check if disabled via project config
    const cwd = data.cwd || process.cwd();
    const configPath = path.join(cwd, '.planning', 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.hooks?.context_warnings === false) process.exit(0);
      } catch (e) {}
    }

    const tmpDir = os.tmpdir();
    const metricsPath = path.join(tmpDir, `claude-ctx-${sessionId}.json`);

    // No bridge file = subagent or fresh session — exit silently
    if (!fs.existsSync(metricsPath)) process.exit(0);

    const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    const now = Math.floor(Date.now() / 1000);

    // Ignore stale metrics
    if (metrics.timestamp && (now - metrics.timestamp) > STALE_SECONDS) process.exit(0);

    const remaining = metrics.remaining_percentage;
    const usedPct = metrics.used_pct;

    // No warning needed
    if (remaining > WARNING_THRESHOLD) process.exit(0);

    // Debounce: check if we warned recently
    const warnPath = path.join(tmpDir, `claude-ctx-${sessionId}-warned.json`);
    let warnData = { callsSinceWarn: 0, lastLevel: null };
    let firstWarn = true;

    if (fs.existsSync(warnPath)) {
      try {
        warnData = JSON.parse(fs.readFileSync(warnPath, 'utf8'));
        firstWarn = false;
      } catch (e) {}
    }

    warnData.callsSinceWarn = (warnData.callsSinceWarn || 0) + 1;

    const isCritical = remaining <= CRITICAL_THRESHOLD;
    const currentLevel = isCritical ? 'critical' : 'warning';

    // Emit immediately on first warning, then debounce subsequent ones
    const severityEscalated = currentLevel === 'critical' && warnData.lastLevel === 'warning';
    if (!firstWarn && warnData.callsSinceWarn < DEBOUNCE_CALLS && !severityEscalated) {
      fs.writeFileSync(warnPath, JSON.stringify(warnData));
      process.exit(0);
    }

    // Reset debounce counter
    warnData.callsSinceWarn = 0;
    warnData.lastLevel = currentLevel;
    fs.writeFileSync(warnPath, JSON.stringify(warnData));

    // Detect NR project state
    const isNrActive = fs.existsSync(path.join(cwd, '.planning', 'STATE.md'));

    let message;
    if (isCritical) {
      message = isNrActive
        ? `CONTEXT CRITICAL: Usage at ${usedPct}%. Remaining: ${remaining}%. `
          + 'Context is nearly exhausted. Complete the current atomic operation and stop. '
          + 'NR state is tracked in STATE.md — /nr:run will resume from where you left off. '
          + 'Inform the user that context is low.'
        : `CONTEXT CRITICAL: Usage at ${usedPct}%. Remaining: ${remaining}%. `
          + 'Context is nearly exhausted. Inform the user that context is low and ask how they '
          + 'want to proceed. Do NOT autonomously save state or write handoff files unless asked.';
    } else {
      message = isNrActive
        ? `CONTEXT WARNING: Usage at ${usedPct}%. Remaining: ${remaining}%. `
          + 'Context is getting limited. Finish the current phase action, then avoid starting '
          + 'new complex work. NR state is persisted — safe to resume in a new session.'
        : `CONTEXT WARNING: Usage at ${usedPct}%. Remaining: ${remaining}%. `
          + 'Be aware that context is getting limited. Avoid unnecessary exploration or '
          + 'starting new complex work.';
    }

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: process.env.GEMINI_API_KEY ? 'AfterTool' : 'PostToolUse',
        additionalContext: message
      }
    }));
  } catch (e) {
    process.exit(0);
  }
});

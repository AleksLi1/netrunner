#!/usr/bin/env node
// nr-hook-version: 2.3.0
// Netrunner Deep Work Monitor — PostToolUse hook
//
// Periodically injects role-identity and depth-coaching reminders to prevent
// Claude from wrapping up prematurely. NR-aware: detects domain from
// CONTEXT.md/PROJECT.md and tailors prompts (quant persona for trading projects,
// web/API/systems prompts for other domains). Uses CONTEXT.md closed paths
// to suggest untried avenues.
//
// Config: ~/.claude/deep-work-config.json (optional — sensible defaults built in)
// State: $TEMP/claude-deep-work-state.json (auto-managed per session)

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILE = path.join(os.tmpdir(), 'claude-deep-work-state.json');
const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const CONFIG_FILE = path.join(claudeDir, 'deep-work-config.json');

// --- Default config (overridden by deep-work-config.json if present) ---
let config = {
  defaultRole: 'Senior Software Engineer',
  reminderIntervalCalls: 30,
  reminderIntervalMinutes: 20,
  sessionGapMinutes: 60,
  projects: {}
};
try {
  config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
} catch (e) {}

// --- Domain-specific prompts (used when NR project detected) ---
const DOMAIN_PROMPTS = {
  quant: {
    role: 'Head of Quantitative Research',
    prompts: [
      'What statistical tests or data slices haven\'t been examined?',
      'What assumptions in the pipeline haven\'t been challenged with data?',
      'Is there a simpler explanation that was overlooked?',
      'What would survive a regime change or black swan?',
      'Have you checked for lookahead bias in every feature and label?'
    ]
  },
  web: {
    role: 'Senior Frontend Architect',
    prompts: [
      'What edge cases in user interaction haven\'t been tested?',
      'Are there accessibility or performance issues you haven\'t measured?',
      'What happens when the network is slow, offline, or returns errors?',
      'Have you tested on multiple viewports and browsers?'
    ]
  },
  api: {
    role: 'Senior Backend Engineer',
    prompts: [
      'What error paths haven\'t been exercised?',
      'Are there race conditions or concurrency issues to consider?',
      'What happens under load or with malformed input?',
      'Have you validated auth, rate limiting, and input sanitization?'
    ]
  },
  systems: {
    role: 'Senior Systems Engineer',
    prompts: [
      'What failure modes haven\'t been considered?',
      'Are there resource leaks, deadlocks, or scaling bottlenecks?',
      'What happens when dependencies are unavailable?',
      'Have you stress-tested the critical path?'
    ]
  },
  ml: {
    role: 'Senior ML Engineer',
    prompts: [
      'Is the validation strategy truly held out from training decisions?',
      'What data distribution shifts could break this in production?',
      'Are there simpler baselines that haven\'t been compared?',
      'Have you checked for data leakage across all preprocessing steps?'
    ]
  }
};

// Read stdin (PostToolUse provides JSON with cwd, tool_name, etc.)
let input = '';
const timeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(timeout);
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();
    run(cwd);
  } catch (e) {
    try { run(process.cwd()); } catch (_) {}
  }
});

function run(cwd) {
  const now = Date.now();

  // --- Load or init session state ---
  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (now - state.lastCall > config.sessionGapMinutes * 60000) {
      state = { startTime: now, callCount: 0, lastReminder: now, reminderCount: 0 };
    }
  } catch (e) {
    state = { startTime: now, callCount: 0, lastReminder: now, reminderCount: 0 };
  }

  state.callCount++;
  state.lastCall = now;

  // --- Determine role and prompts ---
  let role = config.defaultRole;
  let targetHours = null;
  let prompts = [];

  // Check project-specific config first (exact match from config file)
  for (const [pattern, projConfig] of Object.entries(config.projects || {})) {
    if (cwd.toLowerCase().includes(pattern.toLowerCase())) {
      role = projConfig.role || role;
      targetHours = projConfig.targetHours || null;
      prompts = projConfig.prompts || [];
      break;
    }
  }

  // If no project match in config, try NR domain detection
  if (prompts.length === 0) {
    const domain = detectNrDomain(cwd);
    if (domain && DOMAIN_PROMPTS[domain]) {
      role = DOMAIN_PROMPTS[domain].role;
      prompts = [...DOMAIN_PROMPTS[domain].prompts];
    }
  }

  // Append CONTEXT.md-aware prompts (untried avenues)
  const contextPrompts = getContextPrompts(cwd);
  if (contextPrompts.length > 0) {
    prompts.push(...contextPrompts);
  }

  // --- Check if reminder is due ---
  const minutesSinceStart = (now - state.startTime) / 60000;
  const minutesSinceReminder = (now - state.lastReminder) / 60000;
  const callsSinceReminder = state.callCount % config.reminderIntervalCalls;

  const shouldRemind = (
    state.callCount > 5 && (
      callsSinceReminder === 0 ||
      minutesSinceReminder >= config.reminderIntervalMinutes
    )
  );

  if (shouldRemind) {
    state.lastReminder = now;
    state.reminderCount++;

    const hours = Math.floor(minutesSinceStart / 60);
    const mins = Math.floor(minutesSinceStart % 60);
    const elapsed = hours > 0 ? `${hours}h${mins}m` : `${mins}m`;

    let targetStr = '';
    let remainingStr = '';
    let urgency = '';
    if (targetHours) {
      targetStr = ` / ${targetHours}h target`;
      const remaining = Math.max(0, targetHours * 60 - minutesSinceStart);
      const rh = Math.floor(remaining / 60);
      const rm = Math.floor(remaining % 60);
      remainingStr = ` | ${rh}h${rm}m remaining`;
      if (remaining > 30) {
        urgency = `\nYou have ${rh}h${rm}m remaining. DO NOT STOP. Find the next avenue and pursue it.`;
      } else if (remaining <= 0) {
        urgency = '\nTime target reached. Wrap up with a comprehensive summary of all work done.';
      }
    }

    const lines = [];
    lines.push(`<deep-work-ping role="${role}" elapsed="${elapsed}" actions="${state.callCount}" reminder="${state.reminderCount}">`);
    lines.push(`You are operating as: ${role}`);
    lines.push(`Session: ${elapsed}${targetStr}${remainingStr}`);
    lines.push('Before wrapping up this thread of work, ask yourself:');
    lines.push('- What deeper analysis could reveal hidden insights?');
    lines.push('- What adjacent problems or experiments connect to this one?');
    lines.push('- Have you exhausted all avenues or just the obvious ones?');
    lines.push(`- What would a world-class ${role} do next?`);

    for (const p of prompts) {
      lines.push(`- ${p}`);
    }

    if (urgency) lines.push(urgency);
    lines.push('</deep-work-ping>');

    console.log(lines.join('\n'));
  }

  // --- Save state ---
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (e) {}
}

/**
 * Detect NR domain from project artifacts.
 * Returns: 'quant' | 'web' | 'api' | 'systems' | 'ml' | null
 */
function detectNrDomain(cwd) {
  // Quick check: does .planning/ exist?
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) return null;

  // Read CONTEXT.md or PROJECT.md for domain signals
  let text = '';
  for (const file of ['CONTEXT.md', 'PROJECT.md']) {
    const filePath = path.join(planningDir, file);
    if (fs.existsSync(filePath)) {
      try {
        // Read first 2000 chars only — enough for domain detection
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(2000);
        const bytesRead = fs.readSync(fd, buf, 0, 2000, 0);
        fs.closeSync(fd);
        text += buf.toString('utf8', 0, bytesRead);
      } catch (e) {}
    }
  }

  if (!text) return null;
  const lower = text.toLowerCase();

  // Quant signals (3+ required — same rule as run.md)
  const quantSignals = ['sharpe', 'backtest', 'walk-forward', 'regime', 'lookahead',
    'drawdown', 'ohlcv', 'portfolio', 'alpha', 'momentum', 'mean-reversion',
    'trading', 'strategy', 'signal decay', 'feature engineering', 'p&l'];
  const quantHits = quantSignals.filter(s => lower.includes(s)).length;
  if (quantHits >= 3) return 'quant';

  // ML signals
  const mlSignals = ['training', 'validation loss', 'model accuracy', 'epochs',
    'neural network', 'transformer', 'fine-tun', 'dataset', 'overfitting'];
  if (mlSignals.filter(s => lower.includes(s)).length >= 2) return 'ml';

  // Web signals
  const webSignals = ['react', 'vue', 'angular', 'frontend', 'css', 'tailwind',
    'component', 'browser', 'dom', 'playwright', 'next.js', 'svelte'];
  if (webSignals.filter(s => lower.includes(s)).length >= 2) return 'web';

  // API signals
  const apiSignals = ['endpoint', 'rest', 'graphql', 'middleware', 'express',
    'fastapi', 'django', 'authentication', 'rate limit', 'api'];
  if (apiSignals.filter(s => lower.includes(s)).length >= 2) return 'api';

  // Systems signals
  const sysSignals = ['docker', 'kubernetes', 'terraform', 'ci/cd', 'deployment',
    'infrastructure', 'monitoring', 'scaling', 'load balancer', 'nginx'];
  if (sysSignals.filter(s => lower.includes(s)).length >= 2) return 'systems';

  return null;
}

/**
 * Extract prompts from CONTEXT.md closed paths — suggest untried avenues.
 * Returns at most 2 prompts.
 */
function getContextPrompts(cwd) {
  const contextPath = path.join(cwd, '.planning', 'CONTEXT.md');
  if (!fs.existsSync(contextPath)) return [];

  try {
    const content = fs.readFileSync(contextPath, 'utf8');

    // Extract "What Has Been Tried" section
    const triedMatch = content.match(/## What Has Been Tried\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (!triedMatch) return [];

    const triedSection = triedMatch[1];
    const rows = triedSection.split('\n')
      .filter(l => l.trim().startsWith('|') && !l.includes('---'))
      .slice(2); // Skip header + separator

    if (rows.length === 0) return [];

    // Find failed approaches (contain FAIL, LOW confidence, or negative result)
    const failedApproaches = rows
      .filter(r => /fail|low|partial|error/i.test(r))
      .map(r => {
        // Extract approach name (usually first cell after |)
        const cells = r.split('|').map(c => c.trim()).filter(Boolean);
        return cells[0] || '';
      })
      .filter(Boolean)
      .slice(0, 3);

    const prompts = [];
    if (failedApproaches.length > 0) {
      prompts.push(`Previous approaches that failed: ${failedApproaches.join(', ')}. What fundamentally different direction haven't you considered?`);
    }

    if (rows.length >= 5) {
      prompts.push(`${rows.length} approaches tried so far. Are you pattern-matching on the same class of solution, or have you considered a completely orthogonal approach?`);
    }

    return prompts.slice(0, 2);
  } catch (e) {
    return [];
  }
}

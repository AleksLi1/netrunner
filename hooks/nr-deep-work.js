#!/usr/bin/env node
// nr-hook-version: 2.5.0
// Netrunner Deep Work Monitor — PostToolUse hook
//
// Two operating modes:
//   STANDARD — gentle role/depth reminders every 30 calls or 20 minutes
//              (legacy behavior, low signal, easy to ignore)
//   EXTENDED — aggressive enforcement during /nr:run overnight (or any time-budgeted session)
//              Fires every 8 tool calls OR 5 minutes
//              Reads session budget + roadmap + state to inject the SPECIFIC next task
//              Uses directive language ("YOUR NEXT ACTION:", not "ask yourself")
//              Escalates urgency: > 50% time → MANDATORY language; nearing end → wind-down
//              Logs every reminder to .planning/session-log.md for debugging
//
// Session budget contract: $TEMP/nr-session-budget.json (written by `nr-tools.cjs session start`).
// When present and active, this hook switches to EXTENDED mode.

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILE = path.join(os.tmpdir(), 'claude-deep-work-state.json');
const BUDGET_FILE = path.join(os.tmpdir(), 'nr-session-budget.json');
const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const CONFIG_FILE = path.join(claudeDir, 'deep-work-config.json');

// --- Default config (overridden by deep-work-config.json if present) ---
let config = {
  defaultRole: 'Senior Software Engineer',
  reminderIntervalCalls: 30,
  reminderIntervalMinutes: 20,
  sessionGapMinutes: 60,
  // Extended-session thresholds (much more aggressive)
  extendedIntervalCalls: 8,
  extendedIntervalMinutes: 5,
  projects: {}
};
try {
  config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
} catch (e) {}

// --- Domain-specific prompts (used when NR project detected in STANDARD mode) ---
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
    run(cwd, data);
  } catch (e) {
    try { run(process.cwd(), {}); } catch (_) {}
  }
});

// ─── Session Budget Reader ──────────────────────────────────────────────────

function readBudget() {
  try {
    const b = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
    if (b.status === 'complete') return null;
    if (b.end_time_ms && Date.now() > b.end_time_ms + 60000) return null;
    return b;
  } catch {
    return null;
  }
}

function writeBudget(b) {
  try { fs.writeFileSync(BUDGET_FILE, JSON.stringify(b, null, 2)); } catch {}
}

function appendSessionLog(cwd, message) {
  try {
    const planningDir = path.join(cwd, '.planning');
    if (!fs.existsSync(planningDir)) return;
    const logPath = path.join(planningDir, 'session-log.md');
    const ts = new Date().toISOString();
    fs.appendFileSync(logPath, `- \`${ts}\` ${message}\n`);
  } catch {}
}

function fmtDuration(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h === 0 ? `${m}m` : `${h}h${m}m`;
}

// ─── Roadmap / State Readers (what to work on next) ─────────────────────────

function readNextTask(cwd) {
  // Try to find the next concrete thing for Claude to work on.
  try {
    const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
    if (fs.existsSync(roadmapPath)) {
      const content = fs.readFileSync(roadmapPath, 'utf8');
      // Search for first phase that doesn't have a completion marker
      const re = /##\s*Phase\s+(\d+(?:\.\d+)?)\s*[—:-]\s*([^\n]+?)\s*\n([\s\S]*?)(?=\n##|\n$|$)/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const body = m[3];
        if (!/✓|✅|complete|done|finished/i.test(body)) {
          const goalMatch = body.match(/(?:Goal|Objective|Purpose):\s*([^\n]+)/i);
          return {
            phase: m[1],
            name: m[2].trim(),
            goal: goalMatch ? goalMatch[1].trim() : null,
          };
        }
      }
    }
  } catch {}

  try {
    const statePath = path.join(cwd, '.planning', 'STATE.md');
    if (fs.existsSync(statePath)) {
      const content = fs.readFileSync(statePath, 'utf8');
      const phaseMatch = content.match(/\*\*Current Phase:\*\*\s*(.+)/i);
      const nameMatch = content.match(/\*\*Current Phase Name:\*\*\s*(.+)/i);
      const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/i);
      if (phaseMatch) {
        return {
          phase: phaseMatch[1].trim(),
          name: nameMatch ? nameMatch[1].trim() : null,
          status: statusMatch ? statusMatch[1].trim() : null,
        };
      }
    }
  } catch {}

  return null;
}

function readDirective(cwd) {
  // For AUTO_RESEARCH mode — read the experiment directive
  try {
    const directivePath = path.join(cwd, '.planning', 'auto-research', 'DIRECTIVE.md');
    if (!fs.existsSync(directivePath)) return null;
    const content = fs.readFileSync(directivePath, 'utf8');
    const goalMatch = content.match(/(?:##\s*Goal|^Goal):\s*([^\n]+)/im);
    const evalMatch = content.match(/(?:##\s*Eval|^Eval(?:\s+Command)?):\s*([^\n]+)/im);
    return {
      goal: goalMatch ? goalMatch[1].trim() : null,
      eval: evalMatch ? evalMatch[1].trim() : null,
    };
  } catch {
    return null;
  }
}

// ─── Main Hook Body ─────────────────────────────────────────────────────────

function run(cwd, hookData) {
  const now = Date.now();
  const budget = readBudget();
  const extendedMode = budget && (budget.mode === 'EXTENDED' || budget.mode === 'AUTO_RESEARCH');

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

  for (const [pattern, projConfig] of Object.entries(config.projects || {})) {
    if (cwd.toLowerCase().includes(pattern.toLowerCase())) {
      role = projConfig.role || role;
      targetHours = projConfig.targetHours || null;
      prompts = projConfig.prompts || [];
      break;
    }
  }

  if (prompts.length === 0) {
    const domain = detectNrDomain(cwd);
    if (domain && DOMAIN_PROMPTS[domain]) {
      role = DOMAIN_PROMPTS[domain].role;
      prompts = [...DOMAIN_PROMPTS[domain].prompts];
    }
  }

  // --- Choose reminder cadence based on mode ---
  const intervalCalls = extendedMode ? config.extendedIntervalCalls : config.reminderIntervalCalls;
  const intervalMinutes = extendedMode ? config.extendedIntervalMinutes : config.reminderIntervalMinutes;

  const minutesSinceStart = (now - state.startTime) / 60000;
  const minutesSinceReminder = (now - state.lastReminder) / 60000;
  const callsSinceReminder = state.callCount % intervalCalls;

  const shouldRemind = (
    state.callCount > (extendedMode ? 3 : 5) && (
      callsSinceReminder === 0 ||
      minutesSinceReminder >= intervalMinutes
    )
  );

  if (!shouldRemind) {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (e) {}
    process.exit(0);
  }

  state.lastReminder = now;
  state.reminderCount++;

  // --- Build reminder message ---
  let lines = [];

  if (extendedMode) {
    lines = buildExtendedReminder(cwd, role, state, budget, prompts);
  } else {
    lines = buildStandardReminder(role, state, targetHours, prompts, cwd, minutesSinceStart);
  }

  console.log(lines.join('\n'));

  // --- Update budget reminder counter ---
  if (budget) {
    budget.reminders_sent = (budget.reminders_sent || 0) + 1;
    budget.last_reminder_ms = now;
    writeBudget(budget);

    const remainingMs = budget.end_time_ms ? Math.max(0, budget.end_time_ms - now) : null;
    appendSessionLog(cwd, `REMINDER #${budget.reminders_sent} tool=${hookData.tool_name || '?'} elapsed=${fmtDuration(now - budget.start_time_ms)}${remainingMs !== null ? ` remaining=${fmtDuration(remainingMs)}` : ''} calls=${state.callCount}`);
  }

  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (e) {}
}

// ─── Reminder Builders ──────────────────────────────────────────────────────

function buildStandardReminder(role, state, targetHours, prompts, cwd, minutesSinceStart) {
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

  const contextPrompts = getContextPrompts(cwd);
  const allPrompts = [...prompts, ...contextPrompts].slice(0, 4);
  for (const p of allPrompts) lines.push(`- ${p}`);

  if (urgency) lines.push(urgency);
  lines.push('</deep-work-ping>');
  return lines;
}

function buildExtendedReminder(cwd, role, state, budget, domainPrompts) {
  const now = Date.now();
  const elapsedMs = now - budget.start_time_ms;
  const remainingMs = budget.end_time_ms ? Math.max(0, budget.end_time_ms - now) : null;
  const totalMs = budget.end_time_ms ? (budget.end_time_ms - budget.start_time_ms) : null;
  const pctRemaining = totalMs ? remainingMs / totalMs : 1;

  // Classify urgency band
  let band, headline;
  if (remainingMs === null) {
    band = 'OPEN';
    headline = 'EXTENDED SESSION ACTIVE — no time budget set, work continuously until told to stop';
  } else if (remainingMs <= 0) {
    band = 'EXPIRED';
    headline = 'TIME BUDGET EXHAUSTED — initiate Graceful Wind-Down: commit current work, write session report, then stop';
  } else if (remainingMs < 15 * 60000) {
    band = 'FINAL';
    headline = 'LESS THAN 15 MINUTES REMAINING — finish the current atomic operation, then wind down gracefully';
  } else if (pctRemaining > 0.5) {
    band = 'EARLY';
    headline = 'MANDATORY: DO NOT STOP. You are in the first half of an extended session — there is far more work to do than you have done.';
  } else if (pctRemaining > 0.25) {
    band = 'MID';
    headline = 'MANDATORY: Continue working. Significant time remains in this extended session.';
  } else {
    band = 'LATE';
    headline = 'Time budget winding down — continue the current task but begin organizing work for a clean handoff.';
  }

  const nextTask = readNextTask(cwd);
  const directive = readDirective(cwd);

  const lines = [];
  lines.push(`<nr-session-enforce mode="${budget.mode}" band="${band}" elapsed="${fmtDuration(elapsedMs)}" remaining="${remainingMs !== null ? fmtDuration(remainingMs) : 'open'}" reminder="${budget.reminders_sent + 1}">`);
  lines.push(headline);
  lines.push('');
  lines.push(`Session: ${budget.duration_label} | elapsed ${fmtDuration(elapsedMs)} | ${remainingMs !== null ? `${fmtDuration(remainingMs)} remaining` : 'open-ended'}`);
  lines.push(`Cycles: ${budget.cycle_count}/${budget.cycle_cap} | Reminders fired: ${budget.reminders_sent + 1}`);
  lines.push(`Acting as: ${role}`);
  lines.push('');

  if (band === 'EXPIRED' || band === 'FINAL') {
    lines.push('GRACEFUL WIND-DOWN PROTOCOL:');
    lines.push('1. Finish the current atomic operation — do not start new tasks.');
    lines.push('2. Commit any pending changes with: `nr: session wind-down — [what was in progress]`');
    lines.push('3. Append a SESSION REPORT block to .planning/CONTEXT.md decision log (phases completed, in-progress work, recommended next).');
    lines.push('4. Then you may stop.');
  } else {
    // Directive content — tell Claude exactly what to do
    if (nextTask) {
      lines.push('YOUR NEXT ACTION:');
      if (nextTask.phase && nextTask.name) {
        lines.push(`  Work on Phase ${nextTask.phase}: ${nextTask.name}`);
        if (nextTask.goal) lines.push(`  Goal: ${nextTask.goal}`);
        if (nextTask.status) lines.push(`  Status: ${nextTask.status}`);
        lines.push('  Run `/nr:run` (no args) to continue — chain reaction will resume the current action.');
      } else if (nextTask.status) {
        lines.push(`  Current phase status: ${nextTask.status}`);
        lines.push('  Resume by continuing the action that matches this status.');
      }
    } else if (directive) {
      lines.push('AUTO-RESEARCH DIRECTIVE:');
      if (directive.goal) lines.push(`  Goal: ${directive.goal}`);
      if (directive.eval) lines.push(`  Eval: ${directive.eval}`);
      lines.push('  Run the next experiment cycle: propose a modification, run eval, keep if better, revert if worse.');
    } else {
      lines.push('NO PLANNED ROADMAP DETECTED — proactively select work:');
      lines.push('  1. Identify the highest-leverage unfinished thread from recent work.');
      lines.push('  2. If a project is mid-flight without ROADMAP.md, run /nr:run to scope it.');
      lines.push('  3. For creative/exploratory work: generate a new hypothesis and test it.');
    }
    lines.push('');

    if (band === 'EARLY' || band === 'MID') {
      lines.push('RULES FOR THIS SESSION:');
      lines.push('- Do NOT stop to ask the user whether to continue — they already said: work for this duration.');
      lines.push('- Do NOT wrap up with a summary while > 15 min remain. Execute, do not narrate completion.');
      lines.push('- Do NOT take the "easy path" — if a task is creative or open-ended, generate genuinely new approaches.');
      lines.push('- After each completed task, check the roadmap for the next one — keep moving.');
      lines.push('- If all planned work is done but time remains: proactively work through test coverage, code quality, performance, docs, refactoring, security (in that order).');
      lines.push('- Log autonomous decisions to .planning/CONTEXT.md decision log so the user can audit.');
    }

    // Domain-specific creative prompts (only top 2 for extended — keep messages tight)
    const contextPrompts = getContextPrompts(cwd);
    const allPrompts = [...(domainPrompts || []), ...contextPrompts].slice(0, 2);
    if (allPrompts.length > 0) {
      lines.push('');
      lines.push(`What a world-class ${role} would consider:`);
      for (const p of allPrompts) lines.push(`- ${p}`);
    }
  }

  lines.push('</nr-session-enforce>');
  return lines;
}

// ─── Domain Detection ───────────────────────────────────────────────────────

function detectNrDomain(cwd) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) return null;

  let text = '';
  for (const file of ['CONTEXT.md', 'PROJECT.md']) {
    const filePath = path.join(planningDir, file);
    if (fs.existsSync(filePath)) {
      try {
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

  const quantSignals = ['sharpe', 'backtest', 'walk-forward', 'regime', 'lookahead',
    'drawdown', 'ohlcv', 'portfolio', 'alpha', 'momentum', 'mean-reversion',
    'trading', 'strategy', 'signal decay', 'feature engineering', 'p&l'];
  if (quantSignals.filter(s => lower.includes(s)).length >= 3) return 'quant';

  const mlSignals = ['training', 'validation loss', 'model accuracy', 'epochs',
    'neural network', 'transformer', 'fine-tun', 'dataset', 'overfitting'];
  if (mlSignals.filter(s => lower.includes(s)).length >= 2) return 'ml';

  const webSignals = ['react', 'vue', 'angular', 'frontend', 'css', 'tailwind',
    'component', 'browser', 'dom', 'playwright', 'next.js', 'svelte'];
  if (webSignals.filter(s => lower.includes(s)).length >= 2) return 'web';

  const apiSignals = ['endpoint', 'rest', 'graphql', 'middleware', 'express',
    'fastapi', 'django', 'authentication', 'rate limit', 'api'];
  if (apiSignals.filter(s => lower.includes(s)).length >= 2) return 'api';

  const sysSignals = ['docker', 'kubernetes', 'terraform', 'ci/cd', 'deployment',
    'infrastructure', 'monitoring', 'scaling', 'load balancer', 'nginx'];
  if (sysSignals.filter(s => lower.includes(s)).length >= 2) return 'systems';

  return null;
}

function getContextPrompts(cwd) {
  const contextPath = path.join(cwd, '.planning', 'CONTEXT.md');
  if (!fs.existsSync(contextPath)) return [];

  try {
    const content = fs.readFileSync(contextPath, 'utf8');
    const triedMatch = content.match(/## What Has Been Tried\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (!triedMatch) return [];

    const triedSection = triedMatch[1];
    const rows = triedSection.split('\n')
      .filter(l => l.trim().startsWith('|') && !l.includes('---'))
      .slice(2);

    if (rows.length === 0) return [];

    const failedApproaches = rows
      .filter(r => /fail|low|partial|error/i.test(r))
      .map(r => {
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

#!/usr/bin/env node
// nr-hook-version: 2.5.0
// Netrunner Wrap-Up Interceptor — PreToolUse hook
//
// During an active extended session with significant time remaining, this hook
// detects "Claude is about to wrap up" signals and blocks them, redirecting
// the model back to work.
//
// Detection signals (in tool inputs — the only thing PreToolUse sees):
//   - Bash:  git commit messages containing summary/final/wrap-up phrasing
//   - Bash:  echo/print statements saying "all done", "completed all tasks", "session complete"
//   - Write: appending "SESSION COMPLETE" / "FINAL SUMMARY" to .planning files
//   - TodoWrite payloads that mark ALL tasks completed when time remains
//
// Behavior:
//   - No active EXTENDED session → exit 0 (pass-through, no interference)
//   - Active session with > 30 min remaining → exit 2 (block) + stderr message
//   - Active session with <= 30 min remaining → exit 0 (wind-down is OK)
//   - User can force wrap-up by running `nr-tools.cjs session end` first
//
// Every block is logged to .planning/session-log.md so the user can debug.

const fs = require('fs');
const path = require('path');
const os = require('os');

const BUDGET_FILE = path.join(os.tmpdir(), 'nr-session-budget.json');
const WIND_DOWN_GRACE_MS = 30 * 60 * 1000; // Within 30 min of end → wind-down is allowed

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
    fs.appendFileSync(logPath, `- \`${new Date().toISOString()}\` ${message}\n`);
  } catch {}
}

function fmtDuration(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h === 0 ? `${m}m` : `${h}h${m}m`;
}

// ─── Wrap-up Detection ──────────────────────────────────────────────────────

// Phrases in commit messages or text output that indicate Claude is wrapping up.
// Matched case-insensitively against extracted text from tool inputs.
const WRAP_UP_PATTERNS = [
  { re: /\b(?:all\s+(?:tasks?|work|phases?|items?|todos?)\s+(?:complete|completed|done|finished))\b/i, label: 'all tasks complete' },
  { re: /\bsession\s+(?:complete|finished|done|wrapped[- ]up)\b/i, label: 'session complete' },
  { re: /\bfinal\s+(?:summary|wrap[- ]?up|report|commit)\b/i, label: 'final summary' },
  { re: /\bwrap[- ]?(?:up|ping[- ]up)\s+(?:the\s+)?(?:session|work|project)\b/i, label: 'wrap up session' },
  { re: /\bnothing\s+more\s+to\s+do\b/i, label: 'nothing more to do' },
  { re: /\bproject\s+(?:complete|finished|done)\b/i, label: 'project complete' },
  // Generic git commit phrasing — too generic alone, but if combined with extended session and time remaining, it's suspicious
  { re: /\b(?:summarize|summary\s+of)\s+(?:all\s+)?(?:work|changes|done)\b/i, label: 'summarize work' },
];

// Read tool input from stdin (PreToolUse provides JSON)
let input = '';
const timeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(timeout);
  try {
    const data = JSON.parse(input);
    run(data);
  } catch (e) {
    process.exit(0); // Bad input → pass-through, don't block
  }
});

function run(data) {
  const budget = readBudget();

  // Only enforce during EXTENDED or AUTO_RESEARCH sessions
  if (!budget) { process.exit(0); return; }
  if (budget.mode !== 'EXTENDED' && budget.mode !== 'AUTO_RESEARCH') { process.exit(0); return; }
  if (!budget.end_time_ms) {
    // Open-ended session — only block obvious "I'm done" signals, not all wrap-up phrasing
    // (skip enforcement for now; the deep-work hook handles open-ended sessions)
    process.exit(0); return;
  }

  const now = Date.now();
  const remainingMs = budget.end_time_ms - now;

  // Within wind-down grace window — wrap-up is legitimate
  if (remainingMs <= WIND_DOWN_GRACE_MS) { process.exit(0); return; }

  const toolName = data.tool_name || '';
  const cwd = data.cwd || process.cwd();
  const toolInput = data.tool_input || {};

  // Extract searchable text from tool input based on tool type
  const searchText = extractSearchText(toolName, toolInput);
  if (!searchText) { process.exit(0); return; }

  // Check for wrap-up patterns
  let matched = null;
  for (const p of WRAP_UP_PATTERNS) {
    if (p.re.test(searchText)) {
      matched = p;
      break;
    }
  }

  // Also detect "mark all todos complete" pattern in TodoWrite
  if (!matched && toolName === 'TodoWrite' && toolInput.todos) {
    try {
      const todos = toolInput.todos;
      if (Array.isArray(todos) && todos.length >= 2 && todos.every(t => t.status === 'completed')) {
        matched = { label: 'all todos marked completed' };
      }
    } catch {}
  }

  if (!matched) { process.exit(0); return; }

  // Block — write to stderr, exit 2
  budget.wrap_up_attempts = (budget.wrap_up_attempts || 0) + 1;
  writeBudget(budget);

  appendSessionLog(cwd, `WRAP_UP_BLOCKED #${budget.wrap_up_attempts} tool=${toolName} pattern="${matched.label}" remaining=${fmtDuration(remainingMs)}`);

  const message = [
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `  NR ► WRAP-UP BLOCKED (extended session active)`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `Detected wrap-up signal: "${matched.label}"`,
    `Tool: ${toolName}`,
    `Time remaining: ${fmtDuration(remainingMs)} (session ends ${new Date(budget.end_time_ms).toLocaleString()})`,
    `Wrap-up attempts blocked: ${budget.wrap_up_attempts}`,
    '',
    'The user asked you to work for the entire session duration. Wrap-up while > 30 min remain',
    'is the failure mode they specifically asked you to avoid.',
    '',
    'WHAT TO DO INSTEAD:',
    '1. Re-read .planning/ROADMAP.md — is there a next phase?',
    '2. Re-read .planning/CONTEXT.md "Open Questions" — anything unresolved?',
    '3. For creative/data-mining tasks: generate a NEW hypothesis and test it.',
    '4. If nothing planned, do EXTEND_WORK: test coverage → code quality → performance → docs.',
    '5. Only after exhausting all of the above should you commit and stop.',
    '',
    'TO LEGITIMATELY END THE SESSION:',
    '  Run `node ~/.claude/netrunner/bin/nr-tools.cjs session end` first, then this commit will succeed.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ].join('\n');

  process.stderr.write(message);
  process.exit(2);
}

function extractSearchText(toolName, toolInput) {
  // Pull a single string out of any tool input that we want to scan
  switch (toolName) {
    case 'Bash':
    case 'PowerShell':
      return String(toolInput.command || '');
    case 'Write':
    case 'Edit':
      // Look at the content being written — but only flag if writing to .planning/ summary files
      const filePath = String(toolInput.file_path || '');
      if (!/\.planning\b/.test(filePath)) return '';
      return String(toolInput.content || toolInput.new_string || '');
    case 'TodoWrite':
      return JSON.stringify(toolInput.todos || []);
    default:
      return '';
  }
}

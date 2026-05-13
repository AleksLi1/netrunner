/**
 * Session — Extended session budget tracking
 *
 * Provides the runtime state that hooks read to enforce extended-session
 * behavior. Stored in $TEMP/nr-session-budget.json (not .planning/) because
 * the budget is per-process-session, not per-project.
 *
 * Cross-process contract (read by hooks):
 *   {
 *     mode: "STANDARD" | "EXTENDED" | "AUTO_RESEARCH",
 *     cwd: string,                   // project root
 *     start_time_ms: number,         // epoch ms
 *     end_time_ms: number | null,    // epoch ms, null for AUTO_RESEARCH without budget
 *     duration_label: string,        // human readable: "8h", "3h", "overnight"
 *     cycle_count: number,           // bumped by run.md chain loop
 *     cycle_cap: number,             // 50 standard, 500 extended
 *     reminders_sent: number,        // bumped by deep-work hook
 *     last_reminder_ms: number,
 *     wrap_up_attempts: number,      // bumped by wrap-up blocker
 *     status: "active" | "winding_down" | "complete"
 *   }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { output, error } = require('./core.cjs');

const BUDGET_FILE = path.join(os.tmpdir(), 'nr-session-budget.json');

// ─── Time Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a duration string into milliseconds.
 * Accepts: "overnight" (8h), "8h", "8 hours", "180m", "180 minutes", "extended" (4h).
 * Returns { ms, label } or null on parse failure.
 */
function parseDuration(input) {
  if (!input) return null;
  const s = String(input).toLowerCase().trim();

  if (s === 'overnight') return { ms: 8 * 3600 * 1000, label: 'overnight (8h)' };
  if (s === 'extended' || s === 'long session' || s === 'long') return { ms: 4 * 3600 * 1000, label: 'extended (4h)' };
  if (s === 'unlimited' || s === 'forever') return { ms: 24 * 3600 * 1000, label: 'unlimited (24h cap)' };

  // "for N hours" / "N hours" / "Nh"
  let m = s.match(/(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:h|hours?|hr|hrs)\b/);
  if (m) {
    const hours = parseFloat(m[1]);
    return { ms: hours * 3600 * 1000, label: `${hours}h` };
  }
  // "for N minutes" / "N minutes" / "Nm" / "Nmin"
  m = s.match(/(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?)\b/);
  if (m) {
    const mins = parseFloat(m[1]);
    return { ms: mins * 60 * 1000, label: `${mins}m` };
  }
  return null;
}

// ─── Budget File I/O ─────────────────────────────────────────────────────────

function readBudget() {
  try {
    return JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeBudget(budget) {
  try {
    fs.writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

function clearBudget() {
  try { fs.unlinkSync(BUDGET_FILE); } catch {}
}

// ─── Public Helpers (used by hooks via require) ──────────────────────────────

function getActiveBudget() {
  const b = readBudget();
  if (!b) return null;
  if (b.end_time_ms && Date.now() > b.end_time_ms + 60000) return null; // 1 min grace, then expired
  if (b.status === 'complete') return null;
  return b;
}

function timeRemainingMs(budget) {
  if (!budget || !budget.end_time_ms) return 0;
  return Math.max(0, budget.end_time_ms - Date.now());
}

function elapsedMs(budget) {
  if (!budget) return 0;
  return Date.now() - budget.start_time_ms;
}

function formatDuration(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h${m}m`;
}

// ─── CLI Commands ────────────────────────────────────────────────────────────

function cmdSessionStart(cwd, options, raw) {
  const { duration, mode } = options;
  const parsed = parseDuration(duration);
  if (!parsed && duration) {
    error(`Could not parse duration: "${duration}". Try "overnight", "for 3 hours", "for 90 minutes".`);
  }

  const now = Date.now();
  const sessionMode = mode || (parsed ? 'EXTENDED' : 'STANDARD');
  const budget = {
    mode: sessionMode,
    cwd: cwd,
    start_time_ms: now,
    end_time_ms: parsed ? now + parsed.ms : null,
    duration_label: parsed ? parsed.label : 'no budget',
    cycle_count: 0,
    cycle_cap: sessionMode === 'EXTENDED' || sessionMode === 'AUTO_RESEARCH' ? 500 : 50,
    reminders_sent: 0,
    last_reminder_ms: now,
    wrap_up_attempts: 0,
    status: 'active',
  };

  writeBudget(budget);

  // Append a session-log entry so the user can audit
  appendSessionLog(cwd, `SESSION_START mode=${sessionMode} duration=${budget.duration_label} ends=${budget.end_time_ms ? new Date(budget.end_time_ms).toISOString() : 'open'}`);

  output(budget, raw);
}

function cmdSessionStatus(cwd, raw) {
  const b = getActiveBudget();
  if (!b) {
    output({ active: false }, raw, 'no active session');
    return;
  }
  const remaining = timeRemainingMs(b);
  const result = {
    active: true,
    mode: b.mode,
    cwd: b.cwd,
    elapsed: formatDuration(elapsedMs(b)),
    remaining: b.end_time_ms ? formatDuration(remaining) : 'open',
    remaining_ms: remaining,
    duration_label: b.duration_label,
    cycle_count: b.cycle_count,
    cycle_cap: b.cycle_cap,
    reminders_sent: b.reminders_sent,
    wrap_up_attempts: b.wrap_up_attempts,
    status: b.status,
    end_time: b.end_time_ms ? new Date(b.end_time_ms).toISOString() : null,
  };
  output(result, raw);
}

function cmdSessionEnd(cwd, raw) {
  const b = readBudget();
  if (b) {
    appendSessionLog(cwd, `SESSION_END elapsed=${formatDuration(elapsedMs(b))} cycles=${b.cycle_count} reminders=${b.reminders_sent} wrap_up_attempts=${b.wrap_up_attempts}`);
  }
  clearBudget();
  output({ ended: true }, raw, 'session ended');
}

function cmdSessionIncrementCycle(cwd, raw) {
  const b = readBudget();
  if (!b) { output({ updated: false, reason: 'no active session' }, raw); return; }
  b.cycle_count += 1;
  writeBudget(b);
  output({ updated: true, cycle_count: b.cycle_count, cycle_cap: b.cycle_cap }, raw);
}

function cmdSessionLog(cwd, message, raw) {
  if (!message) error('Usage: session log <message>');
  const ok = appendSessionLog(cwd, message);
  output({ logged: ok }, raw, ok ? 'logged' : 'failed');
}

// ─── .planning/session-log.md ────────────────────────────────────────────────

function appendSessionLog(cwd, message) {
  try {
    const planningDir = path.join(cwd, '.planning');
    if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
    const logPath = path.join(planningDir, 'session-log.md');
    const ts = new Date().toISOString();
    let header = '';
    if (!fs.existsSync(logPath)) {
      header = '# Netrunner Session Log\n\nLog of session events for debugging extended-session behavior.\nReminders, wrap-up attempts, and session start/end are written here.\n\n';
    }
    fs.appendFileSync(logPath, `${header}- \`${ts}\` ${message}\n`);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  // Public helpers used by hooks
  parseDuration,
  readBudget,
  writeBudget,
  clearBudget,
  getActiveBudget,
  timeRemainingMs,
  elapsedMs,
  formatDuration,
  appendSessionLog,
  BUDGET_FILE,
  // CLI commands
  cmdSessionStart,
  cmdSessionStatus,
  cmdSessionEnd,
  cmdSessionIncrementCycle,
  cmdSessionLog,
};

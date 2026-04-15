#!/usr/bin/env node
// nr-hook-version: 2.2.0
// Safety gate for destructive commands.
// Registered as a PreToolUse hook — fires before every tool call.
//
// Blocks dangerous commands (rm -rf, git reset --hard, etc.) with a warning.
// This is a safety net even for --dangerously-skip-permissions users.
// Non-destructive commands pass through with exit 0 (no interference).

const fs = require('fs');
const path = require('path');

// Destructive command patterns — commands that can cause irreversible damage.
// Each entry: { pattern: RegExp, message: string }
const DESTRUCTIVE_PATTERNS = [
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\b.*--force|-[a-zA-Z]*f[a-zA-Z]*r)\b/,
    message: 'rm -rf detected — this recursively deletes files permanently'
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    message: 'git reset --hard discards all uncommitted changes permanently'
  },
  {
    pattern: /\bgit\s+push\s+.*--force\b/,
    message: 'git push --force overwrites remote history — other collaborators may lose work'
  },
  {
    pattern: /\bgit\s+push\s+-f\b/,
    message: 'git push -f (force push) overwrites remote history'
  },
  {
    pattern: /\bgit\s+clean\s+.*-f/,
    message: 'git clean -f permanently removes untracked files'
  },
  {
    pattern: /\bgit\s+checkout\s+--\s+\./,
    message: 'git checkout -- . discards all uncommitted file changes'
  },
  {
    pattern: /\bgit\s+branch\s+-D\b/,
    message: 'git branch -D force-deletes a branch (even if unmerged)'
  },
  {
    pattern: /\bdrop\s+(table|database|schema)\b/i,
    message: 'DROP statement permanently destroys database objects'
  },
  {
    pattern: /\btruncate\s+table\b/i,
    message: 'TRUNCATE permanently deletes all rows from the table'
  },
  {
    pattern: /\bsudo\s+rm\b/,
    message: 'sudo rm — elevated deletion is especially dangerous'
  },
  {
    pattern: /\bformat\s+[a-zA-Z]:/i,
    message: 'format command — disk formatting is irreversible'
  },
];

// Read hook input from stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};

    // Only check Bash commands
    if (toolName !== 'Bash') {
      process.exit(0); // Pass through
    }

    const command = toolInput.command || '';
    if (!command) {
      process.exit(0);
    }

    // Safe commands that may contain destructive keywords as data (not commands).
    // e.g., git commit messages mentioning "rm -rf" or "DROP TABLE" as text.
    const SAFE_PREFIXES = [
      /\bgit\s+commit\b/,       // Commit messages are data, not commands
      /\bgit\s+tag\b/,          // Tag messages are data
      /\becho\b/,               // Echo output is data
      /\bprintf\b/,             // Printf output is data
      /\bgit\s+log\b/,          // Log viewing is read-only
      /\bgit\s+show\b/,         // Show is read-only
    ];
    for (const prefix of SAFE_PREFIXES) {
      if (prefix.test(command)) {
        process.exit(0);
      }
    }

    // Check against destructive patterns
    for (const { pattern, message } of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(command)) {
        // Exit code 2 = blocking error. stderr is shown to Claude.
        process.stderr.write(
          `[NR Safety Gate] BLOCKED: ${message}\n` +
          `Command: ${command}\n` +
          `If this is intentional, the user should approve it manually.\n`
        );
        process.exit(2);
      }
    }

    // Non-destructive — pass through
    process.exit(0);
  } catch (e) {
    // Parse error — don't block, just pass through
    process.exit(0);
  }
});

// Timeout: never block for more than 2s
setTimeout(() => { process.exit(0); }, 2000);

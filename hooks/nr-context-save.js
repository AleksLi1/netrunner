#!/usr/bin/env node
// nr-hook-version: 2.2.0
// Auto-save CONTEXT.md state at end of each Claude turn.
// Registered as a Stop hook — fires after every Claude response.
//
// Purpose: Prevent context loss between sessions. Snapshots key brain state
// to a lightweight JSON cache that /nr:run can use for fast warm-start.

const fs = require('fs');
const path = require('path');

// Stop hooks receive JSON on stdin with session metadata.
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();
    saveContext(cwd);
  } catch (e) {
    // Fallback: try process.cwd()
    try { saveContext(process.cwd()); } catch (_) {}
  }
});

// Timeout: if stdin doesn't close in 3s, try cwd fallback and exit.
setTimeout(() => {
  try { saveContext(process.cwd()); } catch (_) {}
  process.exit(0);
}, 3000);

function saveContext(cwd) {
  const contextPath = path.join(cwd, '.planning', 'CONTEXT.md');
  if (!fs.existsSync(contextPath)) return;

  const content = fs.readFileSync(contextPath, 'utf8');

  // Extract key sections for fast warm-start
  const snapshot = {
    saved_at: new Date().toISOString(),
    cwd: cwd,
    hypothesis: extractSection(content, 'Active Hypothesis') || extractField(content, 'Active Hypothesis'),
    confidence: extractField(content, 'Confidence'),
    behavior_pattern: extractField(content, 'Behavior Pattern'),
    tried_count: countTableRows(content, 'What Has Been Tried'),
    constraints_count: countTableRows(content, 'Hard Constraints'),
    last_update: extractLastUpdateEntry(content),
  };

  // Write snapshot next to CONTEXT.md
  const snapshotPath = path.join(cwd, '.planning', '.context-snapshot.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}

function extractField(content, fieldName) {
  const re = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
  const match = content.match(re);
  return match ? match[1].trim() : null;
}

function extractSection(content, sectionName) {
  const re = new RegExp(`## ${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = content.match(re);
  if (!match) return null;
  return match[1].trim().substring(0, 500); // Cap at 500 chars
}

function countTableRows(content, sectionName) {
  const re = new RegExp(`## ${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = content.match(re);
  if (!match) return 0;
  // Count table rows (lines starting with |, skip header + separator)
  const lines = match[1].split('\n').filter(l => l.trim().startsWith('|'));
  return Math.max(0, lines.length - 2); // Subtract header + separator
}

function extractLastUpdateEntry(content) {
  const re = /## Update Log\s*\n([\s\S]*?)(?=\n##|$)/i;
  const match = content.match(re);
  if (!match) return null;
  const lines = match[1].trim().split('\n').filter(l => l.trim());
  return lines.length > 0 ? lines[lines.length - 1].trim().substring(0, 200) : null;
}

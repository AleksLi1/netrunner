const fs = require('fs');
const path = require('path');
const { output, error } = require('./core.cjs');

// --- Internal helpers ---

function contextPath(cwd) {
  return path.join(cwd, '.planning', 'CONTEXT.md');
}

function parseContext(content) {
  // Parse CONTEXT.md into structured sections
  const sections = {};
  let currentSection = null;
  let currentContent = [];

  for (const line of content.split('\n')) {
    const headerMatch = line.match(/^## (.+)/);
    if (headerMatch) {
      if (currentSection) sections[currentSection] = currentContent.join('\n').trim();
      currentSection = headerMatch[1];
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection) sections[currentSection] = currentContent.join('\n').trim();
  return sections;
}

function serializeContext(sections, projectName) {
  let out = `# Netrunner Context — ${projectName || 'Project'}\n\n`;
  for (const [key, val] of Object.entries(sections)) {
    out += `## ${key}\n${val}\n\n`;
  }
  return out.trimEnd() + '\n';
}

// --- Exported commands ---

function cmdLoadContext(cwd, raw) {
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found. Run /nr init first.');
  const content = fs.readFileSync(p, 'utf8');
  output(raw ? JSON.stringify(parseContext(content)) : content);
}

function cmdUpdateDiagnostic(cwd, field, value, raw) {
  // Update a field in the Diagnostic State section
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  let content = fs.readFileSync(p, 'utf8');
  const fieldPattern = new RegExp(`(\\*\\*${field}:\\*\\* )(.*)`, 'i');
  if (fieldPattern.test(content)) {
    content = content.replace(fieldPattern, `$1${value}`);
  } else {
    // Append to diagnostic section
    const diagIdx = content.indexOf('## Diagnostic State');
    if (diagIdx === -1) error('No Diagnostic State section');
    const nextSection = content.indexOf('\n## ', diagIdx + 1);
    const insertAt = nextSection !== -1 ? nextSection : content.length;
    content = content.slice(0, insertAt) + `**${field}:** ${value}\n` + content.slice(insertAt);
  }
  fs.writeFileSync(p, content, 'utf8');
  output(raw ? JSON.stringify({ updated: field }) : `Updated diagnostic: ${field}`);
}

function cmdAddTriedApproach(cwd, approachJson, raw) {
  // Add row to "What Has Been Tried" table
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  let content = fs.readFileSync(p, 'utf8');
  const approach = typeof approachJson === 'string' ? JSON.parse(approachJson) : approachJson;
  const row = `| ${approach.approach || 'N/A'} | ${approach.outcome || 'N/A'} | ${approach.confidence || 'N/A'} | ${approach.failure_mode || 'N/A'} | ${approach.phase || 'N/A'} | ${approach.date || new Date().toISOString().split('T')[0]} |`;

  const tableHeader = '| Approach | Outcome | Confidence | Failure Mode | Phase | Date |';
  const tableIdx = content.indexOf(tableHeader);
  if (tableIdx === -1) {
    // Add section if missing
    content += `\n## What Has Been Tried\n${tableHeader}\n|----------|---------|------------|--------------|-------|------|\n${row}\n`;
  } else {
    // Find end of table, insert row
    const afterHeader = content.indexOf('\n', tableIdx);
    const afterSep = content.indexOf('\n', afterHeader + 1);
    const insertAt = afterSep + 1;
    content = content.slice(0, insertAt) + row + '\n' + content.slice(insertAt);
  }
  fs.writeFileSync(p, content, 'utf8');
  output(raw ? JSON.stringify({ added: approach.approach }) : `Added approach: ${approach.approach}`);
}

function cmdAddDecision(cwd, decisionJson, raw) {
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  let content = fs.readFileSync(p, 'utf8');
  const d = typeof decisionJson === 'string' ? JSON.parse(decisionJson) : decisionJson;
  const row = `| ${d.phase || 'N/A'} | ${d.decision || 'N/A'} | ${d.reasoning || 'N/A'} | ${d.outcome || 'pending'} |`;

  const tableHeader = '| Phase | Decision | Reasoning | Outcome |';
  const tableIdx = content.indexOf(tableHeader);
  if (tableIdx === -1) {
    content += `\n## Decision Log\n${tableHeader}\n|-------|----------|-----------|---------|  \n${row}\n`;
  } else {
    const afterHeader = content.indexOf('\n', tableIdx);
    const afterSep = content.indexOf('\n', afterHeader + 1);
    content = content.slice(0, afterSep + 1) + row + '\n' + content.slice(afterSep + 1);
  }
  fs.writeFileSync(p, content, 'utf8');
  output(raw ? JSON.stringify({ added: d.decision }) : `Added decision: ${d.decision}`);
}

function cmdGetConstraints(cwd, raw) {
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  const content = fs.readFileSync(p, 'utf8');
  const sections = parseContext(content);
  const constraints = sections['Hard Constraints'] || 'None';
  output(raw ? JSON.stringify({ constraints }) : constraints);
}

function cmdGetClosedPaths(cwd, raw) {
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  const content = fs.readFileSync(p, 'utf8');
  const sections = parseContext(content);
  const tried = sections['What Has Been Tried'] || '';
  // Extract high-confidence failures
  const lines = tried.split('\n').filter(l => l.startsWith('|') && !l.startsWith('| Approach') && !l.startsWith('|---'));
  const closed = lines.filter(l => {
    const cols = l.split('|').map(c => c.trim()).filter(Boolean);
    return cols[2] && cols[2].toLowerCase() === 'high' && cols[1] && cols[1].toLowerCase().includes('fail');
  });
  output(raw ? JSON.stringify({ closed_paths: closed.map(l => l.split('|')[1]?.trim()) }) : closed.join('\n') || 'No closed paths');
}

function cmdCheckConstraint(cwd, proposal, raw) {
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  const content = fs.readFileSync(p, 'utf8');
  const sections = parseContext(content);
  const constraints = sections['Hard Constraints'] || '';
  const tried = sections['What Has Been Tried'] || '';

  const violations = [];
  // Check against constraint table rows
  const constraintRows = constraints.split('\n').filter(l => l.startsWith('|') && !l.startsWith('| Constraint') && !l.startsWith('|---'));
  for (const row of constraintRows) {
    const cols = row.split('|').map(c => c.trim()).filter(Boolean);
    if (cols[0] && proposal.toLowerCase().includes(cols[0].toLowerCase())) {
      violations.push(`Constraint violation: "${cols[0]}" — ${cols[1] || 'no reason given'}`);
    }
  }

  // Check against closed paths
  const triedRows = tried.split('\n').filter(l => l.startsWith('|') && !l.startsWith('| Approach') && !l.startsWith('|---'));
  for (const row of triedRows) {
    const cols = row.split('|').map(c => c.trim()).filter(Boolean);
    if (cols[2]?.toLowerCase() === 'high' && cols[1]?.toLowerCase().includes('fail')) {
      if (proposal.toLowerCase().includes(cols[0]?.toLowerCase())) {
        violations.push(`Closed path: "${cols[0]}" failed with high confidence`);
      }
    }
  }

  const result = { proposal, violations, passes: violations.length === 0 };
  output(raw ? JSON.stringify(result) : violations.length === 0 ? 'PASS — no constraint violations' : `FAIL:\n${violations.join('\n')}`);
}

function cmdAddUpdateLog(cwd, phase, change, raw) {
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  let content = fs.readFileSync(p, 'utf8');
  const date = new Date().toISOString().split('T')[0];
  const row = `| ${date} | ${phase} | ${change} |`;

  const tableHeader = '| Date | Phase | Change |';
  const tableIdx = content.indexOf(tableHeader);
  if (tableIdx === -1) {
    content += `\n## Update Log\n${tableHeader}\n|------|-------|--------|\n${row}\n`;
  } else {
    const afterHeader = content.indexOf('\n', tableIdx);
    const afterSep = content.indexOf('\n', afterHeader + 1);
    content = content.slice(0, afterSep + 1) + row + '\n' + content.slice(afterSep + 1);
  }
  fs.writeFileSync(p, content, 'utf8');
  output(raw ? JSON.stringify({ logged: change }) : `Logged: ${change}`);
}

// --- NR_HOME helper ---

function nrHome() {
  const homedir = require('os').homedir();
  return path.join(homedir, '.claude', 'netrunner');
}

// --- New commands ---

function cmdInitContext(cwd, projectInfo, raw) {
  const info = typeof projectInfo === 'string' ? JSON.parse(projectInfo) : projectInfo;
  const destDir = path.join(cwd, '.planning');
  const dest = path.join(destDir, 'CONTEXT.md');

  // Check --force via info or existence
  if (fs.existsSync(dest) && !info.force) {
    error('CONTEXT.md already exists. Pass --force to overwrite.');
  }

  const templatePath = path.join(nrHome(), 'templates', 'context.md');
  if (!fs.existsSync(templatePath)) {
    error(`Template not found: ${templatePath}`);
  }

  let template = fs.readFileSync(templatePath, 'utf8');

  // Fill placeholders
  template = template.replace(/\{\{PROJECT_NAME\}\}/g, info.name || 'Unnamed Project');
  template = template.replace(/\{\{OUTCOME_DESCRIPTION -- what success looks like, not technology choices\}\}/g, info.goal || 'TBD');

  // Fill initial metric row if type provided
  const typeLabel = info.type || 'BUILD:GREENFIELD';
  template = template.replace(/\{\{metric_name\}\}/, 'Project Type');
  template = template.replace(/\{\{current_value\}\}/, typeLabel);
  template = template.replace(/\{\{target_value\}\}/, 'Complete');

  // Fill initial constraint placeholder
  const domain = info.domain || 'general';
  template = template.replace(/\{\{constraint\}\}/, 'Domain');
  template = template.replace(/\{\{reason\}\}/, `${domain} project conventions`);
  template = template.replace(/\{\{cost\}\}/, 'Rework');

  // Fill diagnostic placeholders
  template = template.replace(/\{\{What is the core challenge and WHY does it exist\?\}\}/g, 'Initial exploration — no hypothesis yet');
  template = template.replace(/\{\{signals supporting hypothesis\}\}/g, 'None yet');
  template = template.replace(/\{\{signals contradicting\}\}/g, 'None yet');
  template = template.replace(/\{\{High\/Medium\/Low\}\}/g, 'Low');
  template = template.replace(/\{\{What would resolve uncertainty\?\}\}/g, 'Initial assessment needed');
  template = template.replace(/\{\{Domain-specific knowledge -- ML signals, API patterns, infra constraints, etc\.\}\}/g, `Domain: ${domain}`);

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(dest, template, 'utf8');

  const result = { created: dest, project: info.name, type: typeLabel, domain };
  output(raw ? JSON.stringify(result) : `Initialized CONTEXT.md for "${info.name}" (${typeLabel}, ${domain})`);
}

function cmdContextSummary(cwd, raw) {
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  const content = fs.readFileSync(p, 'utf8');
  const sections = parseContext(content);

  // Extract project name from header
  const headerMatch = content.match(/^# Netrunner Context [-—] (.+)/m);
  const projectName = headerMatch ? headerMatch[1] : 'Unknown';

  // Extract goal (first line of Project Goal section)
  const goal = (sections['Project Goal'] || 'TBD').split('\n')[0].trim();

  // Extract hypothesis and confidence from Diagnostic State
  const diag = sections['Diagnostic State'] || '';
  const hypMatch = diag.match(/\*\*Active hypothesis:\*\* (.+)/);
  const confMatch = diag.match(/\*\*Confidence:\*\* (.+)/);
  const hypothesis = hypMatch ? hypMatch[1].trim() : 'None';
  const confidence = confMatch ? confMatch[1].trim() : 'Unknown';

  // Extract hard constraints
  const constraintSection = sections['Hard Constraints'] || '';
  const constraintRows = constraintSection.split('\n')
    .filter(l => l.startsWith('|') && !l.startsWith('| Constraint') && !l.startsWith('|---'))
    .map(l => {
      const cols = l.split('|').map(c => c.trim()).filter(Boolean);
      return cols[0] || null;
    })
    .filter(Boolean);

  // Extract closed paths (high-confidence failures)
  const tried = sections['What Has Been Tried'] || '';
  const closedPaths = tried.split('\n')
    .filter(l => l.startsWith('|') && !l.startsWith('| Approach') && !l.startsWith('|---'))
    .filter(l => {
      const cols = l.split('|').map(c => c.trim()).filter(Boolean);
      return cols[2] && cols[2].toLowerCase() === 'high' && cols[1] && cols[1].toLowerCase().includes('fail');
    })
    .map(l => l.split('|')[1]?.trim())
    .filter(Boolean);

  // Extract recent decisions (last 5)
  const decisionSection = sections['Decision Log'] || '';
  const decisions = decisionSection.split('\n')
    .filter(l => l.startsWith('|') && !l.startsWith('| Phase') && !l.startsWith('|---'))
    .slice(0, 5)
    .map(l => {
      const cols = l.split('|').map(c => c.trim()).filter(Boolean);
      return { phase: cols[0], decision: cols[1], outcome: cols[3] };
    });

  if (raw) {
    output(JSON.stringify({
      project: projectName,
      goal,
      hypothesis,
      confidence,
      constraints: constraintRows,
      closed_paths: closedPaths,
      recent_decisions: decisions,
    }));
    return;
  }

  // Human-readable compact summary
  const lines = [];
  lines.push(`PROJECT: ${projectName}`);
  lines.push(`GOAL: ${goal}`);
  lines.push(`HYPOTHESIS: ${hypothesis} (confidence: ${confidence})`);
  lines.push('HARD CONSTRAINTS:');
  if (constraintRows.length === 0) {
    lines.push('  - (none)');
  } else {
    for (const c of constraintRows) lines.push(`  - ${c}`);
  }
  lines.push('CLOSED PATHS (do not repeat):');
  if (closedPaths.length === 0) {
    lines.push('  - (none)');
  } else {
    for (const cp of closedPaths) lines.push(`  - ${cp}`);
  }
  lines.push('RECENT DECISIONS:');
  if (decisions.length === 0) {
    lines.push('  - (none)');
  } else {
    for (const d of decisions) {
      lines.push(`  - Phase ${d.phase}: ${d.decision} → ${d.outcome || 'pending'}`);
    }
  }
  output(lines.join('\n'));
}

function cmdUpdateHypothesis(cwd, hypothesis, evidence, confidence, raw) {
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  let content = fs.readFileSync(p, 'utf8');
  const ev = typeof evidence === 'string' ? JSON.parse(evidence) : evidence;

  const forText = (ev.for || []).join('; ') || 'None';
  const againstText = (ev.against || []).join('; ') || 'None';

  // Replace diagnostic fields
  const hypPattern = /(\*\*Active hypothesis:\*\* ).*/;
  const forPattern = /(\*\*Evidence for:\*\* ).*/;
  const againstPattern = /(\*\*Evidence against:\*\* ).*/;
  const confPattern = /(\*\*Confidence:\*\* ).*/;

  if (hypPattern.test(content)) {
    content = content.replace(hypPattern, `$1${hypothesis}`);
  }
  if (forPattern.test(content)) {
    content = content.replace(forPattern, `$1${forText}`);
  }
  if (againstPattern.test(content)) {
    content = content.replace(againstPattern, `$1${againstText}`);
  }
  if (confPattern.test(content)) {
    content = content.replace(confPattern, `$1${confidence}`);
  }

  // Add update log entry
  const date = new Date().toISOString().split('T')[0];
  const logRow = `| ${date} | - | Hypothesis updated: ${hypothesis} (${confidence}) |`;
  const logHeader = '| Date | Phase | Change |';
  const logIdx = content.indexOf(logHeader);
  if (logIdx !== -1) {
    const afterHeader = content.indexOf('\n', logIdx);
    const afterSep = content.indexOf('\n', afterHeader + 1);
    content = content.slice(0, afterSep + 1) + logRow + '\n' + content.slice(afterSep + 1);
  }

  fs.writeFileSync(p, content, 'utf8');
  const result = { hypothesis, evidence: ev, confidence, updated: true };
  output(raw ? JSON.stringify(result) : `Hypothesis updated: ${hypothesis} (confidence: ${confidence})`);
}

function cmdUpdateMetrics(cwd, metricsJson, raw) {
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  let content = fs.readFileSync(p, 'utf8');
  const metrics = typeof metricsJson === 'string' ? JSON.parse(metricsJson) : metricsJson;

  const sections = parseContext(content);
  const stateSection = sections['Current State'] || '';
  const lines = stateSection.split('\n');
  const tableHeaderIdx = lines.findIndex(l => l.startsWith('| Metric'));
  const sepIdx = tableHeaderIdx !== -1 ? tableHeaderIdx + 1 : -1;

  // Parse existing rows
  const existingRows = [];
  const existingMetrics = new Set();
  for (let i = (sepIdx !== -1 ? sepIdx + 1 : 0); i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) break;
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length >= 3) {
      existingRows.push({ name: cols[0], current: cols[1], target: cols[2], index: i });
      existingMetrics.add(cols[0]);
    }
  }

  // Update existing or track new
  const newRows = [];
  for (const [name, vals] of Object.entries(metrics)) {
    const existing = existingRows.find(r => r.name === name);
    if (existing) {
      // Update in place
      const newLine = `| ${name} | ${vals.current} | ${vals.target} |`;
      lines[existing.index] = newLine;
    } else {
      newRows.push(`| ${name} | ${vals.current} | ${vals.target} |`);
    }
  }

  // Append new rows after existing table rows
  if (newRows.length > 0) {
    const lastRowIdx = existingRows.length > 0
      ? existingRows[existingRows.length - 1].index
      : (sepIdx !== -1 ? sepIdx : lines.length - 1);
    lines.splice(lastRowIdx + 1, 0, ...newRows);
  }

  // Rebuild section
  const newStateContent = lines.join('\n');
  const sectionHeader = '## Current State';
  const sectionStart = content.indexOf(sectionHeader);
  if (sectionStart === -1) error('No Current State section found');
  const nextSectionMatch = content.indexOf('\n## ', sectionStart + sectionHeader.length);
  const sectionEnd = nextSectionMatch !== -1 ? nextSectionMatch : content.length;
  content = content.slice(0, sectionStart + sectionHeader.length + 1) + newStateContent + '\n' + content.slice(sectionEnd);

  fs.writeFileSync(p, content, 'utf8');

  // Build output table
  const updatedMetrics = Object.keys(metrics);
  output(raw ? JSON.stringify({ updated: updatedMetrics }) : `Updated metrics: ${updatedMetrics.join(', ')}`);
}

function cmdMergeOverlay(cwd, domain, raw) {
  const validDomains = ['ml', 'web', 'api', 'systems'];
  if (!validDomains.includes(domain)) {
    error(`Invalid domain: ${domain}. Valid: ${validDomains.join(', ')}`);
  }

  const overlayPath = path.join(nrHome(), 'templates', 'overlays', `${domain}.md`);
  if (!fs.existsSync(overlayPath)) {
    error(`Domain overlay not found: ${overlayPath}`);
  }

  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');

  let content = fs.readFileSync(p, 'utf8');
  const overlay = fs.readFileSync(overlayPath, 'utf8');

  // Parse overlay for sections
  const overlayLines = overlay.split('\n');
  const domainContent = [];
  const constraintPatterns = [];
  let inConstraints = false;

  for (const line of overlayLines) {
    if (line.match(/^##?\s+.*[Cc]onstraint/)) {
      inConstraints = true;
      continue;
    } else if (line.match(/^##?\s+/)) {
      inConstraints = false;
    }

    if (inConstraints && line.startsWith('|') && !line.startsWith('| Constraint') && !line.startsWith('|---')) {
      constraintPatterns.push(line);
    } else if (!inConstraints) {
      domainContent.push(line);
    }
  }

  // Merge into Domain Knowledge section
  const domainHeader = '## Domain Knowledge';
  const domainIdx = content.indexOf(domainHeader);
  if (domainIdx === -1) {
    // Append before Decision Log or at end
    const decisionIdx = content.indexOf('## Decision Log');
    const insertAt = decisionIdx !== -1 ? decisionIdx : content.length;
    content = content.slice(0, insertAt) + `${domainHeader}\n${domainContent.join('\n').trim()}\n\n` + content.slice(insertAt);
  } else {
    // Merge into existing
    const nextSection = content.indexOf('\n## ', domainIdx + domainHeader.length);
    const endOfDomain = nextSection !== -1 ? nextSection : content.length;
    const existingDomain = content.slice(domainIdx + domainHeader.length + 1, endOfDomain).trim();
    const merged = existingDomain + '\n\n### Overlay: ' + domain + '\n' + domainContent.join('\n').trim();
    content = content.slice(0, domainIdx + domainHeader.length + 1) + merged + '\n' + content.slice(endOfDomain);
  }

  // Merge constraint patterns into Hard Constraints table
  if (constraintPatterns.length > 0) {
    const constraintHeader = '| Constraint | Why | Cost of Violation |';
    const constraintIdx = content.indexOf(constraintHeader);
    if (constraintIdx !== -1) {
      const afterHeader = content.indexOf('\n', constraintIdx);
      const afterSep = content.indexOf('\n', afterHeader + 1);
      const insertAt = afterSep + 1;
      content = content.slice(0, insertAt) + constraintPatterns.join('\n') + '\n' + content.slice(insertAt);
    }
  }

  // Add update log entry
  const date = new Date().toISOString().split('T')[0];
  const logRow = `| ${date} | - | Domain overlay ${domain} applied |`;
  const logHeader = '| Date | Phase | Change |';
  const logIdx = content.indexOf(logHeader);
  if (logIdx !== -1) {
    const afterHeader = content.indexOf('\n', logIdx);
    const afterSep = content.indexOf('\n', afterHeader + 1);
    content = content.slice(0, afterSep + 1) + logRow + '\n' + content.slice(afterSep + 1);
  }

  fs.writeFileSync(p, content, 'utf8');
  output(raw ? JSON.stringify({ merged: domain, constraints_added: constraintPatterns.length }) : `Merged domain overlay: ${domain} (${constraintPatterns.length} constraints added)`);
}

function cmdGetDomainOverlay(cwd, domain, raw) {
  const validDomains = ['ml', 'web', 'api', 'systems'];
  if (!validDomains.includes(domain)) {
    error(`Invalid domain: ${domain}. Valid: ${validDomains.join(', ')}`);
  }

  const overlayPath = path.join(nrHome(), 'templates', 'overlays', `${domain}.md`);
  if (!fs.existsSync(overlayPath)) {
    error(`Domain overlay not found: ${overlayPath}`);
  }

  const content = fs.readFileSync(overlayPath, 'utf8');
  output(raw ? JSON.stringify({ domain, content }) : content);
}

function cmdContextDiff(cwd, sincePhase, raw) {
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  const content = fs.readFileSync(p, 'utf8');
  const sections = parseContext(content);
  const phaseNum = parseInt(sincePhase, 10);
  if (isNaN(phaseNum)) error('Invalid phase number');

  // Filter Update Log entries from phase N onward
  const updateLog = sections['Update Log'] || '';
  const updateRows = updateLog.split('\n')
    .filter(l => l.startsWith('|') && !l.startsWith('| Date') && !l.startsWith('|---'))
    .filter(l => {
      const cols = l.split('|').map(c => c.trim()).filter(Boolean);
      const rowPhase = parseFloat(cols[1]);
      return !isNaN(rowPhase) ? rowPhase >= phaseNum : true; // include non-numeric phases like "-"
    });

  // Filter Decision Log entries from phase N onward
  const decisionLog = sections['Decision Log'] || '';
  const decisionRows = decisionLog.split('\n')
    .filter(l => l.startsWith('|') && !l.startsWith('| Phase') && !l.startsWith('|---'))
    .filter(l => {
      const cols = l.split('|').map(c => c.trim()).filter(Boolean);
      const rowPhase = parseFloat(cols[0]);
      return !isNaN(rowPhase) && rowPhase >= phaseNum;
    });

  // Filter What Has Been Tried entries from phase N onward
  const tried = sections['What Has Been Tried'] || '';
  const triedRows = tried.split('\n')
    .filter(l => l.startsWith('|') && !l.startsWith('| Approach') && !l.startsWith('|---'))
    .filter(l => {
      const cols = l.split('|').map(c => c.trim()).filter(Boolean);
      const rowPhase = parseFloat(cols[4]); // Phase is column 5 (index 4)
      return !isNaN(rowPhase) && rowPhase >= phaseNum;
    });

  if (raw) {
    output(JSON.stringify({
      since_phase: phaseNum,
      updates: updateRows.length,
      decisions: decisionRows.length,
      approaches_tried: triedRows.length,
      update_entries: updateRows,
      decision_entries: decisionRows,
      tried_entries: triedRows,
    }));
    return;
  }

  const lines = [];
  lines.push(`=== Context diff since Phase ${phaseNum} ===`);
  lines.push('');
  lines.push(`--- Update Log (${updateRows.length} entries) ---`);
  for (const r of updateRows) lines.push(r);
  lines.push('');
  lines.push(`--- Decision Log (${decisionRows.length} entries) ---`);
  for (const r of decisionRows) lines.push(r);
  lines.push('');
  lines.push(`--- Approaches Tried (${triedRows.length} entries) ---`);
  for (const r of triedRows) lines.push(r);
  output(lines.join('\n'));
}

function cmdValidateContext(cwd, raw) {
  const p = contextPath(cwd);
  if (!fs.existsSync(p)) error('No CONTEXT.md found');
  const content = fs.readFileSync(p, 'utf8');
  const sections = parseContext(content);

  const issues = [];

  // Check required sections
  const requiredSections = [
    'Project Goal',
    'Current State',
    'Hard Constraints',
    'Diagnostic State',
    'What Has Been Tried',
    'Domain Knowledge',
    'Decision Log',
    'Update Log',
  ];
  for (const sec of requiredSections) {
    if (!sections[sec]) {
      issues.push(`Missing required section: ## ${sec}`);
    }
  }

  // Check diagnostic state fields
  const diag = sections['Diagnostic State'] || '';
  const requiredDiagFields = ['Active hypothesis', 'Evidence for', 'Evidence against', 'Confidence'];
  for (const field of requiredDiagFields) {
    const pattern = new RegExp(`\\*\\*${field}:\\*\\*`);
    if (!pattern.test(diag)) {
      issues.push(`Diagnostic State missing field: ${field}`);
    }
  }

  // Check for stale data (no entries in Decision Log)
  const decisionLog = sections['Decision Log'] || '';
  const decisionRows = decisionLog.split('\n')
    .filter(l => l.startsWith('|') && !l.startsWith('| Phase') && !l.startsWith('|---'));
  if (decisionRows.length === 0) {
    issues.push('Decision Log has no entries — may be stale');
  }

  // Check for stale data (no entries in Update Log)
  const updateLog = sections['Update Log'] || '';
  const updateRows = updateLog.split('\n')
    .filter(l => l.startsWith('|') && !l.startsWith('| Date') && !l.startsWith('|---'));
  if (updateRows.length === 0) {
    issues.push('Update Log has no entries — may be stale');
  }

  const passes = issues.length === 0;
  if (raw) {
    output(JSON.stringify({ valid: passes, issues }));
    return;
  }

  if (passes) {
    output('PASS — CONTEXT.md structure is valid and complete');
  } else {
    output(`FAIL — ${issues.length} issue(s) found:\n${issues.map(i => `  - ${i}`).join('\n')}`);
  }
}

module.exports = {
  cmdLoadContext,
  cmdUpdateDiagnostic,
  cmdAddTriedApproach,
  cmdAddDecision,
  cmdGetConstraints,
  cmdGetClosedPaths,
  cmdCheckConstraint,
  cmdAddUpdateLog,
  cmdInitContext,
  cmdContextSummary,
  cmdUpdateHypothesis,
  cmdUpdateMetrics,
  cmdMergeOverlay,
  cmdGetDomainOverlay,
  cmdContextDiff,
  cmdValidateContext,
};

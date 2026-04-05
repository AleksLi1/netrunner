# Transfer Import Workflow

**Purpose:** Receive an NTP packet, map findings to the current repository's codebase, plan integration, execute, and verify.

**Triggered by:** IMPORT action in chain reaction engine (auto-detected `.ntp` file in `.planning/imports/`, or explicit user request with file path).

## Prerequisites

- NTP packet available (file path known)
- NTP spec loaded: `references/ntp-spec.md`
- Current repo has code to integrate into (not a fresh repo)

## Process

### Step 1: Load and Validate Packet

1. Read the NTP packet file
2. Validate header: check `NTP/1` version marker, required fields present
3. Parse all sections into structured data
4. Load domain abbreviation table from `references/ntp-spec.md` for the packet's declared domain
5. Display packet summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► IMPORT: Transfer Packet Received
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 From: {repo}@{commit} [{branch}]
 Domain: {domain}
 Confidence: {level}
 Findings: {N} ({types listed})

 Summary: {packet summary text}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 2: Targeted Codebase Discovery

Use DISCOVERY hints from the packet to search THIS repo efficiently. Do NOT scan the entire codebase — use targeted searches only.

**Search strategy:**

1. **PATTERNS search** — grep for the code patterns listed in DISCOVERY.PATTERNS:
   ```
   For each pattern in DISCOVERY.PATTERNS:
     Grep(pattern="{pattern}", output_mode="files_with_matches")
   ```
   These identify the exact files that handle similar concepts.

2. **CONCEPTS search** — grep for domain concepts in DISCOVERY.CONCEPTS:
   ```
   For each concept in DISCOVERY.CONCEPTS:
     Grep(pattern="{concept}", output_mode="files_with_matches")
   ```
   These identify related code that may need to know about the new findings.

3. **TOUCHES search** — grep for integration point keywords in DISCOVERY.TOUCHES:
   ```
   For each touch_point in DISCOVERY.TOUCHES:
     Grep(pattern="{touch_point}", output_mode="files_with_matches")
   ```
   These identify where the new code needs to plug in.

4. **Dependency check** — verify DISCOVERY.DEPS are available:
   ```
   Check package manifest (requirements.txt, package.json, etc.) for each dependency.
   Missing deps → add to integration plan.
   ```

**If existing codebase mapping exists** (`.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`):
- Load these for additional context on where things go
- Cross-reference DISCOVERY hits with known architecture

**If no codebase mapping and discovery hits are sparse:**
- Spawn `nr-mapper` in targeted NTP mode (see nr-mapper agent modifications):
  ```
  Task(subagent_type="nr-mapper", description="Targeted NTP mapping",
    prompt="NTP IMPORT mode. Search for integration points using these hints:
    CONCEPTS: {concepts}
    TOUCHES: {touches}
    PATTERNS: {patterns}
    Write targeted mapping to .planning/codebase/NTP-MAPPING.md")
  ```

### Step 3: Build Integration Map

For each finding in the packet, determine:

| Question | Answer source |
|----------|-------------|
| Does similar code already exist? | PATTERNS search results |
| Where does this type of code live? | STRUCTURE.md or file pattern analysis |
| What existing code needs to know about this? | CONCEPTS + TOUCHES search results |
| What configuration needs to change? | TOUCHES search for config patterns |
| Are dependencies satisfied? | DEPS check |

**Produce an INTEGRATION MAP:**

```markdown
## Integration Map

### F1: {finding name}
- **Action:** CREATE | MODIFY | REPLACE
- **Target file:** {file path in THIS repo} (from discovery)
- **Target location:** {function/class/section} (from reading the file)
- **Existing code:** {what's there now, if MODIFY/REPLACE}
- **What changes:** {brief description}
- **Dependencies:** {any missing deps to install}
- **Config changes:** {any config files to update}

### F2: {finding name}
...

### Integration-level changes:
- {registrations, config updates, pipeline modifications}
```

### Step 4: Constraint Reconciliation

Compare packet CONSTRAINTS with this repo's CONTEXT.md constraints:

| Situation | Action |
|-----------|--------|
| Packet constraint compatible with repo constraints | Proceed |
| Packet REPLACES existing code | Plan removal of old code + addition of new |
| Packet REQUIRES something that doesn't exist | Add prerequisite work to plan |
| Packet EXCLUSIVE with existing code | Flag conflict, ask user |
| Packet TEMPORAL constraint stricter than repo | Upgrade repo's temporal discipline |
| Packet REGIME constraint narrows scope | Document regime limitation in CONTEXT.md |

**Conflict resolution:** If any EXCLUSIVE or incompatible constraints are found, present the conflict to the user before proceeding. Never silently override existing constraints.

### Step 5: Present Integration Plan

Display the integration plan and get user confirmation:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► INTEGRATION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 CREATE:
   {new files to create}

 MODIFY:
   {existing files to change}

 REPLACE:
   {existing code to swap out}

 INSTALL:
   {dependencies to add}

 CONFIG:
   {configuration changes}

 Constraints: {any reconciliation notes}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Proceed with integration?
```

Wait for user confirmation. If declined, save the integration map to `.planning/imports/{packet-name}-MAP.md` for later reference.

### Step 6: Execute Integration

Use the standard EXECUTE action machinery:

**For simple integrations (1-3 changes):**
Execute inline — no agent spawn needed.

**For complex integrations (4+ changes):**
Generate a PLAN.md from the integration map and dispatch to `nr-executor`:

```
Task(subagent_type="nr-executor", description="Integrate NTP transfer: {summary}",
  prompt="Execute this integration plan from NTP transfer.
  PLAN: {integration map}
  CODE FROM PACKET: {code blocks}
  CONSTRAINTS: {merged constraints}
  Commit each logical unit atomically.
  Commit message prefix: 'ntp: ' for all transfer-related commits.")
```

**Commit message convention:** All NTP integration commits use the prefix `ntp:` to make transfer-related changes identifiable in git history.

### Step 7: Run Verification

Execute the verification criteria from the packet's ---VERIFY section:

**Finding-level verification:**
For each `{ID}: {criteria}`:
1. Parse the criteria (metric, operator, threshold, conditions)
2. Run the appropriate check:
   - Code-level: does the integrated code pass linting, type checking, tests?
   - Metric-level: if metrics can be computed (e.g., run a quick backtest), do they meet thresholds?
   - Structural: does the code follow the integration spec (right file, right location, right dependencies)?

**Integration-level verification:**
For `INTEGRATION: {criteria}`:
1. Run end-to-end checks (full pipeline, full test suite, build)
2. Verify no regressions in existing functionality
3. If metric targets specified (e.g., `backtest_match±10%`), run comparison

**Quant-specific verification:**
If domain is `quant`:
1. Run `nr-quant-auditor` in TEMPORAL_AUDIT mode on the integrated code
2. Verify temporal safety score hasn't decreased
3. Check that new features don't contaminate existing feature pipeline

**Verification report:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► IMPORT VERIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 F1 ({name}): {PASS|FAIL} — {details}
 F2 ({name}): {PASS|FAIL} — {details}
 Integration: {PASS|FAIL} — {details}

 Overall: {PASS|PARTIAL|FAIL}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If FAIL: route to REMEDIATE with the specific failures. Do not leave broken integrations.

### Step 8: Update Context and Clean Up

**Brain write-back:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried \
  'NTP import from {source}: {N} findings integrated, verification {verdict}' --cwd .
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-decision \
  '{"phase":"transfer","decision":"imported {N} findings from {source}","reasoning":"{summary}","outcome":"{verdict}"}' --cwd .
```

**Apply DELTA section:**
For each delta entry in the packet:
- `+{field}:{value}` → add to CONTEXT.md
- `~{field}:{value}` → flag for review in CONTEXT.md
- `-{field}:{value}` → note removal in CONTEXT.md

**Archive packet:**
Move the processed packet from `.planning/imports/` to `.planning/imports/processed/` with a verification status suffix.

**Update partner registry:**
If `.planning/ntp-partners.json` exists, update `last_transfer` for the source partner.

### Step 9: Display Import Banner

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► IMPORT COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Source: {repo}@{commit}
 Findings integrated: {N}/{total}
 Verification: {PASS|PARTIAL|FAIL}
 Commits: {list of ntp: commits}

 Changes:
   {file}: {what changed}
   {file}: {what changed}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Anti-Patterns

**DO NOT:**
- Blindly paste code from the packet without mapping to local architecture — the code may need adaptation
- Skip verification — the whole point of NTP is verified, trustworthy transfer
- Modify the packet itself — it's a record of what was sent
- Ignore CONSTRAINTS — if the packet says TEMPORAL safe, verify it's still safe after integration
- Create new architectural patterns for imported code — follow the receiving repo's existing patterns
- Import findings that conflict with CONTEXT.md constraints without user confirmation

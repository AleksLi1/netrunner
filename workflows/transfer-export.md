# Transfer Export Workflow

**Purpose:** Package validated findings from the current repository into an NTP packet for transfer to a partner repository.

**Triggered by:** EXPORT action in chain reaction engine (explicit user request, auto-offer after VERIFY pass, or TRANSITION detection).

## Prerequisites

- Validated findings exist (VERIFICATION.md with PASS, or confirmed entries in CONTEXT.md)
- NTP spec loaded: `references/ntp-spec.md`

## Process

### Step 1: Identify Exportable Findings

Scan the project for validated, transferable knowledge:

**Sources (checked in order):**

1. **CONTEXT.md → "What Has Been Tried"** — entries with `result: SUCCESS` and `Impl. Confidence: High`
2. **Phase VERIFICATION.md files** — phases with PASS verdict
3. **Phase SUMMARY.md files** — completed implementations with code artifacts
4. **Research corpus** — validated research findings (if `RESEARCH_CORPUS = true`)
5. **Strategy artifacts** — `.planning/strategy/` outputs (for BUILD_STRATEGY projects)

**For each candidate finding, extract:**
- What was built/discovered (the finding)
- The actual code (from committed source files, not summaries)
- Metrics achieved (from verification or context)
- Constraints that apply (temporal safety, dependencies, regime assumptions)
- Verification criteria (what proves it works)

**Filter out:**
- Findings with `Impl. Confidence: Low` or `Unknown` — these aren't ready for transfer
- Failed approaches — only transfer successes
- Infrastructure/scaffolding — only transfer domain-level knowledge

### Step 2: Detect Domain and Load Abbreviations

Read CONTEXT.md and detect domain using the same signal detection as `/nr` diagnostic:

| Domain | Key signals |
|--------|-----------|
| `quant` | Sharpe, IC, backtest, walk-forward, trading, features, signal |
| `web` | React, component, LCP, SSR, bundle, Tailwind |
| `api` | endpoint, REST, GraphQL, auth, middleware, database |
| `systems` | Kubernetes, Docker, Terraform, CI/CD, deploy |
| `mobile` | React Native, Flutter, iOS, Android, Expo |
| `desktop` | Electron, Tauri, IPC, window management |
| `data-analysis` | pandas, statistics, hypothesis testing, EDA |
| `data-eng` | pipeline, ETL, Airflow, Spark, dbt, Kafka |
| `general` | (default when no domain-specific signals) |

Load the abbreviation table for the detected domain from `references/ntp-spec.md`. Use abbreviations aggressively in the packet — both agents understand them.

### Step 3: Gather Code Artifacts

For each finding, locate the actual source code:

1. Read the implementation files referenced in SUMMARY.md or VERIFICATION.md
2. Extract the relevant functions/classes — not entire files
3. Strip comments that are project-specific (keep comments that explain the algorithm)
4. Verify the code is self-contained or note dependencies in DEPS

**Critical for quant projects:** Verify temporal safety of exported code. If the finding involves features or signals, confirm `TEMPORAL safe:lookback_only` or flag the specific temporal concern.

### Step 4: Build DISCOVERY Hints

Generate search hints for the receiving agent:

**CONCEPTS** — domain-level concepts this transfer touches:
- Extract from finding names, function names, class names
- Include the problem domain terms (e.g., `rolling_zscore`, `volume_ratio`, `order_routing`)

**TOUCHES** — integration point keywords:
- What kind of code in the receiving repo would need to change?
- Think: `feature_computation`, `signal_registry`, `model_input`, `config`, `data_pipeline`
- Be specific to the domain, not generic

**PATTERNS** — code patterns the receiving agent should grep for:
- Function signatures: `def compute_features`, `class FeatureEngine`
- Registration patterns: `register_signal`, `add_feature`, `route.post`
- Config patterns: `features:`, `signals:`, `endpoints:`

### Step 5: Construct NTP Packet

Assemble the packet following the format in `references/ntp-spec.md`:

1. **Header** — repo name from git, commit hash from HEAD, branch from git, timestamp, domain, confidence
2. **SUMMARY** — 1-3 lines: what, why, impact
3. **FINDINGS** — one line per finding with typed metrics
4. **CODE** — actual implementation code keyed by finding ID
5. **DISCOVERY** — search hints for the receiving agent
6. **CONSTRAINTS** — all constraints (temporal, regime, risk, deps, compat)
7. **VERIFY** — per-finding and integration-level criteria
8. **DELTA** — state changes for receiving repo's CONTEXT.md

### Step 6: Check Partner Registry and Write

**If `.planning/ntp-partners.json` exists:**
1. Read partner registry
2. If target partner has `path` set and directory is accessible:
   - Write packet to `{partner.path}/.planning/imports/{timestamp}-{name}.ntp`
   - Update `last_transfer` in registry
   - Report: "Packet delivered to {partner.name} at {path}"
3. If path not accessible:
   - Write to `.planning/exports/{timestamp}-{name}.ntp`
   - Report: "Packet written. Copy to partner's `.planning/imports/` directory."

**If no partner registry:**
1. Write packet to `.planning/exports/{timestamp}-{name}.ntp`
2. Offer to create `.planning/ntp-partners.json`:
   - Ask for partner repo name and path
   - Create registry with self and partner entries
3. Report packet location

### Step 7: Brain Write-Back

```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried \
  'NTP export: {N} findings to {partner}, packet at {path}' --cwd .
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-decision \
  '{"phase":"transfer","decision":"exported {N} findings","reasoning":"{summary}","outcome":"packet written"}' --cwd .
```

### Step 8: Display Export Banner

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► EXPORT COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Findings: {N} ({types})
 Domain: {domain}
 Confidence: {level}
 Packet: {file path}
 Delivered: {yes — to partner | no — manual copy needed}

 Verification criteria included. Receiving agent
 will validate integration automatically.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Quant-Specific Export Checks

When exporting from a quant project, apply these additional gates:

1. **Temporal audit** — every exported signal/feature must have verified temporal safety. If audit hasn't been run, run `nr-quant-auditor` in TEMPORAL_AUDIT mode on the exported code before packaging.
2. **Validation provenance** — include the validation method (WF, PBO, holdout) and results in the finding metrics. Never export findings validated only on in-sample data.
3. **Regime tagging** — tag each finding with the market regime(s) where it was validated. The receiving agent needs this to decide integration scope.
4. **Research alignment** — if `RESEARCH_CORPUS = true`, cite the research doc that supports each finding. Findings not grounded in research get `status:experimental`.

## Anti-Patterns

**DO NOT:**
- Export integration specs (file paths, method names in the TARGET repo) — the exporting agent doesn't know the target's structure
- Export prose descriptions when code exists — code is always more precise and more compact
- Export findings with unknown or low implementation confidence — these aren't ready
- Export entire files — extract only the relevant functions/classes
- Export without verification criteria — the receiving agent has no way to confirm correctness
- Omit DISCOVERY hints — without them, the receiving agent has to scan the entire target repo

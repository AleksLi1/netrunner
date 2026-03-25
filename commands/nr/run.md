# Netrunner Run — Chain Reaction Engine

<purpose>
Universal autonomous executor. Replaces 9 deleted commands by unifying project scoping, session resume, phase execution, debugging, and progress tracking into one chain reaction loop.

The brain (CONTEXT.md) drives every decision. The user says what they want — Run figures out the rest.

Core loop: USER PROMPT → ORIENT → CLASSIFY → [ACTION → BRAIN ASSESS → NEXT ACTION]* → DONE

Valid user-facing commands: `/nr`, `/nr:run`, `/nr:update`
</purpose>

<flags>
- `--from N` — Start from phase N (skip earlier phases)
- Raw prompt text in `$ARGUMENTS` — interpreted by the classifier
- Empty `$ARGUMENTS` — behavior depends on project state (COLD asks, WARM continues)
</flags>

<runtime_compatibility>
**Subagent spawning:**
- **Claude Code:** `Task(subagent_type="nr-executor", ...)` — blocks until complete, returns result
- **Fallback:** If spawning fails, fall back to sequential inline execution — read and follow the plan directly. Slower but reliable.
- **Completion detection:** If agent commits are visible but orchestrator gets no return signal, treat as success via spot-checks.
</runtime_compatibility>

<process>

## Phase A: Orient

Scan the filesystem once at startup to determine project state.

```bash
INIT=$(node ~/.claude/netrunner/bin/nr-tools.cjs state load 2>/dev/null)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

| Condition | State | Meaning |
|-----------|-------|---------|
| No `.planning/` directory | **COLD** | No project — needs scoping or is a quick task |
| `.planning/` exists, incomplete phases | **WARM** | Project in progress — resume or extend |
| `.planning/` exists, all phases complete | **HOT** | Project done — new work or status check |

**If WARM or HOT**, load: `.planning/CONTEXT.md`, `ROADMAP.md`, `STATE.md`, `REQUIREMENTS.md`, `PROJECT.md`.

Parse `--from N` from `$ARGUMENTS` if present; strip it from prompt text before classification.

## Phase B: Classify Intent

Apply the **first matching** rule:

| State | Prompt Matches | Mode | First Action |
|-------|---------------|------|-------------|
| COLD | Project/feature description | `NEW_PROJECT` | SCOPE |
| COLD | Quant strategy description (3+ quant signals) | `BUILD_STRATEGY` | BUILD_STRATEGY |
| COLD | Bug/error/crash description | `QUICK_DEBUG` | DEBUG |
| COLD | Bounded single task | `QUICK_TASK` | QUICK_EXECUTE |
| COLD | "audit" / "scan" / "check code" + quant context | `QUANT_AUDIT` | AUDIT |
| COLD | Empty | — | Ask: "What would you like to build?" Re-classify after response. |
| WARM | Empty / "continue" / "go" / `--from N` | `CONTINUE` | Resume from current phase state |
| WARM | New feature/addition | `EXTEND` | Add phases to roadmap, then PLAN |
| WARM | Bug/error/crash | `DEBUG` | DEBUG |
| WARM | "audit" / "scan" / "check code" + quant context | `QUANT_AUDIT` | AUDIT |
| WARM | "phase N" explicit | `EXPLICIT` | Whatever phase N needs |
| WARM | Bounded task not in roadmap | `QUICK_TASK` | QUICK_EXECUTE |
| WARM | Progress/status inquiry | `PROGRESS` | Display progress, ask for next action |
| HOT | New work description | `EXTEND` | Add phases to roadmap, then PLAN |
| HOT | Empty | `PROGRESS` | Display completion summary |

**For `CONTINUE` / `EXPLICIT` modes**, determine first action from phase artifacts:

| Phase Artifact State | First Action |
|---------------------|--------------|
| No PLAN.md | PLAN |
| PLAN.md but no SUMMARY.md | EXECUTE |
| SUMMARY.md but no VERIFICATION.md | VERIFY |
| VERIFICATION.md with FAIL | REMEDIATE |
| VERIFICATION.md with PASS | TRANSITION |

**For `EXTEND` mode**, spawn nr-roadmapper to append new phases to ROADMAP.md, then PLAN the first new phase.

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► CHAIN REACTION ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 State: [COLD/WARM/HOT]
 Mode:  [mode name]
 First action: [action name]
 Brain: [hypothesis summary or "No project context"]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Set `CYCLE_COUNT = 0`, `VERIFY_FAIL_COUNT = 0`, `CURRENT_ACTION = [first action]`.

## Brain Assess Function

**Runs BEFORE every action dispatch.** Core intelligence of the chain reaction.

**1. Load brain state** from `.planning/CONTEXT.md` (if exists): Hard Constraints, What Has Been Tried (closed paths), Active Hypothesis, Decision Log.

**2. Apply four pre-generation gates:**

1. **Constraint check:** Violates a Hard Constraint? → SKIP, log why, choose alternative
2. **Closed path check:** Repeats a high-confidence failure? → DISCARD, find alternative
3. **Specificity check:** Generic action? → ENHANCE with project-specific reasoning
4. **Hypothesis alignment:** Moves toward hypothesis? → If not, JUSTIFY or ADJUST

**3. Re-route if warranted:**
- 3 verify failures → HALT
- Execution contradicts plan → re-PLAN
- All phases complete → DONE
- Constraint violation mid-execution → DEBUG

**4. Safety counter:** `CYCLE_COUNT += 1`. If > 50: HALT with safety limit message.

## Action: SCOPE

**Triggers:** `NEW_PROJECT` mode
**Reference:** `~/.claude/netrunner/workflows/scope-project.md`

If workflow file not found, execute inline:

**1. Classify** using the two-tier system:

| Shape | Signal |
|-------|--------|
| `BUILD:GREENFIELD` | No existing codebase, starting from scratch |
| `BUILD:BROWNFIELD` | Existing codebase, adding/modifying functionality |
| `FIX:DEBUGGING` | Something broken that needs investigation |
| `OPTIMIZE:REFINEMENT` | Working system that needs improvement |

Detect domain from signals: ML/Data Science, Web/Frontend, API/Backend, Systems/Infra, General.

For brownfield, spawn `nr-mapper` for quick codebase scan:
```
Task(subagent_type="nr-mapper", description="Quick codebase scan",
  prompt="Scan repository structure. Report: languages, frameworks, architecture, key dirs, tests. Brief output.")
```

**2. Ask 2-3 diagnostic questions** targeted to shape + domain (NOT generic):
- BUILD:GREENFIELD → core constraint, primary user/use case, integration requirements
- BUILD:BROWNFIELD → what exists and works, what can't change, known technical debt
- FIX:DEBUGGING → when it last worked, what changed, reproduction steps
- OPTIMIZE:REFINEMENT → current metrics, target metrics, acceptable trade-offs

Adaptive questioning (based on context richness):
- RICH context (10+ tried approaches) → skip all, infer from context
- MODERATE context → ask 1 max
- COLD start → ask 2-3

Wait for response.

**3. Generate `.planning/` artifacts:**

- **PROJECT.md** — Project identity, classification (shape:subtype), stack, constraints, creation date
- **REQUIREMENTS.md** — Active requirements (REQ-01, REQ-02...), out of scope items, validated section (empty initially)
- **CONTEXT.md** — Full diagnostic state: identity, hard constraints, diagnostic hypothesis (initially "None — project starting"), what has been tried (empty), decision log
- **STATE.md** — Current position (phase 1), created timestamp, status: active

**4. Spawn roadmapper:**
```
Task(
  subagent_type="nr-roadmapper",
  description="Generate project roadmap",
  prompt="Create phased roadmap. Project: [desc]. Classification: [shape+subtype].
Requirements: [from REQUIREMENTS.md]. Constraints: [from answers].
Write to .planning/ROADMAP.md"
)
```

**5. Optional codebase mapping** (BROWNFIELD with significant code): spawn up to 4x `nr-mapper` for ARCHITECTURE.md, PATTERNS.md, DEPENDENCIES.md, CONCERNS.md in `.planning/codebase/`.

**6. Brain write-back:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Project scoped: [shape]:[subtype], [N] phases planned' --cwd .
node ~/.claude/netrunner/bin/nr-tools.cjs brain update-hypothesis 'Project initialized — executing phase 1' --cwd .
```

**Next:** PLAN (phase 1)

## Action: PLAN

**Triggers:** No PLAN.md for current phase
**Reference:** `~/.claude/netrunner/workflows/plan-phase.md`

**1. Build constraint frame** from CONTEXT.md:
```
PHASE [N] CONSTRAINT FRAME:
- Goal: [from roadmap]
- Hard constraints: [from CONTEXT.md + phase-specific]
- Closed paths: [approaches proven not to work]
- Key risk: [what could go wrong]
- Success criteria: [measurable, from roadmap]
```

**2. Optional research** — Brain evaluates need based on signals:
- Phase involves unfamiliar technology
- Prior phase failures suggest knowledge gaps
- Phase description contains "investigate", "evaluate", "compare"
- Brain's confidence in approach is Low

If research needed:
```
Task(subagent_type="nr-researcher", description="Research for Phase [N]: [topic]",
  prompt="Research [specific questions — not generic]. Constraints: [limits].
Write findings to .planning/phase-[N]/RESEARCH.md")
```

Feed research back into constraint frame before planning.

**3. Spawn planner:**
```
Task(subagent_type="nr-planner", description="Plan Phase [N]: [name]",
  prompt="Create executable plan. Constraint frame: [frame]. Goal: [goal].
Requirements: [REQ-IDs]. Prior context: [summaries]. Research: [if done].
Write PLAN.md to .planning/phase-[N]/")
```

**Brain reviews:** constraint compliance, closed path avoidance, wave grouping, measurable criteria. Reject + re-plan max 2 times.

**4. Write-back:** `node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Phase [N] planned: [tasks] tasks in [waves] waves' --cwd .`

**5. Update STATE.md** → status: Planned. **Next:** EXECUTE

## Action: EXECUTE

**Triggers:** PLAN.md exists but no SUMMARY.md
**Reference:** `~/.claude/netrunner/workflows/execute-plan.md`

**1. Discover** all `*-PLAN.md` files in the current phase directory.

**2. Build dependency graph** from plan files. Group independent tasks into parallel execution waves.

**3. Wave-by-wave execution:**
```
For each WAVE in plan:
  For each TASK in wave (parallel):
    Task(subagent_type="nr-executor", description="Execute [task name]",
      prompt="Execute this task from Phase [N] plan.
TASK: [details from PLAN.md]
CONTEXT: [constraints, closed paths from CONTEXT.md]
Commit each logical unit atomically. Create SUMMARY.md on completion.")
```

Track progress per wave. After each wave completes, verify results before proceeding.

**4. Handle failures:**
- All tasks succeeded → proceed to next wave
- Blocking failure → one automatic retry per task, then spawn nr-debugger if still failing
- Non-blocking failure → log to CONTEXT.md, continue with next wave
- All failures logged as tried approaches in CONTEXT.md

**5. Write-back:** `node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Phase [N] executed: [N]/[total] succeeded' --cwd .`

**6. Update STATE.md** → status: Executed. **Next:** VERIFY

## Action: VERIFY

**Triggers:** SUMMARY.md exists but no VERIFICATION.md, or re-verify after remediation
**Reference:** `~/.claude/netrunner/workflows/verify-phase.md`

**1. Spawn verifier:**
```
Task(subagent_type="nr-verifier", description="Verify Phase [N]",
  prompt="Check against success criteria from ROADMAP.md. Check constraint compliance,
hypothesis alignment, E2E integration, test coverage.
Write VERIFICATION.md. Return PASS, PASS_WITH_NOTES, or FAIL with gaps.")
```

**2. Route on verdict:**

| Verdict | Action |
|---------|--------|
| PASS / PASS_WITH_NOTES | → TRANSITION |
| FAIL (1st or 2nd) | → REMEDIATE, increment `VERIFY_FAIL_COUNT` |
| FAIL (3rd consecutive) | → HALT. Log to CONTEXT.md as high-confidence failure. |

**3. Write-back:** `node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Phase [N] verification: [verdict] — [gaps]' --cwd .`

## Action: TRANSITION

**Triggers:** Phase verified PASS
**Reference:** `~/.claude/netrunner/workflows/transition.md`

**1. Brain write-back** — parse SUMMARY.md + VERIFICATION.md, then:
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried \
  '{"approach":"[what]","result":"[SUCCESS|PARTIAL]","implConfidence":"[H/M/L]","phase":"[N]"}' --cwd .
node ~/.claude/netrunner/bin/nr-tools.cjs brain update-hypothesis \
  "[refined hypothesis]" "[evidence]" "[confidence]" --cwd .
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-decision \
  '{"phase":"[N]","decision":"[what]","reasoning":"[why]","outcome":"[result]"}' --cwd .
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-update-log \
  --phase "[N]" --change "[phase summary]" --cwd .
```

**2. Mark phase complete** in ROADMAP.md. **3. Update STATE.md** — advance `current_phase`, update timestamp + progress.

**4. Evaluate trajectory:** Should phases be reordered, inserted, or skipped? If yes, modify ROADMAP.md and log reason.

**5. Update PROJECT.md** with completion notes.

**6. Display transition banner:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► Phase [N] ✓ [Name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Status: [PASS / PASS_WITH_NOTES]
 Key outcomes: [1-2 lines]
 Next: Phase [N+1] — [Name]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**7. Route:** More phases → PLAN (next phase). No more → DONE.

## Action: DEBUG

**Triggers:** `QUICK_DEBUG` / `DEBUG` mode, or execution failure needing investigation
**Reference:** `~/.claude/netrunner/workflows/debug-issue.md`

**1. Classify the issue:**

| Type | Signals |
|------|---------|
| `RUNTIME_ERROR` | Stack traces, exceptions, crashes |
| `LOGIC_BUG` | Wrong output, unexpected behavior |
| `INTEGRATION` | API failures, data format mismatches |
| `PERFORMANCE` | Slow, timeout, memory issues |
| `REGRESSION` | "Used to work", "broke after" |
| `ENVIRONMENT` | Config, dependencies, build failures |

Assess severity: Critical / Major / Minor.

**2. Load prior context** — check CONTEXT.md for matching patterns, relevant constraints, hypothesis relationship.

**3. Spawn debugger:**
```
Task(subagent_type="nr-debugger", description="Debug: [summary]",
  prompt="Investigate: [description]. Type: [type]. Severity: [sev].
Prior context: [tried approaches]. Constraints: [relevant].
Scientific method: hypothesize, test, narrow, fix.
Write to .planning/debug/[issue-slug].md")
```

**4. Write-back:** `node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Debug [type]: [findings]' --cwd .`

**5. Route:** QUICK_DEBUG → DONE. Mid-execution → resume EXECUTE/VERIFY. Deeper issues → REMEDIATE.

## Action: REMEDIATE

**Triggers:** Verification FAIL (1st or 2nd on same phase)

**1. Read VERIFICATION.md** for specific gaps. **2. Spawn planner:**
```
Task(subagent_type="nr-planner", description="Remediate Phase [N]",
  prompt="Re-plan to address verification failures: [gaps].
Original plan: [path]. Constraints + closed paths: [from CONTEXT.md].
Write REMEDIATION-PLAN.md to .planning/phase-[N]/")
```

**3. Write-back:** `node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Phase [N] remediation: targeting [gaps]' --cwd .`

**Next:** EXECUTE (remediation plan), then re-VERIFY.

## Action: QUICK_EXECUTE

**Triggers:** `QUICK_TASK` mode — bounded task, no full project machinery needed.

**1. Validate** task is truly bounded:
- Single file or small set of files
- Clear, unambiguous goal
- No architectural decisions needed
- Estimated effort: under 15 minutes

If NOT bounded, upgrade to `NEW_PROJECT` → SCOPE.

**2. Execute inline** — no agent spawn, no `.planning/` artifacts. Just do the work.

**3. If CONTEXT.md exists, brain write-back:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Quick task: [what was done]' --cwd .
```

**4. Report result.** **Next:** DONE.

## Action: PROGRESS

**Triggers:** `PROGRESS` mode or mid-execution status request.

**1. Metrics:** phases (total/completed/remaining), requirements (total/validated), completion %.

**2. Brain assessment:** hypothesis + confidence, supporting/contradicting evidence, risks, trajectory (on track / drifting / stuck).

**3. Display:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► PROJECT STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Progress: [N]/[total] phases ([percentage]%)
 Requirements: [validated]/[total] validated
 Current phase: [N] — [name] ([status])

 Brain State:
   Hypothesis: [current hypothesis]
   Confidence: [level]
   Trajectory: [on track / drifting / stuck]

 Recommendation: [what to do next]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**4. Ask user** what to do next, then re-classify and dispatch.

## Action: BUILD_STRATEGY

**Triggers:** `BUILD_STRATEGY` mode — quant strategy description with 3+ quant signals detected
**Reference:** `~/.claude/netrunner/workflows/build-strategy.md`

This is a specialized workflow for end-to-end quantitative trading strategy development. It manages its own 7-phase progression with quant-auditor gates between phases.

**1. Validate quant context** — confirm 3+ quant signals present:
- Signals: Sharpe, returns, alpha, backtest, walk-forward, regime, lookahead, trading, features, model, P&L, drawdown, OHLCV, portfolio, signal, strategy, momentum, mean-reversion
- If fewer than 3 signals, downgrade to `NEW_PROJECT` → SCOPE

**2. Load all quant references:**
- `references/quant-finance.md` — expert reasoning triggers
- `references/strategy-metrics.md` — evaluation metrics and correct formulas
- `references/feature-engineering.md` — feature lifecycle and temporal safety
- `references/ml-training.md` — training pipeline best practices
- `references/quant-code-patterns.md` — 20 anti-patterns for code scanning

**3. Dispatch to workflow:**
Read and follow `~/.claude/netrunner/workflows/build-strategy.md`. The workflow manages 7 phases internally:
1. Ideation & Research
2. Data Infrastructure (gate: TEMPORAL_AUDIT)
3. Feature Engineering (gate: FEATURE_AUDIT)
4. Validation Framework (gate: VALIDATION_AUDIT)
5. Model Development (gate: beats baseline)
6. Strategy Evaluation (gate: FULL_AUDIT)
7. Production Readiness (gate: human review)

Each phase follows the standard PLAN → EXECUTE → VERIFY cycle with additional auditor gates.

**4. Brain write-back:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Strategy build: [phase] — [outcome]' --cwd .
```

**5. On completion or interruption:** Return to chain reaction loop. If all 7 phases pass, proceed to DONE.

## Action: AUDIT

**Triggers:** `QUANT_AUDIT` mode — user requests code scanning/audit for quant project
**Agent:** `nr-quant-auditor`

**1. Determine audit scope:**
- Default: `FULL_AUDIT` (all modes)
- If user specifies "temporal" / "lookahead" → `TEMPORAL_AUDIT`
- If user specifies "features" / "pipeline" → `FEATURE_AUDIT`
- If user specifies "validation" / "splits" / "metrics" → `VALIDATION_AUDIT`

**2. Spawn auditor:**
```
Task(subagent_type="nr-quant-auditor", description="Quant code audit",
  prompt="Run [MODE] audit on the codebase. Write report to .planning/audit/.
  Load all quant references. Scan all Python files for anti-patterns.
  Classify severity: CRITICAL/WARNING/INFO. Compute temporal safety score.")
```

**3. Present results:**
Display audit score, critical violations count, and top 3 findings.
If score < 70: recommend immediate fixes before continuing development.

**4. Brain write-back:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Quant audit [MODE]: score [N]/100, [critical] critical, [warning] warnings' --cwd .
```

**Next:** DONE (standalone audit) or resume previous action (if mid-workflow).

## Chain Reaction Loop

```
CYCLE_COUNT = 0, VERIFY_FAIL_COUNT = 0
CURRENT_ACTION = [from Phase B]

LOOP:
  if CYCLE_COUNT > 50: HALT "Safety limit: 50 cycles."
  Brain Assess → may re-route CURRENT_ACTION
  Dispatch CURRENT_ACTION (SCOPE|PLAN|EXECUTE|VERIFY|TRANSITION|DEBUG|REMEDIATE|QUICK_EXECUTE|PROGRESS|BUILD_STRATEGY|AUDIT|DONE)
  if DONE: break
  CURRENT_ACTION = [next action from completed action]
  CYCLE_COUNT += 1
  Write-ahead STATE.md: current_action, cycle_count, verify_fail_count, last_completed_action, timestamp
```

**Crash recovery:** Next `/nr:run` reads STATE.md write-ahead, resumes from `current_action`. No work lost.

**Verify tracking:** FAIL → `VERIFY_FAIL_COUNT += 1`, 3+ → HALT + log. PASS → reset to 0.

**Blockers:** If an action encounters an unresolvable blocker:
1. Brain reasons about the cause — constraint violation, missing dependency, or unexpected failure
2. Log to CONTEXT.md as tried approach with failure mode
3. Present user options:
   - "Fix and retry" — re-run after user provides guidance
   - "Skip this phase" — mark skipped, continue to next
   - "Stop" — save state, display summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► STOPPED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Completed: [list]
 Skipped: [list]
 Remaining: [list]

 Resume: /nr:run

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Phase D: Completion

**1. Final write-back:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Project complete: [N]/[total] phases' --cwd .
node ~/.claude/netrunner/bin/nr-tools.cjs brain update-hypothesis 'Project complete — all phases verified' --cwd .
```

**2. Update STATE.md** → `status: complete`, final timestamp.

**3. Display:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Phases completed: [N]/[total]
 Requirements validated: [N]/[total]
 Brain cycles used: [CYCLE_COUNT]
 Verify retries: [total across all phases]

 Summary:
   [1-2 sentence project summary]

 Artifacts:
   .planning/ROADMAP.md    — phase structure
   .planning/CONTEXT.md    — diagnostic history
   .planning/phase-*/      — per-phase plans, summaries, verifications

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

</process>

<success_criteria>
- COLD + project description → scoped, planned, executed, verified autonomously
- COLD + bug → debugged without unnecessary .planning/ scaffolding
- COLD + bounded task → executed inline without agent overhead
- WARM + empty → seamless resume from exact interruption point
- WARM + new feature → roadmap extended, new phases executed
- WARM + bug → debugged in project context, brain updated
- Every action preceded by brain assessment with 4 pre-generation gates
- No action repeats a high-confidence closed path
- Crash recovery via STATE.md write-ahead at every cycle
- Max 50 cycles, max 3 consecutive verify failures enforced
- All brain state persisted via nr-tools.cjs CLI calls
- Workflow files referenced, not duplicated
- No references to deleted commands — only /nr, /nr:run, /nr:update
</success_criteria>

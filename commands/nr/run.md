# Netrunner Run — Chain Reaction Engine

<purpose>
Universal autonomous executor. Replaces 9 deleted commands by unifying project scoping, session resume, phase execution, debugging, and progress tracking into one chain reaction loop.

The brain (CONTEXT.md) drives every decision. The user says what they want — Run figures out the rest.

Core loop: USER PROMPT → ORIENT → CLASSIFY → [ACTION → BRAIN ASSESS → NEXT ACTION]* → DONE

Valid user-facing commands: `/nr`, `/nr:run`, `/nr:update`
</purpose>

<flags>
- `--from N` — Start from phase N (skip earlier phases)
- `overnight` / `for N hours` / `for N minutes` / `extended` / `long session` — Extended Session Mode
- Raw prompt text in `$ARGUMENTS` — interpreted by the classifier
- Empty `$ARGUMENTS` — behavior depends on project state (COLD asks, WARM continues)
</flags>

<parallel_dispatch>
## Team-Based Parallel Dispatch Protocol

**When to parallelize:** Multi-task waves, multi-hypothesis debugging, multi-focus mapping, multi-verifier checks. Any time 2+ independent agents can run concurrently.

**When NOT to parallelize:** Single-task waves, sequential dependencies between tasks, tasks that write to the same files.

**Standard lifecycle:**
1. **Create team:** `TeamCreate(team_name="nr-{workflow}-{id}", description="...")`
2. **Create tasks:** `TaskCreate(subject="...", description="...")` for each work item in the shared task list
3. **Spawn members:** Launch all agents in ONE turn for concurrency — each agent gets `team_name` and `name` parameters:
   ```
   Agent(team_name="nr-{workflow}-{id}", name="agent-1", subagent_type="nr-executor",
     prompt="You are a team member. Check TaskList, claim your task, execute it, mark completed.")
   Agent(team_name="nr-{workflow}-{id}", name="agent-2", subagent_type="nr-executor",
     prompt="You are a team member. Check TaskList, claim your task, execute it, mark completed.")
   ```
4. **Collect results:** Leader monitors TaskList for all tasks completed, reads outputs
5. **Shutdown:** `SendMessage(type="shutdown_request", recipient="agent-N")` for each member
6. **Delete team:** `TeamDelete()` — cleans up team and task directories

**Sequential fallback:** If TeamCreate is unavailable or team spawning fails, execute each task sequentially using individual `Task()` calls with identical prompts. The workflow still works — just slower.

**Team naming convention:** `nr-{workflow}-{short-id}` where workflow is one of: `exec`, `debug`, `verify`, `map`, `research`, `audit`.
</parallel_dispatch>

<runtime_compatibility>
**Subagent spawning:**
- **Claude Code:** `Task(subagent_type="nr-executor", ...)` — blocks until complete, returns result
- **Team dispatch:** `TeamCreate()` + `Agent(team_name=..., name=...)` — concurrent execution via shared task list
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

### Extended Session Detection

Parse time expressions from `$ARGUMENTS`:

| Expression | Duration |
|-----------|----------|
| `overnight` | 8 hours |
| `for N hours` / `for N hour` | N hours |
| `for N minutes` / `for N mins` | N minutes |
| `extended` / `long session` | 4 hours |

If matched:
- Set `SESSION_MODE = EXTENDED` (default is `STANDARD`)
- Calculate `SESSION_END_TIME = now + duration`
- Set `SESSION_CYCLE_CAP = 500` (vs default 50)
- Strip the time expression from prompt text before classification
- Store in STATE.md: `session_mode`, `session_end_time`, `session_cycle_cap`

Display in Orient output:
```
 Session: EXTENDED (budget: [duration], ends ~[time])
```

### Research Corpus Discovery

After determining project state, scan for an existing research corpus:

1. **Check for research directory** — scan in order: `research/`, `.planning/research/`, `docs/research/`
2. **If found**, look for synthesis file: `00_SYNTHESIS.md`, `SYNTHESIS.md`, or any file with "synthesis" in name
3. **If synthesis exists**, load it fully. This is the **senior researcher's complete analysis** — equivalent to having a domain expert brief the team before any work begins.

**Extract from synthesis and hold in brain state:**
- **Tier rankings** → phase ordering guidance (Tier 0 first, then Tier 1, etc.)
- **Closed paths** → merge with CONTEXT.md closed paths as HARD CONSTRAINTS
- **Key numbers table** → success criteria baselines and expected impacts
- **Implementation timeline** → suggested phase structure and effort estimates
- **Critical constraints** → merge with CONTEXT.md hard constraints
- **Research document index** → topic-to-doc mapping for on-demand loading

**Set `RESEARCH_CORPUS = true`** and make the synthesis available to all downstream actions.

**When research corpus is available, ALL agent prompts get enriched:**
- Researchers receive: "Existing research corpus at [path]. Check before web searching."
- Planners receive: "Research synthesis loaded. Map phase goals to research tiers. Use exact parameters."
- Executors receive: "Research docs available at [path]. Load referenced docs for implementation details."
- Verifiers receive: "Check implementation against research recommendations."

Reference: `references/research-integration.md` for the full integration protocol.

### NTP Transfer Detection

After research corpus discovery, scan for pending NTP transfers:

1. **Check for incoming packets** — scan `.planning/imports/` for `*.ntp` files (not in `processed/` subdirectory)
2. **If found:**
   - Set `NTP_PENDING_IMPORT = true`
   - Store packet paths for IMPORT action
   - If user prompt is empty or "continue", auto-classify as `TRANSFER_IMPORT`
   - Otherwise, note: "Transfer packet(s) pending in .planning/imports/ — import when ready"

3. **Check for partner registry** — read `.planning/ntp-partners.json` if it exists
   - Set `NTP_PARTNERS_AVAILABLE = true`
   - Store partner list for EXPORT action reference

Reference: `references/ntp-spec.md` for the transfer protocol specification.

### Query Scope Detection

**Purpose:** Prevent CONTEXT.md from anchoring unrelated queries. When a fresh session runs `/nr:run` with a query orthogonal to the current active work (e.g. "check infra cost" while the repo is mid-feature on semantic search), loading the Diagnostic State and What Has Been Tried unfiltered biases classification and action dispatch toward the wrong work.

This step runs AFTER state detection and BEFORE intent classification. It applies to all `WARM` and `HOT` runs with non-empty prompts.

**Skip this step when:**
- State is `COLD` (no CONTEXT.md to anchor on)
- Prompt is empty or `continue` / `go` / `resume` (user explicitly wants to resume active work)
- Prompt contains `--from N` (explicit phase targeting)
- Prompt matches `EXPLICIT` phase reference ("phase N")

**Procedure:**

1. **Extract query keywords** from the prompt text (noun phrases, technical terms, domain vocabulary). Expand simple synonyms (infra/infrastructure, perf/performance, etc).

2. **Extract active-work keywords** from CONTEXT.md in priority order:
   - `## Active Work` → `Keywords:` line
   - `## Diagnostic State` → active hypothesis noun phrases
   - Latest 3 entries from `## What Has Been Tried`

3. **Score overlap** (`|Q ∩ A|`, stem-matched, case-insensitive).

4. **Classify scope:**

| Scope | Rule | Impact on Classification |
|-------|------|--------------------------|
| `FOCUSED` | overlap ≥ 2, OR query explicitly names an active work file/concept | Normal behavior. Full CONTEXT.md loaded. `CONTINUE` and `EXTEND` modes work as before. |
| `ORTHOGONAL` | overlap = 0, query targets a different concern area | Downgrade `CONTINUE` to `QUICK_TASK` or `EXTEND` (new work). Suppress Active Work + Diagnostic State from agent prompts. Filter What Has Been Tried by Topic column (or drop if no topic match). |
| `BROAD` | overlap = 0, query is project-wide meta ("status", "health", "what's deployed") | Route to `PROGRESS` mode regardless of incomplete phases. Do not attempt to dispatch execution actions against active work. |
| `AMBIGUOUS` | overlap = 1, cannot tell | **Default to ORTHOGONAL** (asymmetric cost — wrongly broadening costs a scan, wrongly anchoring produces wrong work). |

5. **Store scope in run state** as `QUERY_SCOPE`. All downstream agent prompts filter CONTEXT.md by scope:
   - `FOCUSED` → pass full context
   - `ORTHOGONAL` / `BROAD` → pass only Project Overview + Hard Constraints + Current State + Domain Knowledge + (research corpus if present)

6. **Display scope in Orient banner:**
```
 Scope: [FOCUSED | ORTHOGONAL | BROAD]
```

**Override flags:**
- `--focus` → force FOCUSED
- `--broad` → force BROAD
- Prompt starts with "generally" / "overall" / "project-wide" → force BROAD
- Prompt starts with "continue" / "resume" → force FOCUSED

**Critical rule for EXTEND mode under ORTHOGONAL scope:** New phases generated by the roadmapper MUST NOT inherit success criteria, constraints, or assumptions from the active work thread. The roadmapper receives project-level context only. This prevents a new "infra cost" phase from being contaminated by "semantic search" assumptions.

## Phase B: Classify Intent

Apply the **first matching** rule:

| State | Prompt Matches | Mode | First Action |
|-------|---------------|------|-------------|
| COLD | Project/feature description | `NEW_PROJECT` | SCOPE |
| COLD | Quant strategy description (3+ quant signals) | `BUILD_STRATEGY` | BUILD_STRATEGY |
| COLD | Bug/error/crash description | `QUICK_DEBUG` | DEBUG |
| COLD | Bounded single task | `QUICK_TASK` | QUICK_EXECUTE |
| COLD | "export plan" / "handoff" / "for codex" / "for copilot" | `PLAN_EXPORT` | EXPORT_PLAN |
| COLD | "audit" / "scan" / "check code" + quant context | `QUANT_AUDIT` | AUDIT |
| COLD | "export" / "send to" / "transfer to" / "package for" | `TRANSFER_EXPORT` | EXPORT |
| COLD | "import" / "integrate from" / `.ntp` file referenced | `TRANSFER_IMPORT` | IMPORT |
| COLD | "auto-research" / "experiment loop" / "research loop" + eval description | `AUTO_RESEARCH` | AUTO_RESEARCH |
| COLD | Empty | — | Ask: "What would you like to build?" Re-classify after response. |
| WARM | Empty / "continue" / "go" / `--from N` | `CONTINUE` | Resume from current phase state |
| WARM | New feature/addition | `EXTEND` | Add phases to roadmap, then PLAN |
| WARM | Bug/error/crash | `DEBUG` | DEBUG |
| WARM | "audit" / "scan" / "check code" + quant context | `QUANT_AUDIT` | AUDIT |
| WARM | "export" / "send to" / "transfer to" / "package for" | `TRANSFER_EXPORT` | EXPORT |
| WARM | "import" / "integrate from" / `.ntp` file referenced | `TRANSFER_IMPORT` | IMPORT |
| WARM | "auto-research" / "experiment loop" / "research loop" + eval description | `AUTO_RESEARCH` | AUTO_RESEARCH |
| WARM | "phase N" explicit | `EXPLICIT` | Whatever phase N needs |
| WARM | Bounded task not in roadmap | `QUICK_TASK` | QUICK_EXECUTE |
| WARM | "export plan" / "handoff" / "for codex" / "for copilot" | `PLAN_EXPORT` | EXPORT_PLAN |
| WARM | Progress/status inquiry | `PROGRESS` | Display progress, ask for next action |
| HOT | "auto-research" / "experiment loop" / "research loop" + eval description | `AUTO_RESEARCH` | AUTO_RESEARCH |
| HOT | "export plan" / "handoff" / "for codex" / "for copilot" | `PLAN_EXPORT` | EXPORT_PLAN |
| HOT | New work description | `EXTEND` | Add phases to roadmap, then PLAN |
| HOT | "export" / "send to" / "transfer to" | `TRANSFER_EXPORT` | EXPORT |
| HOT | "import" / "integrate from" / `.ntp` file referenced | `TRANSFER_IMPORT` | IMPORT |
| HOT | Empty | `PROGRESS` | Display completion summary |

**For `CONTINUE` / `EXPLICIT` modes**, determine first action from phase artifacts:

| Phase Artifact State | First Action |
|---------------------|--------------|
| No PLAN.md | PLAN |
| PLAN.md but no SUMMARY.md | EXECUTE |
| SUMMARY.md but no VERIFICATION.md | VERIFY |
| VERIFICATION.md with FAIL | REMEDIATE |
| VERIFICATION.md with PASS + STORIES.md has testable stories | ACCEPT_TEST |
| VERIFICATION.md with PASS + no testable stories | TRANSITION |

**For `EXTEND` mode**, spawn nr-roadmapper to append new phases to ROADMAP.md, then PLAN the first new phase.

**Scope overrides on WARM classification:**
- `QUERY_SCOPE = ORTHOGONAL` + classified `CONTINUE` → override to `QUICK_TASK` or `EXTEND` based on prompt (continuing active work makes no sense for an orthogonal query)
- `QUERY_SCOPE = BROAD` + any classification → override to `PROGRESS` (broad queries are always status/health checks, not execution commands)
- `QUERY_SCOPE = FOCUSED` → no override, use the table above
- Empty prompt is always FOCUSED (user explicitly wants to resume)

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► CHAIN REACTION ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 State: [COLD/WARM/HOT]
 Scope: [FOCUSED | ORTHOGONAL | BROAD]   (omit line on COLD)
 Mode:  [mode name]
 Session: [STANDARD | EXTENDED (budget: Nh, ends ~HH:MM)]
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

**4. Safety counter:** `CYCLE_COUNT += 1`. If > `SESSION_CYCLE_CAP` (50 standard, 500 extended): HALT with safety limit message.

**5. Extended session checks** (only when `SESSION_MODE = EXTENDED`):
- **Autonomy mode:** Suppress user confirmation prompts — infer reasonable defaults and proceed. Log each autonomous decision to CONTEXT.md decision log.
- **Time check:** If current time > `SESSION_END_TIME` → initiate **Graceful Wind-Down** (see below). Complete current atomic operation, do not start new actions.
- **Time warning:** If < 15 minutes remaining → log "Time budget nearly exhausted" and finish current action, then wind down.

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

**5. Optional codebase mapping** (BROWNFIELD with significant code): spawn up to 4x `nr-mapper` for ARCHITECTURE.md, PATTERNS.md, DEPENDENCIES.md, CONCERNS.md in `.planning/codebase/`. Mappers will proactively generate Mermaid architecture diagrams in their output documents (see `references/visualization-patterns.md`).

**6. Generate user stories (STORIES.md):**

Derive user stories from REQUIREMENTS.md + the user's original goal. This forces outside-in thinking — WHO does WHAT and WHY — before any code is written.

```
Task(subagent_type="nr-planner", description="Generate user stories from requirements",
  prompt="Generate user stories from the user's goal and requirements.

USER'S ORIGINAL GOAL: [verbatim from user prompt]
REQUIREMENTS: [from REQUIREMENTS.md]
DOMAIN: [detected domain]
ROADMAP: [phase names and goals from ROADMAP.md]

For each functional requirement, write 1-2 user stories in this format:
- As a [role], I want to [action], so that [outcome]
- Given/When/Then acceptance criteria (machine-testable)
- Map each story to the earliest phase where it becomes testable

Include at least one happy path and one error path per story.

ACCEPTANCE CRITERIA MUST BE AUTOMATABLE:
- Web: Playwright-checkable (page contains text, URL changes, form submits)
- API: HTTP-assertable (status codes, response fields, auth flows)
- CLI: Bash-assertable (stdout content, exit codes, file outputs)
- Data: File/row-assertable (output exists, row counts, column types)

Write to .planning/STORIES.md using the template from templates/stories.md.
Populate the Story-Phase Mapping table.")
```

**7. Brain write-back:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Project scoped: [shape]:[subtype], [N] phases planned, [M] user stories generated' --cwd .
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

**2. Research — corpus-aware decision:**

**If `RESEARCH_CORPUS = true`:**
- Check if the synthesis covers this phase's topic
- If covered: **skip researcher spawn entirely**. Extract findings from relevant research docs and inject directly into the constraint frame:
  ```
  RESEARCH GUIDANCE (from corpus):
  - Relevant docs: [Doc N: title, Doc M: title]
  - Recommended approach: [from synthesis]
  - Expected impact: [UNVALIDATED estimate from synthesis]
  - Specific parameters: [exact values from research]
  - Known pitfalls: [from research]
  ```
- If partially covered: spawn researcher with gap-fill directive:
  ```
  Task(subagent_type="nr-researcher", description="Gap-fill research for Phase [N]",
    prompt="Existing research corpus covers [topics]. Research ONLY these gaps: [gaps].
  Existing corpus at [path] — cite existing docs, don't re-research covered topics.
  Write findings to .planning/phase-[N]/RESEARCH.md")
  ```
- If not covered at all: proceed with standard research (below)

**If no research corpus (standard flow):**
Brain evaluates need based on signals:
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

**3. Spawn planner (with research corpus context if available):**
```
Task(subagent_type="nr-planner", description="Plan Phase [N]: [name]",
  prompt="Create executable plan. Constraint frame: [frame]. Goal: [goal].
Requirements: [REQ-IDs]. Prior context: [summaries]. Research: [if done].
[IF RESEARCH_CORPUS]: Research corpus at [path]. Synthesis loaded.
  Relevant research docs for this phase: [Doc N, Doc M].
  Use exact parameters from research. Reference doc numbers in task metadata.
  Research closed paths: [list] — treat as hard constraints.
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

**Single-task wave** (1 task): Execute directly — no team overhead:
```
Task(subagent_type="nr-executor", description="Execute [task name]",
  prompt="Execute this task from Phase [N] plan.
TASK: [details from PLAN.md]
CONTEXT: [constraints, closed paths from CONTEXT.md]
[IF RESEARCH_CORPUS]: Research corpus at [path].
  This task references: [Doc N]. Load it for exact parameters,
  implementation details, and known pitfalls before implementing.
Commit each logical unit atomically. Create SUMMARY.md on completion.")
```

**Multi-task wave** (2+ tasks): Use team-based parallel dispatch:
```
# 1. Create wave team
TeamCreate(team_name="nr-exec-wave-{phase}-{wave}", description="Wave {W} of Phase {N}: {task_count} parallel tasks")

# 2. Create one task per plan item in shared list
For each TASK in wave:
  TaskCreate(subject="Execute: [task name]",
    description="[task details from PLAN.md]\nCONTEXT: [constraints, closed paths]\nCommit each logical unit atomically.",
    activeForm="Executing [task name]")

# 3. Spawn one nr-executor per task (ALL in one turn for concurrency)
For each TASK in wave:
  Agent(team_name="nr-exec-wave-{phase}-{wave}", name="exec-{task-num}",
    subagent_type="nr-executor",
    prompt="You are a team member. Check TaskList, claim your task, execute it.
    TASK: [details from PLAN.md]
    CONTEXT: [constraints, closed paths from CONTEXT.md]
    Commit each logical unit atomically. Mark task completed when done.")

# 4. Leader monitors TaskList for all tasks completed
# 5. Collect commit hashes from each executor's output
# 6. Cleanup
SendMessage(type="shutdown_request", recipient="exec-{N}") for each member
TeamDelete()
```

**Sequential fallback:** If TeamCreate is unavailable or team spawning fails, execute each task in the wave sequentially using individual `Task()` calls with identical prompts.

Track progress per wave. After each wave completes, verify results before proceeding.

**4. Handle failures:**
- All tasks succeeded → proceed to next wave
- Blocking failure → one automatic retry per task (single `Task()` call), then spawn nr-debugger if still failing
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
| PASS / PASS_WITH_NOTES | → ACCEPT_TEST (if STORIES.md exists with testable stories) or TRANSITION |
| FAIL (1st or 2nd) | → REMEDIATE, increment `VERIFY_FAIL_COUNT` |
| FAIL (3rd consecutive) | → HALT. Log to CONTEXT.md as high-confidence failure. |

**3. Write-back:** `node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Phase [N] verification: [verdict] — [gaps]' --cwd .`

## Action: ACCEPT_TEST

**Triggers:** Phase VERIFY passes (PASS or PASS_WITH_NOTES) AND `.planning/STORIES.md` exists
**Reference:** `~/.claude/netrunner/workflows/acceptance-test.md`

This is the "outside-in" verification — does the built product actually work from the user's perspective? Code verification (VERIFY) checks internal correctness; acceptance testing checks external usability.

**1. Check for testable stories:**
Read `.planning/STORIES.md` Story-Phase Mapping table.
Filter stories where `Testable After <= current_phase` AND `status != passed`.

If no testable stories → skip, route to TRANSITION.

**2. Detect domain and test strategy:**
Auto-detect from project signals or read from STORIES.md `Acceptance Test Strategy` section.

| Domain | Preferred Test Method |
|--------|---------------------|
| `web` | Playwright MCP (direct browser control) — fallback: Playwright test files |
| `api` | HTTP assertions via curl/requests |
| `cli` | Bash script assertions |
| `data` | pytest + file/row assertions |
| `quant` | pytest + metric assertions |
| `mobile` | Platform-specific (flag for manual testing) |
| `desktop` | Playwright Electron mode |

**3. Environment setup:**
- Start the application/service if needed (detect from package.json scripts, Procfile, main entry)
- Wait for readiness (poll health endpoint, check port)
- Prepare test data/fixtures

**4. Generate and run acceptance tests:**

**Playwright MCP available (preferred for web):**
Execute acceptance scenarios directly via MCP tools:
```
mcp__playwright__browser_navigate(url="{app_url}")
mcp__playwright__browser_snapshot()
// Execute Given/When/Then steps via MCP
mcp__playwright__browser_fill_form(fields=[...])
mcp__playwright__browser_click(ref="{ref}")
mcp__playwright__browser_snapshot()
// Assert on snapshot content matching expected outcomes
```

**Other domains / Playwright MCP unavailable:**
Generate test files to `.planning/acceptance-tests/`, execute via appropriate runner:
```bash
# Web: npx playwright test .planning/acceptance-tests/
# API: python -m pytest .planning/acceptance-tests/ -v
# CLI: bash .planning/acceptance-tests/story-NN.sh
# Data: python -m pytest .planning/acceptance-tests/ -v
```

**5. Self-healing loop (max 3 attempts per failed story):**

When a story fails:
1. **Diagnose** — analyze failure output, classify: MISSING_ELEMENT, WRONG_BEHAVIOR, SETUP_FAILURE, TIMING_ISSUE, TEST_ISSUE
2. **Fix** — spawn `nr-executor` for implementation fixes, or fix test/environment inline
3. **Re-test** — run the specific story's test again
4. After 3 failed attempts → escalate to user

```
Task(subagent_type="nr-executor", description="Fix acceptance failure: STORY-{NN}",
  prompt="Acceptance test for STORY-{NN} failed.
EXPECTED: [what test expected]
ACTUAL: [what happened]
DIAGNOSIS: [failure type and cause]
FIX: [specific change needed]
Commit with message: 'fix: acceptance STORY-{NN} — [description]'")
```

**6. Teardown:**
Stop any servers started. Clean up test data/fixtures.

**7. Route on results:**

| Result | Route |
|--------|-------|
| All testable stories PASSED | → TRANSITION |
| 1-2 non-critical stories failed (after healing) | → TRANSITION (PASS_WITH_NOTES) |
| 3+ failures OR any P0 story failed | → REMEDIATE |
| All stories failed | → HALT |

**8. Update STORIES.md** — record test results, update story statuses.

**9. Write-back:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Acceptance test Phase [N]: [passed]/[total] passed, [healed] self-healed' --cwd .
```

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

**7. Update project architecture diagram:** If `.planning/codebase/ARCHITECTURE.md` exists, update its Mermaid diagram to reflect changes from the completed phase. If no architecture diagram exists yet, generate one from the current codebase state.

**8. NTP export offer:** If `NTP_PARTNERS_AVAILABLE = true` and the completed phase produced validated findings (signals, features, strategies, etc.), offer: "Findings validated. Export to [partner name]?" If accepted, set `CURRENT_ACTION = EXPORT` instead of continuing to next phase.

**9. Route:** More phases → PLAN (next phase). No more → DONE.

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

## Action: EXPORT_PLAN

**Triggers:** `PLAN_EXPORT` mode — user wants to hand off plan to another model (Codex, Copilot, etc.)
**Reference:** `~/.claude/netrunner/workflows/export-plan.md`

Converts Netrunner PLAN.md files into model-agnostic task lists. Strips Netrunner-specific
metadata and produces clear, self-contained instructions any coding agent can execute.

**1. Determine scope:**
- Default: current phase (from STATE.md)
- `--all`: all planned phases
- `--phase N`: specific phase
- If no phases are planned yet, inform user and suggest running `/nr:run` first to generate plans

**2. Read plan files** from `.planning/phases/{phase}/*-PLAN.md`.

**3. Transform each plan:**

For each PLAN.md:
- Extract: objective, files_modified, task names, action blocks, acceptance_criteria
- Strip: YAML frontmatter, execution_context, Netrunner file references, verify automated blocks
- Flatten wave dependencies into sequential task order
- Replace internal paths (`~/.claude/netrunner/...`) with direct descriptions

**4. Write HANDOFF.md:**

```markdown
# Task Handoff: [Phase Name]

## Goal
[Objective paragraph]

## Files Involved
- `path/file.ext` — [what changes]

## Tasks

### Task 1: [Name]
**Files:** `path/file.ext`
**What to do:**
[Instructions from action block — clear, specific, self-contained]

**Done when:**
- [Acceptance criteria]

## Verification
[Success criteria from plan]
```

Write to `.planning/HANDOFF.md` (single phase) or `.planning/HANDOFF-all.md` (all phases).

**5. Display summary:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► PLAN EXPORTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Exported: Phase [N] — [name] ([tasks] tasks)
 Output: .planning/HANDOFF.md

 Hand this file to Codex, Copilot, or any coding agent.
 No Netrunner context needed — instructions are self-contained.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Next:** DONE.

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
- `references/research-integration.md` — research corpus protocol (if corpus exists)

**2b. Load research corpus (if exists):**
If `RESEARCH_CORPUS = true`:
- The synthesis replaces generic Phase 1 (Ideation) research — the senior quant already did this work
- Research tiers from synthesis map directly to build-strategy phases
- Research closed paths are injected into every phase's constraint frame
- Research key numbers become success criteria baselines
- Each phase's planner/executor gets the relevant research doc references

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

## Action: EXPORT

**Triggers:** `TRANSFER_EXPORT` mode — user requests export of findings to a partner repository
**Reference:** `~/.claude/netrunner/workflows/transfer-export.md`

This action packages validated findings from the current project into an NTP (Netrunner Transfer Protocol) packet for transfer to another repository. The packet format is optimized for LLM-to-LLM communication — ~5x more token-efficient than prose markdown.

**1. Load NTP spec:** Read `references/ntp-spec.md` for protocol format and domain abbreviation tables.

**2. Identify exportable findings:**
Scan project for validated, transferable knowledge:
- CONTEXT.md "What Has Been Tried" → entries with `result: SUCCESS` and `Impl. Confidence: High`
- Phase VERIFICATION.md files → phases with PASS verdict
- Phase SUMMARY.md files → completed implementations
- Strategy artifacts → `.planning/strategy/` outputs (BUILD_STRATEGY projects)

Filter out: low-confidence results, failed approaches, infrastructure/scaffolding.

**3. Gather code artifacts:**
For each finding, extract the actual implementation code from source files:
- Extract relevant functions/classes, not entire files
- Verify code is self-contained or note dependencies
- For quant projects: verify temporal safety of exported code

**4. Build DISCOVERY hints:**
Generate search hints for the receiving agent's codebase:
- CONCEPTS: domain-level concept keywords from findings
- TOUCHES: integration point keywords (where the receiving repo likely needs changes)
- PATTERNS: code patterns to grep for in the target repo
- DEPS: required dependencies with version constraints

**5. Construct NTP packet:**
Assemble packet following `references/ntp-spec.md` format:
- Header: repo info from git, domain detection, confidence level
- FINDINGS: typed, abbreviated metrics per finding
- CODE: actual implementation keyed by finding ID
- DISCOVERY: search hints for receiving agent
- CONSTRAINTS: temporal, regime, risk, dependency constraints
- VERIFY: per-finding and integration-level criteria
- DELTA: state changes for receiving repo's CONTEXT.md

**6. Deliver packet:**

If `.planning/ntp-partners.json` exists and target partner's path is accessible:
```
Write to {partner.path}/.planning/imports/{timestamp}-{name}.ntp
```
Otherwise:
```
Write to .planning/exports/{timestamp}-{name}.ntp
```
If no partner registry exists, offer to create one.

**7. Brain write-back:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'NTP export: [N] findings to [partner]' --cwd .
```

**8. Auto-offer on TRANSITION:**
After a VERIFY PASS → TRANSITION, if `NTP_PARTNERS_AVAILABLE = true`, offer:
"Findings validated. Export to [partner name]?"

**Next:** DONE.

## Action: IMPORT

**Triggers:** `TRANSFER_IMPORT` mode — NTP packet detected in `.planning/imports/` or user provides packet path
**Reference:** `~/.claude/netrunner/workflows/transfer-import.md`

This action receives an NTP packet, maps findings to the current repo's codebase using targeted searches, plans integration, executes, and verifies.

**1. Load and validate packet:**
- Read the NTP packet file
- Validate header: check `NTP/1` version, required fields present
- Load domain abbreviation table from `references/ntp-spec.md`
- Display packet summary

**2. Targeted codebase discovery using DISCOVERY hints:**

Do NOT scan the entire codebase. Use targeted searches only:
```
For each pattern in DISCOVERY.PATTERNS:
  Grep(pattern="{pattern}", output_mode="files_with_matches")
For each concept in DISCOVERY.CONCEPTS:
  Grep(pattern="{concept}", output_mode="files_with_matches")
For each touch_point in DISCOVERY.TOUCHES:
  Grep(pattern="{touch_point}", output_mode="files_with_matches")
```

Check DISCOVERY.DEPS against package manifest. Missing deps → add to integration plan.

If existing codebase mapping exists (`.planning/codebase/`), cross-reference with discovery hits.

If discovery hits are sparse and no codebase map exists, spawn `nr-mapper` in targeted NTP mode:
```
Task(subagent_type="nr-mapper", description="Targeted NTP mapping",
  prompt="NTP IMPORT mode. Search for integration points.
  CONCEPTS: [concepts]. TOUCHES: [touches]. PATTERNS: [patterns].
  Write targeted mapping to .planning/codebase/NTP-MAPPING.md")
```

**3. Build integration map:**
For each finding: determine action (CREATE/MODIFY/REPLACE), target file, target location, existing code, what changes, missing dependencies, config changes.

**4. Constraint reconciliation:**
Compare packet CONSTRAINTS with CONTEXT.md constraints. Flag conflicts for user review. Never silently override existing constraints.

**5. Present integration plan and get confirmation.**

**6. Execute integration:**
- Simple (1-3 changes): execute inline
- Complex (4+ changes): generate PLAN.md from integration map, dispatch to `nr-executor`
- Commit prefix: `ntp:` for all transfer-related commits

**7. Run verification:**
Execute packet's ---VERIFY criteria:
- Finding-level: does integrated code meet metric thresholds?
- Integration-level: does full pipeline/test suite pass?
- For quant domain: run `nr-quant-auditor` TEMPORAL_AUDIT on integrated code

If FAIL: route to REMEDIATE.

**8. Brain write-back:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'NTP import from [source]: [N] findings, verification [verdict]' --cwd .
```

Apply DELTA section to CONTEXT.md. Archive processed packet to `.planning/imports/processed/`.

**Next:** DONE.

## Action: AUTO_RESEARCH

**Triggers:** `AUTO_RESEARCH` mode — user requests autonomous experiment loop
**Reference:** `~/.claude/netrunner/workflows/auto-research.md`

Karpathy-inspired tight experiment loop: modify code → run eval → keep/revert → repeat.
Produces 20-100+ experiments per session. Brain accumulates diagnostic state for smarter proposals.

**1. Detect auto-research signals:**
- Explicit: "auto-research", "experiment loop", "research loop", "run experiments"
- Implicit: user provides eval command + mutable file scope + optimization goal
- Resume: `.planning/auto-research/JOURNAL.md` exists from prior session

**2. Initialize:**

If `.planning/auto-research/DIRECTIVE.md` does not exist:
- Ask user for: goal, eval command, mutable files, immutable files (or infer from context)
- Generate directive from `templates/research-directive.md`
- Create `.planning/auto-research/` directory

```bash
mkdir -p .planning/auto-research
```

**3. Validate eval harness:**
Run eval command twice to confirm:
- Exits with code 0
- Produces parseable numeric output
- Completes within TIME_BUDGET
- Results are consistent (check variance for stochastic evals)

Store `BASELINE_VALUE` and `BASELINE_COMMIT`.

**4. Dispatch to workflow:**
Read and follow `~/.claude/netrunner/workflows/auto-research.md`.

The workflow manages its own internal experiment loop (not the standard PLAN→EXECUTE→VERIFY cycle).
It uses direct code modification and eval, not agent spawns — keeping the loop tight and fast.

**5. Domain-specific behavior:**

When quant domain detected:
- Load `references/quant-code-patterns.md` for temporal safety checks on every modification
- Apply lookahead audit on each proposed change before eval
- Reject any modification that introduces forward-looking data access

When ML domain detected:
- Track validation loss separately from training loss if both available
- Watch for overfitting patterns (train improves, val degrades)

**6. Extended session integration:**
AUTO_RESEARCH naturally integrates with extended sessions:
- `overnight` → MAX_EXPERIMENTS = 500, full autonomy
- `for N hours` → MAX_EXPERIMENTS calculated from TIME_BUDGET per experiment
- Standard → MAX_EXPERIMENTS = 50

**7. Brain write-back:**
Compact batch updates every 5 experiments (not per-experiment — too noisy):
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried \
  "Auto-research batch: [summary of last 5 experiments]" --cwd .
```

Final session summary:
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried \
  "Auto-research: ${EXPERIMENT_COUNT} experiments, ${IMPROVEMENTS} improvements, ${EVAL_METRIC}: ${BASELINE} → ${BEST}" --cwd .
```

**8. Output artifacts:**
- `.planning/auto-research/DIRECTIVE.md` — research directive (human-editable)
- `.planning/auto-research/JOURNAL.md` — experiment-by-experiment log
- `.planning/auto-research/REPORT.md` — final summary with analysis
- Git history — each improvement is a commit, failures are reverted

**Next:** DONE.

## Action: EXTEND_WORK

**Triggers:** All planned phases DONE + `SESSION_MODE = EXTENDED` + time remaining in budget.

This action finds proactive work to fill remaining session time. Each category runs a mini plan→execute→verify cycle using existing agents.

**Priority order** (skip categories where codebase already scores well):

| Priority | Category | What it does |
|----------|----------|-------------|
| 1 | **Test coverage** | Scan for untested code paths, write missing unit/integration tests |
| 2 | **Code quality** | Run linters, fix type safety issues, remove dead code |
| 3 | **Performance** | Profile hot paths, optimize obvious bottlenecks |
| 4 | **Documentation** | Add inline docs for complex functions, update README if stale |
| 5 | **Refactoring** | Fix DRY violations, extract shared utilities |
| 6 | **Security** | Dependency audit, input validation review |

**For each category:**
1. **Assess** — Quick scan to determine if work is needed (e.g., run coverage tool, count lint warnings)
2. **Skip** if the category is already in good shape (>90% coverage, 0 lint errors, etc.)
3. **Plan** — Create a mini task list (max 5 items per category)
4. **Execute** — Run items using `nr-executor`
5. **Verify** — Confirm improvements, commit results
6. **Time check** — If `SESSION_END_TIME` approaching, stop after current category

**Brain write-back after each category:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Extended work: [category] — [summary of improvements]' --cwd .
```

**Next:** Loop back to next category. If time exhausted or all categories done → DONE.

## Chain Reaction Loop

```
CYCLE_COUNT = 0, VERIFY_FAIL_COUNT = 0
CURRENT_ACTION = [from Phase B]
SESSION_START_TIME = now

LOOP:
  if CYCLE_COUNT > SESSION_CYCLE_CAP: HALT "Safety limit: [cap] cycles."
  Brain Assess → may re-route CURRENT_ACTION
  Dispatch CURRENT_ACTION (SCOPE|PLAN|EXECUTE|VERIFY|ACCEPT_TEST|TRANSITION|DEBUG|REMEDIATE|QUICK_EXECUTE|EXPORT_PLAN|PROGRESS|BUILD_STRATEGY|AUDIT|EXPORT|IMPORT|AUTO_RESEARCH|EXTEND_WORK|DONE)
  if DONE:
    if SESSION_MODE == EXTENDED and time_remaining(SESSION_END_TIME):
      CURRENT_ACTION = EXTEND_WORK
      continue
    else:
      break
  CURRENT_ACTION = [next action from completed action]
  CYCLE_COUNT += 1
  Write-ahead STATE.md: current_action, cycle_count, verify_fail_count, last_completed_action, timestamp, elapsed_time
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

### Goal Validation Gate

Before marking the project complete, validate that what was built achieves the user's original goal. This is the final "outside-in" check.

**1. Re-read the original user goal** from `.planning/STORIES.md` (Original Goal section) or `.planning/PROJECT.md`.

**2. Run full acceptance test sweep:**
If `.planning/STORIES.md` exists:
- Run ALL acceptance tests (not just phase-specific ones)
- This catches regressions where later phases broke earlier stories
- Include stories that were previously passed (full regression)

```
Read STORIES.md → collect ALL stories
For each story with status != passed:
  Flag as GOAL_GAP — something the user asked for that doesn't work yet
For each story with status == passed:
  Re-run acceptance test to check for regressions
```

**3. Map stories to original goal:**
```
GOAL VALIDATION:
  Original goal: [user's verbatim goal]
  Stories: [total] defined, [passed] passing, [failed] failing
  Goal coverage: [are all aspects of the goal covered by stories?]
  Uncovered aspects: [parts of the goal with no corresponding story]
```

**4. Route on validation:**

| Result | Action |
|--------|--------|
| All stories pass + goal fully covered | → Proceed to DONE |
| Stories pass but goal has uncovered aspects | → Generate additional stories, add phases |
| Regression found (previously passed story now fails) | → REMEDIATE the regression |
| Critical stories still failing | → HALT — project not deliverable |

**5. Display goal validation:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► GOAL VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Original goal: [user's goal]
 Stories: [passed]/[total] passing
 Regressions: [count]
 Goal coverage: [FULL | PARTIAL — uncovered: ...]
 Verdict: [ACHIEVED | PARTIAL | NOT_ACHIEVED]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### DONE

**1. Final write-back:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried 'Project complete: [N]/[total] phases, [stories_passed]/[stories_total] stories passing' --cwd .
node ~/.claude/netrunner/bin/nr-tools.cjs brain update-hypothesis 'Project complete — all phases verified, goal validated' --cwd .
```

**2. Update STATE.md** → `status: complete`, final timestamp.

**2b. Generate final project overview diagram:** Write `.planning/PROJECT-OVERVIEW.md` with a Mermaid `graph TD` showing the complete project architecture — all components built across all phases, their relationships, and key integration points. This is the visual summary of what was built. Reference `references/visualization-patterns.md`.

**3. Display:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Phases completed: [N]/[total]
 Requirements validated: [N]/[total]
 User stories: [passed]/[total] passing
 Goal validation: [ACHIEVED | PARTIAL]
 Brain cycles used: [CYCLE_COUNT]
 Verify retries: [total across all phases]
 Self-healed: [total acceptance fixes across all phases]
 Session time: [elapsed] / [budget or "unlimited"]

 [If EXTENDED and extended work was done:]
 Extended work completed:
   [category]: [summary]
   [category]: [summary]

 Summary:
   [1-2 sentence project summary]

 Artifacts:
   .planning/ROADMAP.md        — phase structure + phase flow diagram
   .planning/STORIES.md        — user stories + acceptance test results
   .planning/CONTEXT.md        — diagnostic history
   .planning/PROJECT-OVERVIEW.md — final architecture diagram (Mermaid)
   .planning/acceptance-tests/ — generated acceptance test files
   .planning/phase-*/          — per-phase plans, summaries, verifications
   .planning/plots/            — generated visualization scripts (if any)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Graceful Wind-Down Protocol

When time runs out mid-action (`SESSION_MODE = EXTENDED` and `SESSION_END_TIME` passed):

1. **Complete current atomic operation** — finish the file edit, test run, or commit in progress. Never leave broken state.
2. **Commit pending changes** — stage and commit any uncommitted work with message: `"nr: session wind-down — [description of in-progress work]"`
3. **Write session report** — append to CONTEXT.md decision log:
   ```
   SESSION REPORT (extended, [duration]):
   - Phases completed: [list]
   - Extended work: [categories completed]
   - In-progress at wind-down: [what was happening]
   - Recommended next: [what to pick up next session]
   ```
4. **Display wind-down banner:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► SESSION COMPLETE (time budget exhausted)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Duration: [elapsed time]
 Cycles used: [CYCLE_COUNT]
 Phases completed: [N]/[total]
 Extended work: [categories completed, if any]

 Resume: /nr:run

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

</process>

<success_criteria>
- COLD + project description → scoped, **stories generated**, planned, executed, verified, **acceptance tested** autonomously
- COLD + bug → debugged without unnecessary .planning/ scaffolding
- COLD + bounded task → executed inline without agent overhead
- WARM + empty → seamless resume from exact interruption point
- WARM + new feature → roadmap extended, new phases executed
- WARM + bug → debugged in project context, brain updated
- Every action preceded by brain assessment with 4 pre-generation gates
- No action repeats a high-confidence closed path
- Crash recovery via STATE.md write-ahead at every cycle
- Max 50 cycles (standard) / 500 cycles (extended), max 3 consecutive verify failures enforced
- All brain state persisted via nr-tools.cjs CLI calls
- Workflow files referenced, not duplicated
- No references to deleted commands — only /nr, /nr:run, /nr:update
- Extended session: time expressions parsed, budget tracked, EXTEND_WORK fills remaining time
- Extended session: graceful wind-down when time exhausted — no broken state left behind
- Extended session: autonomous decisions logged to CONTEXT.md decision log
- **User stories generated from goals during SCOPE — outside-in thinking before code**
- **Acceptance tests run after each phase VERIFY — user workflows actually tested**
- **Self-healing loop fixes acceptance failures automatically (max 3 attempts)**
- **Goal Validation Gate at completion — original goal re-checked against story outcomes**
- **Full regression sweep before DONE — later phases don't break earlier stories**
- **Query scope detected on WARM/HOT runs — orthogonal queries don't anchor on active work**
- **Orthogonal/broad queries downgrade CONTINUE → QUICK_TASK or route to EXTEND/PROGRESS as appropriate**
- **Agent prompts under ORTHOGONAL/BROAD scope receive project-level context only — no Diagnostic State pollution**
- **EXTEND mode under ORTHOGONAL scope generates phases independent of active work assumptions**
</success_criteria>

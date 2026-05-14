# Netrunner

**Tell Claude Code what to build. Walk away. Come back to working code.**

Netrunner is a skill for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that turns it into an autonomous expert system. It scopes projects, creates phased roadmaps, spawns specialized agents, executes plans in parallel, verifies results, writes and runs acceptance tests, debugs failures, and learns from every action through a persistent diagnostic brain.

```
/nr:run "build a REST API with JWT auth, rate limiting, and PostgreSQL"
```

That's it. Netrunner handles the rest — from project scoping through verified, acceptance-tested delivery.

---

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Three Commands](#three-commands)
- [How It Works](#how-it-works)
  - [The Chain Reaction Loop](#the-chain-reaction-loop)
  - [Orient: Reading the Room](#phase-a-orient)
  - [Classify: Understanding Intent](#phase-b-classify-intent)
  - [Brain Assess: The Intelligence Layer](#brain-assess)
  - [Actions: What Gets Dispatched](#actions)
- [The Brain](#the-brain)
- [11 Specialized Agents](#11-specialized-agents)
- [8 Domain Specializations](#8-domain-specializations)
- [Advanced Capabilities](#advanced-capabilities)
  - [Extended Sessions](#extended-sessions)
  - [Auto-Research Loop](#auto-research-loop)
  - [Acceptance Testing](#acceptance-testing)
  - [NTP Cross-Repo Transfer](#ntp--netrunner-transfer-protocol)
  - [Research Corpus Integration](#research-corpus-integration)
  - [Quant Strategy Builder](#quant-strategy-builder)
  - [Visualization](#visualization)
- [Crash Recovery](#crash-recovery)
- [Project Artifacts](#project-artifacts)
- [Architecture Reference](#architecture-reference)
- [License](#license)

---

## Install

```bash
npm install -g netrunner-cc
```

Verify it works:
```
/nr:run "hello"
```

<details>
<summary>Manual install (without npm)</summary>

```bash
git clone https://github.com/AleksLi1/netrunner.git
cd netrunner
bash install.sh          # macOS/Linux
powershell -File install.ps1  # Windows
```
</details>

<details>
<summary>Remote one-liner</summary>

```bash
curl -sL https://raw.githubusercontent.com/AleksLi1/netrunner/master/scripts/remote-install.sh | bash
```

Tries npm first, falls back to git clone + install.sh.
</details>

<details>
<summary>What gets installed where</summary>

| Source | Destination |
|--------|-------------|
| `commands/nr.md` | `~/.claude/commands/nr.md` |
| `commands/nr/*.md` | `~/.claude/commands/nr/` |
| `agents/nr-*.md` | `~/.claude/agents/` |
| `bin/` | `~/.claude/netrunner/bin/` |
| `workflows/` | `~/.claude/netrunner/workflows/` |
| `templates/` | `~/.claude/netrunner/templates/` |
| `references/` | `~/.claude/netrunner/references/` |
| `examples/` | `~/.claude/netrunner/examples/` |

The installer auto-cleans stale files from previous versions.
</details>

---

## Quick Start

### Build something from scratch
```
/nr:run "build a real-time chat app with WebSocket, user auth, and message history"
```
Netrunner will ask 2-3 clarifying questions, create a phased roadmap, and execute each phase autonomously with verification and acceptance testing.

### Resume interrupted work
```
/nr:run
```
Reads `STATE.md` and picks up exactly where you left off — mid-phase, mid-wave, wherever.

### Fix a bug
```
/nr:run "the login endpoint returns 500 when the email contains a plus sign"
```
Spawns a debugger agent that uses the scientific method: hypothesize, test, narrow, fix.

### Get expert advice
```
/nr why is my API response time spiking after 1000 concurrent users
```
Loads your project's full diagnostic context, activates the right domain expert, and gives constraint-aware advice that never repeats failed approaches.

### Run overnight
```
/nr:run overnight "refactor the payment system to support multi-currency"
```
8-hour autonomous session. Suppresses confirmation prompts. When planned work finishes early, proactively improves test coverage, code quality, performance, and security.

---

## Three Commands

Everything Netrunner does is accessed through three commands. That's it.

### `/nr:run` — The Chain Reaction Engine

The universal autonomous executor. Describe what you want — Netrunner figures out the how.

```bash
# New projects
/nr:run "build a dashboard with real-time analytics"
/nr:run "create a CLI tool for managing Docker containers"

# Resume work
/nr:run                          # Resume from where you left off
/nr:run --from 3                 # Skip to phase 3

# Extend existing projects
/nr:run "add WebSocket support"  # Adds phases to existing roadmap

# Debug
/nr:run "fix the memory leak in the worker pool"

# Extended sessions
/nr:run overnight                # 8 hours autonomous
/nr:run for 3 hours              # Custom duration
/nr:run extended                 # 4 hours

# Quant-specific
/nr:run "build a momentum strategy with walk-forward validation"

# Cross-repo transfer
/nr:run "export findings to the production repo"
/nr:run "import the NTP packet from research"

# Autonomous experiment loop
/nr:run "auto-research: optimize the feature pipeline, eval: python run_eval.py"
```

### `/nr` — The Diagnostic Expert

Expert Q&A. Ask anything — Netrunner loads your full project context, activates a domain-specific expert persona, and produces answers grounded in what's actually happening in your project.

```bash
/nr what's the highest-leverage thing to do next
/nr why is my test coverage dropping
/nr explain how the middleware chain works
/nr what would happen if I switch from REST to GraphQL
/nr init                         # Analyze repo and create CONTEXT.md
```

The expert:
- Never repeats approaches that already failed
- Detects when an avenue is exhausted (3+ failures on the same theme) and blocks it
- Adapts output format: full 6-field analysis for fresh contexts, compact one-liners for iterative sessions
- Activates domain-specific reasoning triggers (e.g., "Is this a temporal contamination risk?" for quant projects)

### `/nr:update` — Self-Update

```bash
/nr:update
```

Checks for newer versions, shows changelog, backs up current install, pulls and reinstalls. Rolls back automatically on failure.

---

## How It Works

### The Chain Reaction Loop

Every `/nr:run` invocation follows the same core loop:

```
USER PROMPT → ORIENT → CLASSIFY → [ACTION → BRAIN ASSESS → NEXT ACTION]* → DONE
```

This is the "chain reaction" — one action's output determines the next action. The brain evaluates before every dispatch, ensuring the system never drifts, never repeats failures, and always moves toward the project hypothesis.

```
                    ┌─────────────────────────────┐
                    │         USER PROMPT          │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │      A. ORIENT (scan fs)     │
                    │   COLD / WARM / HOT state    │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   B. CLASSIFY (match intent) │
                    │   → mode + first action      │
                    └──────────────┬──────────────┘
                                   │
               ┌───────────────────▼───────────────────┐
               │          CHAIN REACTION LOOP           │
               │                                        │
               │  ┌──────────┐    ┌──────────────────┐ │
               │  │  BRAIN   │───►│ DISPATCH ACTION   │ │
               │  │  ASSESS  │    │ (SCOPE/PLAN/EXEC/ │ │
               │  │ (4 gates)│◄───│  VERIFY/DEBUG/...) │ │
               │  └──────────┘    └──────────────────┘ │
               │       │                    │           │
               │       │    ┌───────────────▼────┐     │
               │       │    │ Determine next     │     │
               │       │    │ action from result  │     │
               │       │    └───────────┬────────┘     │
               │       │               │               │
               │       └───────────────┘               │
               │              (loop)                    │
               └───────────────────┬───────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │           D. DONE            │
                    │   Goal validation + summary  │
                    └─────────────────────────────┘
```

### Phase A: Orient

Netrunner scans the filesystem once at startup to determine project state:

| Condition | State | Meaning |
|-----------|-------|---------|
| No `.planning/` directory | **COLD** | No project — needs scoping or is a quick task |
| `.planning/` exists, incomplete phases | **WARM** | Project in progress — resume or extend |
| `.planning/` exists, all phases complete | **HOT** | Project done — new work or status check |

If WARM or HOT, it loads the full project brain: `CONTEXT.md`, `ROADMAP.md`, `STATE.md`, `REQUIREMENTS.md`, `PROJECT.md`.

Orient also detects:
- **Extended session flags** (`overnight`, `for 3 hours`, etc.)
- **Research corpus** — existing `research/` directory with synthesis files
- **Pending NTP transfers** — `.planning/imports/*.ntp` files
- **Phase skip flags** (`--from N`)

### Phase B: Classify Intent

The classifier applies the **first matching rule** from a priority-ordered table. Classification depends on both the project state (COLD/WARM/HOT) and what the user said.

**COLD state (no project):**

| User Says | Mode | First Action |
|-----------|------|-------------|
| Project/feature description | `NEW_PROJECT` | SCOPE |
| Quant strategy (3+ quant signals) | `BUILD_STRATEGY` | Specialized 7-phase workflow |
| Bug/error/crash | `QUICK_DEBUG` | DEBUG (no scaffolding) |
| Bounded single task | `QUICK_TASK` | Execute inline |
| "audit" / "scan" + quant context | `QUANT_AUDIT` | AUDIT |
| "export" / "transfer to" | `TRANSFER_EXPORT` | EXPORT |
| "import" / `.ntp` referenced | `TRANSFER_IMPORT` | IMPORT |
| "auto-research" / "experiment loop" | `AUTO_RESEARCH` | Karpathy-style experiment loop |
| Empty prompt | — | Asks "What would you like to build?" |

**WARM state (project in progress):**

| User Says | Mode | First Action |
|-----------|------|-------------|
| Empty / "continue" / "go" | `CONTINUE` | Resume from current phase state |
| New feature/addition | `EXTEND` | Add phases to roadmap, then PLAN |
| Bug/error/crash | `DEBUG` | Debug with full project context |
| "phase 3" (explicit) | `EXPLICIT` | Whatever phase 3 needs next |
| Bounded task not in roadmap | `QUICK_TASK` | Execute inline |
| Progress/status inquiry | `PROGRESS` | Display progress report |

**HOT state (project complete):**

| User Says | Mode | First Action |
|-----------|------|-------------|
| New work description | `EXTEND` | Add phases, execute |
| Empty prompt | `PROGRESS` | Display completion summary |

**Phase artifact state** determines which action a phase needs next:

| Phase Has | Next Action |
|-----------|------------|
| No PLAN.md | PLAN |
| PLAN.md but no SUMMARY.md | EXECUTE |
| SUMMARY.md but no VERIFICATION.md | VERIFY |
| VERIFICATION.md with FAIL | REMEDIATE |
| VERIFICATION.md with PASS + untested stories | ACCEPT_TEST |
| VERIFICATION.md with PASS + all stories tested | TRANSITION |

### Brain Assess

The intelligence layer. Runs **before every action dispatch** — this is what makes Netrunner more than a script runner.

**Four pre-generation gates:**

1. **Constraint check** — Does this action violate a Hard Constraint from CONTEXT.md? If yes, SKIP and find an alternative. Hard constraints are absolute — they never get overridden.

2. **Closed path check** — Does this action repeat a high-confidence failure from the "What Has Been Tried" log? If yes, DISCARD and find a different approach. When 3+ entries cluster on the same theme, the entire avenue is marked EXHAUSTED with a mechanistic explanation.

3. **Specificity check** — Is this action generic? If yes, ENHANCE it with project-specific reasoning from the brain state. "Write tests" becomes "Write integration tests for the JWT refresh flow using the mock auth provider from phase 2."

4. **Hypothesis alignment** — Does this action move toward the current diagnostic hypothesis? If not, it must JUSTIFY the deviation or ADJUST the hypothesis.

**Safety mechanisms:**
- Cycle counter: max 50 cycles (standard) or 500 (extended sessions)
- Verify failure counter: 3 consecutive failures on the same phase → HALT
- Brain re-routing: execution contradicts plan → re-PLAN; constraint violation mid-execution → DEBUG

### Actions

Actions are the atomic units of work in the chain reaction. Each action produces artifacts and determines the next action.

#### SCOPE
Creates the full project scaffolding from a description. Classifies into one of 4 shapes (BUILD:GREENFIELD, BUILD:BROWNFIELD, FIX:DEBUGGING, OPTIMIZE:REFINEMENT), asks 2-3 diagnostic questions, generates PROJECT.md, REQUIREMENTS.md, CONTEXT.md, STATE.md, ROADMAP.md, and STORIES.md. For brownfield projects, spawns `nr-mapper` to scan the existing codebase.

#### PLAN
Creates an executable plan for a phase. Builds a constraint frame from CONTEXT.md, optionally spawns `nr-researcher` for knowledge gaps, then spawns `nr-planner` to produce a PLAN.md with task breakdown, dependency graph, and wave grouping. Brain reviews the plan for constraint compliance before accepting.

#### EXECUTE
Runs a plan. Groups independent tasks into parallel waves. Single-task waves execute directly. Multi-task waves use team-based parallel dispatch — multiple `nr-executor` agents run concurrently via shared task lists. Each executor commits atomically. Failures get one automatic retry, then escalate to the debugger.

#### VERIFY
Spawns `nr-verifier` to check phase results against success criteria from the roadmap. Produces a VERIFICATION.md with PASS, PASS_WITH_NOTES, or FAIL verdict. Three consecutive failures → HALT.

#### ACCEPT_TEST
Runs acceptance tests against user stories from STORIES.md. Detects the project domain and uses the appropriate test method (Playwright for web, HTTP assertions for APIs, bash for CLIs, pytest for data/quant). Includes a self-healing loop that diagnoses failures, spawns fixes, and re-tests (max 3 attempts per story).

#### TRANSITION
Marks a phase complete. Writes all outcomes to the brain (tried approaches, hypothesis updates, decisions). Advances to the next phase. Updates the project architecture diagram. Optionally offers NTP export if validated findings exist and partner repos are registered.

#### DEBUG
Classifies the issue (RUNTIME_ERROR, LOGIC_BUG, INTEGRATION, PERFORMANCE, REGRESSION, ENVIRONMENT), loads prior context, and spawns `nr-debugger` for scientific-method investigation.

#### REMEDIATE
After a verification failure, spawns `nr-planner` to create a targeted remediation plan addressing the specific gaps, then re-executes and re-verifies.

#### QUICK_EXECUTE
For bounded tasks that don't need full project machinery. Validates the task is truly bounded, executes inline without agent spawns or `.planning/` artifacts.

#### PROGRESS
Displays project metrics: phases completed, requirements validated, brain hypothesis and confidence, trajectory assessment, and recommendation for next steps.

#### BUILD_STRATEGY
Specialized 7-phase quant trading strategy workflow with auditor gates between phases. See [Quant Strategy Builder](#quant-strategy-builder).

#### AUDIT
Spawns `nr-quant-auditor` for code scanning. Four modes: TEMPORAL_AUDIT (lookahead contamination), FEATURE_AUDIT (pipeline issues), VALIDATION_AUDIT (split/metric problems), FULL_AUDIT (all).

#### EXPORT / IMPORT
NTP cross-repo transfer. See [NTP](#ntp--netrunner-transfer-protocol).

#### AUTO_RESEARCH
Karpathy-style experiment loop. See [Auto-Research Loop](#auto-research-loop).

#### EXTEND_WORK
Proactive improvements when planned work completes during extended sessions. Priority: test coverage → code quality → performance → documentation → refactoring → security.

---

## The Brain

Every project gets a persistent brain at `.planning/CONTEXT.md`. It's consulted before every action and updated after every outcome. The brain is what makes Netrunner learn across sessions instead of starting fresh each time.

### What the brain tracks

| Section | Purpose |
|---------|---------|
| **Project Goal** | Outcome description — what success looks like, not tech choices |
| **Current State** | Metrics table with current/target values |
| **Hard Constraints** | Absolute rules that are never violated |
| **Diagnostic Hypothesis** | The brain's current understanding of project state, with evidence and confidence level |
| **What Has Been Tried** | Every approach attempted, with outcome (FAILED/FIXED/CHANGED), confidence (High/Medium/Low), failure mode, and phase |
| **Domain Knowledge** | Project-specific expert knowledge accumulated during execution |
| **Decision Log** | Significant decisions with reasoning and outcomes |
| **Update Log** | Session history |

### How the brain prevents wasted effort

1. **Closed paths** — If an approach failed with high confidence, it's never suggested again. The brain detects when the same class of approach keeps failing:
   - 3+ failures on "try different model architectures" → entire avenue marked EXHAUSTED
   - Mechanistic explanation generated: "Model architecture changes are not addressing the root cause (data quality)"

2. **Constraint enforcement** — Hard constraints are checked before every action. If a proposed action would violate one, it's blocked and an alternative is found.

3. **Hypothesis alignment** — Every action must move toward the current hypothesis. Random exploration is prevented — the brain requires justification for any deviation.

4. **Session batching** — Updates are batched per session (not per-invocation) to keep the brain lean. When "What Has Been Tried" exceeds 15 entries, archiving is prompted.

### Brain CLI

The brain is managed programmatically through `nr-tools.cjs`:

```bash
nr-tools brain load                    # Load current brain state
nr-tools brain add-tried '<approach>'  # Log a tried approach
nr-tools brain update-hypothesis '...' # Update the diagnostic hypothesis
nr-tools brain add-decision '...'      # Log a decision
nr-tools brain get-constraints         # Get hard constraints
nr-tools brain get-closed-paths        # Get failed approaches
```

---

## 11 Specialized Agents

Agents are Claude Code subprocesses with specific tools and domain knowledge. They run in parallel when tasks are independent — a 5-task wave can dispatch 5 executors simultaneously.

| Agent | What It Does | Key Tools |
|-------|-------------|-----------|
| **nr-planner** | Creates executable plans with task breakdown, dependency graphs, wave grouping, and constraint frames. Receives the brain's constraint frame as input. | Read, Write, Bash, Glob, Grep, WebFetch |
| **nr-executor** | Implements tasks with atomic commits. Tracks deviations from the plan and manages checkpoints. Reads CONTEXT.md for constraint awareness. | Read, Write, Edit, Bash, Grep, Glob |
| **nr-verifier** | Unified verification: goal-backward analysis, Nyquist gap filling, cross-phase integration checks, and acceptance test execution (starts the app, tests user stories end-to-end). | Read, Write, Edit, Bash, Grep, Glob |
| **nr-researcher** | Investigates unknowns. Checks existing research corpus before doing web searches. Handles project-level, phase-level, and UI research. | Read, Write, Bash, Grep, Glob, WebSearch, WebFetch |
| **nr-synthesizer** | Distills research outputs from parallel researcher agents into actionable SUMMARY.md. For quant projects, applies temporal-integrity-first synthesis. | Read, Write, Bash |
| **nr-debugger** | Scientific method: classify issue → hypothesize → test → narrow → fix. Manages debug sessions with checkpoints. Reads CONTEXT.md for prior failure patterns. | Read, Write, Edit, Bash, Grep, Glob, WebSearch |
| **nr-mapper** | Analyzes codebase architecture. Writes structured docs (ARCHITECTURE.md, PATTERNS.md, DEPENDENCIES.md, CONCERNS.md) with Mermaid diagrams. Supports targeted NTP mapping mode. | Read, Bash, Grep, Glob, Write |
| **nr-roadmapper** | Creates phased execution plans from requirements. Domain-aware ordering (e.g., validation-before-modeling for quant projects). | Read, Write, Bash, Glob, Grep |
| **nr-quant-auditor** | Active code scanner for trading systems. 8 audit modes: TEMPORAL, FEATURE, VALIDATION, PRODUCTION, DRIFT, OVERFITTING, BACKTEST (mandatory 8-check pipeline), FULL. Produces scored reports with temporal safety ratings. | Read, Write, Bash, Grep, Glob |
| **nr-web-auditor** | Active code scanner for web/frontend. 7 audit modes: ACCESSIBILITY (WCAG 2.1), PERFORMANCE (LCP/CLS/INP), BUNDLE, RENDER, HYDRATION (SSR/RSC), SECURITY (XSS, leaked secrets, tabnabbing), FULL. 26 grep-able patterns from `references/web-code-scan-patterns.md`. | Read, Write, Edit, Bash, Grep, Glob |
| **nr-api-auditor** | Active code scanner for API/backend. 9 audit modes: SECURITY (injection, RCE, secrets), AUTH (JWT, BOLA/IDOR), N+1, CONTRACT (breaking changes), IDEMPOTENCY (money paths), RATE_LIMIT, RELIABILITY (timeouts, transactions), OBSERVABILITY, FULL. 26 patterns with money-path severity upgrade. | Read, Write, Edit, Bash, Grep, Glob |

### Parallel dispatch

When a phase has multiple independent tasks, Netrunner dispatches them concurrently:

```
Wave 1: [Task A, Task B, Task C]  ← 3 executors run in parallel
Wave 2: [Task D]                   ← depends on Wave 1, runs after
Wave 3: [Task E, Task F]          ← 2 executors run in parallel
```

This uses Claude Code's team-based dispatch: `TeamCreate` → `TaskCreate` per item → spawn all agents in one turn → monitor shared task list → shutdown and cleanup.

---

## 8 Domain Specializations

Netrunner detects your project's domain from keyword signals and activates a specialized expert persona. Each domain includes a complete knowledge stack:

| Layer | What It Contains |
|-------|-----------------|
| Expert reasoning file | Persona description, reasoning triggers, common pitfalls |
| Code patterns file | 10-20 WRONG/CORRECT pairs showing anti-patterns vs. correct implementations |
| Deep reference guide | 800+ line comprehensive technical reference |
| Domain overlay | Detection signals, pre-generation gates, expert activation rules |
| Build workflow | 5-7 phase domain-specific build sequence with quality gates |
| Example interactions | CONTEXT.md examples and conversation transcripts |

### The 8 domains

| Domain | Expert Persona | Key Principle |
|--------|---------------|---------------|
| **Quantitative Finance** | Head of quant research | "Every result is an artifact until proven otherwise." Temporal contamination detection, walk-forward validation, skepticism-by-default. |
| **Web / Frontend** | Senior frontend architect | "Performance is measured, not assumed." Core Web Vitals, accessibility, progressive enhancement. |
| **API / Backend** | Senior backend architect | "Contracts are sacred." API versioning, rate limiting, backwards compatibility. |
| **Systems / Infrastructure** | Senior SRE | "Everything fails — how gracefully?" Failure modes, blast radius, observability. |
| **Mobile** | Senior mobile architect | "Offline is the default state." Battery efficiency, platform conventions, adaptive layouts. |
| **Desktop** | Senior desktop architect | "Memory is finite." Resource management, native integration, cross-platform consistency. |
| **Data Analysis** | Senior data scientist | "Correlation is not causation." Statistical rigor, reproducibility, methodology documentation. |
| **Data Engineering** | Senior data platform engineer | "Idempotency is non-negotiable." Pipeline reliability, schema evolution, data quality gates. |

### Domain detection

Domains are detected automatically from signals in your project. For example, quant finance activates when 2+ of these appear: Sharpe, returns, alpha, backtest, walk-forward, regime, lookahead, trading, features, P&L, drawdown, OHLCV, portfolio, signal, strategy, momentum, mean-reversion.

Each domain persona is inherited by all agents — the planner plans like a domain expert, the verifier checks domain-specific quality gates, the debugger investigates domain-specific failure patterns.

---

## Advanced Capabilities

### Extended Sessions

For large projects, let Netrunner run for hours without interruption:

```bash
/nr:run overnight              # 8 hours
/nr:run for 3 hours            # Custom duration
/nr:run for 45 minutes         # Shorter sessions
/nr:run extended               # 4 hours (alias for "long session")
```

**What changes in extended mode:**

| Feature | Standard | Extended |
|---------|----------|---------|
| Cycle cap | 50 | 500 |
| User confirmations | Prompted | Suppressed (decisions logged to CONTEXT.md) |
| Post-completion | Stop | EXTEND_WORK: proactively improve test coverage, code quality, performance, docs, security |
| Wind-down | Immediate | Graceful: finishes atomic operation, commits pending work, writes session report |

When time runs out mid-action, Netrunner completes the current atomic operation (never leaves broken state), commits pending changes, writes a session report to CONTEXT.md, and displays a completion banner with elapsed time and work summary. `/nr:run` will resume seamlessly next session.

### Auto-Research Loop

Karpathy-inspired autonomous experiment loop for optimization tasks. Runs a tight modify → eval → keep/revert cycle, accumulating brain state for progressively smarter proposals.

```bash
/nr:run "auto-research: optimize the feature pipeline, eval: python run_eval.py"
```

**How it works:**
1. Parses goal, eval command, and mutable/immutable file scope
2. Validates the eval harness (runs it twice for consistency)
3. Records baseline value and commit
4. Proposes a code modification based on brain state + prior experiments
5. Runs eval → if improved: keep (commit) → if not: revert (git checkout)
6. Brain accumulates: "Tried X, result Y" — proposals get smarter over time
7. Repeats for 20-100+ experiments per session

**Integration with extended sessions:** `overnight` → up to 500 experiments. Brain batches updates every 5 experiments to keep context lean.

**Output:** `.planning/auto-research/JOURNAL.md` (experiment-by-experiment log), `REPORT.md` (analysis), and git history (each improvement is a commit, failures are reverted).

### Lateral Mode (Creative Reframing)

For when conventional thinking is tapped out. The default `/nr` flow gives you median-competent expertise; Lateral mode gives you a four-phase divergent pipeline equipped with cross-domain primitives.

```bash
/nr --lateral "we're stuck on caching strategy"
/nr --creative "rethink our auth flow"
```

**Auto-triggers** when the brain detects 3+ exhausted experiment clusters on a STRATEGY query — that's the moment conventional thinking has provably failed. A banner shows the auto-upgrade with a `--no-lateral` override.

**Four-phase pipeline:**
1. **REFRAMING** — 5-8 reframings of the problem itself, not solutions. "The problem is actually about ___, not ___."
2. **ANALOGICAL TRANSFER** — deliberate parallels from non-software domains via the analogy library (cellular apoptosis ↔ cache invalidation, bee swarm voting ↔ distributed consensus, hotel keycards ↔ JWT refresh, etc.)
3. **ASSUMPTION INVERSION** — list 3 load-bearing assumptions, ask "what if false?"
4. **RECONVERGE** — 2-3 concrete avenues, each carrying a `LINEAGE` tag (ANALOGY / INVERSION / NAIVE / RECOMBO / NEG_SPACE) and a `PROVOCATION` line stating the uncomfortable part

**Knowledge base:**
- `references/lateral-reframings.md` — 7 operational primitives (analogical transfer, constraint inversion, first-principles regression, naive question, adversarial probing, combinatorial recombination, negative space) with templates and worked examples
- `references/analogy-library.md` — 48 curated cross-domain analogies indexed by software primitive
- `references/creative-precedent.md` — per-project personal library grown when the user marks an avenue as having unlocked their thinking

**Hard gates:** Lateral avenues must carry a lineage tag, must use specific named analogies (not vague "like nature"), must include a provocation line, and must never re-land in the exhausted clusters that triggered the mode.

### Acceptance Testing

Netrunner doesn't just verify code — it verifies that the built product actually works from the user's perspective.

**User stories are generated during SCOPE** from the user's original goal and requirements. Each story follows Given/When/Then format with machine-testable acceptance criteria:

```markdown
## STORY-01: User can create an account
As a new user, I want to create an account, so that I can access the dashboard.

**Given** I am on the registration page
**When** I fill in email "test@example.com" and password "SecurePass123!"
**And** I click "Create Account"
**Then** I should see the dashboard with a welcome message
**And** the URL should contain "/dashboard"
```

**Domain-appropriate test runners:**

| Domain | Test Method |
|--------|------------|
| Web | Playwright MCP (direct browser control) or Playwright test files |
| API | HTTP assertions (curl/requests) |
| CLI | Bash script assertions (stdout, exit codes, file outputs) |
| Data / Quant | pytest + file/row/metric assertions |
| Mobile | Platform-specific (flagged for manual testing) |

**Self-healing loop:** When an acceptance test fails, Netrunner:
1. Diagnoses the failure (MISSING_ELEMENT, WRONG_BEHAVIOR, SETUP_FAILURE, TIMING_ISSUE, TEST_ISSUE)
2. Spawns `nr-executor` to fix the implementation
3. Re-runs the specific test
4. Repeats up to 3 times, then escalates to the user

**Goal Validation Gate:** Before marking a project complete, Netrunner re-reads the original user goal, runs ALL acceptance tests (including previously-passed ones for regression), and validates that the goal is fully covered by stories. Uncovered aspects trigger additional story generation and phases.

### NTP — Netrunner Transfer Protocol

Cross-repo LLM-to-LLM knowledge transfer. Designed for workflows where research happens in one repo and production happens in another. ~5x more token-efficient than prose markdown.

```bash
# In the research repo
/nr:run "export findings to the production repo"

# In the production repo
/nr:run "import the transfer packet"
```

**Design principles:**
- **WHAT not WHERE** — exporter describes findings, importer maps to its own codebase
- **Code over prose** — functions, not descriptions
- **Typed fields** — `IC:0.03 decay:5d` not sentences
- **DISCOVERY hints** — grep targets so the importer doesn't scan the entire repo

**Packet structure:**
```
---NTP/1 SUMMARY---     # One-line per finding
---NTP/1 FINDINGS---    # Typed, abbreviated metrics
---NTP/1 CODE---        # Actual implementation by finding ID
---NTP/1 DISCOVERY---   # CONCEPTS, TOUCHES, PATTERNS, DEPS
---NTP/1 CONSTRAINTS--- # Temporal, regime, risk, dependency constraints
---NTP/1 VERIFY---      # Per-finding and integration-level test criteria
---NTP/1 DELTA---       # State changes for receiving repo's CONTEXT.md
```

**Partner registry:** `.planning/ntp-partners.json` enables auto-delivery between repos. Packets are written directly to the partner's `.planning/imports/` directory.

### Research Corpus Integration

When your project has an existing `research/` directory with a synthesis file (e.g., from prior deep research), Netrunner shifts from "research from scratch" to "capitalize on completed expert analysis."

**What changes:**
- Researchers check the corpus before doing web searches — gap-fill only
- Planners map phase goals to research tiers and use exact parameters from the synthesis
- Executors load referenced research docs for implementation details
- Verifiers check implementation against research recommendations
- Research closed paths become hard constraints across all phases

Netrunner scans for: `research/`, `.planning/research/`, `docs/research/` — looking for `00_SYNTHESIS.md`, `SYNTHESIS.md`, or any file with "synthesis" in the name.

### Quant Strategy Builder

The most deeply developed domain specialization. Activated when 3+ quant signals are detected in the user's description.

```bash
/nr:run "build a momentum strategy with walk-forward validation on daily OHLCV data"
```

**7-phase workflow with auditor gates:**

| Phase | Gate |
|-------|------|
| 1. Ideation & Research | — |
| 2. Data Infrastructure | TEMPORAL_AUDIT |
| 3. Feature Engineering | FEATURE_AUDIT |
| 4. Validation Framework | VALIDATION_AUDIT |
| 5. Model Development | Beats baseline |
| 6. Strategy Evaluation | FULL_AUDIT |
| 7. Production Readiness | Human review |

**Quant-specific resources:**
- 20 code pattern pairs (temporal contamination, rolling stats, Sharpe calculation, position sizing, walk-forward purging, etc.)
- 3 deep references: strategy metrics (1900+ lines), feature engineering (600+ lines), ML training (960+ lines)
- Dedicated `nr-quant-auditor` agent with temporal safety scoring
- Expert persona: "Head of quantitative research — skeptical by default"

### Visualization

All agents and workflows proactively generate diagrams:

**Mermaid diagrams** (embedded in markdown):
- Architecture diagrams (nr-mapper)
- Task dependency graphs (nr-planner)
- Pass/fail verification charts (nr-verifier)
- Hypothesis trees (nr-debugger)
- Phase sequence diagrams (nr-roadmapper)
- Contamination propagation maps (nr-quant-auditor)
- Final project overview (completion)

**Python plot scripts** (saved to `.planning/plots/`):
- IC distributions, equity curves, regime breakdowns (quant)
- Feature importance charts
- Evaluation dashboards

---

## Crash Recovery

State is written to disk after every cycle. If Claude Code crashes, your session disconnects, or you just close the terminal:

```bash
/nr:run    # Picks up exactly where it left off
```

`STATE.md` records: current action, cycle count, verify failure count, last completed action, timestamp, and elapsed time. The next `/nr:run` reads this write-ahead log and resumes from the exact point of interruption.

---

## Project Artifacts

Every Netrunner project produces a `.planning/` directory:

```
.planning/
├── PROJECT.md              # Project identity, classification, stack
├── ROADMAP.md              # Phased execution plan with status markers
├── REQUIREMENTS.md         # Tracked requirements (REQ-01, REQ-02, ...)
├── CONTEXT.md              # Brain: constraints, tried approaches, hypothesis
├── STATE.md                # Current position + crash recovery write-ahead
├── STORIES.md              # User stories with Given/When/Then criteria
├── PROJECT-OVERVIEW.md     # Final architecture diagram (Mermaid)
├── config.json             # Project configuration
│
├── phase-1/                # Per-phase artifacts
│   ├── PLAN.md             # Executable plan with task breakdown
│   ├── SUMMARY.md          # Execution outcome record
│   ├── VERIFICATION.md     # Verification results (PASS/FAIL)
│   └── RESEARCH.md         # Phase-specific research (if needed)
│
├── codebase/               # Codebase analysis (brownfield projects)
│   ├── ARCHITECTURE.md     # Architecture with Mermaid diagrams
│   ├── PATTERNS.md         # Code patterns and conventions
│   ├── DEPENDENCIES.md     # Dependency analysis
│   └── CONCERNS.md         # Technical debt and risks
│
├── acceptance-tests/       # Generated acceptance test files
├── auto-research/          # Experiment loop artifacts
│   ├── DIRECTIVE.md        # Research directive
│   ├── JOURNAL.md          # Experiment-by-experiment log
│   └── REPORT.md           # Final analysis
│
├── exports/                # NTP packets sent
├── imports/                # NTP packets received
│   └── processed/          # Archived after import
│
├── plots/                  # Generated visualization scripts
├── debug/                  # Debug session artifacts
└── audit/                  # Quant audit reports
```

---

## Architecture Reference

### File counts

| Category | Files | Lines |
|----------|-------|-------|
| CLI + libraries (`bin/`) | 13 | ~7,400 |
| Agents | 9 | ~19,800 |
| Commands | 3 | ~1,600 |
| Workflows | 20 | ~8,500 |
| Templates | 22 | ~4,000 |
| References | 35 | ~27,400 |
| Examples | 16 | ~1,400 |

### CLI modules (`bin/nr-tools.cjs`)

The CLI entry point routes to 12 library modules:

| Module | Responsibility |
|--------|---------------|
| `brain.cjs` | CONTEXT.md management (load, update-hypothesis, add-tried, add-decision, constraints, closed-paths) |
| `state.cjs` | STATE.md CRUD (load, update, patch, begin-phase, session continuity) |
| `phase.cjs` | Phase lifecycle (add, insert, remove, complete, plan-index) |
| `roadmap.cjs` | ROADMAP.md operations (get-phase, analyze, update-progress) |
| `verify.cjs` | Artifact verification (plan-structure, phase-completeness, references, commits, health) |
| `init.cjs` | Compound workflow initialization (execute-phase, plan-phase, new-project, resume) |
| `commands.cjs` | Utility commands (resolve-model, commit, generate-slug, progress, stats, websearch) |
| `config.cjs` | `.planning/config.json` management |
| `frontmatter.cjs` | YAML frontmatter CRUD for planning docs |
| `template.cjs` | Template selection and fill |
| `model-profiles.cjs` | Model profile resolution |
| `core.cjs` | Core utilities and error handling |

### Model profiles

Configure which Claude model agents use:

| Profile | Behavior |
|---------|----------|
| `quality` | Opus for reasoning-heavy agents, Sonnet for others |
| `balanced` | Sonnet for most, Haiku for simple tasks |
| `budget` | Haiku where possible, Sonnet for complex tasks |
| `inherit` | All agents use the parent model (required for non-Anthropic providers) |

---

## License

MIT


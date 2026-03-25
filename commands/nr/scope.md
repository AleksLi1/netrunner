# Netrunner Scope — Project Kickoff with Diagnostic Reasoning

<purpose>
Initialize a new project through diagnostic classification. Accepts a freeform description, classifies the project type, asks minimal targeted questions, then generates all planning artifacts. This is the entry point for any new Netrunner project.
</purpose>

<process>

## 1. Accept Project Description

```
Input: $ARGUMENTS
```

If `$ARGUMENTS` is empty, ask:
```
What are you building? Describe the project, feature, or system in a few sentences.
```

Wait for response before continuing.

## 2. Brain Classification

Classify the project using the two-tier system:

### Shape Detection
| Shape | Signal |
|-------|--------|
| `BUILD:GREENFIELD` | No existing codebase for this feature, starting from scratch |
| `BUILD:BROWNFIELD` | Existing codebase, adding/modifying functionality |
| `FIX:DEBUGGING` | Something broken that needs systematic investigation |
| `OPTIMIZE:REFINEMENT` | Working system that needs improvement |

### Subtype Detection
Analyze the description for domain signals:
- **ML/Data Science:** model training, data pipeline, evaluation, inference
- **Quantitative Finance / Trading** (ML subdomain): Sharpe, P&L, returns, alpha, drawdown, backtest, walk-forward, regime, lookahead, trading strategy, signal, portfolio, execution, direction accuracy, OHLCV, orderbook, slippage, prediction for trading
- **Web/Frontend:** UI, components, routing, state management, styling
- **API/Backend:** endpoints, database, authentication, services
- **Systems/Infra:** deployment, CI/CD, configuration, monitoring
- **General:** tooling, documentation, testing frameworks

### Quant Project Detection
If the project is classified as **Quantitative Finance / Trading**, set `is_quant = true`. This activates:
- Quant-specific diagnostic questions in Step 3
- Market Structure / Strategy Profile / Risk Framework sections in CONTEXT.md
- Quant-specific hard constraints auto-populated
- Validation-first phase ordering in ROADMAP.md

### Brownfield Detection
If existing code is present in the repo:

```
Task(
  subagent_type="nr-mapper",
  description="Quick codebase scan for project scoping",
  prompt="Scan the current repository structure. Report: languages, frameworks, architecture pattern, key directories, existing tests. Brief output only."
)
```

Use mapper results to inform classification and phase structure.

## 3. Diagnostic Questions (2-3 maximum)

Based on classification, ask targeted questions. These are NOT generic — they are specific to the detected shape and domain.

**For BUILD:GREENFIELD:**
- "What's the core constraint? (time, performance, compatibility, learning curve)"
- "Who is the user / what's the primary use case?"
- "Any existing systems this must integrate with?"

**For BUILD:BROWNFIELD:**
- "What's the integration point with existing code?"
- "What can't change? (APIs, data formats, dependencies)"
- "What's the definition of done?"

**For FIX:DEBUGGING:**
- "What's the specific symptom?"
- "When did it start / what changed?"
- "What have you already tried?"

**For OPTIMIZE:REFINEMENT:**
- "What's the current metric and target?"
- "What's the performance budget / constraint?"
- "What's already been attempted?"

**For Quantitative Finance / Trading projects** (replaces or augments domain questions):
- "What asset class and frequency? (e.g., BTC/USDT 1-min bars, US equities daily)"
- "What's the strategy type and edge hypothesis? (momentum, mean-reversion, stat-arb — and WHY does this alpha exist?)"
- "What's your current validation framework? (walk-forward with purging, single train/test split, or not yet established)"
- "Has a lookahead audit been performed on the feature pipeline? (Yes with details, No, Not sure)"

These questions are critical because the #1 failure mode in quant projects is invalid evaluation (leakage, lookahead, or backtest overfitting). Establishing validation integrity at project initialization prevents months of wasted work on tainted results.

Present questions via AskUserQuestion when possible for structured responses.

## 4. Brain Reasoning — Phase Structure

With classification + answers, reason about the project structure:

```
PROJECT ANALYSIS:
- Shape: [detected shape]
- Subtype: [detected subtype]
- Complexity: [Low | Medium | High]
- Key constraints: [from answers]
- Risk areas: [identified from classification]

PHASE STRATEGY:
- [Why this many phases]
- [Why this ordering]
- [What each phase must prove before the next begins]
```

## 5. Generate All Artifacts

### 5a. `.planning/PROJECT.md`

```markdown
# [Project Name]

## What This Is
[1-2 sentence description from user input + brain refinement]

## Classification
- Shape: [BUILD:GREENFIELD | BUILD:BROWNFIELD | FIX:DEBUGGING | OPTIMIZE:REFINEMENT]
- Subtype: [domain-specific subtype]
- Complexity: [Low | Medium | High]

## Core Constraints
[From diagnostic questions]

## Requirements
See REQUIREMENTS.md for detailed requirements with IDs.

---
*Created: [date]*
```

### 5b. `.planning/REQUIREMENTS.md`

```markdown
# Requirements

## Active
- [ ] **REQ-01**: [Requirement from scoping]
- [ ] **REQ-02**: [Requirement from scoping]
...

## Out of Scope
- [Explicitly excluded items]

## Validated
[Empty — populated as requirements are verified]
```

### 5c. `.planning/ROADMAP.md`

Spawn the roadmapper agent:

```
Task(
  subagent_type="nr-roadmapper",
  description="Generate project roadmap",
  prompt="Create a phased roadmap for this project.

Project: [description]
Classification: [shape + subtype]
Requirements: [from REQUIREMENTS.md]
Constraints: [from diagnostic answers]

Generate phases with:
- Phase number and name
- Goal (what this phase proves)
- Success criteria (measurable)
- Dependencies (what must be done first)
- Plans section (populated during planning)

Write to .planning/ROADMAP.md"
)
```

**For quant/trading projects**, the roadmapper MUST follow this phase ordering principle:

```
QUANT PHASE ORDERING (validation before modeling):
1. Data pipeline + integrity verification
2. Validation framework (walk-forward, purging, embargo)
3. Feature engineering + lookahead audit
4. Baseline model (simplest possible)
5. Experimentation (systematic, one variable at a time)
6. Evaluation (multi-regime, with transaction costs)
7. Production preparation (execution, monitoring, kill switches)

NEVER plan model experimentation before validation framework is established.
NEVER plan complex models before simple baseline is evaluated.
```

Include this ordering instruction in the roadmapper prompt when `is_quant = true`.
```

### 5d. `.planning/CONTEXT.md`

**For standard projects:**
```markdown
# Project Context

## Project Identity
- **Name:** [project name]
- **Type:** [shape:subtype]
- **Stack:** [detected or declared]
- **Started:** [date]

## Current State
[Initial metrics or state description]

## Hard Constraints
[From diagnostic questions — things that cannot change]

## Diagnostic State
**Behavior Pattern:** [Initial — no patterns yet]
**Active Hypothesis:** [None — project starting]
**Evidence:** []
**Confidence:** N/A

## What Has Been Tried
| Approach | Result | Impl. Confidence | Notes |
|----------|--------|-----------------|-------|
| Project scoped | N/A | N/A | Initial scoping complete |

## Open Questions / Active Frontiers
[Questions identified during scoping]

## Update Log
- [date]: Project scoped via /nr:scope
```

**For quant/trading projects** — include additional sections (populated from diagnostic answers):
```markdown
# Netrunner Context — [Project Name]

## Project Goal
[Outcome description — what success looks like in trading terms, not technology choices]

## Current State
| Metric | Current | Target |
|--------|---------|--------|
| [primary trading metric] | [value or "baseline pending"] | [target] |

## Market Structure
- **Asset class:** [from diagnostic answer]
- **Frequency:** [from diagnostic answer]
- **Execution venue:** [if known]
- **Liquidity profile:** [if known]

## Strategy Profile
- **Type:** [from diagnostic answer]
- **Holding period:** [inferred from frequency]
- **Capacity:** [if known]
- **Edge source:** [from diagnostic answer — WHY does this alpha exist?]

## Risk Framework
- **Max drawdown tolerance:** [if known, else "Not yet defined (research phase)"]
- **Position sizing:** [if known, else "Not yet implemented"]
- **Tail risk:** [relevant tail risks for this asset class]

## Hard Constraints
| Constraint | Why | Cost of Violation |
|------------|-----|-------------------|
| No lookahead features | Future data in features invalidates all results | Entire strategy is fake |
| Walk-forward validation only | Random splits on time series are meaningless | All metrics are unreliable |
| Transaction costs in eval | P&L without costs is fantasy | Profitable strategy becomes loss |
| Out-of-sample holdout sacred | Touching test set corrupts it | No trustworthy performance estimate |
| [additional from diagnostic answers] | | |

## Diagnostic State
**Active Hypothesis:** [From initial assessment — what is the core challenge?]
**Evidence for:** [initial signals]
**Evidence against:** [if any]
**Confidence:** Low (project starting)
**Open questions:** [critical unknowns from scoping]

## What Has Been Tried
| Approach | Outcome | Impl. Confidence | Failure Mode | Notes |
|----------|---------|-----------------|--------------|-------|
| Project scoped | N/A | N/A | N/A | Initial scoping complete |

## Domain Knowledge
[Relevant quant/trading knowledge from diagnostic conversation]

## Decision Log
| Phase | Decision | Reasoning | Outcome |
|-------|----------|-----------|---------|

## Update Log
| Date | Phase | Change |
|------|-------|--------|
| [date] | Scope | Project scoped via /nr:scope |
```

### 5e. `.planning/config.json`

```json
{
  "project_name": "[name]",
  "classification": {
    "shape": "[shape]",
    "subtype": "[subtype]"
  },
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true
  },
  "created": "[date]"
}
```

### 5f. Per-phase `CONTEXT.md` files

For each phase in the roadmap, create `.planning/phases/NN-slug/CONTEXT.md`:

```markdown
# Phase N Context

## Phase Goal
[From roadmap]

## Constraints
[Inherited from project + phase-specific]

## Status
Not started
```

### 5g. `.planning/STATE.md`

```markdown
# Project State

## Current Position
- **Current Phase:** 1
- **Status:** Not started
- **Last Activity:** [date] — Project scoped

## Progress
[Phase status list from roadmap]
```

## 6. Create Phase Directories

```bash
mkdir -p .planning/phases
```

Create a directory for each phase: `.planning/phases/NN-slug/`

## 7. Present Summary

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► PROJECT SCOPED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Project: [name]
 Type: [shape:subtype]
 Phases: [count]

 Artifacts created:
 - .planning/PROJECT.md
 - .planning/REQUIREMENTS.md
 - .planning/ROADMAP.md
 - .planning/CONTEXT.md
 - .planning/STATE.md
 - .planning/config.json
 - [phase directories]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 ▶ Next: /nr:plan 1
   Plan the first phase

 Or: /nr:run
   Execute all phases autonomously

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

</process>

<success_criteria>
- [ ] Project classified with shape + subtype
- [ ] 2-3 diagnostic questions asked (not generic)
- [ ] All planning artifacts created
- [ ] ROADMAP.md has phased structure with success criteria
- [ ] CONTEXT.md initialized with diagnostic state
- [ ] STATE.md tracks current position
- [ ] Phase directories created
- [ ] User knows next step
- [ ] For quant projects: Market Structure, Strategy Profile, Risk Framework sections populated
- [ ] For quant projects: Quant-specific hard constraints auto-populated (lookahead, walk-forward, costs, holdout)
- [ ] For quant projects: Roadmap follows validation-before-modeling ordering
</success_criteria>

---
name: nr
description: Netrunner — Collapses the solution space before answering. Run in default or acceptEdits mode for interactive questions.
argument-hint: "<query> | init"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
---

<objective>
Transform vague queries into precise, constraint-aware questions that collapse the solution space to the right answer. Prevent wasted exploration by surfacing binding constraints, failure modes, and already-tried approaches before generating solutions.

**How it works:**
1. Load project context from `.claude/netrunner/context.md` (if exists)
2. Classify the query type
3. Ask 2–3 targeted UI questions using AskUserQuestion
4. Produce a detailed response: current state analysis + 2–3 distinct avenues with mechanism, expected gain, risk, and effort
</objective>

<context>
Raw query: $ARGUMENTS

Context file location: `.claude/netrunner/context.md` (relative to current project root)
</context>

<process>

## Step 0 — Load context

Check if `.claude/netrunner/context.md` exists.

- **Exists** → Read it in full. All constraints, baselines, and tried approaches come from here.
- **Missing** → Inform the user: "No Netrunner context found for this project. Run `/nr init` to build one from the repo." Then proceed with conversation context only.
- **Query is "init"** → Go to INIT flow below.

---

## INIT flow

When query is `init` or starts with `init`:

1. Analyse the repo: read README.md, CLAUDE.md, recent git log (`git log --oneline -30`), key source files
2. Also scan git history for reverted/removed commits — these are implicit "tried and abandoned" signals
3. Extract: project goal, current metrics/targets, architecture summary, known constraints, what's been tried, open questions
4. Write `.claude/netrunner/context.md` using the template in `context-template.md` (or the template below if not found)
5. Tell the user: "Netrunner context created at `.claude/netrunner/context.md`. Use `/nr <query>` to get reframed answers."

**Context file template:**

```markdown
# Netrunner Context — [Project Name]
# Last updated: [YYYY-MM-DD]

---

## Project Goal
[one paragraph — what are we actually trying to achieve]

---

## Current State
| Metric | Current | Target |
|--------|---------|--------|
| [metric] | [value] | [target] |

**Architecture**: [2–3 line summary of key components]

---

## Hard Constraints
| Constraint | Detail |
|-----------|--------|
| [constraint] | [why it matters / cost of violating] |

---

## What Has Been Tried
| Approach | Outcome | Notes |
|----------|---------|-------|
| [approach] | [FAILED/FIXED/CHANGED/TAINTED/REMOVED] | [detail] |

---

## Open Questions / Active Frontiers
- [question or active hypothesis]

---

## Update Log
| Date | Change |
|------|--------|
| [date] | Initial context created |
```

---

## Step 1 — Classify (silently)

Classify the query into one:
- **TRAINING** — loss, convergence, epochs, hyperparameters, learning rate
- **EVALUATION** — metrics, backtesting, validation, numbers
- **FEATURE_ENGINEERING** — new or modified input features, normalisation
- **ARCHITECTURE** — model structure, components, design decisions
- **DEBUGGING** — broken behaviour, unexpected numbers, regressions
- **RESEARCH** — "what if", new approaches, exploring ideas
- **TOOLING** — dev tooling, scripts, workflow, performance

---

## Step 2 — Ask UI questions

Use **AskUserQuestion** to ask 2–3 questions. Do NOT ask in plain text.

Generate options dynamically from the loaded context and the query — make them specific, not generic. If context.md lists current metrics, use those exact numbers in the options. If it lists what's been tried, reference those in the constraint options.

**Always ask question 1 and 2. Add question 3 based on classification.**

**Question 1 — Failure mode** (header: "Failure mode")
Ask what they're actually seeing vs expecting. Generate 3–4 options from:
- Specific metric values from context.md current state
- Common failure patterns for this classification type
- "Something else" as last option

**Question 2 — Binding constraint** (header: "Constraint")
Ask what cannot change. Generate 3–4 options from:
- Hard constraints listed in context.md
- Classification-specific common constraints
- "No hard constraints" as an option
- multiSelect: true

**Question 3 (classification-specific):**
- **TRAINING** (header: "Priority") → Which metric to prioritise? Options from context.md targets.
- **EVALUATION** (header: "Eval method") → Overlapping vs independent samples? Lookahead risk?
- **FEATURE_ENGINEERING** (header: "Signal concern") → Does normalisation preserve the target signal?
- **ARCHITECTURE** (header: "Component") → Which component? Retraining acceptable?
- **DEBUGGING** (header: "Stage") → Which pipeline stage? What changed?
- **RESEARCH** (header: "Mechanism") → What's the theoretical mechanism for improvement?
- **TOOLING** (header: "Bottleneck") → What's the actual bottleneck — startup, runtime, output?

**Fallback — if AskUserQuestion returns no answers (bypass permissions mode or dismissed):**

Do NOT proceed to Step 3. Output the questions as plain text and stop:

---
**Netrunner needs answers before it can collapse the solution space.**
_UI questions were suppressed (bypass permissions mode). Please answer below and re-run, or switch to default permissions mode._

**Q1 — Failure mode**: [question text]
[numbered options]

**Q2 — Binding constraint**: [question text]
[numbered options — multiple allowed]

**Q3 — [header]**: [question text]
[numbered options]

Re-run as: `/nr [original query] -- Q1: [answer] | Q2: [answer] | Q3: [answer]`

---

If the user provides answers after `--` in the query, parse them and proceed to Step 3.

---

## Step 3 — Reframe and produce detailed response

Before answering, state the active constraint frame:

```
QUERY (reframed): [original query rewritten with precision]
METRICS IN SCOPE: [concrete success criteria from answers + context]
CONSTRAINTS ACTIVE: [what cannot change]
ALREADY TRIED: [from answers + context.md — excluded from suggestions]
EXPERT FRAME: [the domain expert whose knowledge should be activated]
```

### Current State Analysis
Brief diagnosis: what the answers + context tell you about *why* the problem exists.

### Avenues

Present 2–3 distinct approaches. For each:

**Avenue [N]: [Name]**
- **Mechanism**: why this would work, given the constraint frame
- **Expected gain**: concrete estimate (e.g. "+3–5% hit rate", "halves startup time")
- **Risk**: what could go wrong or why it might not transfer
- **Effort**: rough cost (e.g. "2h experiment", "requires retraining", "30min script change")

### Recommendation
Which avenue to try first and why — based on the constraint frame, not generic best practice.

---

## Step 4 — Update context

After producing the response, check: did this session surface new knowledge?

If yes, update `.claude/netrunner/context.md`:
- New metric numbers → update Current State
- Approach tried with outcome → add to What Has Been Tried
- New constraint → add to Hard Constraints
- Open question answered → update Open Questions

Add a row to Update Log: `[today's date] | [one-line description]`. Keep terse.

</process>

<success_criteria>
- Questions appeared as UI elements, not plain text
- Options were specific to the project context, not generic
- Response included reframed query with active constraint frame
- 2–3 avenues with mechanism, gain, risk, effort
- No suggestions that repeat already-tried approaches
- No suggestions that violate stated constraints
- context.md updated if new knowledge surfaced
</success_criteria>

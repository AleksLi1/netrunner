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
Transform vague queries into precise, constraint-aware answers that collapse the solution space. For model development queries: force mechanistic diagnosis of what the model is and isn't learning before suggesting anything. Prevent wasted exploration by surfacing behavior patterns, implementation confidence on prior failures, and binding constraints — before generating avenues.

**How it works:**
1. Load project context from `.claude/netrunner/context.md`
2. Classify query — MODEL_DEV gets a diagnostic-first flow
3. Ask 2–3 targeted UI questions (diagnostic for MODEL_DEV, constraint-surfacing for others)
4. For MODEL_DEV: state a mechanistic hypothesis before avenues — mandatory, no exceptions
5. Produce avenues with mechanism, gain, risk, implementation risk, verification, and effort
</objective>

<context>
Raw query: $ARGUMENTS

Context file: `.claude/netrunner/context.md` (relative to project root)
</context>

<process>

## Step 0 — Load context

Check `.claude/netrunner/context.md`:
- **Exists** → Read it fully. All constraints, metrics, tried approaches, diagnostic state, and implementation confidence come from here.
- **Missing** → Inform user: "No Netrunner context found. Run `/nr init` to build one." Proceed with conversation context only.
- **Query is "init"** → Go to INIT flow.

---

## INIT flow

When query starts with `init`:

1. Read README.md, CLAUDE.md (if exists), recent `git log --oneline -30`, key source files
2. Scan git history for reverted/removed commits — implicit abandoned signals; note implementation confidence as Unknown unless context is clear
3. Extract: project goal, metrics/targets, architecture, constraints, what's been tried
4. For model development projects: also extract any diagnostic signals — loss curves mentioned, regime analysis, feature ablations, any description of model behavior
5. Infer implementation confidence on historical failures where possible; default to Unknown
6. Write `.claude/netrunner/context.md` using the schema in `context-template.md` (or the schema below)
7. Confirm: "Netrunner context created at `.claude/netrunner/context.md`. Use `/nr <query>` for constrained answers."

**Context file schema:**

```markdown
# Netrunner Context — [Project Name]
# Last updated: [YYYY-MM-DD]

## Project Goal
[One paragraph — what you're actually trying to achieve. Outcome, not technology.]

## Current State

| Metric | Current | Target |
|--------|---------|--------|
| [metric] | [value] | [target] |

**Architecture**: [2–3 lines: key components, stack, data flow]
**Active work**: [what's currently in progress]

## Hard Constraints

| Constraint | Detail |
|-----------|--------|
| [constraint] | [why it matters / cost of violating] |

## Diagnostic State

**Model behavior hypothesis:**
[Mechanistic description of what the model is and isn't learning. What knowledge is it missing? Why?
Write "Unknown — not yet established" if no diagnostic work has been done.]

**Evidence:**
- [signals that support the hypothesis — loss curves, regime breakdown, ablations, output inspection]
- [or "None yet — flying blind on model internals"]

**Open diagnostic questions:**
- [experiments or measurements that would confirm or deny the hypothesis]

## What Has Been Tried

| Approach | Outcome | Impl. Confidence | Failure Mode | Notes |
|----------|---------|-----------------|--------------|-------|
| [approach] | [FAILED/FIXED/CHANGED/TAINTED/REMOVED/DEBUNKED] | [High/Med/Low/Unknown] | [mechanistic reason it failed — or "Unknown"] | [detail] |

## Open Questions / Active Frontiers
- [question or active hypothesis]

## Update Log

| Date | Change |
|------|--------|
| [YYYY-MM-DD] | Initial context created |
```

---

## Step 1 — Classify (silently)

Classify the query. **MODEL_DEV is the primary classification** for this skill — use it when the query is about model performance, improvement, understanding what the model is learning, why metrics are where they are, or what to try next.

**MODEL_DEV sub-types (choose one):**
- **MODEL_DEV:CEILING** — model has learned something but plateaued; metrics stuck well below target
- **MODEL_DEV:RANDOM** — model isn't learning the target; metrics at chance level
- **MODEL_DEV:OVERFIT** — good train performance, poor val; generalization failure
- **MODEL_DEV:REGIME** — works in some conditions, fails in others; distribution shift
- **MODEL_DEV:SIGNAL** — questions about whether features or label construction are informative
- **MODEL_DEV:DYNAMICS** — training instability, gradient issues, loss divergence, convergence problems

**Other classifications (for non-model queries):**
- **DEBUGGING** — broken behaviour, unexpected numbers, regressions in pipeline/tooling
- **RESEARCH** — exploratory "what if" without a specific failure mode
- **TOOLING** — dev tooling, scripts, workflow, performance
- **EVALUATION** — metric methodology, backtesting setup, validation correctness

---

## Step 2 — Ask diagnostic questions

**Use AskUserQuestion to ask.** If the response appears auto-selected (see answer validation below), fall back to plain text. Generate options from context.md — use actual metric numbers, actual tried approaches. Do not generate generic options.

### For MODEL_DEV queries:

**Q1 — "Behavior pattern"** (what is the model actually doing right now?)

Options must include the actual current metric values from context.md. Core patterns:
- Learning nothing: metrics at chance level (e.g. 50% on binary, random baseline)
- Partial learning: stuck at [current]%, far from [target]% — ceiling failure
- Generalisation gap: learns in training, fails on val/test split
- Regime-dependent: works in [X regime], fails in [Y regime] — use specifics from context
- Other (let user specify)

**Q2 — "Prior failure confidence"** (how reliable is the failure history in context.md?)

This question is critical — it determines which "FAILED" entries are genuinely closed vs should be reconsidered.
- High — implementations were rigorous; prior failures are genuinely exhausted paths
- Mixed — some approaches were well-tested, others were quick experiments
- Low — many quick tests with uncertain implementations; the failures may not be real
- Unknown — can't judge without more information
(If context shows many failures with no implementation detail, surface this explicitly in the options)

**Q3 — "Model internals"** (what diagnostic signals exist?) multiSelect: true

This determines whether a hypothesis can be grounded or must remain provisional:
- Nothing systematic — flying blind; only top-level metrics available
- Training dynamics — loss curves, convergence behaviour, gradient norms
- Condition breakdown — performance by regime, time period, or input category
- Feature sensitivity — ablations, importance scores, attention patterns
- Output inspection — can examine samples, predictions, or generated trajectories qualitatively
- Calibration — model confidence vs actual accuracy

### For non-MODEL_DEV queries:

Use the original format:
- **Q1 "Failure mode"** — what specifically are you seeing vs expecting (with actual numbers)
- **Q2 "Constraint"** (multiSelect) — what cannot change; use constraints from context.md as options
- **Q3** classification-specific: DEBUGGING → "Stage"; TOOLING → "Bottleneck"; EVALUATION → "Eval method"; RESEARCH → "Mechanism"

---

### Answer validation + hybrid fallback

After AskUserQuestion returns, validate the response:

**Auto-selection detection**: The response is likely auto-selected if ANY of these are true:
- All answers are empty or whitespace-only
- Every answer matches the first option exactly (signs of `dontAsk` mode auto-selecting defaults)
- The response was dismissed or skipped

**If answers appear genuine** → proceed to Step 3 with the answers.

**If answers appear auto-selected AND AskUserQuestion is available** → re-ask as formatted plain text:

---
Netrunner needs your input. Reply with answers (e.g., `Q1: 2, Q2: 1,3, Q3: 1`):

**Q1 — [header]**: [options as numbered list]
**Q2 — [header]**: [options as numbered list]
**Q3 — [header]**: [options as numbered list]
---

**STOP HERE.** Wait for the user to reply, then parse answers and proceed to Step 3.

**If AskUserQuestion is unavailable** (permissions suppressed / bypass mode / tool not available), OR if answers appear auto-selected and AskUserQuestion is also unavailable:

Infer answers from context.md and conversation history. Primary source: context.md structured data. Secondary source: conversation history (fills gaps).

**For MODEL_DEV queries:**
- **Q1 (Behavior pattern)**: Read Current State table. Find the largest metric-to-target gap. State it mechanistically with EXACT numbers: "[metric] at [current] vs [target] — [what this means about model behavior]". Example: "dir_acc at 52% vs 75% target — direction accuracy plateau; PathHead adds only +2% over random baseline"
- **Q2 (Prior failure confidence)**: Scan Impl. Confidence column in What Has Been Tried. Majority High → "High". Majority Unknown → "Low". Mixed → "Mixed". Include count: "[N] entries High, [M] Unknown"
- **Q3 (Model internals)**: Read Diagnostic State section. Map evidence entries to signal categories (training dynamics, condition breakdown, feature sensitivity, output inspection, calibration). No evidence → "Nothing systematic — flying blind"

**For non-MODEL_DEV queries:**
- **Q1 (Failure mode)**: Largest metric-to-target gap from Current State with exact numbers
- **Q2 (Constraint)**: All entries from Hard Constraints table with their specific details
- **Q3 (Classification-specific)**: Infer from classification type + most recent What Has Been Tried entries

**CRITICAL — expert depth (NEVER violate):** Use EXACT numbers, metric names, constraint details, and specific values found in context.md. NEVER summarize "dir_acc at 52% vs 75% target" as "model underperforming". NEVER summarize "Full retrain ~6h+" as "training is expensive". The specificity IS the value.

**Thin context handling:**
- No context.md → Infer from conversation only. Prefix response: "No Netrunner context found — inference from conversation only. Run `/nr init` for better results."
- Thin context (<3 tried entries) → Best-effort inference, mark uncertain answers as `[low confidence]`
- No context + no conversation signals → Classification-type defaults with warning: "Limited context — answers are generic defaults. Results will improve with `/nr init`."

Display the inferred answers:

```
INFERRED FROM CONTEXT:
[Q1 header] → [inferred value with specific numbers from context]
[Q2 header] → [inferred value with reasoning]
[Q3 header] → [inferred value referencing evidence]
[Inferred from context — re-run with `-- Q1: X | Q2: Y | Q3: Z` to override]
```

Then proceed to Step 3 with these inferred answers.

**Inline `--` syntax** is still supported as a direct bypass:
e.g., `/nr [query] -- Q1: [answer] | Q2: [answer] | Q3: [answer]`
Parse answers after `--` and use them to populate the constraint frame directly. This skips AskUserQuestion entirely.

---

## Step 3 — Diagnose, hypothesize, and produce response

### For MODEL_DEV:

**First — state the active constraint frame:**

```
QUERY (reframed): [original query rewritten with precision]
METRICS IN SCOPE: [concrete success criteria from answers + context]
CONSTRAINTS ACTIVE: [what cannot change]
CLOSED PATHS (high-confidence failures): [approaches with High impl. confidence — excluded from suggestions]
UNCERTAIN FAILURES (low/unknown confidence): [approaches not yet reliably tested — NOT excluded; flag for reinvestigation if relevant]
DIAGNOSTIC VISIBILITY: [what we know about model internals from Q3 answers]
```

**Then — mandatory diagnostic hypothesis:**

Do not skip this. If evidence is thin, state the hypothesis as provisional and say so.

```
DIAGNOSTIC HYPOTHESIS
─────────────────────
The model is [behavioral description] because [mechanistic cause].

Evidence: [what from context.md + Q3 answers supports this]
Bottleneck: [what specifically needs to change for improvement]
Falsification test: [one concrete experiment that would confirm or deny this hypothesis]
```

The hypothesis must answer: **what knowledge is the model missing, and why is it missing it?** Not what to try — what is actually happening inside the model.

**Then — avenues (2–3):**

Each avenue must derive from the diagnostic hypothesis. Do not suggest approaches that are not causally connected to the identified bottleneck. Do not suggest high-confidence failures.

**Avenue [N]: [Name]**
- **Mechanism**: how this directly addresses the bottleneck identified in the hypothesis
- **Expected gain**: concrete estimate (e.g. "+3–5% hit rate" — not "might help")
- **Risk**: what could go wrong or why it might not transfer to this specific model/data
- **Implementation risk**: how easy is it to implement this incorrectly? (High / Med / Low) — name the specific failure modes to watch for
- **Verification**: how to confirm it worked AND how to confirm it failed *correctly* (i.e. the approach is wrong, not the implementation)
- **Effort**: rough cost

**Recommendation**: which avenue to try first — prioritise by (1) falsification value for the hypothesis, (2) implementation risk (low is better), (3) effort. Not by effort alone.

### For non-MODEL_DEV queries:

Standard format: constraint frame → current state analysis → 2–3 avenues (mechanism / gain / risk / effort) → recommendation.

---

## Step 4 — Update context

After producing the response, update `.claude/netrunner/context.md` with new knowledge from this session.

**Always:**
- `Diagnostic State` — revise the behavior hypothesis if the session surfaced new understanding of what the model is doing. If hypothesis is now better grounded, update evidence list.
- `Update Log` — one-line entry with today's date

**When applicable:**
- New metric numbers → update Current State
- New constraint → add to Hard Constraints
- New approach tried with outcome → add to What Has Been Tried
- Open question answered or new question emerged → update Open Questions / Active Frontiers

**Critical rule when recording failures:**
Never write `FAILED` without also recording:
1. `Impl. Confidence` — how confident are we the implementation was correct?
2. `Failure Mode` — mechanistic hypothesis for why it failed (not just "it didn't work")

A failure recorded as `Unknown` confidence is not evidence the approach is wrong — it is evidence we need a cleaner test. Do not let low-confidence failures permanently close off avenues.

</process>

<success_criteria>
- For MODEL_DEV: diagnostic hypothesis stated before avenues, grounded in behavior pattern + diagnostic signals
- Hypothesis answers "what knowledge is the model missing and why" — not "what should we try"
- Avenues derive mechanistically from the hypothesis bottleneck
- Constraint frame separates high-confidence failures (closed) from uncertain failures (not closed)
- Each avenue includes implementation risk with named failure modes, and a verification step
- Questions appeared as UI elements with context-specific options (actual numbers, actual approaches)
- Context updated: diagnostic state revised, impl. confidence captured on any new failures
- No avenues that repeat high-confidence failures or violate hard constraints
</success_criteria>

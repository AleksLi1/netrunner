# Brain Reasoning Protocol

## Overview
The Netrunner brain is the active decision-maker throughout the entire build lifecycle. This document describes how the brain reasons at every decision point, with worked examples, decision trees, and quality checks that ensure expert-level reasoning.

## When Brain Reasoning Triggers
1. Before planning any phase
2. During execution when problems arise
3. During verification
4. At phase transitions
5. When user asks diagnostic questions (/nr)
6. During scoping (/nr:scope)

## The Reasoning Step

### 1. LOAD STATE
- Read CONTEXT.md (full diagnostic model)
- Read all prior SUMMARY.md files (what was built)
- Read all prior VERIFICATION.md files (what passed/failed)
- Read current phase goal + success criteria from ROADMAP.md

### 2. CLASSIFY THIS MOMENT
- What type of decision is needed?
  - Approach selection (choosing between options)
  - Error diagnosis (something failed)
  - Scope adjustment (requirements changed or new info)
  - Quality assessment (is this good enough?)
- What domain is active? (apply relevant overlay)
- **Quant finance detection:** If project involves trading, financial modeling, or quantitative strategy development → activate quant persona from `references/quant-finance.md`. This heightens skepticism, enforces temporal discipline, and adds trading-specific reasoning gates (lookahead audit, validation integrity, execution realism).

### 3. ACTIVATE CONSTRAINTS
- Hard constraints from CONTEXT.md -> absolute limits, NEVER violate
- Closed paths from "What Has Been Tried" (high confidence failures) -> forbidden
- Prior decisions from Decision Log -> consistency check
- Current hypothesis -> alignment check

### 4. REASON
The brain MUST produce explicit reasoning:
- "Given [constraints], [prior outcomes], [current state], [hypothesis]..."
- "The best approach for this phase is [X] because [causal reasoning]"
- "I'm choosing [X] over [Y] because [Y] conflicts with [constraint/prior failure]"
- Reasoning must be SPECIFIC to this project's state, not generic advice

### 5. DECIDE
- Write decision to CONTEXT.md Decision Log with full reasoning
- Generate constraint frame for downstream agent:
  - What MUST happen (requirements)
  - What MUST NOT happen (constraints)
  - What to PREFER (reasoning-informed preferences)
  - What was TRIED and FAILED (closed paths)

### 6. RECORD (after execution)
- Add approach + outcome to "What Has Been Tried"
- Update hypothesis if evidence changed
- Update constraints if new limits discovered
- Update metrics if measurable change
- Add to Update Log

---

## Worked Examples

These examples show the full brain reasoning protocol applied to realistic scenarios. Each demonstrates how LOAD, CLASSIFY, ACTIVATE, REASON, DECIDE, and RECORD work together.

### Example 1: Phase Planning Decision

```
CONTEXT: Building a REST API. Phase 3 is "Authentication." Phase 2 (Database Schema)
discovered that the users table has no email column.

LOAD: Prior phases show database schema is simpler than expected. CONTEXT.md
constraint: "Must support OAuth providers."

CLASSIFY: approach_selection — choosing auth implementation

ACTIVATE CONSTRAINTS:
- Hard: "Must support OAuth providers"
- Closed: None yet
- Prior decisions: "PostgreSQL chosen in Phase 1" → JWT storage in DB viable

REASON: "Given the constraint for OAuth providers, and that Phase 2 revealed no
email column, I need to add email to the schema migration AND implement OAuth.
The original plan had basic JWT auth only. Adjusting Phase 3 scope to include
OAuth + email migration."

DECIDE: Expand Phase 3 scope. Add schema migration task before auth implementation.
Constraint frame for planner: MUST include OAuth, MUST add email column,
PREFER Passport.js for OAuth (team familiarity from Domain Knowledge).

RECORD: Decision Log: "Phase 3 expanded to include OAuth + email migration
based on Phase 2 schema discovery"
```

**Why this example matters:** It shows how a discovery in Phase 2 (missing email column) cascades into Phase 3 planning. The brain does not just plan Phase 3 in isolation — it integrates prior phase outcomes into the decision. Without brain reasoning, the planner would have generated an auth plan that silently fails because there is no email column to authenticate against.

### Example 2: Execution Problem Diagnosis

```
CONTEXT: ML model training. Phase 4 executor reports: "Training loss NaN after
epoch 15. Was decreasing normally before that."

LOAD: CONTEXT.md shows prior approaches tried gradient clipping (didn't help).
Hypothesis: "Model struggles with regime transitions in data."

CLASSIFY: error_diagnosis — training failure

ACTIVATE CONSTRAINTS:
- Hard: "6h retrain budget" (can't afford long debugging)
- Closed: "Gradient clipping alone insufficient" (high confidence)
- Prior: "Baseline achieves 0.8 Sharpe" → signal exists in data

REASON: "NaN at epoch 15 (not immediately) suggests accumulating instability,
not bad initialization. Gradient clipping was tried and failed → the issue is
likely in the data, not the gradients. Given the regime transition hypothesis,
epoch 15 may be when the model first encounters a different market regime.
The feature scales likely differ drastically between regimes."

DECIDE: Add per-regime normalization layer before transformer input.
This directly addresses the hypothesis AND explains why gradient clipping
failed (the issue is feature scale, not gradient magnitude).

RECORD: Add to tried: "Gradient clipping alone" → Failed, High confidence.
Update hypothesis: "Feature scale heterogeneity across regimes causes
training instability at epoch ~15 when regime transition data is encountered."
```

**Why this example matters:** It shows the brain closing a path (gradient clipping) with high confidence and reasoning causally about WHY it failed, not just THAT it failed. The replacement approach is chosen because it addresses the causal mechanism, not because it is a generic "next thing to try."

### Example 3: Verification Gap Assessment

```
CONTEXT: Web app. Phase 5 (Search Feature) verification shows: Tests pass,
but "search returns results" test doesn't check result relevance.

LOAD: CONTEXT.md hypothesis: "Full-text search sufficient for current scale."
Success criteria: "Search returns relevant results in <200ms."

CLASSIFY: quality_assessment — verification has gaps

ACTIVATE CONSTRAINTS:
- Hard: "PostgreSQL only" (no Elasticsearch)
- Closed: None
- Prior: "Phase 3 established <100K records" → FTS sufficient at this scale

REASON: "Tests verify that search RETURNS results but not that results are
RELEVANT. The success criterion says 'relevant results' — we're testing
function, not quality. However, given the constraint that PostgreSQL FTS
is our only option AND the scale is <100K records, relevance is largely
determined by the tsvector configuration. Need a test with known data
that verifies ranking order."

DECIDE: One auto-retry: add a relevance test with seeded data that verifies
search ranking. If FTS ranking is poor, note it as a constraint for future
phases but don't block — 'relevant' at this scale means 'contains the term.'

RECORD: Add to tried: "Basic search functionality" → Passed but relevance
untested. Update hypothesis: "FTS sufficient but relevance quality unverified."
```

**Why this example matters:** It shows the brain distinguishing between "tests pass" and "success criteria met." The verification technically passes, but the brain catches a quality gap by reasoning about what the success criteria actually require versus what the tests actually check.

---

## Decision Trees

These trees encode the brain's decision logic at common branch points. Walk through them in order — stop at the first match.

### "Should this phase be skipped?"
1. Has a prior phase made this phase's goal redundant? → **Skip** (log reason)
2. Has the diagnostic hypothesis changed making this phase irrelevant? → **Skip** (log reason)
3. Is this phase blocked by a constraint discovered later? → **Skip** (log constraint)
4. Is this phase's approach invalidated by prior failures? → **Modify**, don't skip
5. None of the above → **Execute as planned**

Example: Phase 4 was "Add Redis caching." Phase 3 discovered response times are already <50ms. Phase 4's goal (improve response time) is redundant. Skip with log: "Phase 3 achieved target response times without caching."

### "Should I insert a new phase?"
1. Did verification reveal a gap that can't be fixed with retry? → **Insert** remediation phase
2. Did execution discover a prerequisite that wasn't anticipated? → **Insert before** current phase
3. Has scope grown beyond what remaining phases can handle? → **Insert** additional phase
4. Is there a risk that should be validated before continuing? → **Insert validation phase**
5. None of the above → **Continue** with existing roadmap

Example: Phase 2 verification reveals the database schema works but has no indexes. Phase 3 (API endpoints) will be slow without indexes. Insert Phase 2.5: "Add database indexes" before Phase 3.

### "How do I handle a constraint violation?"
1. Is the constraint truly hard (not soft)? → **Never violate** — find another way
2. Can the approach be modified to satisfy the constraint? → **Modify** approach
3. Is there an alternative approach that avoids the constraint entirely? → **Switch** approach
4. Does the constraint need to be re-evaluated given new evidence? → **Log reasoning**, update
5. No path forward → **Escalate** to user with diagnosis

Example: Hard constraint "PostgreSQL only." Proposed approach uses MongoDB. Steps 1-3: Can we achieve the same with PostgreSQL's JSONB? If yes, modify. If no, escalate: "This feature requires document storage patterns that PostgreSQL JSONB handles poorly at this scale. Options: relax constraint, reduce feature scope, or accept performance trade-off."

### "Is the hypothesis still valid?"
1. Has new evidence directly contradicted the hypothesis? → **Replace** with new hypothesis
2. Has evidence weakened the hypothesis but not disproved it? → **Lower confidence**, continue
3. Has evidence supported the hypothesis? → **Raise confidence**, continue
4. Has the hypothesis become irrelevant to current work? → **Archive**, form new one
5. No new evidence either way → **Maintain**, but note staleness

### "Should I retry or move on?"
1. Did the failure reveal a clear, fixable cause? → **Retry** with specific fix
2. Was this the second failure of the same approach? → **Move on**, close the path
3. Is the failure intermittent/non-deterministic? → **Retry once**, then investigate environment
4. Does fixing this block all downstream phases? → **Retry** with higher priority
5. Can downstream phases proceed without this? → **Move on**, log as known issue

---

## Context Evolution Patterns

The brain's reasoning quality evolves predictably across phases. Understanding these patterns helps calibrate confidence and decision-making strategy.

### Early Phases (1-2): Discovery
- Context is sparse, confidence is low
- Decisions are exploratory ("let's try X to learn")
- Hypothesis is broad ("the main challenge is probably X")
- Many open questions
- **Brain strategy:** Make reversible decisions. Prefer approaches that generate learning even if they fail. Keep options open.
- **Common mistake:** Over-committing to an architecture before enough evidence exists.

### Middle Phases (3-5): Convergence
- Context is rich, confidence is medium
- Decisions are informed ("given A from Phase 2, we should B")
- Hypothesis is specific ("the root cause is X because Y")
- Open questions are narrow and testable
- **Brain strategy:** Start closing paths aggressively. Lock in decisions that have evidence. Narrow the solution space.
- **Common mistake:** Ignoring early-phase evidence that contradicts the current approach.

### Late Phases (6+): Refinement
- Context is dense, confidence is high
- Decisions are precise ("Phase 7 needs exactly X because Y and Z")
- Hypothesis is validated or replaced
- Remaining questions are edge cases
- **Brain strategy:** Optimize, don't explore. Every decision should reference specific prior evidence. Avoid introducing new unknowns.
- **Common mistake:** Reopening settled decisions without strong new evidence.

### Regression Signals
These patterns indicate the brain's context model may be degrading:

- **Confidence drops suddenly** → Something invalidated assumptions → Re-examine the last 2 phases for missed signals
- **New hard constraint discovered late** → May need to revisit earlier decisions → Trace which decisions assumed the constraint did not exist
- **Metric moving wrong direction** → Hypothesis may be wrong → Lower hypothesis confidence, consider alternatives
- **Same error recurring** → A closed path is being repeated → Check if the path was properly recorded with high confidence
- **Decisions contradicting each other** → Context model is inconsistent → Full context reload and reconciliation needed

---

## Reasoning Quality Checks

The brain's reasoning should pass ALL of these checks. If any check fails, the reasoning must be revised before a decision is made.

### 1. Causal, not correlational
- **Pass:** "X causes Y because [mechanism]"
- **Fail:** "X happens with Y" or "X is associated with Y"
- **Fix:** Identify the causal mechanism. If none exists, the reasoning is speculation — label it as such.

### 2. Specific, not generic
- **Pass:** "For THIS project, because Phase 2 showed Z, we should X"
- **Fail:** "Generally, X is a good practice" or "Best practice suggests X"
- **Fix:** Ground every claim in specific project evidence. If no project evidence exists, say so and note low confidence.

### 3. Evidence-based, not opinion
- **Pass:** "Phase 2 showed X (VERIFICATION.md line 14)" or "The error log shows Y"
- **Fail:** "I think X" or "X seems right" or "X should work"
- **Fix:** Cite the specific artifact, phase, or data point. If no evidence exists, explicitly state "no evidence — low confidence."

### 4. Constraint-aware
- **Pass:** Every decision explicitly references which constraints it satisfies or navigates
- **Fail:** Decision is made without mentioning constraints
- **Fix:** Before finalizing, enumerate all active constraints and verify the decision does not violate any.

### 5. Falsifiable
- **Pass:** The reasoning implies what would DISPROVE it ("If we see X, this approach is wrong")
- **Fail:** The reasoning is unfalsifiable ("This should help")
- **Fix:** Add a falsification condition. Every hypothesis and approach should have a "I'd abandon this if..." clause.

### 6. Traceable
- **Pass:** Can follow the complete chain: evidence → reasoning → decision → expected outcome
- **Fail:** Decision appears without clear reasoning, or reasoning appears without clear evidence
- **Fix:** Fill in the missing links. If a link genuinely does not exist (no evidence), make that gap explicit.

### Applying the Checks
When reasoning is produced, run through all 6 checks quickly:
```
REASONING: "We should use WebSockets for real-time updates."

CHECK 1 (Causal): WHY do WebSockets cause better real-time? → Need mechanism
CHECK 2 (Specific): Is this for THIS project? → Need project-specific justification
CHECK 3 (Evidence): What evidence? → Need data point
CHECK 4 (Constraints): Any constraints about protocols? → Need to check
CHECK 5 (Falsifiable): When would this be wrong? → Need failure condition
CHECK 6 (Traceable): Can I trace this? → evidence → reasoning → decision?

REVISED: "Given the Phase 3 requirement for <100ms update latency (ROADMAP.md)
and the hard constraint of 'browser-only clients' (CONTEXT.md), WebSockets
provide persistent connections that eliminate HTTP overhead. SSE was considered
but CONTEXT.md notes bidirectional communication is needed for Phase 6.
This would be wrong if: latency requirements relax to >1s, or if the
deployment environment blocks WebSocket upgrades."
```

---

## Pre-Generation Gate
Applied at EVERY output point:

1. **Constraint check:** Does this violate any Hard Constraint from CONTEXT.md?
   -> If yes: DISCARD and regenerate
2. **Closed path check:** Does this repeat a high-confidence failure?
   -> If yes: DISCARD and find alternative
3. **Specificity check:** Is this generic advice, or causally specific to THIS project?
   -> If generic: ENHANCE with project-specific reasoning
4. **Hypothesis alignment:** Does this move toward resolving the active hypothesis?
   -> If not: JUSTIFY why diverging, or ADJUST to align

## Phase Transition Protocol
At every phase boundary:
1. Read all artifacts from completed phase
2. Update CONTEXT.md:
   - Add tried approaches with outcomes
   - Add any new constraints discovered
   - Update diagnostic hypothesis with new evidence
   - Add decision log entry
   - Update metrics
3. Re-read ROADMAP.md (catch inserted phases)
4. Evaluate: "Is the overall approach still on track?"
   - If yes: continue to next phase
   - If no: can INSERT new phases, REORDER remaining, or SKIP phases
5. Generate transition summary

## Context Evolution
The brain gets SMARTER as it goes:
- Phase 1 has minimal context -> decisions based on initial analysis
- Phase 2 has Phase 1 outcomes -> more informed decisions
- Phase N has N-1 phases of accumulated knowledge -> expert-level decisions
- Each failure enriches the constraint set -> fewer mistakes
- Each success validates the hypothesis -> higher confidence

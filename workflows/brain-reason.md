# Brain Reasoning Workflow

This workflow executes the brain reasoning protocol at any decision point.

## Inputs
- `phase`: Current phase number (optional)
- `trigger`: What triggered reasoning (plan|execute|verify|transition|query)
- `question`: Specific question to reason about (optional)

## Steps

### Step 1: Load Context
Read `.planning/CONTEXT.md` using `nr-tools.cjs brain load`
If no CONTEXT.md exists, note this and proceed with limited context.

### Step 2: Load Phase History
For each completed phase (from .planning/phases/):
- Read SUMMARY.md (what was built)
- Read VERIFICATION.md (what passed/failed)
Compile into a concise "prior outcomes" summary.

### Step 3: Load Current Phase
If phase is specified:
- Read phase section from ROADMAP.md: `nr-tools.cjs roadmap get-phase <N>`
- Read phase CONTEXT.md if exists
- Read any existing PLAN.md files

### Step 4: Classify
Determine what type of decision is needed:
- approach_selection: Choosing between implementation options
- error_diagnosis: Something failed, need root cause
- scope_adjustment: New information requires plan changes
- quality_assessment: Evaluating if work meets standards
- phase_planning: Planning what a phase should do

### Step 4b: Determine Workflow Mode

After classification, determine the workflow mode based on project state and user intent.
This mode tells `/nr:run` which workflow to invoke.

```
WORKFLOW_MODES:
- NEW_PROJECT — No .planning/ exists, user describes a project
- QUICK_DEBUG — No .planning/ exists, user describes a bug/fix
- CONTINUE — .planning/ exists with incomplete phases, user says "continue" or empty prompt
- EXTEND — .planning/ exists, user wants new feature/addition
- DEBUG — .planning/ exists, user describes a bug/fix
- EXPLICIT — .planning/ exists, user says "phase N" explicitly
- QUICK_TASK — .planning/ exists, user describes bounded single task
```

**Detection logic:**

1. Check for `.planning/` directory existence:
   - Does NOT exist → NEW_PROJECT or QUICK_DEBUG
   - EXISTS → CONTINUE, EXTEND, DEBUG, EXPLICIT, or QUICK_TASK

2. When `.planning/` does NOT exist:
   - User describes an error, bug, or fix → `QUICK_DEBUG`
   - User describes a project, feature, or system → `NEW_PROJECT`

3. When `.planning/` EXISTS:
   - User prompt is empty or says "continue", "go", "next" → `CONTINUE`
   - User says "phase N" or "do phase N" → `EXPLICIT`
   - User describes an error, bug, failure, or "X doesn't work" → `DEBUG`
   - User describes a new feature, addition, or extension → `EXTEND`
   - User describes a small, bounded task (single file change, config tweak, rename) → `QUICK_TASK`
   - Ambiguous → default to `CONTINUE` if phases are incomplete, else `EXTEND`

4. Read `.planning/STATE.md` to determine current position:
   - If all phases complete → `EXTEND` (project is done, user wants more)
   - If current phase has incomplete plans → `CONTINUE`
   - If current phase is complete but next exists → `CONTINUE`

**Output:** Set `WORKFLOW_MODE` for downstream routing by `/nr:run`.

### Step 5: Activate Constraints
Extract from CONTEXT.md:
- Hard constraints (absolute limits)
- Closed paths (high-confidence failures to avoid)
- Prior decisions (for consistency)
- Active hypothesis (for alignment)

### Step 6: Reason
Produce explicit reasoning following the format:
"Given [constraints], [prior outcomes], [current state], [hypothesis],
the best approach is [X] because [causal reasoning]."

### Step 7: Generate Constraint Frame
Output a constraint frame for downstream agents:
```
CONSTRAINT FRAME:
MUST: [requirements]
MUST NOT: [constraints + closed paths]
PREFER: [reasoning-informed preferences]
CONTEXT: [relevant prior outcomes]
HYPOTHESIS: [current diagnostic hypothesis]
```

### Step 8: Record Decision
Update CONTEXT.md with the decision and reasoning:
`nr-tools.cjs brain add-decision '{"phase":"N","decision":"...","reasoning":"..."}'`

---

## Trigger-Specific Behavior

### trigger: plan
- Focus on approach selection for the upcoming phase
- Generate constraint frame that will be embedded in PLAN.md
- Prioritize avoiding closed paths and respecting hard constraints
- Evaluate whether the phase goal is still relevant given prior outcomes
- If the phase was planned before significant discoveries, adjust scope

### trigger: execute
- Focus on error diagnosis or scope adjustment
- Check if current approach conflicts with constraints
- Recommend course correction if needed
- When diagnosing errors, always check closed paths first to avoid repeating failures
- Distinguish between "this approach failed" and "this approach was implemented incorrectly"

### trigger: verify
- Focus on quality assessment
- Compare outcomes against must-haves and success criteria
- Determine if phase goals were met
- Check for gaps between "tests pass" and "success criteria satisfied"
- Identify any new constraints or closed paths revealed by verification

### trigger: transition
- Focus on context evolution and phase boundary management
- Compile all outcomes from the completing phase
- Update CONTEXT.md with: tried approaches, new constraints, hypothesis evolution
- Evaluate: "Is the overall approach still on track?"
- If not: determine whether to insert, reorder, or skip phases
- Generate transition summary for the Update Log
- Recalculate confidence levels across all active hypotheses
- Check if any previously closed paths should be reopened given new evidence

### trigger: query
- Focus on answering the user's specific question
- Load relevant context sections (not everything)
- Apply classification to the question itself
- Produce reasoning that directly addresses the query
- Record the question and answer in Update Log if it changes understanding
- If the query reveals a gap in the brain's context model, note it for the next phase
- Never give generic answers — every response must reference THIS project's state

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

---

## Edge Cases

### No CONTEXT.md exists
- Proceed with minimal context
- After reasoning, suggest creating CONTEXT.md via `/nr init`
- Do NOT block on missing context — degrade gracefully
- Mark all decisions as "Low" confidence due to missing context
- If the trigger is `plan`, recommend running `/nr:run` to set up the project first

### Conflicting constraints
- If two hard constraints conflict: flag to user, do not choose
  - Present both constraints with their sources
  - Explain why they conflict with specific reasoning
  - Offer options: relax one constraint, find a creative third path, or reduce scope
- If hard constraint conflicts with closed path: hard constraint wins
  - The closed path may need to be reopened with a different approach
  - Log: "Reopening closed path X because hard constraint Y requires it"
- If two closed paths suggest opposite solutions: escalate, test both hypotheses
  - Design a minimal experiment that distinguishes between them
  - The experiment becomes a new phase or sub-task

### Hypothesis has no evidence
- If diagnostic hypothesis has zero evidence for/against:
  - Confidence must be "Low"
  - Recommend a validation task before major investment
  - The constraint frame should include "UNVALIDATED HYPOTHESIS — verify early"
  - Design the first phase to produce evidence for or against the hypothesis
  - Set explicit criteria: "If Phase N shows X, hypothesis is supported; if Y, hypothesis is rejected"

### Context is very large (10+ phases)
- Summarize rather than load everything
- Focus on: last 3 phases, all high-confidence failures, all hard constraints
- Use `nr-tools.cjs brain summary` for compact representation
- When referencing older phases, cite phase number and specific finding
- If a decision depends on something from an early phase, load that specific phase's artifacts

### Multiple valid approaches
- When reasoning produces 2+ equally valid approaches:
  - Pick the one with lower risk (reversible > irreversible)
  - If equal risk: pick the one that generates more learning
  - If equal learning: pick the one that is simpler to implement
  - Log alternative approaches in Decision Log with reasoning for rejection
  - Include "pivot trigger": conditions under which the chosen approach should be abandoned in favor of the alternative

### Stale context
- If the most recent phase update is significantly old (user returned after a break):
  - Re-read all artifacts, do not rely on summary alone
  - Ask: "Has anything changed outside of Netrunner since the last phase?"
  - Mark any time-sensitive constraints for re-evaluation

### Cascading failures
- If Phase N fails and Phase N+1 depends on it:
  - Do NOT skip to Phase N+1 hoping it will work
  - Either retry Phase N with a different approach, or insert a remediation phase
  - Trace the dependency chain: which downstream phases are affected?
  - Update the roadmap to reflect the blocked state

---

## Tool Integration

These are the exact `nr-tools.cjs` calls for each step of the workflow.

### Step 1 (Load Context)
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain load
node ~/.claude/netrunner/bin/nr-tools.cjs brain summary   # for compact version
```

### Step 5 (Activate Constraints)
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain get-constraints
node ~/.claude/netrunner/bin/nr-tools.cjs brain get-closed-paths
```

### Step 7 (Check Constraint Frame)
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain check-constraint "proposed approach text"
```

### Step 8 (Record)
```bash
# Record a decision
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-decision '{"phase":"N","decision":"...","reasoning":"..."}'

# Update the diagnostic hypothesis
node ~/.claude/netrunner/bin/nr-tools.cjs brain update-hypothesis --hypothesis "..." --evidence '{"for":[],"against":[]}' --confidence "Medium"

# Record a tried approach
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried '{"approach":"...","outcome":"...","confidence":"High","failure_mode":"...","phase":"N"}'

# Add to update log
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-update-log --phase N --change "description of what changed"
```

### Full Workflow Example
A complete brain reasoning pass using tools:
```bash
# 1. Load context
node ~/.claude/netrunner/bin/nr-tools.cjs brain load

# 2. Get phase info
node ~/.claude/netrunner/bin/nr-tools.cjs roadmap get-phase 3

# 3. Get constraints (for Step 5)
node ~/.claude/netrunner/bin/nr-tools.cjs brain get-constraints
node ~/.claude/netrunner/bin/nr-tools.cjs brain get-closed-paths

# 4-6. Classify, Reason (done by the brain, not tools)

# 7. Validate the proposed approach against constraints
node ~/.claude/netrunner/bin/nr-tools.cjs brain check-constraint "Use WebSockets for real-time data feed"

# 8. Record the decision
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-decision '{"phase":"3","decision":"Use WebSockets for real-time feed","reasoning":"Hard constraint requires <100ms latency, SSE insufficient for bidirectional needs in Phase 6"}'

# 8b. Update hypothesis if evidence changed
node ~/.claude/netrunner/bin/nr-tools.cjs brain update-hypothesis --hypothesis "WebSocket approach viable for real-time requirements" --evidence '{"for":["Phase 2 latency tests show <50ms with WS"],"against":[]}' --confidence "Medium"
```

---

## Context Evolution

The brain accumulates knowledge across phases:

| Phase | Context Quality | Decision Basis |
|-------|----------------|----------------|
| 1 | Minimal | Initial analysis + user input |
| 2 | Growing | Phase 1 outcomes + initial constraints |
| 3 | Substantial | 2 phases of evidence + refined hypothesis |
| N | Expert | N-1 phases of knowledge + validated constraints |

Each phase transition enriches:
- "What Has Been Tried" -> more closed paths, fewer mistakes
- Decision Log -> more consistency, better pattern recognition
- Hypothesis -> higher confidence, more targeted approaches
- Constraints -> tighter bounds, more efficient exploration

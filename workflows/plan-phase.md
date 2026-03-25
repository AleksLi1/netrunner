# Workflow: Plan Phase

<purpose>
Create a detailed execution plan for a specific phase. The Brain (CONTEXT.md) reasons about the phase's core challenge, generates a constraint frame, and guides the planner to produce a plan that respects project constraints and leverages accumulated knowledge.
</purpose>

<inputs>
- Phase number to plan
- ROADMAP.md -- phase goal, success criteria, dependencies
- CONTEXT.md -- constraints, tried approaches, diagnostic hypothesis
- REQUIREMENTS.md -- requirements assigned to this phase
- Prior phase summaries (if any)
</inputs>

<procedure>

## 1. Initialize

```bash
PHASE_ARG="${PHASE_NUMBER}"
INIT=$(node ~/.claude/netrunner/bin/nr-tools.cjs init plan-phase "${PHASE_ARG}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract from init JSON: `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `padded_phase`, `commit_docs`.

**Validation:**
- Phase must exist in ROADMAP.md. If not: "Phase [N] not found. Available phases: [list]"
- `.planning/` must exist. If not: abort -- project needs scoping first.

## 2. Parse and Normalize

Determine phase details:
- Phase number and name from ROADMAP.md
- Phase directory: `.planning/phases/{NN}-{slug}/`
- Phase goal and success criteria from ROADMAP.md
- Requirements assigned to this phase from REQUIREMENTS.md

## 3. Validate Phase

Check if phase is ready for planning:
- Prior phases should be complete (warn if not, do not block)
- Phase should not already have an approved plan (offer to re-plan if it does)

## 4. Brain Reasoning Step

Read CONTEXT.md + all prior phase summaries to reason about this phase.

### 4a. Classify this phase's core challenge

```
PHASE [N] ANALYSIS:
- Core challenge: [what makes this phase hard]
- Shape: [BUILD | FIX | OPTIMIZE]
- Domain: [which area of the system]
- Dependencies: [what this phase relies on from prior phases]
- Risks: [what could go wrong]
```

### 4b. Review accumulated knowledge

- What did prior phases discover?
- Any constraints added during execution?
- Any approaches proven to fail?
- Has the diagnostic hypothesis evolved?

### 4c. Generate constraint frame for planner

```
CONSTRAINT FRAME FOR PHASE [N]:
- Goal: [from roadmap, possibly refined by brain]
- Hard constraints: [from CONTEXT.md]
- Phase-specific constraints: [from brain reasoning]
- Closed paths: [high-confidence failures -- DO NOT suggest these]
- Integration requirements: [from prior phase outputs]
- Success criteria: [measurable, from roadmap]
```

## 5. Handle Research (if needed)

Brain evaluates: "Does this phase need research before planning?"

**Research triggers:**
- Phase involves technology not yet used in project
- Prior phases flagged knowledge gaps
- Brain's confidence in approach is Low
- Phase description suggests exploration needed

If research needed:

```
Task(
  subagent_type="nr-researcher",
  description="Research for Phase [N] planning",
  prompt="Research specific questions for Phase [N]: [phase name]

Questions:
[Brain's specific research queries]

Context:
[Relevant CONTEXT.md sections]

Constraints to respect:
[Hard constraints]

Return: actionable findings organized by question."
)
```

Integrate research findings into constraint frame.

## 6. Check Existing Plans

If phase directory already contains PLAN.md files:
- List existing plans
- Offer to re-plan from scratch or extend
- On re-plan: archive existing plans (rename with .bak suffix)

## 7. Spawn Planner Agent

```
Task(
  subagent_type="nr-planner",
  description="Create plan for Phase [N]: [name]",
  prompt="Create a detailed execution plan for Phase [N].

CONSTRAINT FRAME:
[Full constraint frame from brain reasoning]

PHASE CONTEXT:
- Goal: [from roadmap]
- Success criteria: [from roadmap]
- Requirements: [assigned REQ-IDs]
- Prior phase outputs: [relevant summaries]
- Research findings: [if any]

PLANNING RULES:
1. Every task must have clear success criteria
2. Group tasks into waves (parallel execution groups)
3. Wave 1 = no dependencies, Wave 2 = depends on Wave 1, etc.
4. Mark tasks that may need human input as 'checkpoint'
5. Include verification steps in the plan
6. Reference specific files/modules when possible

Write plan to: [phase_dir]/PLAN.md

Plan format:
---
phase: [N]
type: plan
autonomous: true
---

## Tasks

### Wave 1 -- [wave description]
- [ ] Task 1.1: [description] | Success: [criteria]
- [ ] Task 1.2: [description] | Success: [criteria]

### Wave 2 -- [wave description]
- [ ] Task 2.1: [description] | Success: [criteria] | Depends: 1.1
"
)
```

**Runtime note:** Use Claude Code `Task()` for subagent dispatch. If Task() is unavailable, execute the planner prompt inline.

## 8. Brain Reviews Plan (Pre-Generation Gate)

Before approving the plan, Brain checks:

1. **Constraint compliance:** Does every task respect the constraint frame?
2. **Closed path avoidance:** Does any task repeat a high-confidence failure?
3. **Coverage:** Do all success criteria from ROADMAP.md have corresponding tasks?
4. **Wave structure:** Are dependencies correctly captured?
5. **Specificity:** Are tasks concrete enough to execute? (No vague "implement X" without details)

If Brain rejects:
- Provide specific feedback to planner
- Re-spawn planner with feedback (max 2 revision iterations)

## 9. Commit Planning Artifacts

```bash
git add .planning/phases/${PADDED_PHASE}-*/PLAN.md
git commit -m "plan(phase-${PHASE}): create execution plan for ${PHASE_NAME}"
```

</procedure>

<outputs>
- `.planning/phases/{NN}-{slug}/PLAN.md` -- detailed execution plan with waves and tasks
- Updated CONTEXT.md (if research produced new constraints)
</outputs>

# Phase Transition Workflow

<internal_workflow>

**This is an INTERNAL workflow -- NOT a user-facing command.**

There is no `/nr:transition` command. This workflow is invoked automatically by
the run orchestrator during auto-advance, or inline after phase verification.
Users should never be told to run `/nr:transition`.

**Valid user commands:**
- `/nr` -- Diagnostic Q&A
- `/nr:run` -- Autonomous execution (handles all phase progression)
- `/nr:update` -- Self-update

</internal_workflow>

<required_reading>

**Read these files NOW:**

1. `.planning/STATE.md`
2. `.planning/PROJECT.md`
3. `.planning/ROADMAP.md`
4. `.planning/CONTEXT.md`
5. Current phase's plan files (`*-PLAN.md`)
6. Current phase's summary files (`*-SUMMARY.md`)

</required_reading>

<purpose>

Mark current phase complete and advance to next. This is the natural point where progress tracking, PROJECT.md evolution, and CONTEXT.md brain reasoning happen.

"Planning next phase" = "current phase is done"

</purpose>

<process>

<step name="load_project_state" priority="first">

Before transition, read project state:

```bash
cat .planning/STATE.md 2>/dev/null
cat .planning/PROJECT.md 2>/dev/null
cat .planning/CONTEXT.md 2>/dev/null
```

Parse current position to verify we're transitioning the right phase.
Note accumulated context that may need updating after transition.

</step>

<step name="verify_completion">

Check current phase has all plan summaries:

```bash
ls .planning/phases/XX-current/*-PLAN.md 2>/dev/null | sort
ls .planning/phases/XX-current/*-SUMMARY.md 2>/dev/null | sort
```

**Verification logic:**

- Count PLAN files
- Count SUMMARY files
- If counts match: all plans complete
- If counts don't match: incomplete

**If all plans complete:**

Auto-mode: proceed directly to cleanup_handoff step.
Interactive mode: Ask "Phase [X] complete -- all [Y] plans finished. Ready to mark done and move to Phase [X+1]?" and wait for confirmation.

**If plans incomplete:**

**SAFETY RAIL: always_confirm_destructive applies here.**
Skipping incomplete plans is destructive -- ALWAYS present:

```
Phase [X] has incomplete plans:
- {phase}-01-SUMMARY.md (complete)
- {phase}-02-SUMMARY.md -- Missing
- {phase}-03-SUMMARY.md -- Missing

Warning: Skipping plans requires confirmation (destructive action)

Options:
1. Continue current phase (execute remaining plans)
2. Mark complete anyway (skip remaining plans)
3. Review what's left
```

Wait for user decision.

</step>

<step name="cleanup_handoff">

Check for lingering handoffs:

```bash
ls .planning/phases/XX-current/.continue-here*.md 2>/dev/null
```

If found, delete them -- phase is complete, handoffs are stale.

</step>

<step name="brain_reasoning_at_transition">

**CRITICAL: This is where the brain reasons about phase transition.**

Execute brain reasoning protocol (see references/brain-protocol.md):

### 1. Load all artifacts from completed phase

```bash
cat .planning/phases/XX-current/*-SUMMARY.md 2>/dev/null
cat .planning/phases/XX-current/VERIFICATION.md 2>/dev/null
cat .planning/CONTEXT.md 2>/dev/null
```

Parse summaries for: approaches tried, decisions made, metrics changed, new constraints discovered, hypothesis-relevant evidence.

### 2. Update CONTEXT.md via brain CLI

**Add tried approaches** (one call per significant approach):
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried \
  '{"approach":"[what was tried]","result":"[SUCCESS|FAILED|PARTIAL]","implConfidence":"[High|Medium|Low]","failureMode":"[why it failed, if applicable]","phase":"[N]","date":"[YYYY-MM-DD]"}' \
  --cwd .
```

**Update diagnostic hypothesis** (if phase results change understanding):
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain update-hypothesis \
  "[new or refined hypothesis based on phase outcomes]" \
  "[evidence: list key observations from this phase]" \
  "[High|Medium|Low]" \
  --cwd .
```

**Add decision log entries** (one per significant decision):
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-decision \
  '{"phase":"[N]","decision":"[what was decided]","reasoning":"[why]","outcome":"[result]"}' \
  --cwd .
```

**Add update log entry:**
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-update-log \
  --phase "[N]" --change "[summary of what changed in this phase]" \
  --cwd .
```

**If new constraints discovered** during execution, edit `.planning/CONTEXT.md` directly to add rows to the Hard Constraints table.

**If metrics changed**, update via:
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain update-metrics \
  '{"[metric_name]":{"current":"[value]","target":"[value]"}}' \
  --cwd .
```

### 3. Evaluate trajectory

After CONTEXT.md is updated, reason about overall direction:
- Read updated CONTEXT.md — does the hypothesis still hold?
- Read remaining phases in ROADMAP.md — are they still the right next steps?
- If yes: continue to next phase
- If no: can INSERT new phases, REORDER remaining, or SKIP phases
  - Insert: Add phase to ROADMAP.md, create phase directory
  - Skip: Mark phase as skipped in ROADMAP.md with reason in CONTEXT.md
  - Reorder: Update phase numbers in ROADMAP.md

### 4. Generate transition assessment

Summarize for the orchestrator:
- What was learned in this phase (1-2 sentences)
- How it affects the remaining plan (any adjustments?)
- Updated constraint frame for next phase (new constraints, closed paths)

</step>

<step name="update_roadmap_and_state">

**Delegate ROADMAP.md and STATE.md updates to nr-tools:**

```bash
TRANSITION=$(node ~/.claude/netrunner/bin/nr-tools.cjs phase complete "${current_phase}")
```

The CLI handles:
- Marking the phase checkbox as `[x]` complete with today's date
- Updating plan count to final (e.g., "3/3 plans complete")
- Updating the Progress section in ROADMAP.md
- Advancing STATE.md position to next phase
- Clearing resolved blockers from STATE.md

</step>

<step name="evolve_project">

Update PROJECT.md based on phase outcomes:

1. **Requirements invalidated?** Move to Out of Scope with reason
2. **Requirements validated?** Move to Validated with phase reference
3. **New requirements emerged?** Add to Active
4. **Decisions to log?** Add to Key Decisions
5. **"What This Is" still accurate?** Update if drifted

</step>

<step name="determine_next">

Read ROADMAP.md to find next phase.

**Route A: More phases remain**

Brain routes to the next action automatically. The orchestrator continues
with the next phase — planning, then execution.

Auto-advance mode: Continue directly to next phase.

Interactive mode:
```
## Phase {X}: {Phase Name} Complete

---

## Next Up

**Phase {X+1}: {Next Phase Name}**
[Goal from ROADMAP.md]

Continue with `/nr:run` or `/nr:run phase {X+1}` to proceed.

/clear first for fresh context window

---
```

**Route B: All phases complete**

```
Phase {X} marked complete.

All phases finished!

Ready for milestone completion and archive.
```

</step>

</process>

<implicit_tracking>
Progress tracking is IMPLICIT: planning phase N implies phases 1-(N-1) complete. No separate progress step -- forward motion IS progress.
</implicit_tracking>

<partial_completion>

If user wants to move on but phase isn't fully complete:

```
Phase [X] has incomplete plans:
- {phase}-02-PLAN.md (not executed)
- {phase}-03-PLAN.md (not executed)

Options:
1. Mark complete anyway (plans weren't needed)
2. Defer work to later phase
3. Stay and finish current phase
```

Respect user judgment -- they know if work matters.

**If marking complete with incomplete plans:**

- Update ROADMAP: "2/3 plans complete" (not "3/3")
- Note in transition message which plans were skipped
- Update CONTEXT.md with reason for skipping

</partial_completion>

<success_criteria>

Transition is complete when:

- [ ] Current phase plan summaries verified (all exist or user chose to skip)
- [ ] Any stale handoffs deleted
- [ ] CONTEXT.md updated with brain reasoning (tried approaches, hypothesis, constraints)
- [ ] ROADMAP.md updated with completion status and plan count
- [ ] PROJECT.md evolved (requirements, decisions, description if needed)
- [ ] STATE.md updated (position, project reference, context, session)
- [ ] Progress table updated
- [ ] User knows next steps

</success_criteria>

# Workflow: Verify Phase

<purpose>
Verify a completed phase against success criteria, constraint frame compliance, and diagnostic hypothesis alignment. Goes beyond checkbox verification -- the Brain assesses whether the phase's work actually advances the project toward its goal.
</purpose>

<inputs>
- Phase number to verify
- `.planning/phases/{NN}-{slug}/PLAN.md` -- what was supposed to happen
- `.planning/phases/{NN}-{slug}/SUMMARY.md` -- what actually happened
- `.planning/ROADMAP.md` -- success criteria for this phase
- `.planning/CONTEXT.md` -- constraints, diagnostic state, prior knowledge
- `.planning/REQUIREMENTS.md` -- requirements assigned to this phase
</inputs>

<procedure>

## 1. Initialize

```bash
PHASE_ARG="${PHASE_NUMBER}"
INIT=$(node ~/.claude/netrunner/bin/nr-tools.cjs init execute-phase "${PHASE_ARG}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

**Validation:**
- Phase must exist and have SUMMARY.md. If not: "Phase [N] has no execution summary. Execute the phase first."
- CONTEXT.md must exist. Warn if missing, proceed with limited verification.

## 2. Load Phase Artifacts

Read all relevant files:
- `.planning/phases/{NN}-{slug}/PLAN.md` -- what was supposed to happen
- `.planning/phases/{NN}-{slug}/SUMMARY.md` -- what actually happened
- `.planning/ROADMAP.md` -- success criteria for this phase
- `.planning/CONTEXT.md` -- constraints, diagnostic state, prior knowledge
- `.planning/REQUIREMENTS.md` -- requirements assigned to this phase

## 3. Spawn Verifier

```
Task(
  subagent_type="nr-verifier",
  description="Verify Phase [N]: [name]",
  prompt="Verify Phase [N] completion comprehensively.

PHASE PLAN (what was supposed to happen):
[PLAN.md contents]

PHASE SUMMARY (what actually happened):
[SUMMARY.md contents]

SUCCESS CRITERIA (from ROADMAP.md):
[Phase success criteria]

REQUIREMENTS (assigned to this phase):
[REQ-IDs and descriptions]

CONSTRAINT FRAME:
[Active hard constraints from CONTEXT.md]

DIAGNOSTIC HYPOTHESIS:
[Current hypothesis from CONTEXT.md]

VERIFICATION CHECKS:

1. SUCCESS CRITERIA COMPLIANCE
   For each success criterion:
   - Met? (YES / PARTIAL / NO)
   - Evidence: [specific file, test, or output]

2. CONSTRAINT FRAME COMPLIANCE
   For each hard constraint:
   - Respected? (YES / VIOLATED)
   - Evidence: [specific implementation detail]

3. DIAGNOSTIC HYPOTHESIS ALIGNMENT
   - Does this phase's work support or invalidate the current hypothesis?
   - Any new evidence for/against?
   - Should hypothesis be updated?

4. E2E INTEGRATION
   - Does this phase's output integrate correctly with prior phases?
   - Any API contract violations?
   - Any data format mismatches?

5. TEST COVERAGE
   - Were tests written for new functionality?
   - Do tests pass?
   - Any critical paths untested?

6. REQUIREMENTS COVERAGE
   For each assigned REQ-ID:
   - Addressed? (COMPLETE / PARTIAL / NOT_ADDRESSED)
   - Evidence: [specific implementation]

RETURN FORMAT:
Status: PASS | PASS_WITH_NOTES | FAIL
Gaps: [list of specific gaps if any]
Notes: [observations for CONTEXT.md]
Hypothesis update: [if diagnostic hypothesis should change]

Write VERIFICATION.md to: [phase_dir]/VERIFICATION.md"
)
```

**Runtime note:** Use Claude Code `Task()` for subagent dispatch. If Task() is unavailable, execute the verifier prompt inline.

## 4. Process Verification Results

### On PASS:
- Log success to CONTEXT.md
- Mark requirements as Validated in REQUIREMENTS.md
- Proceed to phase transition

### On PASS_WITH_NOTES:
- Log notes to CONTEXT.md
- Mark requirements as Validated where applicable
- Display notes to user
- Proceed (notes are informational, not blocking)

### On FAIL:
- Brain reasons about fix strategy:

```
FAILURE ANALYSIS:
- Gaps found: [list from verifier]
- Root cause assessment: [brain's analysis]
- Fix strategy: [targeted fix | re-execute specific tasks | re-plan phase]
- Auto-fix possible? [yes/no]
```

**If auto-fix possible (one retry allowed):**
1. Spawn nr-executor with specific fix instructions
2. Re-run verification
3. If still failing: present to user

**If auto-fix not possible:**
Present options:
1. "Fix manually and re-verify" -- exit, user fixes, re-verifies later
2. "Accept with gaps" -- mark phase as PASS_WITH_NOTES, log gaps
3. "Re-plan this phase" -- trigger plan-phase workflow with gap context

## 5. Update CONTEXT.md

After verification (regardless of outcome):
- Log verification result and date
- Update diagnostic hypothesis if verifier suggested changes
- Add any new constraints discovered
- Record any new tried approaches

```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-update-log --phase N --change "Phase [N] verified: [PASS|FAIL]"
```

## 6. Write VERIFICATION.md

Ensure `.planning/phases/{NN}-{slug}/VERIFICATION.md` contains:

```markdown
# Phase [N] Verification

## Status: [PASS | PASS_WITH_NOTES | FAIL]
## Date: [date]

## Success Criteria
| Criterion | Status | Evidence |
|-----------|--------|----------|
| [criterion] | [MET/PARTIAL/NOT_MET] | [evidence] |

## Constraint Compliance
| Constraint | Status | Notes |
|------------|--------|-------|
| [constraint] | [RESPECTED/VIOLATED] | [notes] |

## Requirements Coverage
| REQ-ID | Status | Evidence |
|--------|--------|----------|
| [REQ-XX] | [COMPLETE/PARTIAL] | [evidence] |

## Integration Assessment
[E2E integration findings]

## Test Coverage
[Test coverage findings]

## Hypothesis Impact
[How this phase affects the diagnostic hypothesis]

## Gaps (if any)
[Specific gaps that need attention]
```

## 7. Commit

```bash
git add .planning/phases/${PADDED_PHASE}-*/VERIFICATION.md .planning/CONTEXT.md
git commit -m "verify(phase-${PHASE}): ${STATUS} - ${PHASE_NAME}"
```

</procedure>

<outputs>
- `.planning/phases/{NN}-{slug}/VERIFICATION.md` -- detailed verification results
- Updated `.planning/CONTEXT.md` -- verification findings logged
- Updated `.planning/REQUIREMENTS.md` -- requirements marked as Validated (on PASS)
</outputs>

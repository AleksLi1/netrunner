# Workflow: Debug Issue

<purpose>
Investigate bugs and issues using systematic scientific method. The Brain classifies the issue, loads prior failure patterns from CONTEXT.md, and spawns a debugger agent with full diagnostic context. Results feed back into the project's knowledge base.
</purpose>

<inputs>
- Issue description (from user)
- `.planning/CONTEXT.md` -- prior failures, constraints, diagnostic hypothesis
- Phase context (which phase's work is affected, if applicable)
</inputs>

<procedure>

## 1. Accept Issue Description

If no description provided, ask:
```
Describe the issue. What's happening? What did you expect? Any error messages?
```

Wait for response before continuing.

## 2. Brain Classifies the Issue

### Issue Type
| Type | Signals |
|------|---------|
| `RUNTIME_ERROR` | Stack traces, exceptions, crashes, "error when..." |
| `LOGIC_BUG` | Wrong output, unexpected behavior, "it does X instead of Y" |
| `INTEGRATION` | API failures, data format mismatches, "X can't talk to Y" |
| `PERFORMANCE` | Slow, timeout, memory, "takes too long" |
| `REGRESSION` | "Used to work", "broke after", "worked yesterday" |
| `ENVIRONMENT` | Config, dependencies, "works on my machine", build failures |

### Severity Assessment
- **Critical:** Application crashes, data loss, security issue
- **Major:** Core feature broken, blocking progress
- **Minor:** Edge case, cosmetic, workaround exists

### Quant-Specific Issue Types (when quant project detected)
| Type | Signals |
|------|---------|
| `LOOKAHEAD_CONTAMINATION` | Future data in features, impossible backtest results |
| `LEAKAGE` | Information sharing across folds, global normalization |
| `REGIME_FAILURE` | Strategy fails in specific market conditions |
| `SIGNAL_DECAY` | Backtest vs live performance gap |
| `VALIDATION_INTEGRITY` | Non-temporal splits, train/test contamination |
| `LOSS_METRIC_MISMATCH` | Optimizing wrong objective for trading context |

## 3. Load Prior Context

If `.planning/CONTEXT.md` exists:
- Read tried approaches -- check if this issue pattern has been seen before
- Read constraints -- debugger must respect these
- Read diagnostic hypothesis -- issue may be related to known patterns
- Read prior phase summaries -- issue may stem from earlier phase

Build a **debug context frame:**

```
DEBUG CONTEXT:
- Issue type: [classified type]
- Severity: [assessment]
- Related prior failures: [from tried approaches, if any]
- Active constraints: [from CONTEXT.md]
- Diagnostic hypothesis relevance: [how current hypothesis relates to this issue]
- Phase context: [which phase's work is affected]
```

## 4. Generate Hypotheses

Brain generates 2-3 hypotheses inline based on the issue classification and prior context:

```
HYPOTHESES:
Based on issue type [TYPE], severity [SEV], and prior context:

H1: [Most likely hypothesis] — confidence: [HIGH/MEDIUM/LOW]
    Test: [what would confirm/rule out]

H2: [Alternative hypothesis] — confidence: [HIGH/MEDIUM/LOW]
    Test: [what would confirm/rule out]

H3: [Long-shot hypothesis, if warranted] — confidence: [LOW]
    Test: [what would confirm/rule out]
```

Rank hypotheses by confidence. If only 1 hypothesis has HIGH confidence, skip team dispatch and go directly to single debugger (step 5 fallback).

## 5. Investigate via Team (Parallel Hypothesis Testing)

**Single hypothesis** (or team unavailable): Use single `Task()` call — no team overhead:

```
Task(
  subagent_type="nr-debugger",
  description="Debug: [issue summary] — test H1",
  prompt="Investigate hypothesis: [H1 description]
  ... [full investigation method + constraints + return format] ...")
```

**Multiple hypotheses** (2-3): Create a team with one debugger per hypothesis:

### 5.1 Create Debug Team

```
TeamCreate(team_name="nr-debug-{issue-slug}", description="Parallel hypothesis testing — {N} hypotheses")
```

### 5.2 Create Tasks per Hypothesis

```
TaskCreate(subject="Test H1: [hypothesis summary]",
  description="Investigate hypothesis: [H1 full description]. Test: [confirmation/ruling criteria]. Write findings to .planning/debug/{issue-slug}-H1.md.",
  activeForm="Testing hypothesis 1")

TaskCreate(subject="Test H2: [hypothesis summary]",
  description="Investigate hypothesis: [H2 full description]. Test: [confirmation/ruling criteria]. Write findings to .planning/debug/{issue-slug}-H2.md.",
  activeForm="Testing hypothesis 2")

# (TaskCreate for H3 if it exists)
```

### 5.3 Spawn Debuggers (ONE turn for concurrency)

```
Agent(team_name="nr-debug-{issue-slug}", name="debugger-h1", subagent_type="nr-debugger",
  prompt="You are a team member on nr-debug-{issue-slug}. Check TaskList, claim 'Test H1'.

ISSUE DESCRIPTION: [User's description]
YOUR HYPOTHESIS: [H1 full description]
DEBUG CONTEXT: [Context frame from step 3]

INVESTIGATION METHOD:
1. CLASSIFY — What subsystem is affected?
2. TEST — Design and run minimal test for THIS hypothesis:
   - What would confirm it? What would rule it out?
3. NARROW — Based on test results, assess this hypothesis
4. FIX — If root cause confirmed: implement fix, verify it, check for regressions
5. DOCUMENT — Record findings

CONSTRAINTS: [Hard constraints from CONTEXT.md]
PRIOR FAILURES: [Related tried approaches]

RETURN FORMAT:
Status: ROOT_CAUSE_FOUND | RULED_OUT | INCONCLUSIVE
Hypothesis: [H1 description]
Evidence: [what was tested and found]
Root cause: [if found]
Fix applied: [yes/no, what was done]
Confidence: [HIGH/MEDIUM/LOW]
New constraints: [any discovered]

Write findings to: .planning/debug/{issue-slug}-H1.md
Mark task completed when done.")

Agent(team_name="nr-debug-{issue-slug}", name="debugger-h2", subagent_type="nr-debugger",
  prompt="You are a team member on nr-debug-{issue-slug}. Check TaskList, claim 'Test H2'.
  [... same structure as H1 but with H2 hypothesis ...]
  Write findings to: .planning/debug/{issue-slug}-H2.md
  Mark task completed when done.")

# (Agent for H3 if it exists)
```

### 5.4 Cleanup

```
SendMessage(type="shutdown_request", recipient="debugger-h1")
SendMessage(type="shutdown_request", recipient="debugger-h2")
# (shutdown H3 if it exists)
TeamDelete()
```

**Sequential fallback:** If TeamCreate is unavailable or team spawning fails, test each hypothesis sequentially using individual `Task()` calls with identical prompts.

## 6. Merge Debug Results

Leader collects results from all debuggers via TaskList and applies decision matrix:

| Outcome | Action |
|---------|--------|
| Exactly 1 `ROOT_CAUSE_FOUND` | Accept that debugger's fix and findings |
| Multiple `ROOT_CAUSE_FOUND` | Brain picks highest confidence; if tied, prefer the one with a fix already applied |
| All `RULED_OUT` | Generate new hypotheses (return to step 4), max 2 rounds |
| All `INCONCLUSIVE` | Status = `NEEDS_MORE_INFO`, present partial findings to user |
| Mix of `RULED_OUT` + `INCONCLUSIVE` | Focus on inconclusive hypothesis with targeted re-investigation |

Merge into unified debug report at `.planning/debug/{issue-slug}.md`.

## 7. Process Debug Results

### On ROOT_CAUSE_FOUND:

If fix was applied:
- Verify the fix (run tests, check behavior)
- Update CONTEXT.md:
  - Add to "What Has Been Tried" with result and confidence
  - Update diagnostic hypothesis if relevant
  - Add any new constraints discovered
  - Log entry in Update Log

If fix not applied (e.g., requires human decision):
- Present findings and recommendations
- Let user decide on approach

### On NEEDS_MORE_INFO:

Present what was learned so far:
```
Investigation narrowed the issue but needs more information:

Eliminated hypotheses:
- [hypothesis 1] -- ruled out because [evidence]

Remaining hypotheses:
- [hypothesis 2] -- needs [specific info] to confirm

What would help:
- [specific question or action needed]
```

### On CHECKPOINT:

Debugger hit a decision point:
- Present the decision needed
- Wait for user input
- Re-spawn or continue with answer

## 8. Update Project Knowledge

After debugging (regardless of outcome):

### Update CONTEXT.md:
```markdown
## What Has Been Tried
| Approach | Result | Impl. Confidence | Notes |
|----------|--------|-----------------|-------|
| [debug: issue description] | [FIXED/INVESTIGATED/ONGOING] | [confidence] | [root cause or findings] |
```

### If issue relates to a phase:
- Note in phase's CONTEXT.md
- If fix changes phase outcomes, flag for re-verification

### Brain write-back:
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried '{"approach":"debug: [issue]","outcome":"[result]","confidence":"[level]","failure_mode":"[root cause]","phase":"[N]"}'
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-update-log --phase N --change "Debugged: [issue summary] -- [outcome]"
```

</procedure>

<outputs>
- Debug findings (presented to user)
- Fix implementation (if applied)
- Updated `.planning/CONTEXT.md` -- debug findings logged to knowledge base
</outputs>

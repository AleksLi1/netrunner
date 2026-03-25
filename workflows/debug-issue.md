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

## 4. Spawn Debugger Agent

```
Task(
  subagent_type="nr-debugger",
  description="Debug: [issue summary]",
  prompt="Investigate this issue using systematic scientific method.

ISSUE DESCRIPTION:
[User's description]

DEBUG CONTEXT:
[Context frame from step 3]

INVESTIGATION METHOD:
1. CLASSIFY -- What type of issue is this? What subsystem?
2. HYPOTHESIZE -- Based on symptoms + context, what are the top 2-3 hypotheses?
3. TEST -- For each hypothesis, design a minimal test:
   - What would confirm this hypothesis?
   - What would rule it out?
4. NARROW -- Run tests, eliminate hypotheses
5. FIX -- Once root cause found:
   - Implement the fix
   - Verify the fix resolves the symptom
   - Verify no regression introduced
6. DOCUMENT -- Record findings

CONSTRAINTS:
[Hard constraints from CONTEXT.md -- fixes must not violate these]

PRIOR FAILURES:
[Related tried approaches -- avoid repeating failed fixes]

RETURN FORMAT:
Status: ROOT_CAUSE_FOUND | NEEDS_MORE_INFO | CHECKPOINT
Root cause: [description]
Fix applied: [yes/no, what was done]
Hypothesis tested: [list of hypotheses tested with results]
New constraints: [any constraints discovered]
Recommendations: [if fix not applied, what to do]"
)
```

**Runtime note:** Use Claude Code `Task()` for subagent dispatch. If Task() is unavailable, execute the debugger prompt inline.

## 5. Process Debugger Results

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

## 6. Update Project Knowledge

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

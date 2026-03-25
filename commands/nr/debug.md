# Netrunner Debug — Diagnostic Debugging

<purpose>
Investigate bugs and issues using systematic scientific method. The Brain classifies the issue, loads prior failure patterns from CONTEXT.md, and spawns a debugger agent with full diagnostic context. Results feed back into the project's knowledge base.
</purpose>

<process>

## 1. Accept Issue Description

```
Input: $ARGUMENTS
```

If `$ARGUMENTS` is empty, ask:
```
Describe the issue. What's happening? What did you expect? Any error messages?
```

Wait for response before continuing.

## 2. Brain Classifies the Issue

Analyze the issue description and classify:

### Issue Type
| Type | Signals |
|------|---------|
| `RUNTIME_ERROR` | Stack traces, exceptions, crashes, "error when..." |
| `LOGIC_BUG` | Wrong output, unexpected behavior, "it does X instead of Y" |
| `INTEGRATION` | API failures, data format mismatches, "X can't talk to Y" |
| `PERFORMANCE` | Slow, timeout, memory, "takes too long" |
| `REGRESSION` | "Used to work", "broke after", "worked yesterday" |
| `ENVIRONMENT` | Config, dependencies, "works on my machine", build failures |

**Quant/Trading-specific issue types** (when CONTEXT.md indicates a trading project):
| Type | Signals |
|------|---------|
| `LOOKAHEAD_CONTAMINATION` | "Results too good", "metrics dropped after code review", suspiciously high Sharpe/accuracy |
| `LEAKAGE` | "Train and test metrics are similar", "model works perfectly on validation", performance doesn't degrade out-of-sample as expected |
| `REGIME_FAILURE` | "Model stopped working", "worked last month but not now", performance varies dramatically by time period |
| `SIGNAL_DECAY` | "Backtest was great but live is terrible", "alpha disappeared", gradual metric degradation over time |
| `VALIDATION_INTEGRITY` | "Walk-forward gives different results than single split", "metrics change depending on split method" |
| `LOSS_METRIC_MISMATCH` | "Training loss decreasing but target metric flat", "model converging on wrong objective" |

### Severity Assessment
- **Critical:** Application crashes, data loss, security issue. **Quant:** Lookahead contamination confirmed (all results invalid), live trading with tainted model
- **Major:** Core feature broken, blocking progress. **Quant:** Suspected leakage, validation framework broken, regime failure in production
- **Minor:** Edge case, cosmetic, workaround exists. **Quant:** Signal decay under investigation, loss-metric alignment refinement

## 3. Load Prior Context

If `.planning/CONTEXT.md` exists:
- Read tried approaches → check if this issue pattern has been seen before
- Read constraints → debugger must respect these
- Read diagnostic hypothesis → issue may be related to known patterns
- Read prior phase summaries → issue may stem from earlier phase

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

### Quant-Specific Debug Protocols

When the issue is classified as a quant-specific type, include the relevant protocol in the debugger prompt:

**LOOKAHEAD_CONTAMINATION protocol:**
1. Freeze all model training — results are unreliable until audit completes
2. Trace every feature backward: for each feature used by the model, identify the raw data source and verify temporal availability at prediction time
3. Check for subtle lookahead: EMA/MA computed with current bar, normalization statistics from full dataset, label encoding using future values
4. Check off-by-one errors in temporal indexing (most common source of lookahead)
5. Validation test: shuffle time ordering and retrain — if performance is maintained, lookahead is confirmed
6. If confirmed: mark ALL prior results as TAINTED in CONTEXT.md, re-evaluate from last known clean state

**LEAKAGE protocol:**
1. Check validation split methodology: is it truly temporal? Any information sharing?
2. Examine feature-target correlation: any feature with >0.5 correlation with future returns is suspicious
3. Check data joining: are features joined by exact timestamp? Are there off-by-one joins that pull in future data?
4. Verify normalization: are mean/std computed per-fold or globally? Global = leakage
5. Test: train on random noise features — if model "learns", structural leakage exists in the pipeline

**REGIME_FAILURE protocol:**
1. Partition evaluation by market regime (bull, bear, sideways, crisis)
2. Compare feature distributions across regimes — distribution shift is the primary cause
3. Check if training data has regime imbalance (e.g., 80% bull market training data)
4. Evaluate: does the model have regime-detection capability, or does it assume stationarity?
5. Test: train separate per-regime models vs. single model — performance delta reveals regime sensitivity

**SIGNAL_DECAY protocol:**
1. Compare backtest performance vs live: is the gap consistent or growing?
2. Check for capacity constraints: is execution impact eating the alpha?
3. Evaluate: has the market microstructure changed since the backtest period?
4. Check for overfitting to historical patterns: how many parameters vs. independent observations?
5. Test: run the strategy on recent out-of-sample data with paper trading — does the edge persist?

## 4. Spawn Debugger Agent

```
Task(
  subagent_type="nr-debugger",
  description="Debug: [issue summary]",
  prompt="Investigate this issue using systematic scientific method.

ISSUE DESCRIPTION:
[User's description from $ARGUMENTS]

DEBUG CONTEXT:
[Context frame from step 3]

INVESTIGATION METHOD:
1. CLASSIFY — What type of issue is this? What subsystem?
2. HYPOTHESIZE — Based on symptoms + context, what are the top 2-3 hypotheses?
3. TEST — For each hypothesis, design a minimal test:
   - What would confirm this hypothesis?
   - What would rule it out?
4. NARROW — Run tests, eliminate hypotheses
5. FIX — Once root cause found:
   - Implement the fix
   - Verify the fix resolves the symptom
   - Verify no regression introduced
6. DOCUMENT — Record findings

CONSTRAINTS:
[Hard constraints from CONTEXT.md — fixes must not violate these]

PRIOR FAILURES:
[Related tried approaches — avoid repeating failed fixes]

RETURN FORMAT:
Status: ROOT_CAUSE_FOUND | NEEDS_MORE_INFO | CHECKPOINT
Root cause: [description]
Fix applied: [yes/no, what was done]
Hypothesis tested: [list of hypotheses tested with results]
New constraints: [any constraints discovered]
Recommendations: [if fix not applied, what to do]"
)
```

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
- [hypothesis 1] — ruled out because [evidence]

Remaining hypotheses:
- [hypothesis 2] — needs [specific info] to confirm

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
- If fix was applied, note in phase's SUMMARY.md

### If new constraint discovered:
- Add to Hard Constraints in CONTEXT.md

## 7. Present Results

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► DEBUG — [STATUS]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Issue: [summary]
 Type: [classified type]
 Root cause: [found/investigating]

 [If fixed:]
 Fix: [description]
 Verified: [yes/no]

 [If not fixed:]
 Findings: [what was learned]
 Next step: [recommendation]

 Context updated: [what was logged]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

</process>

<success_criteria>
- [ ] Issue classified by type and severity
- [ ] Prior context loaded and relevant patterns identified
- [ ] Scientific method applied: classify → hypothesize → test → fix
- [ ] Debugger received full constraint context
- [ ] Root cause found or investigation state documented
- [ ] CONTEXT.md updated with findings
- [ ] Fix verified if applied
- [ ] User informed of results and next steps
- [ ] For quant projects: quant-specific debug protocol applied when relevant issue type detected
- [ ] For quant projects: lookahead/leakage findings trigger TAINTED marking on affected prior results
</success_criteria>

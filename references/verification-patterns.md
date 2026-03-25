# Verification Patterns

Reference for verifying code quality during Netrunner plan execution.

<stub_detection>

## Universal Stub Patterns

These patterns indicate placeholder code regardless of file type:

**Comment-based stubs:**
```bash
# Grep patterns for stub comments
grep -E "(TODO|FIXME|XXX|HACK|PLACEHOLDER)" "$file"
grep -E "implement|add later|coming soon|will be" "$file" -i
grep -E "// \.\.\.|/\* \.\.\. \*/|# \.\.\." "$file"
```

**Placeholder text in output:**
```bash
# UI placeholder patterns
grep -E "placeholder|lorem ipsum|coming soon|under construction" "$file" -i
grep -E "sample|example|test data|dummy" "$file" -i
grep -E "\[.*\]|<.*>|\{.*\}" "$file"  # Template brackets left in
```

**Empty or trivial implementations:**
```bash
# Functions that do nothing
grep -E "return null|return undefined|return \{\}|return \[\]" "$file"
grep -E "pass$|\.\.\.|\bnothing\b" "$file"
grep -E "console\.(log|warn|error).*only" "$file"  # Log-only functions
```

**Hardcoded values where dynamic expected:**
```bash
# Hardcoded IDs, counts, or content
grep -E "id.*=.*['\"].*['\"]" "$file"  # Hardcoded string IDs
grep -E "count.*=.*\d+|length.*=.*\d+" "$file"  # Hardcoded counts
```

</stub_detection>

<react_components>

## React/Next.js Components

**Existence check:**
```bash
# File exists and exports component
[ -f "$component_path" ] && grep -E "export (default |)function|export const.*=.*\(" "$component_path"
```

**Substantive check:**
```bash
# Returns actual JSX, not placeholder
grep -E "return.*<" "$component_path" | grep -v "return.*null" | grep -v "placeholder" -i

# Has meaningful content (not just wrapper div)
grep -E "<[A-Z][a-zA-Z]+|className=|onClick=|onChange=" "$component_path"

# Uses props or state (not static)
grep -E "props\.|useState|useEffect|useContext|\{.*\}" "$component_path"
```

**Stub patterns specific to React:**
```javascript
// RED FLAGS - These are stubs:
return <div>Component</div>
return <div>Placeholder</div>
return <div>{/* TODO */}</div>
return <p>Coming soon</p>
return null
return <></>

// Also stubs - empty handlers:
onClick={() => {}}
onChange={() => console.log('clicked')}
onSubmit={(e) => e.preventDefault()}  // Only prevents default, does nothing
```

**Wiring check:**
```bash
# Component imports what it needs
grep -E "^import.*from" "$component_path"

# Props are actually used (not just received)
grep -E "\{ .* \}.*props|\bprops\.[a-zA-Z]+" "$component_path"

# API calls exist (for data-fetching components)
grep -E "fetch\(|axios\.|useSWR|useQuery|getServerSideProps|getStaticProps" "$component_path"
```

</react_components>

<api_routes>

## API Routes (Next.js App Router / Express / etc.)

**Existence check:**
```bash
# File exists and exports handler
[ -f "$route_path" ] && grep -E "export.*function (GET|POST|PUT|DELETE|PATCH)|app\.(get|post|put|delete|patch)" "$route_path"
```

**Substantive check:**
```bash
# Returns actual response, not placeholder
grep -E "Response|res\.(json|send|status)" "$route_path" | grep -v "placeholder" -i

# Has business logic (not just pass-through)
grep -E "await|try|if.*\(|switch|\.find|\.create|\.update|\.delete" "$route_path"

# Handles errors
grep -E "catch|error|400|401|403|404|500" "$route_path"
```

**Stub patterns specific to APIs:**
```typescript
// RED FLAGS - These are stubs:
return Response.json({ message: "Hello" })
return res.json({ status: "ok" })
return new Response("Not implemented", { status: 501 })
return res.status(200).json({})
```

</api_routes>

<database_schema>

## Database Schema (Prisma / Drizzle / SQL)

**Existence check:**
```bash
# Schema file exists with models
[ -f "$schema_path" ] && grep -E "model |CREATE TABLE|export const" "$schema_path"
```

**Substantive check:**
```bash
# Has actual fields (not just id)
grep -E "String|Int|Boolean|DateTime|Float|VARCHAR|TEXT|INTEGER" "$schema_path"

# Has relationships
grep -E "relation|references|FOREIGN KEY|@relation" "$schema_path"

# Has constraints
grep -E "@unique|@default|NOT NULL|PRIMARY KEY|@id" "$schema_path"
```

</database_schema>

<hooks_utilities>

## Custom Hooks and Utilities

**Existence check:**
```bash
[ -f "$util_path" ] && grep -E "export (function|const|default)" "$util_path"
```

**Substantive check:**
```bash
# Has actual logic
grep -E "if|switch|for|while|map|filter|reduce|try" "$util_path"

# Returns meaningful values
grep -E "return [^;]+" "$util_path" | grep -v "return null" | grep -v "return undefined"

# Has proper types (TypeScript)
grep -E ":\s*(string|number|boolean|Promise|Array|\{)" "$util_path"
```

</hooks_utilities>

<environment_config>

## Environment Variables and Configuration

**Existence check:**
```bash
[ -f ".env.example" ] || [ -f ".env.local.example" ] || [ -f ".env" ]
```

**Substantive check:**
```bash
# Required vars are defined (not just comments)
grep -E "^[A-Z_]+=.+" ".env.example" 2>/dev/null

# Has descriptive comments
grep -E "^#" ".env.example" 2>/dev/null
```

</environment_config>

<wiring_verification>

## Wiring Verification Patterns

### Pattern: Component -> API
```bash
# Component calls the right API endpoint
grep -E "fetch\(['\"].*$API_PATH|axios\.\w+\(['\"].*$API_PATH" "$COMPONENT"
```

### Pattern: API -> Database
```bash
# API route uses database
grep -E "prisma\.|db\.|pool\.|knex\.|drizzle" "$ROUTE"
```

### Pattern: Form -> Handler
```bash
# Form has onSubmit connected to handler
grep -E "onSubmit=\{|handleSubmit|action=" "$FORM_COMPONENT"
```

### Pattern: State -> Render
```bash
# State variables are used in JSX
STATE_VAR=$(grep -oE "const \[(\w+)" "$COMPONENT" | sed 's/const \[//')
for var in $STATE_VAR; do
  grep -c "$var" "$COMPONENT"
done
```

</wiring_verification>

<verification_checklist>

## Quick Verification Checklist

### Component Checklist
- [ ] File exists and exports component
- [ ] Returns meaningful JSX (not placeholder)
- [ ] Props are received and used
- [ ] Event handlers have implementation
- [ ] API calls target correct endpoints

### API Route Checklist
- [ ] File exists and exports handler
- [ ] Handles the correct HTTP method
- [ ] Has input validation
- [ ] Has error handling
- [ ] Returns appropriate status codes

### Schema Checklist
- [ ] Models have meaningful fields
- [ ] Relationships are defined
- [ ] Constraints are applied

### Hook/Utility Checklist
- [ ] Exports functions with proper signatures
- [ ] Has actual logic (not pass-through)
- [ ] Error cases handled

### Wiring Checklist
- [ ] Components call correct APIs
- [ ] APIs use correct database operations
- [ ] Forms connect to handlers
- [ ] State drives render output

</verification_checklist>

<automated_verification_script>

## Automated Verification Approach

For the verification subagent, use this pattern:

```bash
# 1. Check existence
check_exists() {
  [ -f "$1" ] && echo "EXISTS: $1" || echo "MISSING: $1"
}

# 2. Check for stub patterns
check_stubs() {
  local file="$1"
  local stubs=$(grep -c -E "TODO|FIXME|placeholder|not implemented" "$file" 2>/dev/null || echo 0)
  [ "$stubs" -gt 0 ] && echo "STUB_PATTERNS: $stubs in $file"
}

# 3. Check wiring (component calls API)
check_wiring() {
  local component="$1"
  local api_path="$2"
  grep -q "$api_path" "$component" && echo "WIRED: $component -> $api_path" || echo "NOT_WIRED: $component -> $api_path"
}

# 4. Check substantive (more than N lines, has expected patterns)
check_substantive() {
  local file="$1"
  local min_lines="$2"
  local pattern="$3"
  local lines=$(wc -l < "$file" 2>/dev/null || echo 0)
  local has_pattern=$(grep -c -E "$pattern" "$file" 2>/dev/null || echo 0)
  [ "$lines" -ge "$min_lines" ] && [ "$has_pattern" -gt 0 ] && echo "SUBSTANTIVE: $file" || echo "THIN: $file ($lines lines, $has_pattern matches)"
}
```

Run these checks against each must-have artifact. Aggregate results into VERIFICATION.md.

</automated_verification_script>

<human_verification_triggers>

## When to Require Human Verification

Not everything can be automated. Require human checkpoint when:

1. **Visual correctness** -- "Does this look right?"
2. **UX flow** -- "Try logging in and tell me if it feels right"
3. **Third-party integration** -- "Verify Stripe test payment works"
4. **Performance subjective** -- "Is the animation smooth enough?"
5. **Content accuracy** -- "Are these labels correct for your domain?"

Automated verification handles existence, stubs, wiring, and basic functionality.
Human verification handles subjective quality and real-world integration.

</human_verification_triggers>

<checkpoint_automation_reference>

## Pre-Checkpoint Automation

Before presenting a human-verify checkpoint, run automated checks first:

```bash
# 1. Run all must-have verification checks
# 2. Run stub detection on all modified files
# 3. Run wiring checks for connected components
# 4. Only THEN present human checkpoint

# If automated checks fail, fix first -- don't waste human time
# on things the agent can catch
```

This reduces human verification to genuine judgment calls.

</checkpoint_automation_reference>

<brain_specific_verification>

## Brain-Specific Verification

### Hypothesis Verification
When verifying against the diagnostic hypothesis in CONTEXT.md:
1. **Does the phase outcome SUPPORT the hypothesis?** → record as `evidence_for` with specifics
2. **Does the phase outcome CONTRADICT the hypothesis?** → record as `evidence_against` with specifics
3. **Is the hypothesis still RELEVANT after this phase?** → assess `hypothesis_validity` (valid/stale/superseded)
4. **Should the hypothesis be UPDATED based on results?** → propose `hypothesis_evolution` with reasoning

**Hypothesis verification template:**
```
Hypothesis: [state from CONTEXT.md]
Phase outcome: [what happened]
Evidence alignment: FOR / AGAINST / NEUTRAL
Confidence shift: [previous] → [updated] (reason)
Action: MAINTAIN / UPDATE / DISCARD hypothesis
```

**Compound hypothesis handling:**
If the hypothesis has multiple parts (e.g., "N+1 queries AND missing index"):
- Verify each part independently
- A single contradiction does not invalidate the whole hypothesis
- Track partial confirmation: "Part A confirmed, Part B still unverified"

### Constraint Compliance Verification
For each hard constraint in CONTEXT.md:
1. **Was the constraint explicitly referenced in the plan?** → trace constraint to plan step
2. **Does the implementation satisfy the constraint?** → verify with concrete evidence
3. **Were any constraint boundaries approached (warning zone)?** → flag if within 20% of limit
4. **If a constraint was relaxed, was it documented with reasoning?** → check Decision Log

**Constraint verification matrix:**
```
| Constraint | Referenced in Plan | Satisfied | Boundary Distance | Notes |
|-----------|-------------------|-----------|-------------------|-------|
| PostgreSQL only | Step 3 | YES | N/A | Using pg driver |
| < 200ms p95 | Step 5 | YES | 15% margin | 170ms measured |
| No breaking API | Step 2 | PARTIAL | N/A | See note below |
```

### Context Evolution Verification
After each phase, verify that CONTEXT.md was properly updated:
1. **New tried approaches** added with outcomes and confidence scores
2. **New constraints** added if discovered during implementation
3. **Hypothesis updated** if evidence changed its validity or confidence
4. **Decision log entry** added with reasoning and alternatives considered
5. **Metrics updated** if measurable changes occurred
6. **Closed paths** documented with why they were abandoned

**Context staleness check:**
- If CONTEXT.md has not been updated after a phase → FAIL verification
- If new information was discovered but not recorded → FAIL verification
- Stale context causes downstream phases to work from wrong assumptions

</brain_specific_verification>

<verification_anti_patterns>

## Verification Anti-Patterns

| Anti-Pattern | Symptom | Fix |
|-------------|---------|-----|
| Task-focused verification | "All tasks complete" without checking goals | Verify goals, not tasks |
| Missing negative tests | Only happy paths tested | Add error + edge case verification |
| Stale success criteria | Criteria from planning, not reflecting learned reality | Update criteria from CONTEXT.md |
| Orphan verification | Checking things not in requirements | Map every check to a REQ-ID |
| Confidence inflation | "High confidence" without measurement | Require measurable evidence |
| Regression blindness | New work verified, but old work not re-checked | Run integration verification |
| Verification theater | Running checks but ignoring failures | Every failure must be resolved or documented |
| Premature sign-off | Marking phase complete before all checks pass | Gate completion on verification |
| Static verification | Same checks for every phase regardless of type | Use phase-type-specific checklists |
| Silent degradation | Metrics worse than before but not flagged | Compare before/after for all metrics |

### How to Detect Anti-Patterns in Your Own Verification
1. **Count your verification steps** -- if fewer than the success criteria, you're missing checks
2. **Check for negative assertions** -- "X does NOT break" should appear alongside "X works"
3. **Look for numbers** -- if no metrics appear in verification, you're not measuring
4. **Trace to requirements** -- every check should map to a documented requirement
5. **Review failure handling** -- what happens when a check fails? If nothing, it's theater

</verification_anti_patterns>

<phase_type_checklists>

## Verification Checklists by Phase Type

### Data Pipeline Phases (ML / Data Engineering)

**Input verification:**
- [ ] Data source accessible and returning expected schema
- [ ] Row/record count matches expected range
- [ ] Null/missing value rates within acceptable thresholds
- [ ] Data types match schema definition (no silent coercion)
- [ ] Timestamp ranges cover expected period

**Transform verification:**
- [ ] Output row count explained by input count + join/filter logic
- [ ] No unintended duplicates introduced
- [ ] Feature distributions are plausible (no all-zeros, no extreme outliers)
- [ ] Categorical encodings are consistent with training expectations
- [ ] Normalization/scaling applied correctly (check mean/std)

**Output verification:**
- [ ] Output schema matches downstream consumer expectations
- [ ] Output written to correct location/table/bucket
- [ ] Idempotency: re-running produces same result
- [ ] Pipeline completes within time budget
- [ ] Data quality metrics logged and within thresholds

**Model-specific verification:**
- [ ] Train/val/test split has no data leakage
- [ ] Model metrics (accuracy, F1, AUC) meet minimum thresholds
- [ ] Prediction distribution is plausible (not degenerate)
- [ ] Model artifact saved and versioned
- [ ] Inference latency within serving budget

### Quantitative Finance / Trading Phases

**This is the most critical verification domain.** A trading model that passes all standard ML checks can still be worthless (or dangerous) if temporal integrity is violated. Every check below addresses a failure mode that has caused real financial losses.

**Temporal Integrity Verification (HIGHEST PRIORITY):**
- [ ] **Lookahead audit — features:** For every feature, verify that at prediction time T, only data from T-k (k >= 1) is used. Trace each feature from model input back to raw data source. Flag any feature with ambiguous temporal availability.
- [ ] **Lookahead audit — labels:** Labels are computed using only data from the prediction horizon window, not data available before the prediction point.
- [ ] **Lookahead audit — normalization:** Any normalization (mean, std, min, max) is computed per-fold using only training data, NEVER computed globally across the full dataset.
- [ ] **Off-by-one indexing:** Check array indexing — `data[i]` vs `data[i-1]` is the difference between a valid feature and lookahead. Current bar's close is NOT available at prediction time for most strategies.
- [ ] **EMA/MA computation:** Moving averages and exponential moving averages must not include the current bar if predicting at the current bar's timestamp.

**Validation Framework Verification:**
- [ ] **Walk-forward structure:** Splits are strictly temporal — training period ends before validation period begins, with no overlap.
- [ ] **Purging gaps:** Sufficient gap between training and validation to prevent autocorrelation leakage. Gap >= max(prediction_horizon, feature_lookback_window).
- [ ] **Embargo period:** Data immediately after training period is excluded from validation to prevent information leakage through serial correlation.
- [ ] **No data shuffling:** At no point in the pipeline is time-series data randomly shuffled before splitting.
- [ ] **Fold independence:** Each walk-forward fold uses a truly distinct validation period. No period appears in multiple folds' validation sets.

**Evaluation Integrity Verification:**
- [ ] **Transaction costs included:** All P&L and Sharpe calculations include realistic transaction costs (commission + spread + estimated slippage).
- [ ] **Regime coverage:** Evaluation covers at least 2 distinct market regimes (e.g., trending + mean-reverting, or bull + bear). Single-regime evaluation is insufficient.
- [ ] **Statistical significance:** Performance claims are supported by: sufficient sample size (>100 trades for significance), confidence intervals, or permutation tests. A 2% edge over 50 trades is noise.
- [ ] **Out-of-sample integrity:** The OOS holdout has NOT been used for model selection, hyperparameter tuning, or "checking" results. Any peek contaminates it.
- [ ] **Multiple testing correction:** If N strategy variants were tested, the probability of finding a spurious winner at 5% significance is approximately 1-(0.95^N). Document how many variants were tested.

**Result Skepticism Verification:**
- [ ] **Sharpe reality check:** Sharpe > 2.0 without high-frequency data is suspicious. Sharpe > 3.0 almost certainly contains an error. Verify the Sharpe calculation: annualization factor, cost inclusion, return definition (log vs simple).
- [ ] **Accuracy vs P&L alignment:** High direction accuracy with low P&L suggests the model is right on small moves and wrong on large moves. Verify that accuracy translates to economic value.
- [ ] **Drawdown analysis:** Maximum drawdown and drawdown duration are reported alongside returns. A strategy with 2x annual return and 50% max drawdown is selling insurance, not generating alpha.
- [ ] **Consistency check:** Performance is roughly consistent across sub-periods, not dominated by a few outlier trades. Remove the top 5 trades and re-evaluate.
- [ ] **Capacity estimation:** Is the strategy's edge larger than execution costs at target size? Market impact at scale can eliminate thin edges entirely.

**Code Quality Verification (Trading-Specific):**
- [ ] **Random seeds set:** All random number generators are seeded for reproducibility. Results that can't be reproduced are unreliable.
- [ ] **Hyperparameters logged:** All hyperparameters are logged with results. A "good" result without knowing the exact configuration is useless.
- [ ] **Data version pinned:** The exact dataset version (date range, source, preprocessing) is recorded. Data pipeline changes can silently invalidate prior results.
- [ ] **No hardcoded thresholds from backtest:** Trading thresholds (entry/exit levels, stop-loss levels) should not be optimized on the same data used for evaluation.

### UI Component Phases (Web / Frontend)

**Visual verification:**
- [ ] Component renders without console errors
- [ ] Layout matches design specification (spacing, alignment, sizing)
- [ ] Responsive: renders correctly at mobile, tablet, desktop breakpoints
- [ ] Dark/light mode: colors adapt correctly (if applicable)
- [ ] Loading states display appropriately (skeleton, spinner, etc.)

**Interaction verification:**
- [ ] All clickable elements have hover/focus states
- [ ] Form inputs validate on blur and submit
- [ ] Error states display user-friendly messages
- [ ] Success states provide clear feedback
- [ ] Navigation flows reach correct destinations

**Accessibility verification:**
- [ ] Semantic HTML elements used (button, nav, main, etc.)
- [ ] ARIA labels on interactive elements
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Screen reader announces state changes

**Performance verification:**
- [ ] No unnecessary re-renders (React Profiler check)
- [ ] Images are optimized and lazy-loaded where appropriate
- [ ] Bundle impact is within budget (check bundle analyzer)
- [ ] First Contentful Paint within target

### API Endpoint Phases (Backend / API)

**Contract verification:**
- [ ] Request schema validates correctly (required fields, types)
- [ ] Response schema matches API documentation
- [ ] Status codes are semantically correct (201 for create, 404 for missing, etc.)
- [ ] Error responses include actionable error messages
- [ ] Pagination/filtering works as documented

**Security verification:**
- [ ] Authentication required on protected endpoints
- [ ] Authorization checks enforce correct permissions
- [ ] Input sanitization prevents injection (SQL, XSS, command)
- [ ] Rate limiting configured for public-facing endpoints
- [ ] Sensitive data not logged or exposed in responses

**Reliability verification:**
- [ ] Error handling covers database failures, timeout, invalid input
- [ ] Retry logic for transient failures (if applicable)
- [ ] Idempotency keys for mutating operations (if applicable)
- [ ] Request timeout configured and reasonable
- [ ] Health check endpoint responds correctly

**Performance verification:**
- [ ] Response time within SLA (measure p50, p95, p99)
- [ ] Database queries are optimized (no N+1, indexes used)
- [ ] Payload size is reasonable (no over-fetching)
- [ ] Connection pooling configured correctly

### Infrastructure Phases (Systems / DevOps)

**Provisioning verification:**
- [ ] Resources created with correct specifications (size, region, tier)
- [ ] Network security groups / firewall rules are minimal and correct
- [ ] Secrets stored in secrets manager (not in code or env files)
- [ ] IAM roles follow principle of least privilege
- [ ] Resources tagged for cost tracking and ownership

**Deployment verification:**
- [ ] Deployment completes without errors
- [ ] Health checks pass after deployment
- [ ] Rollback procedure tested and documented
- [ ] Zero-downtime deployment confirmed (if required)
- [ ] Environment variables set correctly in target environment

**Monitoring verification:**
- [ ] Logs are being collected and are searchable
- [ ] Metrics are being emitted (latency, error rate, throughput)
- [ ] Alerts configured for critical thresholds
- [ ] Dashboards reflect current system state
- [ ] On-call rotation and escalation path documented

**Disaster recovery verification:**
- [ ] Backups are running and restorable
- [ ] Recovery procedure tested (not just documented)
- [ ] Failover works within RTO target
- [ ] Data integrity maintained after recovery

### Integration Phases (Cross-Domain)

**Interface verification:**
- [ ] Data formats match between producer and consumer
- [ ] API versions are compatible across services
- [ ] Authentication tokens/credentials flow correctly across boundaries
- [ ] Timeout values are consistent (caller timeout > callee timeout)
- [ ] Error propagation maintains context across boundaries

**End-to-end verification:**
- [ ] Happy path completes from user action to final state
- [ ] Error path surfaces meaningful feedback to the user
- [ ] Data consistency maintained across all stores
- [ ] Race conditions handled (concurrent requests, stale reads)
- [ ] Performance under integration is within budget (not just individual components)

**Rollback verification:**
- [ ] Each integrated component can be rolled back independently
- [ ] Partial failures leave system in consistent state
- [ ] Feature flags can disable new integration without full rollback
- [ ] Monitoring detects integration failures specifically (not just component failures)

</phase_type_checklists>

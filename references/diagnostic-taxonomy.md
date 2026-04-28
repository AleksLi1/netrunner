# Diagnostic Taxonomy

The brain's core classification knowledge base. Every project request passes through this taxonomy to determine shape, domain, risk profile, and resolution strategy before any planning begins.

---

## Two-Tier Classification System

### Tier 1: Project Shape (4 shapes)

| Shape | Signal | Example |
|-------|--------|---------|
| BUILD:GREENFIELD | No existing codebase, creating from scratch | "Build a REST API with auth" |
| BUILD:BROWNFIELD | Existing codebase, adding/modifying | "Add search to our Django app" |
| FIX:DEBUGGING | Something is broken, need to find and fix | "API returns 500 on POST" |
| OPTIMIZE:REFINEMENT | Working but needs improvement | "Speed up query from 2s to 200ms" |

### Tier 2: Domain Subtype (per shape)

| Domain | Signals | Overlay |
|--------|---------|---------|
| ML/Data | model, training, features, accuracy, loss, gradient, epoch, tensor | ml.md |
| **Quant Finance** (ML subdomain) | Sharpe, P&L, returns, alpha, drawdown, backtest, walk-forward, regime, lookahead, leakage, OHLCV, orderbook, slippage, trading, portfolio, signal decay, factor, position sizing, execution | ml.md + quant-finance.md |
| Web/Frontend | React, CSS, responsive, components, UI, layout, hydration, SSR, bundle | web.md |
| API/Backend | endpoints, auth, database, REST, GraphQL, middleware, ORM, migration | api.md |
| Systems/Infra | deploy, scale, monitor, CI/CD, containers, Kubernetes, Terraform, pipeline | systems.md |
| General | None of the above specifically | none |

**Quant Finance detection:** When ML domain is detected AND quant signals are present, activate quant persona from `references/quant-finance.md`. This activates heightened skepticism, temporal contamination awareness, and trading-specific reasoning patterns. Quant subtypes: LOOKAHEAD, LEAKAGE, BACKTEST_OVERFIT, REGIME_BLIND, SIGNAL_DECAY, EXECUTION_GAP, LOSS_MISALIGN, CAPACITY.

---

## Classification Matrix (Shape x Domain) — Extended

### BUILD:GREENFIELD

| Domain | Classification Signals | Typical Phase Structure | Risk Profile | Front-Load Strategy |
|--------|----------------------|------------------------|--------------|-------------------|
| ML | "new model", "train from scratch", "build pipeline", "predict X from Y" | 4-6 phases: Data audit → Baseline → Feature eng → Model iteration → Eval → Deploy | Data quality unknown, compute budget unclear, metric may be wrong | Validate data quality AND baseline feasibility in Phase 1 |
| Web | "new app", "build site", "create dashboard", "design UI" | 3-5 phases: Scaffold → Core layout → Features → Polish → Deploy | Scope creep on UI, browser compat, performance budget missed | Nail the component architecture and routing in Phase 1 |
| API | "new service", "build API", "create backend", "microservice" | 3-5 phases: Schema design → Core endpoints → Auth/middleware → Integration → Deploy | Schema changes late, auth complexity, migration strategy | Lock data model and auth strategy in Phase 1 |
| Systems | "set up infra", "build pipeline", "create cluster", "automate deployment" | 3-4 phases: Architecture → Core infra → Automation → Hardening | Vendor lock-in, security gaps, cost overrun | Validate cost model and security requirements in Phase 1 |
| General | "build tool", "create script", "new project" | 2-4 phases: Design → Core → Features → Polish | Unclear requirements, scope creep | Validate core use case with working prototype in Phase 1 |

### BUILD:BROWNFIELD

| Domain | Classification Signals | Typical Phase Structure | Risk Profile | Front-Load Strategy |
|--------|----------------------|------------------------|--------------|-------------------|
| ML | "add feature to model", "retrain", "update pipeline", "add new data source" | 3-4 phases: Codebase audit → Integration point → Implementation → Validation | Breaking existing model performance, training pipeline fragility | Map existing pipeline dependencies AND run baseline metrics before changing anything |
| Web | "add component", "new page", "integrate widget", "update UI" | 2-4 phases: Codebase audit → Seam identification → Implementation → Integration test | Breaking existing styles, state management conflicts, bundle size regression | Understand existing component tree and state flow before adding |
| API | "add endpoint", "new feature", "extend API", "add field" | 2-4 phases: Schema review → Migration plan → Implementation → Backward compat check | Breaking existing clients, migration failures, auth gaps | Check existing API contract and write characterization tests first |
| Systems | "add monitoring", "update pipeline", "migrate to X", "add service" | 2-4 phases: Current state audit → Change plan → Implementation → Rollback verification | Breaking existing deployments, config drift, downtime | Document current state AND verify rollback procedure before changing |
| General | "add feature", "extend tool", "modify behavior" | 2-3 phases: Code review → Implementation → Verification | Regressions, unexpected side effects | Read and understand existing code before modifying |

### FIX:DEBUGGING

| Domain | Classification Signals | Typical Phase Structure | Risk Profile | Front-Load Strategy |
|--------|----------------------|------------------------|--------------|-------------------|
| ML | "model not converging", "accuracy dropped", "NaN loss", "prediction wrong" | 2-3 phases: Reproduce → Diagnose → Fix + verify | Fixing symptom not cause, introducing new regression | Reproduce consistently AND check if recent changes correlate |
| Web | "page blank", "layout broken", "not rendering", "console errors" | 1-3 phases: Reproduce → Isolate → Fix + verify | Fix creates new visual regression, browser-specific | Check console errors AND network tab immediately |
| API | "500 error", "timeout", "wrong response", "auth failing" | 1-3 phases: Reproduce → Log analysis → Fix + verify | Masking root cause, fix introduces different failure | Check server logs AND reproduce with exact request |
| Systems | "pods crashing", "deploy failing", "latency spike", "disk full" | 1-3 phases: Triage → Root cause → Fix + verify | Applying band-aid, recurrence, cascading failure | Check system events AND recent deployments immediately |
| General | "not working", "error", "bug", "broken" | 1-3 phases: Reproduce → Diagnose → Fix | Insufficient information, vague symptoms | Get exact error message AND reproduction steps |

### OPTIMIZE:REFINEMENT

| Domain | Classification Signals | Typical Phase Structure | Risk Profile | Front-Load Strategy |
|--------|----------------------|------------------------|--------------|-------------------|
| ML | "improve Sharpe", "reduce loss", "better accuracy", "faster training" | 2-4 phases: Baseline measurement → Analysis → Optimization → Validation | Overfitting to test set, metric gaming, regression on other metrics | Measure current baseline with proper eval methodology first |
| Web | "faster load", "reduce bundle", "improve CLS", "better lighthouse" | 2-3 phases: Profile → Optimize → Verify no regression | Functionality regression, over-optimization, diminishing returns | Run lighthouse/profiler AND set specific numeric target |
| API | "faster queries", "reduce latency", "handle more load", "optimize DB" | 2-3 phases: Profile → Optimize → Load test | Query plan regression, cache invalidation bugs, new bottleneck | Run EXPLAIN ANALYZE AND profile request lifecycle |
| Systems | "reduce costs", "improve uptime", "scale to X", "reduce deploy time" | 2-4 phases: Measure → Identify bottleneck → Optimize → Verify | Cost reduction breaks reliability, scaling introduces new failure modes | Measure current state with specific metrics AND define acceptable tradeoffs |
| General | "make it faster", "clean up", "refactor", "improve" | 2-3 phases: Measure → Optimize → Verify | Premature optimization, regression | Profile before optimizing, measure after |

---

## Diagnostic Question Bank

### BUILD:GREENFIELD Questions
1. "What is the core outcome you need?" (Goal extraction)
2. "What constraints are non-negotiable?" (Constraint extraction)
3. "What's your deployment target?" (Environment context)
4. "Do you have existing data/content to work with?" (Input context)
5. "What does 'done' look like? What's the acceptance criteria?" (Completion definition)
6. "Who is the end user and what's their technical level?" (User context)
7. "What's the timeline pressure?" (Urgency calibration)
8. "Are there similar systems you want to emulate or avoid?" (Reference points)

### BUILD:BROWNFIELD Questions
1. "What's the current codebase like?" (Existing context)
2. "What specifically needs to change?" (Delta extraction)
3. "What must NOT break?" (Constraint extraction)
4. "Are there existing tests?" (Safety net assessment)
5. "Who else works on this codebase?" (Coordination needs)
6. "What's the deployment process?" (Release context)
7. "What's the git history look like for the area being changed?" (Change velocity)
8. "Are there known tech debt items blocking this change?" (Obstacle mapping)

### FIX:DEBUGGING Questions
1. "When did it start failing?" (Timeline)
2. "What changed recently?" (Change correlation)
3. "Can you reproduce it consistently?" (Reproducibility)
4. "What have you already tried?" (Closed paths)
5. "What's the exact error message?" (Symptom precision)
6. "Does it fail in all environments or just one?" (Environment isolation)
7. "What percentage of requests/users are affected?" (Impact scope)
8. "Is there a workaround in place?" (Urgency calibration)

### OPTIMIZE:REFINEMENT Questions
1. "What's the current metric and target?" (Gap quantification)
2. "Where do you suspect the bottleneck?" (Hypothesis seeding)
3. "What are the constraints on the solution?" (Bounds)
4. "Is there a regression risk?" (Safety assessment)
5. "How was the current implementation designed?" (Intent archaeology)
6. "What's the measurement methodology?" (Metric validity)
7. "Are there tradeoffs you're willing to make?" (Optimization budget)
8. "What's the cost of NOT optimizing?" (Priority calibration)

---

## Domain-Specific Question Extensions

### ML Domain
- "What data do you have?" (volume, features, quality)
- "What's your training budget?" (compute, time)
- "What metric matters most?" (Sharpe, accuracy, F1, etc.)
- "Is this online or batch?" (Training paradigm)
- "What's the feature engineering pipeline?" (Data transformation)
- "How is the data split? Train/val/test or walk-forward?" (Evaluation rigor)
- "Are there known biases or class imbalances?" (Data pathology)
- "What's the inference latency requirement?" (Serving constraint)
- "Is there a human-in-the-loop or fully automated?" (Autonomy level)

### Quantitative Finance Domain (ML subdomain)
These questions activate when quant finance is detected. They are MORE IMPORTANT than generic ML questions.
- "Has a point-in-time audit been done on the feature pipeline? Can every feature be computed without future data?" (Lookahead contamination — the #1 silent killer)
- "What's the validation framework — walk-forward with purging, or single train/test split?" (Evaluation integrity)
- "What regimes does the training data cover? Bull, bear, sideways, crisis?" (Regime coverage)
- "Are transaction costs modeled in the evaluation? Spread, slippage, market impact?" (Execution realism)
- "How many strategy variations have been tested on this dataset? What's the multiple testing correction?" (Data snooping / backtest overfitting)
- "What's the out-of-sample holdout policy? Has the test set been touched?" (Test set sanctity)
- "What is the causal mechanism — why would this alpha exist? Who is on the other side of the trade?" (Edge source identification)
- "What's the strategy's capacity? At what AUM does market impact eat the alpha?" (Scalability)
- "Is the universe survivorship-free? Does it include delisted assets?" (Survivorship bias)
- "What's the signal-to-noise ratio in the target? Is direction prediction realistic for this asset/frequency?" (Theoretical ceiling)

### Web Domain
- "What browsers/devices must be supported?" (Compatibility)
- "Is there an existing design system?" (Component reuse)
- "What's the performance budget?" (Core Web Vitals)
- "SSR, SSG, or SPA?" (Rendering strategy)
- "What state management is in use?" (Data flow)
- "Accessibility requirements? WCAG level?" (A11y compliance)
- "What's the build tooling?" (Webpack, Vite, Next.js, etc.)
- "Is there i18n/l10n required?" (Internationalization)

### API Domain
- "What auth method?" (Security model)
- "Expected request volume?" (Scale requirements)
- "Backward compatibility needed?" (Evolution constraints)
- "What's the data model?" (Schema complexity)
- "Sync or async operations?" (Processing model)
- "What database and why?" (Storage strategy)
- "Rate limiting requirements?" (Abuse prevention)
- "API versioning strategy?" (Evolution plan)

### Systems Domain
- "What's the SLA?" (Reliability target)
- "Cloud provider constraints?" (Platform lock-in)
- "Compliance requirements?" (Regulatory bounds)
- "What's the observability stack?" (Monitoring capability)
- "Disaster recovery plan?" (Failure preparedness)
- "What's the blast radius of a failed deploy?" (Risk containment)
- "Multi-region or single-region?" (Geographic requirements)
- "What's the cost ceiling?" (Budget constraint)

### Mobile Domain
- "iOS, Android, or both?" (Platform scope)
- "What's the minimum OS version?" (API availability)
- "Offline-first or online-only?" (Data architecture)
- "What's the navigation structure?" (Screen architecture)
- "How is auth handled on device?" (Secure storage, biometric)
- "Push notification requirements?" (Server integration, deep linking)
- "What's the target app size?" (Download conversion)
- "App store submission process?" (Automated or manual)
- "Crash reporting and analytics?" (Production visibility)
- "Performance targets?" (Startup time, frame rate, memory)

### Desktop Domain
- "Electron, Tauri, or native?" (Framework and process model)
- "Windows, macOS, Linux, or all?" (Platform matrix)
- "Local-first or cloud-dependent?" (Data architecture)
- "What native OS features needed?" (File system, tray, notifications)
- "Auto-update strategy?" (Distribution and update mechanism)
- "Code signing set up?" (Distribution readiness)
- "Expected session duration?" (Memory management implications)
- "System integration needs?" (File associations, protocol handlers)

### Data Analysis Domain
- "What's the research question?" (Analysis focus)
- "Exploratory or confirmatory?" (Statistical rigor level)
- "What's the sample size?" (Statistical power)
- "What methods are planned and why?" (Methodology selection)
- "Known confounders?" (Causal validity)
- "How to handle missing data?" (Imputation strategy)
- "Deliverable format?" (Notebook, report, dashboard)
- "Reproducibility requirement?" (Seeds, versions, data snapshots)
- "Multiple comparisons planned?" (Correction method needed)

### Data Engineering Domain
- "Data volume per time unit?" (Batch vs streaming)
- "Data quality contract?" (Schema validation, dedup)
- "Freshness SLA?" (Architecture constraint)
- "Late data handling?" (Event-time vs processing-time)
- "Reprocessing capability?" (Backfill strategy)
- "Who consumes the output?" (Consumer requirements)
- "Failure handling strategy?" (Alerting, retry, manual)
- "Retention policy?" (Storage cost vs compliance)
- "Schema evolution strategy?" (Registry, documentation, ad-hoc)
- "Cost monitoring?" (Budget ceiling, per-run tracking)

---

## Failure Signatures

Failure signatures map observable symptoms to likely causes. Use these to short-circuit diagnosis — do NOT start from scratch when a known pattern matches.

### ML Failures

| Symptom | Likely Cause | First Check | Common Misdiagnosis |
|---------|-------------|-------------|---------------------|
| Loss not decreasing | Learning rate too high OR data quality issue | Plot loss curve per epoch, try 10x lower LR | "Model too simple" (usually wrong) |
| Loss decreasing but metric flat | Wrong loss function OR data leakage | Check eval vs train distribution, audit features for lookahead | "Need more data" (rarely the issue) |
| Good train, bad eval | Overfitting OR distribution mismatch | Plot train/eval gap over time, check for temporal leakage | "Need regularization" (not always — check data first) |
| Model outputs constant value | Dead neurons OR label imbalance | Check output distribution, verify label balance | "Training failed" (too vague — find WHY) |
| NaN in training | Gradient explosion OR bad data (inf/nan in features) | Check for inf/nan in features, reduce LR, add gradient clipping | "Learning rate too high" (sometimes, but check data first) |
| Sharpe drops after retrain | Regime change OR data drift | Compare feature distributions pre/post, check for concept drift | "Model degraded" (vague — identify WHAT changed) |
| High Sharpe but loses money | Survivorship bias OR lookahead bias | Walk-forward validation, check for future data leaking into features | "Market changed" (convenient excuse — audit methodology) |
| Training extremely slow | Data loading bottleneck OR unnecessary computation | Profile with torch profiler, check DataLoader num_workers | "Need more GPU" (usually wrong — profile first) |
| Feature importance is random | Noisy features OR multicollinearity | Check feature correlations, try feature ablation study | "Bad model" (bad features are far more common) |
| Model works on sample, fails on full data | Data quality issues at scale OR memory constraints | Check for edge cases in full dataset, monitor memory usage | "Sampling is representative" (dangerous assumption) |
| Predictions clustered in narrow range | Target normalization issue OR sigmoid saturation | Check target distribution and output activation | "Model is conservative" (it's likely broken) |
| Backtest great, live performance poor | Lookahead bias OR execution assumptions | Audit feature availability at prediction time | "Market is different now" (audit methodology first) |

### Quantitative Finance Failures (ML subdomain — activate with quant detection)

| Symptom | Likely Cause | First Check | Common Misdiagnosis |
|---------|-------------|-------------|---------------------|
| Strategy Sharpe > 3 in backtest | Lookahead bias or survivorship bias | Audit every feature for point-in-time availability. Add 1-bar delay buffer to all features. Re-run. | "We found alpha" (you found a bug) |
| Backtest profitable, live trading flat/negative | Execution gap: fill assumptions, latency, market impact | Compare assumed vs actual fills. Model realistic slippage. Check signal latency. | "Market changed" (your backtest was unrealistic) |
| Model accuracy degrades over rolling windows | Signal decay or regime shift | Plot rolling metric with regime overlay. Check if same features still carry information. | "Model needs retraining" (maybe the signal is gone permanently) |
| Direction accuracy barely above random (50-53%) | Weak signal, wrong loss function, or feature ceiling | Test linear baseline on same features. If linear also ~52%, features don't contain directional information. | "Need better architecture" (architecture can't create signal that isn't in the data) |
| Auxiliary loss improves but target metric doesn't | Loss-metric misalignment | Map each loss component to target metric. Check gradient magnitudes per component. | "Training is working" (training is optimizing the wrong thing) |
| Strategy works in trending markets, dies in choppy markets | Regime-dependent alpha | Segment performance by VIX regime, trend strength, or volatility bucket. | "Strategy is robust" (it's only robust in one regime) |
| Walk-forward performance much worse than single split | Overfitting to specific period | Reduce model complexity. Check for period-specific features. | "Walk-forward is too strict" (walk-forward is realistic, your single split was lucky) |
| Adding more features doesn't improve performance | Feature saturation or multicollinearity | Run feature ablation. Check correlation matrix. Test with feature subsets. | "Need more data" (you might need BETTER features, not more) |
| Model confident but wrong on large moves | Tail risk blindness | Check calibration on extreme events separately. Model may be calibrated on average but uncalibrated on tails. | "Outlier events, can't predict those" (if your strategy is exposed to them, you must account for them) |
| Ensemble of strategies has lower Sharpe than best individual | Negative diversification: strategies are correlated | Check correlation matrix of strategy returns. Ensure strategies exploit different edges. | "Ensemble should always be better" (only if strategies are genuinely diverse) |
| Backtest Sharpe 2+, live Sharpe < 0.5 | Execution cost underestimation (2-3x gap) | Compare assumed vs realized costs. Check fill rate, slippage, latency. See Case 6 in production-failure-case-studies.md | "Alpha decayed" (costs were never modeled realistically) |
| ALL parameter configs negative in test | No alpha in strategy class, multiple testing artifact | Compute DSR across all configs. Check expected max Sharpe for N trials. See Case 4. | "Need to tune more" (the entire strategy class has no edge) |
| Train-test gap > 10% | Feature leakage via normalization, feature selection, or split method | Audit full pipeline for expanding-window normalization, split temporal ordering. See Cases 1, 2, 5. | "Model just overfits a little" (10%+ gap = leakage, not overfitting) |
| Strategy performance identical across all regimes | Normalization or regime detection using future data | Check if z-scores, HMM, or regime labels use full-dataset statistics. See Case 3. | "Robust strategy" (too good to be true — check for leakage) |
| Signal IC declines monotonically over OOS | Alpha decay: signal losing predictive power | Estimate IC half-life. Check if factor is published/crowded. Load alpha-decay-patterns.md | "Needs retraining" (maybe the alpha is permanently gone) |
| Rolling Sharpe dropping but P&L still positive | Transition from alpha to noise — strategy becoming break-even | Check rolling IC, distribution drift (KS test). Load live-drift-detection.md | "Just a drawdown" (could be permanent alpha erosion) |
| Strategy profitable but can't scale beyond small size | Market impact eating alpha at larger sizes | Estimate capacity with square-root impact law. Check volume participation rate. | "Just need more capital" (strategy has capacity limits) |

### Web Failures

| Symptom | Likely Cause | First Check | Common Misdiagnosis |
|---------|-------------|-------------|---------------------|
| Blank page | JS error blocking render | Console errors + network tab for failed resources | "Deployment issue" (check client-side first) |
| Layout shift on load | Images/fonts without dimensions OR late-loading content | CLS audit, check for unsized media | "CSS bug" (it's a missing dimension) |
| Hydration mismatch | Server/client state divergence | Check for Date/Math.random/window refs in SSR code | "React bug" (it's YOUR code diverging) |
| Slow initial load | Bundle too large OR no code splitting | Webpack bundle analyzer, check main chunk size | "Server slow" (usually client bundle) |
| State not updating | Stale closure OR missing dependency array entry | React DevTools, check useEffect/useCallback dependency arrays | "State library bug" (almost always user error) |
| Works locally, broken in prod | Env var missing OR build optimization removing code | Compare build outputs, check env var injection | "Works on my machine" (environment difference) |
| Mobile layout broken | Missing viewport meta OR fixed pixel widths | DevTools mobile emulation, check for hardcoded widths | "CSS framework issue" (usually missing responsive rules) |
| Component re-renders excessively | Missing memoization OR unstable reference in props | React Profiler, check for new object/array literals in render | "React is slow" (your render cycle is wrong) |
| CSS not applying | Specificity conflict OR scoping issue | Inspect element, check computed styles | "CSS is broken" (specificity always wins) |
| Form submission not working | preventDefault missing OR wrong form action | Check onSubmit handler, verify form element nesting | "Backend issue" (check frontend form handling first) |
| Infinite loading spinner | Promise never resolves OR error swallowed | Check network tab for pending/failed requests | "API is down" (could be client-side error handling) |
| Images not loading | Wrong path OR CORS OR missing public directory config | Network tab 404s, check image src paths | "Broken images" (usually path configuration) |

### API Failures

| Symptom | Likely Cause | First Check | Common Misdiagnosis |
|---------|-------------|-------------|---------------------|
| 500 error on POST | Validation failure OR unhandled exception | Server logs + request body + stack trace | "Server crashed" (usually unhandled edge case) |
| Slow queries | Missing index OR N+1 queries | EXPLAIN ANALYZE + count total queries per request | "Database slow" (database is fine, queries are bad) |
| Auth token rejected | Token expired OR wrong audience/issuer | Decode JWT at jwt.io, check exp/aud/iss claims | "Auth broken" (token configuration issue) |
| CORS errors | Missing headers OR preflight OPTIONS not handled | Check OPTIONS response headers | "Server blocking requests" (server not ALLOWING requests) |
| Data inconsistency | Race condition OR missing transaction wrapper | Check for concurrent writes, audit transaction boundaries | "Bug in logic" (concurrency bug, not logic bug) |
| Memory leak | Connection pool exhaustion OR event listener accumulation | Process memory over time, check connection pool stats | "Need more RAM" (you're leaking, not undersized) |
| Timeout on some requests | Connection pool exhaustion OR slow downstream dependency | Trace request lifecycle, check pool wait times | "Network issue" (usually resource exhaustion) |
| 404 on valid route | Route ordering conflict OR middleware short-circuiting | Check route registration order, middleware chain | "Route not defined" (it's defined but shadowed) |
| Partial response data | Serialization error OR lazy loading not triggered | Check ORM query includes/joins | "Data missing from DB" (data exists, query is incomplete) |
| Webhook not firing | Retry exhaustion OR wrong URL OR SSL verification failure | Check webhook delivery logs and response codes | "Webhook service broken" (usually configuration) |
| Request body empty | Content-Type header wrong OR body parser not configured | Check Content-Type header and body parser middleware | "Client sending empty body" (parser not matching content type) |
| Pagination returning duplicates | Sort order not stable OR concurrent inserts | Add unique tiebreaker to sort, use cursor-based pagination | "Database bug" (unstable sort + offset pagination) |

### Systems Failures

| Symptom | Likely Cause | First Check | Common Misdiagnosis |
|---------|-------------|-------------|---------------------|
| Pods restarting | OOM kill OR health check failing OR crash loop | kubectl describe pod + events, check exit codes | "Code crash" (often OOM or failed health check) |
| Deploy succeeds, app broken | Config mismatch OR missing migration OR wrong image tag | Compare configs between envs, check migration status | "Code bug" (usually environment configuration) |
| Latency spike at scale | Connection pool OR thread exhaustion OR GC pressure | Connection count + thread dumps + GC logs | "Need bigger instance" (usually resource management) |
| Intermittent failures | DNS resolution OR flaky dependency OR clock skew | Retry patterns + circuit breaker logs + DNS TTL | "Random issue" (nothing is random — find the pattern) |
| Disk full | Logs not rotated OR temp files OR unused images/volumes | df -h + find large files + check log rotation config | "Need bigger disk" (you're accumulating garbage) |
| SSL certificate error | Cert expired OR chain incomplete OR wrong domain | openssl s_client -connect host:443 | "Cert needs renewal" (might be chain or domain issue) |
| Load balancer unhealthy targets | Health check path wrong OR timeout too short | Check health check configuration and endpoint response time | "Instances are down" (health check misconfigured) |
| Container won't start | Missing env var OR port conflict OR image pull failure | Check container logs from the FIRST start attempt | "Bad image" (usually missing runtime config) |
| Terraform plan shows unexpected changes | State drift OR provider version change | terraform state list, check for manual changes | "Terraform bug" (state drifted from reality) |
| CI pipeline flaky | Test ordering dependency OR external service timeout OR resource contention | Check which tests fail and if they share state | "Tests are flaky" (tests have hidden dependencies) |
| DNS not resolving | TTL caching OR propagation delay OR wrong record type | dig/nslookup from multiple locations | "DNS is broken" (usually caching or propagation) |
| High cloud bill | Unused resources OR missing autoscaling OR data transfer costs | Cost explorer by service, check for idle resources | "Cloud is expensive" (you're paying for waste) |

---

## Resolution Strategies

Each project shape has a distinct resolution approach. Follow the strategy for the classified shape.

### BUILD:GREENFIELD Strategy
1. **Start with the simplest thing that could work** (baseline). Resist the urge to architect for scale on day 1.
2. **Validate the core hypothesis before building features.** If the core idea doesn't work, features are worthless.
3. **Front-load the riskiest technical decision.** Don't leave "can we actually do X?" for Phase 3.
4. **Each phase should produce a working increment.** No phase should end with "nothing runs yet."
5. **If stuck on architecture, build two small prototypes and compare.** 2 hours of prototyping beats 8 hours of debate.
6. **Define the walking skeleton first.** End-to-end path through the system, even if every part is minimal.
7. **Lock external interfaces early.** API contracts, data schemas, and integration points harden fast — decide early.

### BUILD:BROWNFIELD Strategy
1. **Map the existing codebase first.** Understand what exists before planning what to add.
2. **Identify the seam** where new code attaches to old. This seam is where complexity concentrates.
3. **Write characterization tests before changing anything.** Capture current behavior so you know if you break it.
4. **Change one thing at a time, verify after each change.** Small diffs, frequent verification.
5. **If the codebase resists change, refactor the seam first.** Sometimes the right first step is making the change easy, then making the easy change.
6. **Respect existing patterns** even if you disagree. Consistency in a codebase trumps local perfection.
7. **Check the blast radius.** Before changing shared code, trace all callers and dependents.

### FIX:DEBUGGING Strategy
1. **Reproduce consistently before diagnosing.** If you can't trigger it reliably, you can't verify the fix.
2. **Narrow the surface area** with binary search. Comment out half the system. Does it still fail?
3. **Form ONE hypothesis and test it.** Don't shotgun multiple changes — you won't know what fixed it.
4. **If the fix is complex, write a test that fails without it first.** The test proves the fix and prevents regression.
5. **Check: is this a symptom of a deeper issue?** A 500 error might be a missing null check, or it might be a broken data pipeline upstream.
6. **Read the error message carefully.** The actual error is often right there, ignored because it's long or unfamiliar.
7. **Check what changed.** git log, deployment history, config changes — most bugs are caused by recent changes.
8. **Time-box diagnosis.** If you haven't found it in 30 minutes with one approach, try a different angle.

### OPTIMIZE:REFINEMENT Strategy
1. **Measure before optimizing.** Profile, don't guess. The bottleneck is usually not where you think.
2. **Find THE bottleneck.** Optimizing non-bottlenecks produces zero improvement. Amdahl's Law.
3. **Set a specific numeric target.** "Faster" is not a goal. "P95 latency under 200ms" is a goal.
4. **Apply the minimum change that moves the metric.** Surgical optimization, not architectural overhaul.
5. **Verify no regression in other dimensions.** Faster but wrong is not an optimization.
6. **Know when to stop.** Diminishing returns are real. 2s → 200ms is valuable. 200ms → 180ms rarely is.
7. **Document what you tried and the results.** Optimization is empirical — keep the lab notebook.

---

## Anti-Patterns

Common mistakes the brain should actively detect and prevent.

### Planning Anti-Patterns

| Anti-Pattern | Description | Detection Signal | Correction |
|-------------|-------------|-----------------|------------|
| Big Bang | Trying to build everything in one phase | Phase has 10+ deliverables, no intermediate milestones | Break into increments, each producing working output |
| Gold Plating | Adding features nobody asked for | Requirements list keeps growing without user input | Stick to stated requirements, note nice-to-haves separately |
| Analysis Paralysis | Researching indefinitely instead of building | Multiple research phases, no code written | Set research time budget, then build with best available info |
| Premature Abstraction | Building frameworks before knowing requirements | "Let's build a generic X that handles any Y" | Build the concrete case first, extract abstractions from patterns |
| Resume-Driven Design | Choosing tech for novelty, not fit | Tech stack doesn't match team skills or project needs | Choose boring technology that solves the problem |
| Scope Creep by Implication | "While we're at it, let's also..." | Each phase grows 30%+ from original estimate | Explicit scope gate — new requests go to backlog |
| Cargo Cult Architecture | Copying Netflix/Google architecture for a small project | Microservices for a team of 2, Kubernetes for 100 users | Right-size the architecture to actual needs |

### Execution Anti-Patterns

| Anti-Pattern | Description | Detection Signal | Correction |
|-------------|-------------|-----------------|------------|
| Shotgun Debugging | Changing multiple things at once | Multiple files modified with "try this" mindset | One change, one test. Revert if it doesn't fix it. |
| Copy-Paste Architecture | Duplicating code without understanding | Same code block appears 3+ times | Understand the pattern, then extract and reuse |
| TODO-Driven Development | Leaving stubs and placeholders for "later" | Code full of TODO/FIXME/HACK comments | Build complete or defer entirely. No half-implementations. |
| Over-Engineering | Building for hypothetical future requirements | "What if we need to support X later?" | YAGNI — You Aren't Gonna Need It. Build for now. |
| Lava Flow | Dead code and obsolete features left in codebase | Large sections of commented-out or unreachable code | Delete dead code. Git remembers it if you need it back. |
| God Object/Function | One class/function that does everything | Function > 100 lines, class with 20+ methods | Single Responsibility — split by behavior |
| Stringly Typed | Using strings where structured types belong | String parsing/comparison for control flow | Use enums, types, or structured data |

### Quantitative Finance Anti-Patterns

| Anti-Pattern | Description | Detection Signal | Correction |
|-------------|-------------|-----------------|------------|
| Backtest Archaeology | Mining historical data for patterns that "explain" past events | Strategy has many parameters tuned to historical events | Reduce degrees of freedom. Test on truly out-of-sample data. |
| Sharpe Worship | Optimizing Sharpe ratio at the expense of everything else | High Sharpe but concentrated in few trades or short period | Check Calmar, drawdown, and profit factor. Sharpe alone is insufficient. |
| Complexity Escalation | Adding model complexity when simple models fail | Jumping to transformers/diffusion when linear can't find signal | If a linear model can't find it, the signal probably isn't in your features. Fix inputs, not architecture. |
| Survivorship Blindness | Using only currently-listed assets for historical analysis | Dataset doesn't include delisted/bankrupt assets | Use point-in-time universe. Include dead stocks. Major source of upward bias. |
| Mid-Price Fantasy | Backtesting with mid-price fills and no transaction costs | No slippage model, no spread, no market impact | Model realistic execution. The difference between mid and actual fill is often larger than the alpha. |
| Peek-and-Adjust | Looking at test set results and "adjusting" the strategy | Multiple rounds of changes after seeing out-of-sample results | Test set is ONE shot. If you peeked, it's no longer out-of-sample. Get new data. |
| Feature Timestamp Neglect | Not auditing when features become available | Features computed without explicit point-in-time logic | Every feature needs a timestamp audit: "At time T, could I have computed this?" |
| Single Seed Conviction | Drawing conclusions from one random seed | "It works!" based on one training run | Run 5+ seeds. If results vary by >2% across seeds, the signal is noise-dependent. |
| Regime Amnesia | Training only on recent (favorable) data | Training period excludes major market events (crashes, regime changes) | Ensure training covers at least one full market cycle. |
| Alpha Decay Denial | Deploying a strategy without monitoring for decay | No rolling performance monitoring post-deployment | Monitor rolling Sharpe and compare to backtest expectations. Set automatic shutdown thresholds. |
| Cost Optimism | Assuming flat, low transaction costs in backtest | Flat bps cost model, no market impact, no slippage | Use square-root impact law. Validate costs with first 100 live fills. See production-reality.md. |
| Capacity Blindness | Not estimating strategy capacity before deployment | No volume participation limits, no market depth analysis | Estimate capacity with impact model. Size for stressed conditions, not average. |
| Kill Switch Absence | No automated risk limits for live trading | No max drawdown halt, no daily loss limit, no position limits | Implement kill switches BEFORE going live. Non-negotiable. See risk-management-framework.md. |
| DSR Ignorance | Reporting raw Sharpe from best of N backtests | Multiple configs tested, best Sharpe reported without correction | Apply Deflated Sharpe Ratio. Count ALL configs ever tested. See overfitting-diagnostics.md. |
| Published Factor Naivety | Building strategy around a published academic factor without checking decay | Factor IC assumed same as paper's reported IC | Check factor publication date, estimate current IC, assess crowding. See alpha-decay-patterns.md. |
| Paper Trading Skipping | Deploying with real capital without shadow period | No paper trading phase, direct backtest-to-live | Minimum 2 weeks paper trading. Compare shadow results to backtest expectations. |
| Drawdown Normalization | Treating large train-test gaps as "normal" overfitting | 10-20% accuracy gap between train and test accepted | >5% gap in classification = leakage signal. Investigate, don't normalize. See Case 5. |

### Verification Anti-Patterns

| Anti-Pattern | Description | Detection Signal | Correction |
|-------------|-------------|-----------------|------------|
| Happy Path Only | Testing only the success case | No error handling tests, no edge case coverage | Test errors, edge cases, empty states, and boundaries |
| Testing Implementation | Tests coupled to internal code structure | Tests break when refactoring without behavior change | Test behavior and outputs, not internal methods |
| False Confidence | Tests pass but don't verify real requirements | High coverage but bugs still ship | Goal-backward testing — start from user outcomes |
| Skipping Verification | "It works on my machine" | No CI, no automated tests, manual verification only | Automate verification, run in clean environment |
| Flaky Test Tolerance | Accepting intermittently failing tests | "Just re-run it" culture | Fix flaky tests immediately — they erode trust in the suite |
| Testing in Production | No staging environment, no pre-release validation | Bugs discovered by users, not tests | Stage → Test → Deploy pipeline |
| Snapshot Apathy | Snapshot tests accepted without review | "Update snapshots" committed blindly | Review every snapshot change — they encode behavior |

---

## Domain Overlap Patterns

Many projects span multiple domains. When overlap is detected, identify primary and secondary domains, then apply the combined strategy.

### ML + API (Model Serving)
- **Primary:** ML | **Secondary:** API
- **Key Concern:** Training/serving skew, latency vs accuracy tradeoff, feature availability at inference time
- **Strategy:** Build and validate model first, then wrap in API. Monitor prediction distribution drift in production.
- **Common Pitfall:** Features available in training but not at serving time (lookahead in training pipeline)
- **Phase Structure:** Data → Model → API wrapper → Monitoring → Drift detection

### Web + API (Full Stack)
- **Primary:** Web | **Secondary:** API
- **Key Concern:** API contract stability, loading states, error propagation, optimistic updates
- **Strategy:** Define API contract first (OpenAPI/GraphQL schema), build frontend and backend in parallel, integrate late.
- **Common Pitfall:** Building UI before API is stable, leading to constant frontend rework
- **Phase Structure:** API contract → Parallel build → Integration → End-to-end testing

### API + Systems (Production Backend)
- **Primary:** API | **Secondary:** Systems
- **Key Concern:** Operational reliability, deployment pipeline, observability, graceful degradation
- **Strategy:** Build API with observability from day 1 (structured logging, health checks, metrics). Automate deployment early.
- **Common Pitfall:** Building the API without considering how it will be deployed, monitored, and scaled
- **Phase Structure:** API + observability → CI/CD pipeline → Staging environment → Production hardening

### ML + Systems (MLOps)
- **Primary:** ML | **Secondary:** Systems
- **Key Concern:** Training pipeline reliability, model versioning, experiment tracking, rollback capability
- **Strategy:** Automate the training pipeline before optimizing the model. A reproducible mediocre model beats an irreproducible great one.
- **Common Pitfall:** Spending weeks on model improvement without version control or reproducibility
- **Phase Structure:** Pipeline automation → Experiment tracking → Model training → Deployment automation → Monitoring

### Web + ML (Interactive ML)
- **Primary:** Web | **Secondary:** ML
- **Key Concern:** Inference latency for interactive use, model size for client-side, graceful degradation without model
- **Strategy:** Build UI with mock predictions first, then integrate real model. Consider client-side vs server-side inference.
- **Common Pitfall:** Waiting for perfect model before building any UI, resulting in no user feedback loop
- **Phase Structure:** UI with mocks → Model integration → Latency optimization → Progressive enhancement

### Web + Systems (Frontend Platform)
- **Primary:** Web | **Secondary:** Systems
- **Key Concern:** CDN configuration, build pipeline, preview deployments, performance monitoring
- **Strategy:** Set up deployment pipeline early. Preview deploys per PR. Performance budgets enforced in CI.
- **Common Pitfall:** Manual deployments blocking iteration speed
- **Phase Structure:** Build pipeline → CDN/hosting → Preview deploys → Performance monitoring → Edge optimization

### Triple Overlap (Full Stack ML)
- **Primary:** ML | **Secondary:** API + Web
- **Key Concern:** Everything above, plus integration complexity across all three layers
- **Strategy:** Build vertically — thin slice through all three layers first, then widen each layer.
- **Common Pitfall:** Perfecting one layer before touching others, leading to integration surprises
- **Phase Structure:** Thin vertical slice → Model improvement → API hardening → UI polish → Production readiness

---

## Confidence Calibration

Confidence levels determine how aggressively the brain should commit to a diagnosis or plan. Miscalibrated confidence causes either paralysis (too low) or recklessness (too high).

### High Confidence Indicators
- Reproduced the issue 3+ times with consistent results
- Direct causal evidence: change X → observed Y, revert X → Y disappears
- Metric improvement measured quantitatively after change
- Prior experience with this exact pattern in this exact context
- Multiple independent signals converge on the same conclusion
- Solution is well-documented in official sources
- **Action:** Commit to the plan. Execute with full effort.

### Medium Confidence Indicators
- Reproduced once or twice, but not consistently
- Correlational evidence: X and Y occur together, but causation uncertain
- Metric improved but could be noise (not statistically significant)
- Similar but not identical prior experience (analogous pattern)
- Some signals support the hypothesis, some are ambiguous
- Solution found in community sources (Stack Overflow, blog posts)
- **Action:** Proceed but build in verification checkpoints. Have a Plan B ready.

### Low Confidence Indicators
- Cannot reliably reproduce the issue
- Theoretical reasoning only — no empirical evidence yet
- No metric movement or measurement capability
- No prior experience with this pattern
- Conflicting signals — evidence points in multiple directions
- Solution is speculative or based on outdated information
- **Action:** Run a targeted experiment to increase confidence before committing. Time-box the experiment.

### Confidence Transitions

| Trigger | Direction | Example |
|---------|-----------|---------|
| Successful reproduction | Low → Medium | "I can trigger the bug reliably now" |
| Quantitative measurement | Medium → High | "Latency dropped from 2s to 200ms after the index" |
| Independent confirmation | Any → Up one level | "Another developer hit the same issue and same fix worked" |
| Counter-evidence discovered | Any → Down one level | "Fix worked in staging but not production" |
| Fix applied but problem persists | High → Low | "Added the index but queries are still slow" |
| New information invalidates assumption | Any → Reset to Low | "The data we were training on had a different schema than production" |
| Successful replication in new environment | Medium → High | "Works in staging AND production" |
| Passage of time without recurrence | Medium → High | "No incidents in 2 weeks since the fix" |

### Confidence-Based Decision Rules
- **High confidence + High urgency:** Act immediately, verify after
- **High confidence + Low urgency:** Act in next planned phase
- **Medium confidence + High urgency:** Act with rollback plan ready
- **Medium confidence + Low urgency:** Run experiment first, then act
- **Low confidence + High urgency:** Apply safest possible mitigation, investigate root cause in parallel
- **Low confidence + Low urgency:** Investigate until confidence rises, do not act yet

---

## Severity Classification

When a FIX:DEBUGGING request arrives, classify severity to determine response urgency.

| Severity | Definition | Response Time | Example |
|----------|-----------|---------------|---------|
| P0 — Critical | System down, data loss, security breach | Immediate, all hands | Production database corrupted, API returning user data to wrong users |
| P1 — High | Major feature broken, significant user impact | Same day | Payment processing failing, login broken for all users |
| P2 — Medium | Feature degraded, workaround exists | This week | Search returns incomplete results, slow but functional |
| P3 — Low | Minor issue, cosmetic, edge case | Next sprint | Tooltip misaligned, rare error on unusual input |

---

## Complexity Estimation Heuristics

Quick estimation of project complexity to calibrate phase count and time expectations.

| Factor | Low Complexity | Medium Complexity | High Complexity |
|--------|---------------|-------------------|-----------------|
| External dependencies | 0-1 | 2-4 | 5+ |
| Data sources | 1 | 2-3 | 4+ or real-time |
| Auth requirements | None or API key | JWT/OAuth single provider | Multi-provider, RBAC, MFA |
| Deployment target | Single server/static | Container + CI/CD | Multi-region, multi-service |
| Team size | Solo | 2-4 | 5+ with coordination |
| State management | Stateless or simple | Session/cache state | Distributed state, CQRS |
| Regulatory requirements | None | Basic (GDPR, etc.) | Heavy (HIPAA, SOX, PCI) |
| Integration complexity | No integrations | REST API integrations | Event-driven, async, webhooks |

**Phase count heuristic:** Low = 2-3 phases, Medium = 3-5 phases, High = 5-7 phases.

---

## Quick Reference: Classification Decision Tree

```
1. Does existing code need to change?
   ├── YES → Is something currently broken?
   │   ├── YES → FIX:DEBUGGING
   │   └── NO → Is it working but needs to be better?
   │       ├── YES → OPTIMIZE:REFINEMENT
   │       └── NO → BUILD:BROWNFIELD (adding new capability)
   └── NO → BUILD:GREENFIELD

2. What domain? (check for keyword signals)
   ├── model/training/loss/features/accuracy → ML
   │   └── Sharpe/P&L/backtest/regime/lookahead/trading? → ML:QUANT (activate quant persona)
   ├── React/CSS/component/layout/UI/page/hydration/SSR/bundle → Web
   ├── endpoint/auth/database/REST/GraphQL/ORM/migration/JWT → API
   ├── deploy/scale/Kubernetes/Terraform/CI/Docker/monitoring/SRE → Systems
   ├── React Native/Flutter/iOS/Android/mobile/app/offline/push → Mobile
   ├── Electron/Tauri/desktop/IPC/tray/main process/renderer → Desktop
   ├── pandas/numpy/scipy/statistics/EDA/p-value/A/B test → Data Analysis
   ├── pipeline/ETL/Airflow/Spark/dbt/Kafka/warehouse/BigQuery → Data Engineering
   └── None of the above → General

3. Check for domain overlap (multiple signal clusters present)
   └── If overlap detected → See Domain Overlap Patterns section

4. Domain-specific activation:
   ├── ML:QUANT detected → Load references/quant-finance.md → heightened skepticism, temporal discipline
   ├── Web detected → Load references/web-reasoning.md → performance measurement, accessibility rigor
   ├── API detected → Load references/api-reasoning.md → contract discipline, security awareness
   ├── Systems detected → Load references/systems-reasoning.md → failure mode analysis, blast radius
   ├── Mobile detected → Load references/mobile-reasoning.md → offline-first, platform parity
   ├── Desktop detected → Load references/desktop-reasoning.md → memory management, IPC security
   ├── Data Analysis detected → Load references/data-analysis-reasoning.md → methodological rigor
   └── Data Engineering detected → Load references/data-engineering-reasoning.md → idempotency, schema contracts
```

---

## Mobile Development Extension

### Mobile Diagnostic Categories

| Category | Signal | Key Concern |
|----------|--------|-------------|
| OFFLINE_SYNC | Data unavailable offline, sync conflicts, stale cache | Offline-first architecture, conflict resolution strategy |
| APP_LIFECYCLE | State lost on background, crash on resume, cold start issues | Proper state persistence across all lifecycle transitions |
| NAVIGATION | Deep link failures, back stack corruption, modal presentation bugs | Navigation architecture and state management |
| PUSH_NOTIFICATION | Notifications not received, wrong routing, permission issues | Token management, payload handling in all app states |
| PLATFORM_PARITY | Feature works on iOS but not Android (or vice versa) | Platform-specific APIs, behavior differences |
| PERFORMANCE_MOBILE | Slow scrolling, janky animations, high battery drain | Main thread blocking, bridge congestion, image optimization |
| APP_STORE | Rejection, guideline violation, metadata issues | Compliance with Apple/Google review guidelines |

### Mobile Failure Signatures

| Symptom | Root Cause | Diagnostic Steps | Resolution |
|---------|-----------|-----------------|------------|
| Crash on background→foreground transition | State not persisted across lifecycle events | Check componentDidMount/useEffect for state restoration; verify AsyncStorage/SQLite persistence | Persist critical state to storage on background event; restore on foreground |
| Blank screen on cold start | Async data load blocking render without loading state | Check initial render path; verify splash screen config; check for synchronous AsyncStorage calls | Add loading state to initial render; use splash screen API to control dismissal |
| Slow list scrolling (< 30fps) | Heavy render on main thread, unoptimized FlatList/RecyclerView | Profile with React Native Profiler or Android Profiler; check getItemLayout, keyExtractor | Implement getItemLayout, use memo for items, reduce render complexity, use FlashList |
| Push notification not received | Token not registered, permission denied, background handler missing | Check FCM/APNs token registration; verify permissions; check background handler registration | Register token on app start; handle permission denial; implement background message handler |
| Deep link opens wrong screen | URL scheme conflict, route params not parsed, missing navigation handler | Check URL scheme registration in app config; log received URL; trace navigation resolution | Register unique URL scheme; validate and parse params; add fallback route |
| App rejected from store | Missing privacy policy, unauthorized API usage, incomplete metadata | Read rejection reason carefully; check recent guideline changes; review permission usage descriptions | Fix specific guideline violation; add required metadata; resubmit with explanation |
| Data sync conflicts | No conflict resolution strategy, optimistic updates without rollback | Log both client and server state on conflict; check sync timestamp logic | Implement last-write-wins, server-wins, or CRDT-based conflict resolution |
| Memory warning/OOM crash | Image cache unbounded, leaked event listeners, large data in memory | Profile with Xcode Instruments or Android Profiler; check for growing allocations | Implement image cache limits; clean up listeners in useEffect returns; paginate large datasets |

### Mobile Anti-Patterns

| Anti-Pattern | Description | Detection Signal | Correction |
|-------------|-------------|-----------------|------------|
| Network-First Design | Assuming network is always available | No offline handling, no cache layer, fetch-on-every-render | Design offline-first: cache locally, sync when connected |
| Permission Spam | Requesting all permissions on first launch | Permission dialogs appear before any user context | Request permissions in context, when user performs relevant action |
| Platform Ignorance | Writing iOS-first code and hoping it works on Android | No Platform.select, hardcoded iOS paths, untested on Android | Test on both platforms every sprint; use platform abstractions |
| Bridge Bottleneck | Heavy computation crossing JS/native bridge frequently | Janky animations, slow list rendering, high CPU in bridge | Move computation to native module or use JSI for hot paths |
| Monolithic Navigation | Single navigation stack for entire app | Deep nesting, broken back button, state persistence issues | Use nested navigators with clear boundaries and reset logic |
| Ignoring App Lifecycle | Not handling background/foreground transitions | State loss, stale data on resume, duplicate API calls | Subscribe to AppState changes; persist and restore state correctly |
| Screenshot Data Leak | Sensitive data visible in app switcher screenshot | Banking/medical data visible in recent apps view | Implement blur overlay on background event |
| Unbounded Image Cache | No cache eviction policy for downloaded images | Memory grows continuously, eventual OOM crash | Set cache size limits; implement LRU eviction; use progressive loading |

---

## Desktop Development Extension

### Desktop Diagnostic Categories

| Category | Signal | Key Concern |
|----------|--------|-------------|
| PROCESS_MODEL | IPC failures, renderer crashes, main process stability | Correct separation of main/renderer responsibilities |
| WINDOW_MGMT | Window state lost, multi-window bugs, tray behavior | Window lifecycle management and state persistence |
| IPC_SECURITY | Arbitrary code execution risk, unvalidated IPC messages | Context isolation, preload script safety, IPC validation |
| NATIVE_INTEGRATION | File system errors, system API differences, path issues | Cross-platform native API abstraction |
| DISTRIBUTION | Installer failures, signing errors, update issues | Code signing, installer creation, auto-update mechanism |
| MEMORY_DESKTOP | Memory growth over time, leaked windows, process bloat | Long-running process memory management |
| CROSS_PLATFORM | Different behavior on Windows/macOS/Linux | Platform-specific API availability and behavior |

### Desktop Failure Signatures

| Symptom | Root Cause | Diagnostic Steps | Resolution |
|---------|-----------|-----------------|------------|
| White/blank window on startup | Renderer crash or failed asset loading | Check main process console for errors; verify file paths in production build; check CSP headers | Fix asset paths for production (use app.getAppPath()); handle renderer errors gracefully |
| IPC messages not received | Handler not registered or message serialization failure | Log all IPC send/receive events; check channel name spelling; verify preload script exposure | Register handlers before window creation; validate channel names; use contextBridge correctly |
| Memory grows over hours of use | Leaked BrowserWindow instances, event listener accumulation | Take heap snapshots at intervals; count BrowserWindow instances; check for removeListener calls | Null window references on close; remove all listeners in cleanup; use WeakRef for caches |
| Auto-update fails silently | Code signing mismatch, CDN error, version comparison bug | Check update server logs; verify code signing certificate; test update URL manually | Fix code signing; verify update feed format; test update on clean install |
| Different behavior on Linux | Missing system dependency or GTK/X11 API difference | Test on target Linux distribution; check for platform-specific API calls; verify dependencies | Use Platform detection; bundle required dependencies; add platform-specific fallbacks |
| App won't start after update | Incomplete update, corrupted binary, permission issue | Check update log files; verify file permissions; compare hash of installed vs expected binary | Implement update verification; add rollback on failed start; use installer with repair mode |
| Tray icon not showing | Wrong icon format, missing tray API on Linux, permissions | Check icon file format (ICO/PNG/ICNS per platform); verify tray API availability | Use platform-specific icon formats; check for tray support before creating; add fallback UI |
| File dialog crashes app | Main thread blocking or platform-specific dialog bug | Check if dialog called from renderer without IPC; test on each OS | Use dialog.showOpenDialog from main process via IPC; handle cancel correctly |

### Desktop Anti-Patterns

| Anti-Pattern | Description | Detection Signal | Correction |
|-------------|-------------|-----------------|------------|
| Node in Renderer | Enabling nodeIntegration in renderer windows | `nodeIntegration: true` in BrowserWindow config | Enable contextIsolation; use preload scripts; expose only needed APIs via contextBridge |
| IPC Wild West | No validation on IPC messages from renderer | IPC handlers trust all arguments without checking | Validate sender, sanitize arguments, whitelist allowed channels |
| Path Hardcoding | Using hardcoded path separators or user directories | String paths with `/` or `\`, hardcoded `/Users/` or `C:\` | Use path.join(), app.getPath(), os.homedir() |
| Single Window Assumption | Not handling multiple windows or window recreation | No BrowserWindow tracking, crash on second window open | Track all windows in a Set; handle window-all-closed per platform |
| Memory Hoarding | Never releasing large objects or caching everything | Heap grows monotonically, process > 1GB after hours | Implement cache eviction; use streams for large files; close unused windows |
| Main Process Web Requests | Making HTTP requests from main process when renderer can | Main process doing API calls, handling cookies, managing auth | Route web requests through renderer; main process handles only OS integration |
| Ignoring Platform Conventions | Same UX on all platforms (Windows menus on macOS, etc.) | macOS app without app menu, Windows app without taskbar integration | Follow platform conventions: app menu on macOS, taskbar on Windows, desktop files on Linux |
| Blocking Main Process | Synchronous file I/O or computation in main process | App UI freezes during file operations or computation | Use async APIs; move computation to worker threads; stream large files |

---

## Data Analysis Extension

### Data Analysis Diagnostic Categories

| Category | Signal | Key Concern |
|----------|--------|-------------|
| METHODOLOGY | Wrong test selected, assumptions violated, invalid comparison | Appropriate statistical test selection and assumption verification |
| REPRODUCIBILITY | Different results on re-run, environment-dependent outcomes | Random seeds, library versions, data versioning, notebook state |
| DATA_QUALITY | Missing values, outliers, data type coercion, encoding issues | Data profiling, cleaning documentation, quality gates |
| VISUALIZATION | Misleading charts, wrong scale, missing labels, cherry-picking | Honest data representation with appropriate chart types |
| MULTIPLE_TESTING | Testing many hypotheses without correction, p-hacking | Family-wise error rate control, pre-registration |
| SAMPLE_SIZE | Underpowered analysis, drawing conclusions from insufficient data | Power analysis, confidence interval width, effect size |
| CAUSALITY | Confusing correlation with causation, Simpson's paradox | Causal inference methodology, confounding control |

### Data Analysis Failure Signatures

| Symptom | Root Cause | Diagnostic Steps | Resolution |
|---------|-----------|-----------------|------------|
| p-value just below 0.05 from many tests | Multiple testing without correction | Count total tests run; check for test selection based on results | Apply Bonferroni, Holm, or FDR correction; pre-register hypotheses |
| Non-reproducible results across runs | Missing random seed or stochastic algorithm without fix | Check for random seed setting; verify library versions; check notebook execution order | Set numpy/random seeds at script start; pin library versions; use scripts over notebooks for final analysis |
| Surprising strong correlation | Confounding variable or common cause | Check for lurking variables; stratify analysis; test with partial correlation | Control for confounders; use causal inference methods; report conditional relationships |
| t-test returns significant but means look similar | Large sample size making tiny effects significant | Calculate effect size (Cohen's d); report confidence intervals; check practical significance | Report effect size alongside p-value; interpret practical significance; consider equivalence testing |
| Regression R-squared very high (> 0.95) | Overfitting, multicollinearity, or data leakage | Check condition number; compute VIF; verify no target leakage in features | Remove collinear features; use cross-validation; audit feature construction for leakage |
| Visualization shows clear trend but test non-significant | Small sample size or high variance | Compute statistical power; check sample size; examine variance | Collect more data; use non-parametric methods; report confidence intervals with the visualization |
| Different conclusions from same data | Different preprocessing, outlier handling, or test selection | Document all preprocessing decisions; run sensitivity analysis | Pre-register analysis plan; report results across reasonable analytic choices (multiverse analysis) |
| Memory error on large dataset | Inefficient pandas operations (iterating rows, copy-heavy chains) | Profile memory with memory_profiler; check for .copy() chains; look for iterrows() | Use vectorized operations; chunk processing; use Dask or Polars for large datasets |

### Data Analysis Anti-Patterns

| Anti-Pattern | Description | Detection Signal | Correction |
|-------------|-------------|-----------------|------------|
| P-Hacking | Running many tests and reporting only significant ones | Many unreported tests, "let's try another test", selective reporting | Pre-register hypotheses; report all tests; apply multiple testing correction |
| Ignoring Assumptions | Running tests without checking prerequisites | No normality check before t-test, no homoscedasticity check before ANOVA | Check and report assumption tests; use non-parametric alternatives when assumptions fail |
| Correlation Causation | Inferring causal relationships from observational data | "X causes Y" language without experimental design or causal framework | Use "X is associated with Y"; apply causal inference methods if causal claims are needed |
| Outlier Deletion | Removing outliers without justification or sensitivity analysis | Observations removed with no documented reason | Document removal criteria; run analysis with and without outliers; report both |
| Notebook Drift | Running notebook cells out of order, creating hidden state | Results change depending on cell execution order | Restart kernel and run all before reporting; convert to scripts for final analysis |
| Visualization Dishonesty | Truncated axes, misleading scales, cherry-picked ranges | Y-axis not starting at zero for bar charts, zoomed-in time ranges | Use appropriate scales; show full range; document any axis modifications |
| Sample Size Neglect | Drawing strong conclusions from tiny samples | n < 30 with strong claims, no power analysis, no confidence intervals | Compute and report required sample size; show confidence intervals; qualify conclusions |
| Data Dredging | Exploring data until finding a pattern, then claiming discovery | No pre-registered hypothesis, discovery framed as confirmation | Separate exploratory and confirmatory analyses; validate on holdout data |

---

## Data Engineering Extension

### Data Engineering Diagnostic Categories

| Category | Signal | Key Concern |
|----------|--------|-------------|
| PIPELINE_RELIABILITY | Pipeline failures, stuck tasks, silent data loss | Idempotency, retry logic, failure alerting, dead letter handling |
| SCHEMA_EVOLUTION | Breaking changes, incompatible consumers, migration failures | Schema versioning, backward/forward compatibility, registry |
| DATA_QUALITY_ENG | Missing records, duplicates, type coercion, freshness violations | Quality assertions at pipeline boundaries, anomaly detection |
| ORCHESTRATION | DAG failures, scheduling conflicts, dependency deadlocks | DAG design, trigger management, resource allocation |
| SCALE_PERFORMANCE | Slow pipelines, OOM in Spark, warehouse query timeout | Partition strategy, data skew, resource tuning |
| LATE_DATA | Out-of-order events, late arrivals, incorrect aggregations | Event-time vs processing-time, watermarking, reprocessing |
| COST_EFFICIENCY | Runaway cloud costs, over-provisioned clusters, scan-heavy queries | Partition pruning, caching, auto-scaling, data lifecycle |

### Data Engineering Failure Signatures

| Symptom | Root Cause | Diagnostic Steps | Resolution |
|---------|-----------|-----------------|------------|
| Pipeline silently produces wrong row count | Schema drift in source, join key mismatch, or filter bug | Compare source row count to output; check join cardinality; log rows at each stage | Add row count assertions at boundaries; alert on >5% deviation; validate join keys |
| Spark job OOM on large partition | Data skew concentrating records on single partition key | Check partition size distribution; look for hot keys in join/group-by | Salted keys for skewed joins; repartition before aggregation; increase executor memory |
| Duplicate records in target table | Non-idempotent write (append without dedup) or retry without dedup | Count distinct vs total records; check for retry logic without idempotency | Use MERGE/upsert operations; add dedup step before write; use partition overwrite |
| Dashboard shows stale data | Pipeline succeeded but processed empty partition, or scheduler skipped run | Check pipeline logs for actual records processed; verify scheduler trigger conditions | Add zero-row alerting; verify trigger configuration; add data freshness SLA monitoring |
| Airflow DAG stuck in running state | Upstream sensor timeout, pool exhaustion, or deadlock | Check sensor logs; verify pool slot availability; look for circular dependencies | Set sensor timeout; increase pool size; break circular dependencies with external triggers |
| Query timeout on warehouse table | Missing partition pruning, full table scan, or expired clustering | Check query plan for partition pruning; verify clustering keys; check table size growth | Add partition filter to query; re-cluster table; implement data lifecycle (drop old partitions) |
| Schema registry rejects new schema | Backward-incompatible change (field removal, type change) | Compare new schema to registered schema; check compatibility mode setting | Use additive-only changes; add new fields instead of modifying; use FULL compatibility mode |
| Late-arriving data missing from aggregations | Processing-time window closed before late data arrived | Check watermark settings; compare event-time to processing-time; look for out-of-order events | Increase watermark delay; implement late data side output; use reprocessing for accuracy |

### Data Engineering Anti-Patterns

| Anti-Pattern | Description | Detection Signal | Correction |
|-------------|-------------|-----------------|------------|
| Append-Only Writes | Always appending without dedup, creating duplicates on retry | Row count grows on re-run, duplicate IDs in target | Use MERGE/upsert, partition overwrite, or dedup-on-write |
| Schema by Convention | No schema validation, relying on producer/consumer agreement | Silent type coercion, missing columns discovered in production | Implement schema registry; validate at pipeline boundaries; use typed data classes |
| SELECT * in Production | Unbounded queries without partition pruning or column selection | Full table scans, high warehouse costs, slow queries | Always specify columns; always filter by partition key; set scan limits |
| Monolithic Pipeline | Single DAG that does everything from ingestion to serving | Long execution time, single failure blocks everything, hard to test | Break into ingestion, transformation, and serving stages; use intermediate storage |
| Manual Backfill | No automated reprocessing capability, manual SQL for fixes | Ad-hoc queries to fix data issues, no backfill documentation | Build idempotent pipelines with date-range parameters; automate backfill with date loops |
| Alert Fatigue | Too many alerts, or alerts only on failure (not on data quality) | Team ignores alerts, data issues found by consumers not pipeline | Alert on data quality anomalies (row count, null rate, freshness); reduce noise; tier alerts by severity |
| Implicit Dependencies | DAG dependencies don't match actual data dependencies | Pipeline B runs before Pipeline A finishes, causing inconsistent results | Make all data dependencies explicit in DAG; use data-aware scheduling; add dependency sensors |
| Cost Blindness | No monitoring of compute and storage costs per pipeline | Surprise cloud bills, unused tables consuming storage, over-provisioned clusters | Tag resources per pipeline; set up cost alerts; implement data lifecycle policies; right-size clusters |

---

## Mobile + API Domain Overlap Patterns

### Mobile + API (Mobile Backend)
- **Primary:** Mobile | **Secondary:** API
- **Key Concern:** Offline-first data sync, optimistic updates, auth token refresh, push notification delivery
- **Strategy:** Design API with mobile constraints in mind — batch endpoints, delta sync, compression. Build offline-capable mobile data layer before integrating live API.
- **Common Pitfall:** Designing API for web and expecting mobile to "just work" — mobile needs offline support, token refresh, and bandwidth-efficient responses
- **Phase Structure:** API contract → Mobile data layer → Offline sync → Online integration → Push notifications

### Mobile + Systems (App Platform)
- **Primary:** Mobile | **Secondary:** Systems
- **Key Concern:** CI/CD for mobile builds, certificate management, beta distribution, crash reporting
- **Strategy:** Set up mobile CI/CD (Fastlane, EAS) early. Automate signing, building, and distribution before feature development.
- **Common Pitfall:** Manual builds and ad-hoc distribution — blocks testing and feedback cycles

### Desktop + API (Desktop Backend)
- **Primary:** Desktop | **Secondary:** API
- **Key Concern:** Local-first with cloud sync, auth in long-running process, offline capability
- **Strategy:** Build desktop app with local storage first, add cloud sync as enhancement. Handle auth token refresh for sessions lasting days.
- **Common Pitfall:** Treating desktop like a web app — desktop users expect instant response from local data, not loading spinners

### Data Analysis + Data Engineering (Analytical Platform)
- **Primary:** Data Engineering | **Secondary:** Data Analysis
- **Key Concern:** Data quality pipeline feeding analytical workloads, schema stability for analyses
- **Strategy:** Build reliable data pipeline first with quality gates, then build analysis layer on top. Ensure schema changes propagate to downstream analyses.
- **Common Pitfall:** Analyzing data before pipeline reliability is established — analysis on unreliable data produces unreliable conclusions

### Web + Mobile (Cross-Platform)
- **Primary:** Web | **Secondary:** Mobile
- **Key Concern:** Shared business logic, consistent UX across platforms, responsive vs native trade-offs
- **Strategy:** Define shared API contract and design system. Build web and mobile in parallel with shared backend. Use shared component libraries where possible.
- **Common Pitfall:** Building web-first and "shrinking" for mobile — mobile UX patterns differ fundamentally from web

---

## Taxonomy Version

- **Version:** 4.0
- **Last updated:** 2026-03-25
- **Line count target:** 2000+ (comprehensive diagnostic knowledge base with 8 domain specializations)
- **Sections:** 20+ (Classification, Matrix, Questions, Domain Extensions for ML/Quant/Web/API/Systems/Mobile/Desktop/Data Analysis/Data Engineering, Failure Signatures per domain, Resolution Strategies, Anti-Patterns per domain, Domain Overlap Patterns, Confidence Calibration, Severity, Complexity, Decision Tree)

# Workflow: Build Strategy

<purpose>
End-to-end quantitative trading strategy building from idea to production readiness.
7 mandatory phases in strict order. Each phase has a quant-auditor gate that must pass before proceeding.
This is the gold standard workflow — no shortcuts, no skipped phases.
</purpose>

<inputs>
- Strategy idea/thesis from user (via run.md BUILD_STRATEGY classification)
- `.planning/CONTEXT.md` — project context, constraints, prior work
- Asset class, frequency, target holding period
</inputs>

<prerequisites>
- Quant persona must be active (2+ detection signals in CONTEXT.md)
- References loaded: quant-finance.md, strategy-metrics.md, feature-engineering.md, ml-training.md, quant-code-patterns.md
</prerequisites>

<phase_enforcement>

## Phase Order (NON-NEGOTIABLE)

```
PHASE_ORDER = [
    "IDEATION",       # Phase 1: Research and thesis formation
    "DATA",           # Phase 2: Data infrastructure and temporal safety
    "FEATURES",       # Phase 3: Feature engineering with temporal guarantees
    "VALIDATION",     # Phase 4: Walk-forward validation framework
    "MODEL",          # Phase 5: Model development and baseline comparison
    "EVALUATION",     # Phase 6: Full strategy evaluation suite
    "PRODUCTION"      # Phase 7: Production readiness and human review
]

# NON-NEGOTIABLE: phases cannot be skipped or reordered.
# The ONLY exception: going BACKWARD (e.g., from MODEL back to FEATURES).
# Forward skipping is NEVER allowed.
```

### Skip Prevention Logic

Before entering any phase N, verify:
1. All phases 1 through N-1 have status COMPLETE in STATE.md
2. All gates for phases 1 through N-1 have PASS status
3. No CRITICAL violations remain unresolved from prior audits

If any check fails, HALT and report which prerequisite is missing.

</phase_enforcement>

<procedure>

---

## Phase 1: IDEATION & RESEARCH

**Goal:** Define what market inefficiency you are exploiting and why it should persist.

### 1.1 Edge Hypothesis Definition

The strategy MUST begin with a written thesis answering:
- **What inefficiency exists?** (e.g., momentum persistence, mean reversion at microstructure level)
- **Why does it exist?** (behavioral bias, structural constraint, information asymmetry)
- **Why hasn't it been arbitraged away?** (capacity limits, execution difficulty, data access)
- **What would falsify this thesis?** (specific metrics or conditions that disprove the edge)

If the user cannot articulate the edge, STOP. No amount of ML sophistication compensates for a missing edge.

### 1.2 Edge Source Classification

Classify the strategy's edge into one or more categories:

| Edge Source | Description | Typical Decay | Example |
|-------------|-------------|---------------|---------|
| **Speed** | Faster execution or data processing | Days to weeks | HFT, latency arbitrage |
| **Information** | Access to unique or alternative data | Months | Satellite imagery, NLP sentiment |
| **Modeling** | Superior signal extraction from public data | Weeks to months | ML alpha, factor timing |
| **Structural** | Exploiting market structure constraints | Years | Index rebalancing, regulatory effects |

### 1.3 Literature Research

Spawn researcher agent for academic and practitioner review:

```
Task(
  subagent_type="nr-researcher",
  description="Research strategy thesis and prior art",
  prompt="Research the following strategy thesis:

  Thesis: [user's strategy description]
  Asset class: [asset class]
  Frequency: [frequency]

  Find:
  1. Academic papers on this type of edge (last 10 years)
  2. Known decay patterns for this edge type
  3. Common pitfalls specific to this strategy class
  4. Estimated capacity from literature

  Output: .planning/strategy/RESEARCH.md"
)
```

### 1.4 Strategy Profile

Document the strategy profile:

```markdown
## Strategy Profile
- **Asset Class:** [equities, futures, crypto, FX, options, multi-asset]
- **Frequency:** [tick, intraday, daily, weekly]
- **Target Holding Period:** [seconds, minutes, hours, days, weeks]
- **Universe Size:** [number of instruments]
- **Capacity Estimate:** [AUM before alpha decay — from literature]
- **Data Requirements:** [list all data sources needed]
- **Edge Source:** [speed | information | modeling | structural]
- **Expected Sharpe (gross):** [realistic estimate from literature]
```

### 1.5 Outputs

- `.planning/strategy/THESIS.md` — edge hypothesis, falsification criteria
- `.planning/strategy/RESEARCH.md` — literature review, prior art
- `.planning/strategy/PROFILE.md` — strategy profile document

### Gate: NONE

This is the research phase. No automated gate, but the edge hypothesis MUST be written before proceeding. If the thesis document is empty or vague ("ML will find patterns"), the workflow halts.

---

## Phase 2: DATA INFRASTRUCTURE

**Goal:** Build the data pipeline with ironclad temporal safety guarantees.

### 2.1 Data Source Identification

For each data source required by the strategy profile:
- **Source name and provider** (e.g., Yahoo Finance, Binance API, WRDS)
- **Update frequency and latency** (real-time, T+1, T+2)
- **Publication delay** — CRITICAL: when is the data actually available?
  - Earnings: filed days after quarter end
  - Economic indicators: published with delay
  - Price data: typically available at close or next open
- **Survivorship bias risk** — does the dataset exclude delisted/failed instruments?
- **Look-ahead risk assessment** — can any field contain future information?

### 2.2 Data Quality Audit

For each data source, verify:

```python
# Data quality checks — ALL must pass
def audit_data_quality(df):
    checks = {
        "no_future_dates": df.index.max() <= pd.Timestamp.now(),
        "no_duplicate_timestamps": not df.index.duplicated().any(),
        "monotonic_index": df.index.is_monotonic_increasing,
        "missing_rate": df.isnull().mean().max() < 0.05,  # <5% missing per column
        "no_negative_prices": (df[price_cols] > 0).all().all(),
        "no_zero_volume_with_price_change": True,  # custom check
    }
    return checks
```

### 2.3 Temporal Boundary Enforcement

ALL data loading code MUST enforce temporal boundaries:

```python
# CORRECT: Temporal boundary in data loading
def load_data(as_of_date: pd.Timestamp) -> pd.DataFrame:
    """Load data available as of the given date."""
    df = raw_data[raw_data['publication_date'] <= as_of_date]  # point-in-time
    return df

# INCORRECT: Loading all data without temporal filter
def load_data() -> pd.DataFrame:
    return pd.read_csv("all_data.csv")  # NO temporal boundary
```

### 2.4 Missing Data Protocol

Handle missing data with strict rules:
- **Forward fill with limit:** `df.ffill(limit=5)` — never unlimited forward fill
- **NEVER backfill:** `df.bfill()` is BANNED — it uses future data
- **Document every fill:** log which columns, how many values, what limit
- **Prefer dropna over fill** for critical signals — missing IS information

### 2.5 Data Schema Documentation

Write data schema to `.planning/strategy/DATA_SCHEMA.md`:

```markdown
| Column | Type | Source | Pub Delay | Fill Method | Notes |
|--------|------|--------|-----------|-------------|-------|
| close  | float | Exchange | T+0 | None | Adjusted for splits |
| volume | int   | Exchange | T+0 | ffill(1) | |
| earnings | float | SEC | T+2 to T+90 | None | Filing date, not period end |
```

### 2.6 Outputs

- Data loading module with temporal boundaries
- `.planning/strategy/DATA_SCHEMA.md` — complete data dictionary
- Data quality audit report

### Gate: TEMPORAL_AUDIT

```
Task(
  subagent_type="nr-verifier",
  description="Temporal audit of data infrastructure",
  prompt="Run TEMPORAL_AUDIT on all data loading code.

  Load references/quant-code-patterns.md for correct/incorrect patterns.

  Check:
  1. Every data load function has a temporal boundary parameter
  2. No backfill operations anywhere in data code
  3. Publication delays documented for every data source
  4. Forward fill has explicit limits
  5. Survivorship bias addressed

  Scoring:
  - Each CRITICAL violation (lookahead, backfill): -20 points from 100
  - Each WARNING (missing docs, unlimited ffill): -5 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-TEMPORAL-DATA.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 3: FEATURE ENGINEERING

**Goal:** Build predictive features with temporal safety and statistical rigor.

### 3.1 Feature Extraction

Follow `references/feature-engineering.md` lifecycle:
1. **Raw → Derived:** Apply transformations (returns, ratios, ranks)
2. **Derived → Features:** Combine with domain logic (momentum, mean reversion signals)
3. **Features → Selected:** Statistical filtering with multiple testing correction

### 3.2 Temporal Safety in Feature Construction

EVERY rolling computation MUST follow the shift-before-roll pattern:

```python
# CORRECT: shift THEN roll — uses only past data
feature = df['close'].shift(1).rolling(window=20).mean()

# INCORRECT: roll THEN shift — window includes current bar
feature = df['close'].rolling(window=20).mean().shift(1)

# CORRECT: expanding window normalization (no future stats)
feature = (df['ret'] - df['ret'].expanding().mean()) / df['ret'].expanding().std()

# INCORRECT: full-sample normalization (uses future data)
feature = (df['ret'] - df['ret'].mean()) / df['ret'].std()
```

### 3.3 Feature Evaluation

Evaluate each feature candidate with:

| Metric | Method | Threshold | Notes |
|--------|--------|-----------|-------|
| **Information Coefficient (IC)** | Rank correlation with forward returns | abs(IC) > 0.02 | Walk-forward, not full sample |
| **IC Decay** | IC at lag 1, 2, 5, 10, 20 | Monotonically decreasing | Validates signal, not noise |
| **Regime Stability** | IC by market regime (bull/bear/sideways) | Positive in 2+ regimes | Single-regime signals are fragile |
| **Turnover** | Feature rank change per period | < 0.5 | High turnover = high transaction costs |
| **Multiple Testing** | Bonferroni or Benjamini-Hochberg FDR | Adjusted p < 0.05 | MANDATORY when testing 10+ features |

### 3.4 Feature Ablation Study

Test feature importance via walk-forward ablation:

```python
# Walk-forward feature ablation — NOT single train/test split
for fold in walk_forward_splits:
    base_score = evaluate(model, all_features, fold)
    for feature in feature_set:
        ablated_score = evaluate(model, all_features - {feature}, fold)
        importance[feature].append(base_score - ablated_score)

# Feature passes if: mean(importance) > 0 AND importance > 0 in >60% of folds
```

### 3.5 Outputs

- Feature construction module with temporal safety
- `.planning/strategy/FEATURE_REPORT.md` — IC analysis, regime stability, ablation results
- Feature selection rationale with multiple testing correction

### Gate: FEATURE_AUDIT

```
Task(
  subagent_type="nr-verifier",
  description="Feature engineering audit",
  prompt="Run FEATURE_AUDIT on all feature construction code.

  Load references/quant-code-patterns.md for shift-before-roll patterns.

  Check:
  1. ALL rolling computations use shift-before-roll
  2. No full-sample normalization (expanding window only)
  3. IC evaluation is walk-forward, not single split
  4. Multiple testing correction applied if 10+ features tested
  5. Feature ablation uses walk-forward, not single split

  Scoring:
  - CRITICAL (wrong shift/roll order, full-sample norm): -20 points
  - WARNING (missing ablation, no multiple testing): -10 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-FEATURE-ENGINEERING.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 4: VALIDATION FRAMEWORK

**Goal:** Build the evaluation infrastructure BEFORE fitting any models.

### 4.1 Walk-Forward Splits

Implement temporal cross-validation with purging and embargo:

```python
def walk_forward_splits(dates, n_splits=5, train_pct=0.6, purge_days=5, embargo_days=5):
    """
    Walk-forward splits with purging (remove overlap between train/test)
    and embargo (gap between train end and test start).

    NEVER use sklearn's KFold or ShuffleSplit — they break temporal order.
    """
    splits = []
    for i in range(n_splits):
        train_end = train_start + train_size
        purge_end = train_end + purge_days
        test_start = purge_end + embargo_days
        test_end = test_start + test_size
        splits.append((train_idx, test_idx))
    return splits
```

### 4.2 Evaluation Metrics

Implement metrics from `references/strategy-metrics.md` with CORRECT formulas:

| Metric | Correct Formula | Common Mistake |
|--------|----------------|----------------|
| **Sharpe Ratio** | Newey-West adjusted standard errors | Using simple std (ignores autocorrelation) |
| **Max Drawdown** | On equity curve, not returns | Computing on returns series |
| **Sortino Ratio** | Downside deviation only | Using full standard deviation |
| **Calmar Ratio** | Annualized return / max drawdown | Wrong annualization factor |
| **Hit Rate** | Winning trades / total trades | Ignoring magnitude |
| **Profit Factor** | Gross profit / gross loss | Including zero-return trades |

### 4.3 Baseline Models

EVERY strategy must be compared against baselines:

```python
BASELINES = {
    "buy_and_hold": lambda prices: prices.pct_change(),
    "random_signal": lambda n: np.random.choice([-1, 0, 1], n),
    "simple_momentum": lambda prices, w: np.sign(prices.pct_change(w)),
    "equal_weight": lambda universe: np.ones(len(universe)) / len(universe),
}

# Model must beat ALL baselines with statistical significance (p < 0.05)
```

### 4.4 Outputs

- Walk-forward split implementation with purging + embargo
- Metric calculation module (correct formulas)
- Baseline model implementations
- `.planning/strategy/VALIDATION_FRAMEWORK.md` — split design, metrics, baselines

### Gate: VALIDATION_AUDIT

```
Task(
  subagent_type="nr-verifier",
  description="Validation framework audit",
  prompt="Run VALIDATION_AUDIT on the validation framework.

  Load references/strategy-metrics.md for correct metric formulas.

  Check:
  1. Splits are temporal (no random shuffling)
  2. Purging and embargo implemented correctly
  3. Sharpe uses Newey-West adjustment
  4. Max drawdown computed on equity curve, not returns
  5. Baseline models implemented and comparison is statistical

  Scoring:
  - CRITICAL (shuffled splits, wrong Sharpe formula): -25 points
  - WARNING (missing embargo, no statistical test): -10 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-VALIDATION-FRAMEWORK.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 5: MODEL DEVELOPMENT

**Goal:** Build and train models using the validated infrastructure from Phase 4.

### 5.1 Architecture Selection

Start simple and justify complexity:

```
COMPLEXITY_LADDER = [
    "Linear regression / Logistic regression",   # Always start here
    "Ridge / Lasso / ElasticNet",                 # If linear has signal
    "LightGBM / XGBoost",                         # If nonlinearity justified
    "Neural networks (LSTM, Transformer)",         # Only if GBM plateaus AND data is sufficient
    "Ensemble of above",                           # Only with structural diversity
]

# Rule: Never skip a rung. If linear model has zero signal,
# a neural network won't find it — your features are the problem.
```

### 5.2 Training Pipeline

Follow `references/ml-training.md` requirements:
- **No shuffle:** `shuffle=False` in all data loaders and splits
- **Gradient clipping:** prevent exploding gradients in neural models
- **Early stopping on validation loss:** not training loss, with patience
- **Reproducibility:** set all random seeds, log hyperparameters

### 5.3 Hyperparameter Optimization

Use NESTED walk-forward cross-validation:

```python
# CORRECT: Nested CV — inner loop for HPO, outer loop for evaluation
for outer_fold in outer_walk_forward_splits:
    # Inner loop: find best hyperparameters
    best_params = optimize(
        model, param_space,
        inner_walk_forward_splits(outer_fold.train),  # ONLY train data
        metric="sharpe"
    )
    # Outer loop: evaluate with best params on held-out test
    score = evaluate(model(best_params), outer_fold.test)

# INCORRECT: Single loop — HPO and evaluation on same splits (overfitting)
best_params = optimize(model, param_space, walk_forward_splits, metric="sharpe")
score = evaluate(model(best_params), walk_forward_splits)  # BIASED
```

### 5.4 Ensemble Construction (if justified)

Ensembles require STRUCTURAL diversity — not just different random seeds:

```python
# GOOD: Structural diversity (different model families)
ensemble = [LinearModel(), LightGBM(), SimpleNN()]

# BAD: Seed diversity (same model, different seeds)
ensemble = [LightGBM(seed=1), LightGBM(seed=2), LightGBM(seed=3)]
```

### 5.5 Outputs

- Trained model artifacts with logged hyperparameters
- Training curves and convergence diagnostics
- `.planning/strategy/MODEL_REPORT.md` — architecture rationale, HPO results, training diagnostics

### Gate: BASELINE COMPARISON

This gate is procedural, not an auditor spawn:

```python
# Model must beat ALL baselines with statistical significance
for baseline_name, baseline in BASELINES.items():
    p_value = paired_comparison_test(model_returns, baseline_returns)
    assert p_value < 0.05, f"Model does not beat {baseline_name} (p={p_value:.4f})"

# Performance must hold across 2+ market regimes
for regime in ["bull", "bear", "sideways"]:
    regime_sharpe = compute_sharpe(model_returns[regime_mask])
    assert regime_sharpe > 0, f"Model underperforms in {regime} regime"
```

**If model fails to beat baselines:**
- STOP. The signal is not there, or the features are insufficient.
- Log failure to CONTEXT.md: "Model failed baseline comparison — features insufficient"
- Return to Phase 3 (FEATURES) to re-examine feature pipeline
- Do NOT try more complex models to force-fit noise

---

## Phase 6: STRATEGY EVALUATION

**Goal:** Comprehensive out-of-sample evaluation of the complete strategy.

### 6.1 Full Metric Suite

Compute ALL metrics from `references/strategy-metrics.md`:

```python
metrics = {
    "sharpe_ratio": compute_sharpe_newey_west(returns),
    "sharpe_ci_95": bootstrap_ci(returns, compute_sharpe, n_bootstrap=10000),
    "sortino_ratio": compute_sortino(returns),
    "calmar_ratio": compute_calmar(returns),
    "max_drawdown": compute_max_drawdown(equity_curve),
    "max_drawdown_duration": compute_max_dd_duration(equity_curve),
    "hit_rate": compute_hit_rate(trades),
    "profit_factor": compute_profit_factor(trades),
    "avg_win_loss_ratio": compute_win_loss_ratio(trades),
    "annual_return": compute_annual_return(returns),
    "annual_volatility": compute_annual_volatility(returns),
}
```

### 6.2 Regime Decomposition

Separate performance by market regime:

```markdown
| Regime | Sharpe | Max DD | Hit Rate | % of Time | Notes |
|--------|--------|--------|----------|-----------|-------|
| Bull   |        |        |          |           |       |
| Bear   |        |        |          |           |       |
| Sideways |      |        |          |           |       |
| High Vol |      |        |          |           |       |
| Low Vol |       |        |          |           |       |
```

If Sharpe < 0 in any major regime (>20% of time), document as risk factor.

### 6.3 Transaction Cost Sensitivity

Test strategy robustness to execution costs:

```python
cost_multipliers = [1.0, 1.5, 2.0, 3.0]
for mult in cost_multipliers:
    net_returns = gross_returns - (transaction_costs * mult)
    net_sharpe = compute_sharpe(net_returns)
    # Log: at what cost multiplier does Sharpe drop below 1.0?
    # This is the "cost buffer" — higher is better
```

### 6.4 Capacity Estimation

Estimate maximum AUM before alpha decays:

- **Market impact model:** estimate price impact per trade
- **Volume participation limit:** trades should be < 1% of daily volume (liquid) or < 0.1% (illiquid)
- **Alpha decay curve:** how does Sharpe change as position sizes scale?

### 6.5 Monte Carlo Analysis

Bootstrap confidence intervals and ruin probability:

```python
# Bootstrap Sharpe confidence interval
bootstrap_sharpes = [
    compute_sharpe(np.random.choice(returns, len(returns), replace=True))
    for _ in range(10000)
]
sharpe_ci = np.percentile(bootstrap_sharpes, [2.5, 97.5])

# Ruin probability: P(drawdown > X%) over strategy lifetime
ruin_prob = np.mean([
    max_drawdown(simulate_path(returns)) > ruin_threshold
    for _ in range(10000)
])
```

### 6.6 Outputs

- `.planning/strategy/EVALUATION_REPORT.md` — full metrics, regime analysis, cost sensitivity
- `.planning/strategy/MONTE_CARLO.md` — bootstrap CIs, ruin probability, drawdown distribution

### Gate: FULL_AUDIT

```
Task(
  subagent_type="nr-verifier",
  description="Full strategy audit on complete codebase",
  prompt="Run FULL_AUDIT on the complete strategy codebase.

  This is the comprehensive final audit before production.
  Load ALL references: quant-code-patterns.md, strategy-metrics.md, feature-engineering.md, ml-training.md.

  Check ALL of the following:
  1. Data: temporal boundaries, no backfill, publication delays documented
  2. Features: shift-before-roll, expanding normalization, walk-forward IC
  3. Validation: temporal splits, purging + embargo, correct metric formulas
  4. Model: no shuffle, nested CV for HPO, baseline beaten with significance
  5. Evaluation: full metric suite, regime decomposition, cost sensitivity

  Also verify:
  - No CRITICAL violations remain from any earlier audit
  - All earlier audit reports exist in .planning/audit/

  Scoring:
  - Each CRITICAL violation: -20 points from 100
  - Each WARNING: -5 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-FULL-STRATEGY.md
  Return: PASS/FAIL with score and violation summary"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 7: PRODUCTION READINESS

**Goal:** Prepare the strategy for live execution with safety guardrails.

### 7.1 Live Data Pipeline

- Implement real-time or scheduled data ingestion
- Ensure data format matches backtest schema exactly
- Add data freshness monitoring (alert if data is stale)
- Handle exchange holidays, early closes, data outages

### 7.2 Monitoring & Alerting

Implement the following monitors:

| Monitor | Trigger | Action |
|---------|---------|--------|
| **Metric Drift** | Rolling Sharpe drops below 50% of backtest | Alert + flag for review |
| **Drawdown Alert** | Current drawdown > 50% of max backtest DD | Alert + reduce position |
| **Feature Distribution Shift** | KS test p < 0.01 on any feature | Alert + investigate |
| **Prediction Drift** | Model output distribution shifts | Alert + flag for retrain |
| **Data Staleness** | No new data for 2x expected frequency | Alert + halt trading |

### 7.3 Kill Switches

MANDATORY safety limits:

```python
KILL_SWITCHES = {
    "max_drawdown_pct": 0.15,       # Halt if DD exceeds 15% (or user-defined)
    "max_daily_loss_pct": 0.03,     # Halt if daily loss exceeds 3%
    "max_position_pct": 0.20,       # No single position > 20% of portfolio
    "max_leverage": 2.0,            # Gross leverage limit
    "max_turnover_daily": 0.50,     # Prevent hyperactive trading
}

# Kill switches are NEVER disabled. They can only be adjusted with explicit
# user approval and documented rationale.
```

### 7.4 Position Sizing

Implement volatility-adjusted position sizing:

```python
def position_size(signal, volatility, target_vol=0.10, max_position=0.20):
    """
    Scale positions inversely with volatility.
    Higher vol → smaller position. Capped at max_position.
    """
    raw_size = signal * (target_vol / volatility)
    return np.clip(raw_size, -max_position, max_position)
```

### 7.5 Shadow Trading Plan

Before committing real capital:
- Run the strategy in shadow mode (paper trading) for minimum N days
- N depends on frequency: daily strategy = 30 days, intraday = 10 days
- Compare shadow results to backtest expectations
- If shadow Sharpe is within 1 standard error of backtest Sharpe, proceed
- If shadow performance significantly deviates, investigate before going live

### 7.6 Outputs

- Live data pipeline implementation
- Monitoring and alerting module
- Kill switch implementation
- Position sizing module
- Shadow trading configuration
- `.planning/strategy/PRODUCTION_PLAN.md` — full production specification

### Gate: HUMAN REVIEW (NOT AUTOMATED)

This is the ONLY gate that requires explicit human approval.

Present the following to the user:

```
═══════════════════════════════════════════════════════
  STRATEGY BUILD COMPLETE — HUMAN REVIEW REQUIRED
═══════════════════════════════════════════════════════

Strategy: [name]
Edge: [thesis summary]

PERFORMANCE SUMMARY (out-of-sample):
  Sharpe Ratio:     [X.XX] (95% CI: [X.XX, X.XX])
  Sortino Ratio:    [X.XX]
  Max Drawdown:     [X.X%] (duration: [N days])
  Annual Return:    [X.X%]
  Hit Rate:         [X.X%]
  Profit Factor:    [X.XX]

COST SENSITIVITY:
  Sharpe @ 1x costs: [X.XX]
  Sharpe @ 2x costs: [X.XX]
  Sharpe @ 3x costs: [X.XX]
  Cost buffer:       [X]x before Sharpe < 1.0

CAPACITY: ~$[X]M before significant alpha decay

RISK:
  Ruin probability (15% DD): [X.X%]
  Worst regime: [regime] (Sharpe: [X.XX])

AUDIT STATUS:
  Data audit:       [PASS/FAIL] (score: [XX]/100)
  Feature audit:    [PASS/FAIL] (score: [XX]/100)
  Validation audit: [PASS/FAIL] (score: [XX]/100)
  Full audit:       [PASS/FAIL] (score: [XX]/100)

═══════════════════════════════════════════════════════
```

Ask: **"Do you want to proceed to shadow trading?"**
- On YES: configure shadow trading, strategy is COMPLETE
- On NO: ask what concerns remain, address them, re-present

</procedure>

<gate_failure_protocol>

## Gate Failure Protocol

When any gate fails:

### Step 1: Log Failure
Write to CONTEXT.md:
```
| Phase [N] gate failed | Score: [XX]/100 | [N] CRITICAL, [M] WARNING violations | [date] |
```

### Step 2: Extract Remediation Tasks
Parse the audit report for violations and create a task list:
```markdown
## Remediation Tasks (Phase [N] Gate Failure)
- [ ] CRITICAL: [violation description] — [file:line]
- [ ] CRITICAL: [violation description] — [file:line]
- [ ] WARNING: [violation description] — [file:line]
```

### Step 3: Execute Fixes

```
Task(
  subagent_type="nr-executor",
  description="Fix audit violations for Phase [N]",
  prompt="Fix the following violations from the [MODE] audit:

  [violation list from audit report]

  Reference: quant-code-patterns.md for correct patterns.
  Fix each violation. Do not introduce new violations."
)
```

### Step 4: Re-Audit
Re-run the same gate audit. Compare scores.

### Step 5: Retry Limit
Maximum 3 gate retries per phase. After 3 failures:
- HALT the workflow
- Write to CONTEXT.md: "Phase [N] gate failed 3 times — requires user intervention"
- Present failure summary to user with specific unresolved violations
- Ask: "How would you like to proceed?"

</gate_failure_protocol>

<artifacts>

## Artifacts Per Phase

| Phase | Key Artifacts | Audit Report |
|-------|--------------|--------------|
| 1. Ideation | THESIS.md, RESEARCH.md, PROFILE.md | None |
| 2. Data | Data module, DATA_SCHEMA.md | AUDIT-TEMPORAL-DATA.md |
| 3. Features | Feature module, FEATURE_REPORT.md | AUDIT-FEATURE-ENGINEERING.md |
| 4. Validation | Validation module, VALIDATION_FRAMEWORK.md | AUDIT-VALIDATION-FRAMEWORK.md |
| 5. Model | Model artifacts, MODEL_REPORT.md | Baseline comparison log |
| 6. Evaluation | EVALUATION_REPORT.md, MONTE_CARLO.md | AUDIT-FULL-STRATEGY.md |
| 7. Production | PRODUCTION_PLAN.md, all modules | Human review record |

All artifacts are written to `.planning/strategy/`.
All audits are written to `.planning/audit/`.

</artifacts>

<integration>

## Integration with run.md

This workflow is dispatched when run.md classifies intent as `BUILD_STRATEGY`:

**Detection signals (need 3+ for activation):**
- COLD state (no existing .planning/ for this project)
- User mentions "build a strategy", "develop a trading system", "create an alpha model"
- Quant persona already active (2+ quant signals in CONTEXT.md)
- Strategy-specific language: edge, alpha, Sharpe, backtest, walk-forward

**Handoff from run.md:**
```
run.md CLASSIFY → BUILD_STRATEGY detected
  → Load build-strategy.md workflow
  → Execute Phase 1 through Phase 7 sequentially
  → Each phase: execute → gate → pass/fail → next or remediate
  → Phase 7 gate: human review
  → On completion: return control to run.md → DONE action
```

**State tracking:**
Update STATE.md after each phase completion:
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs state update-phase \
  --phase "[phase_name]" --status "COMPLETE" --gate "PASS" --score "[score]"
```

</integration>

<success_criteria>

## Success Criteria

The workflow is COMPLETE when ALL of the following are true:

1. **All 7 phases completed in strict order** — no phases skipped
2. **All automated gates passed** — auditor score >= 90 for each
3. **Final strategy performance:**
   - Sharpe ratio > 1.0 (net of estimated transaction costs)
   - Bootstrap 95% CI for Sharpe excludes 0
   - Positive Sharpe in at least 2 of 3 major market regimes
4. **Human review completed** — user explicitly approved for shadow trading
5. **All artifacts written** to `.planning/strategy/` and `.planning/audit/`
6. **No unresolved CRITICAL violations** across any audit report
7. **Kill switches and monitoring implemented** — no production deployment without safety

If the strategy fails to meet performance criteria after Phase 5 or 6, this is a VALID outcome. Not every thesis has a tradeable edge. Document the findings and present to user:
- "The strategy did not meet minimum performance thresholds."
- "Key findings: [what was learned]"
- "Recommendation: [revise thesis / try different features / abandon]"

A failed strategy with clean methodology is more valuable than a "successful" strategy built on lookahead bias.

</success_criteria>

<outputs>
- `.planning/strategy/THESIS.md` — edge hypothesis and falsification criteria
- `.planning/strategy/RESEARCH.md` — literature review and prior art
- `.planning/strategy/PROFILE.md` — strategy profile (asset class, frequency, capacity)
- `.planning/strategy/DATA_SCHEMA.md` — complete data dictionary with temporal annotations
- `.planning/strategy/FEATURE_REPORT.md` — IC analysis, regime stability, ablation results
- `.planning/strategy/VALIDATION_FRAMEWORK.md` — split design, metrics, baselines
- `.planning/strategy/MODEL_REPORT.md` — architecture rationale, HPO results, training diagnostics
- `.planning/strategy/EVALUATION_REPORT.md` — full metrics, regime analysis, cost sensitivity
- `.planning/strategy/MONTE_CARLO.md` — bootstrap CIs, ruin probability, drawdown distribution
- `.planning/strategy/PRODUCTION_PLAN.md` — live pipeline, monitoring, kill switches, shadow plan
- `.planning/audit/AUDIT-TEMPORAL-DATA.md` — Phase 2 gate audit
- `.planning/audit/AUDIT-FEATURE-ENGINEERING.md` — Phase 3 gate audit
- `.planning/audit/AUDIT-VALIDATION-FRAMEWORK.md` — Phase 4 gate audit
- `.planning/audit/AUDIT-FULL-STRATEGY.md` — Phase 6 comprehensive audit
</outputs>

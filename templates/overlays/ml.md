# ML Domain Overlay

## Persona Activation

When ML/Data Science domain is detected, determine the subdomain:

**Quantitative Finance / Trading** (PRIMARY — activate when signals present):
- Signals: Sharpe, P&L, returns, alpha, drawdown, position, execution, backtest, walk-forward, regime, lookahead, leakage, tick, OHLCV, orderbook, spread, slippage, trading, hedge, portfolio, signal decay, factor
- Persona: **You are the head of quantitative research at a systematic trading firm.** You have seen hundreds of strategies that looked great in backtest and failed in production. Your default stance is skepticism — every result is guilty of overfitting until proven innocent. You think in terms of: Is this real alpha or is this an artifact? Would I stake the firm's capital on this?
- Load: `references/quant-finance.md` for expert reasoning patterns

**General ML** (activate when no quant signals):
- Standard ML reasoning without the quant paranoia layer
- Still rigorous about validation, leakage, and overfitting — but without the trading-specific lens

## Domain-Specific Context Fields

Add these sections to CONTEXT.md when ML domain is detected:

### Model Architecture
- **Type:** {{transformer|CNN|RNN|diffusion|ensemble|gradient_boosting|linear}}
- **Parameters:** {{parameter count}}
- **Input shape:** {{dimensions, feature count, temporal window}}
- **Output:** {{classification|regression|generation|ranking|trajectory}}
- **Loss composition:** {{component losses and weights}}

### Training Configuration
- **Batch size:** {{size}}
- **Learning rate:** {{initial rate, schedule}}
- **Optimizer:** {{Adam|SGD|AdamW|custom}}
- **Epochs/budget:** {{max epochs or time budget}}
- **Hardware:** {{GPU type, count, memory}}
- **Regularization:** {{dropout, weight decay, augmentation}}

### Data Characteristics
- **Volume:** {{rows/samples, features}}
- **Quality:** {{missing %, noise level, label quality}}
- **Distribution:** {{balanced/imbalanced, temporal, spatial}}
- **Freshness:** {{update frequency, staleness risk}}
- **Feature types:** {{numerical, categorical, text, image, time-series}}
- **Temporal span:** {{date range, regime coverage}}

### Evaluation Framework
- **Primary metric:** {{Sharpe|accuracy|F1|AUC|RMSE|custom}}
- **Secondary metrics:** {{list}}
- **Validation strategy:** {{k-fold|holdout|walk-forward|time-series split}}
- **Baseline:** {{current best, random baseline, human baseline}}
- **Out-of-sample:** {{holdout period, never-touched test set}}

### Regime/Drift Monitoring
- **Regime detection:** {{method, frequency}}
- **Feature drift:** {{monitored features, threshold}}
- **Concept drift:** {{detection method, retrain trigger}}
- **Retraining schedule:** {{frequency, trigger conditions}}

## Quant-Specific Context Fields

Add these ADDITIONAL sections when quantitative finance subdomain is active:

### Market Structure
- **Asset class:** {{equities|crypto|FX|futures|options|fixed income}}
- **Frequency:** {{tick|1s|1m|5m|15m|1h|daily}}
- **Execution venue:** {{exchange, OTC, dark pool}}
- **Liquidity profile:** {{liquid|illiquid, avg daily volume, spread}}

### Strategy Profile
- **Type:** {{momentum|mean-reversion|statistical-arb|market-making|directional|relative-value}}
- **Holding period:** {{seconds|minutes|hours|days|weeks}}
- **Capacity:** {{estimated AUM capacity before alpha decay}}
- **Edge source:** {{speed|information|modeling|structural}}

### Risk Framework
- **Max drawdown tolerance:** {{percentage}}
- **Position sizing:** {{method, max single position}}
- **Correlation to existing book:** {{correlation to existing strategies}}
- **Tail risk:** {{how strategy behaves in crisis/flash crash}}

## ML-Specific Hard Constraints

| Constraint Pattern | Why It Matters | Cost of Violation |
|-------------------|----------------|-------------------|
| Training time budget | Compute cost, iteration speed | Budget overrun, slow research |
| Inference latency | User experience, SLA | SLA breach, revenue loss |
| Memory/GPU limits | Hardware availability | OOM crashes, training failure |
| Data freshness | Model accuracy | Stale predictions, financial loss |
| Reproducibility | Debugging, compliance | Can't diagnose issues |
| Privacy/compliance | GDPR, HIPAA, etc. | Legal liability |

## Quant-Specific Hard Constraints

| Constraint Pattern | Why It Matters | Cost of Violation |
|-------------------|----------------|-------------------|
| No future information in features | Lookahead bias invalidates ALL results | Strategy looks great in backtest, fails live |
| Temporal ordering in all splits | Data leakage through shuffled time series | Inflated metrics, false confidence |
| Transaction costs in evaluation | P&L without costs is fantasy | Profitable strategy becomes unprofitable |
| Regime coverage in validation | Bull-only training fails in crashes | Catastrophic drawdown in production |
| Out-of-sample holdout is sacred | Touching the test set corrupts it | No trustworthy performance estimate |
| Single seed is not evidence | One lucky seed proves nothing | Strategy is noise, not signal |

## ML Diagnostic Patterns

| Pattern | Symptoms | Root Cause | Resolution Strategy |
|---------|----------|------------|-------------------|
| Underfitting | Train loss high, metrics flat | Insufficient capacity or features | Increase capacity, engineer features, check data quality |
| Overfitting | Train good, eval bad, growing gap | Too much capacity, too little data | Regularize, augment, simplify, early stopping |
| Training instability | Loss spikes, NaN, divergence | Learning rate, normalization, data issues | Reduce LR, add gradient clipping, check data pipeline |
| Plateau | Loss stops decreasing at suboptimal level | Local minimum, LR too low, feature ceiling | LR scheduling, architecture change, new features |
| Data leakage | Suspiciously good metrics | Future data in features, train/eval overlap | Audit feature pipeline, check temporal ordering |
| Regime shift | Model degrades after retrain | Distribution change, concept drift | Regime detection, adaptive retraining, ensemble |
| Catastrophic forgetting | New data degrades old performance | Sequential training without replay | Experience replay, elastic weight consolidation |
| Feature redundancy | Many features, marginal improvement | Correlated features diluting signal | Feature selection, PCA, importance analysis |

## Quant Diagnostic Patterns

These are activated ONLY for quantitative finance projects. They represent the most common failure modes that destroy trading strategies.

| Pattern | Symptoms | Investigation Protocol |
|---------|----------|----------------------|
| Lookahead contamination | Metrics too good for the problem's difficulty, sudden performance jumps when new features added | Trace every feature to its construction. For each: "At time T, could I have known this value?" Check for off-by-one in indexing. Check EMA/rolling calculations for using current bar. Check for future-dated joins. |
| Backtest overfitting | Strong in-sample, weak/random out-of-sample, performance degrades with more data | Count degrees of freedom vs. data points. Run combinatorial purged cross-validation. Test on synthetic data with known signal — does the model find it? Test on shuffled labels — does the model still "work"? |
| Survivorship bias | Strategy works on current constituents but not historical universe | Check if dataset includes delisted/bankrupt assets. Check if universe is selected using future knowledge. Compare performance on full historical universe vs. current constituents. |
| Signal decay | Performance degrades over time even without code changes | Plot rolling metric over time. Check if alpha is being arbitraged away. Check if market microstructure changed. Compare recent vs. historical feature distributions. |
| Regime blindness | Works in one market condition, catastrophic in another | Segment performance by regime (bull/bear/sideways/crisis). Check validation period regime composition. Deliberately test on regime transitions. |
| Execution gap | Backtest profitable, live trading unprofitable | Check fill assumptions (mid vs. aggressive). Add realistic slippage model. Check latency impact on signal. Model market impact for position sizes. |
| Loss-metric misalignment | Loss decreasing but target metric flat or decreasing | The model is optimizing what you told it to, which isn't what you care about. Map loss components to target metrics. Check if auxiliary losses are drowning the signal you want. |
| Complexity premium illusion | Complex model barely beats simple baseline | The marginal gain doesn't justify the complexity risk. Compare to linear/tree baseline. If delta < 2%, the complex model is probably fitting noise. |

## Reasoning Triggers — Deep References

These triggers activate loading of specialized reference files for deep knowledge. They extend the base quant reasoning with comprehensive coverage.

### Architecture Selection Trigger
**Activate when:** Query mentions model architecture, LSTM vs transformer, which model to use, architecture decision, model selection, neural network vs tree-based.
**Load:** `references/ml-training.md` — Architecture Selection section and Architecture Deep Dives.
**Gate questions before answering:**
- Has a baseline been established first? (If no baseline, recommend LightGBM/linear first)
- Is the proposed architecture justified by data volume and task complexity?
- What is the inference latency requirement? (Transformers are slow; trees are fast)
- Is the complexity premium real? (Complex model must beat simple by > 2% to justify risk)

### Training Pipeline Trigger
**Activate when:** Query mentions training loop, DataLoader, learning rate, batch size, early stopping, gradient clipping, loss function, optimizer, epochs, training configuration.
**Load:** `references/ml-training.md` — Training Pipeline Best Practices and Loss Function Design.
**Gate questions before answering:**
- Is the DataLoader shuffling? (CRITICAL: must be False for time series)
- Is early stopping monitoring validation metric (not training loss)?
- Is the loss function aligned with the actual trading objective?
- Are gradients being clipped? (Financial return outliers cause NaN without clipping)
- Are random seeds set for ALL sources of randomness?

### Feature Engineering Trigger (Enhanced)
**Activate when:** Query mentions features, rolling statistics, indicators, normalization, feature selection, IC, information coefficient, feature importance, ablation, feature pipeline.
**Load:** `references/feature-engineering.md` — Full feature lifecycle reference.
**Gate questions before answering:**
- Does every rolling computation use shift(1) before rolling()? (Temporal guard)
- Is normalization scope correct? (Expanding window or training-set-only, never global)
- Is feature selection done inside walk-forward CV? (Selection on full data = snooping)
- Has IC decay been measured? (A feature with IC that doesn't decay monotonically is suspicious)
- Is multiple testing correction applied? (Testing N features requires Bonferroni or FDR)

### Strategy Evaluation Trigger
**Activate when:** Query mentions Sharpe ratio, performance evaluation, backtest results, strategy metrics, drawdown, risk metrics, transaction costs, capacity.
**Load:** `references/strategy-metrics.md` — Full metric reference with correct formulas.
**Gate questions before answering:**
- Is the Sharpe ratio adjusted for autocorrelation? (Newey-West, not naive mean/std)
- Are bootstrap confidence intervals reported? (Point estimate Sharpe is meaningless)
- Are transaction costs included? (Gross Sharpe vs net Sharpe can differ enormously)
- Is the evaluation walk-forward? (Single-split backtest is not evidence)
- Has the multiple testing problem been addressed? (Deflated Sharpe Ratio if many strategies tested)

### Code Audit Trigger
**Activate when:** Query mentions audit, scan, check code, verify pipeline, lookahead check, temporal safety review.
**Action:** Recommend spawning `nr-quant-auditor` agent for automated scanning.
**Available modes:** TEMPORAL_AUDIT, FEATURE_AUDIT, VALIDATION_AUDIT, FULL_AUDIT.
**Output location:** `.planning/audit/AUDIT-{mode}-{timestamp}.md`

## ML Metrics Reference

| Metric | Use When | Watch Out For |
|--------|----------|---------------|
| Accuracy | Balanced classification | Misleading on imbalanced data |
| F1 Score | Imbalanced classification | Threshold-dependent |
| AUC-ROC | Ranking, threshold-free evaluation | Can hide poor calibration |
| Sharpe Ratio | Trading/financial models | Window-dependent, can be gamed by cherry-picking period |
| RMSE | Regression, scale matters | Sensitive to outliers |
| MAE | Regression, outlier-robust | Less sensitive to large errors |
| Log Loss | Probabilistic classification | Requires calibrated probabilities |
| R-squared | Regression, explained variance | Can increase with irrelevant features |
| Precision@K | Top-K ranking, recommendation | Ignores recall, position-insensitive |
| Calmar Ratio | Trading with drawdown focus | More robust than Sharpe for tail risk |
| Hit Rate | Directional prediction | Meaningless without magnitude — 51% hit rate with 2:1 payoff ratio is great |
| Profit Factor | Trading P&L | Gross profit / gross loss — above 1.5 is strong |

## ML Phase Structure Template

Typical ML project phases:
1. **Data Pipeline + EDA** — always first, never skip; understand shape, quality, distributions
2. **Feature Engineering + Selection** — domain features, transformations, importance ranking
3. **Baseline Model** — simple, fast validation; proves signal exists before investing in complexity
4. **Target Architecture** — the model you actually want; justified by baseline learnings
5. **Training Loop + Optimization** — hyperparameter tuning, regularization, hardware utilization
6. **Evaluation + Validation Framework** — proper holdout, cross-validation, statistical significance
7. **Monitoring + Drift Detection** — production model health, retraining triggers
8. **Deployment / Serving** — inference optimization, A/B testing, rollback strategy

## Quant Phase Structure Template

Quantitative finance projects follow a DIFFERENT phase structure. The key difference: validation rigor comes FIRST, not after the model is built.

1. **Data Integrity + Universe Definition** — data quality, survivorship check, temporal alignment, point-in-time correctness
2. **Feature Engineering with Causal Audit** — every feature must pass: "At prediction time T, is this knowable?" Lookahead audit is non-negotiable.
3. **Validation Framework BEFORE Modeling** — walk-forward splits, purged CV, regime-aware holdouts. Define this BEFORE touching a model. If your validation is wrong, everything downstream is wrong.
4. **Signal Discovery + Baseline** — simple models first (linear, tree). If a simple model can't find signal, question the data, not the architecture.
5. **Target Architecture** — justified by baseline learnings. Complexity must earn its place.
6. **Backtest with Realistic Assumptions** — transaction costs, slippage, market impact, fill rates. No mid-price fantasy.
7. **Out-of-Sample Validation** — the test set you never touched. One shot. If it fails, go back to step 4, not step 6.
8. **Paper Trading / Shadow Mode** — run alongside live without risking capital. Compare fills, latency, actual vs. expected.
9. **Live Deployment with Kill Switches** — position limits, drawdown limits, automatic shutdown thresholds.

## ML Metrics Tracking Table

| Metric | Current | Target | Phase | Notes |
|--------|---------|--------|-------|-------|

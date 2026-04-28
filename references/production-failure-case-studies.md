# Production Failure Case Studies — Real Repo Learnings

## Purpose

This reference captures anonymized failure patterns from real quantitative trading projects. Every pattern documented here was observed in production or near-production code. These are NOT theoretical — they are bugs that cost real money or wasted months of development.

Netrunner agents use these case studies to:
- Recognize failure signatures before they reach production
- Guide debugging when similar patterns emerge in new projects
- Inform pre-generation gates with concrete "don't repeat this" examples
- Provide realistic context during BUILD_STRATEGY phases

## Case Study Format

Each case follows: **Symptom → Root Cause → How It Was Found → Fix → Lesson**

---

## Case 1: Temporal Data Contamination via Alternating Splits

**Symptom:** Model showed 70%+ directional accuracy in "test" data. Strategy had Sharpe > 3 in backtest. Collapsed to ~50% (random) in true out-of-sample.

**Root Cause:** Data was split using `alternating_3d_split` — alternating 3-day blocks between train and test sets. This created massive information leakage because:
- Feature windows (e.g., 60-bar lookbacks) bridged train/test boundaries
- The "test" blocks were temporally interleaved with training data
- Autocorrelation in financial time series meant adjacent blocks were highly correlated

**How It Was Found:** When a strict temporal split was enforced (train: first 70%, test: last 30% with purge gap), all apparent alpha vanished. The model was memorizing patterns from adjacent training blocks, not learning generalizable signal.

**Fix:** Replaced alternating split with strict chronological split + purge gap of `max(feature_window, target_horizon)` bars between train and test. Added embargo period equal to target horizon.

**Lesson:** **Any non-chronological split on time series data is wrong.** No exceptions. The autocorrelation in financial data guarantees that interleaved splits will leak information. This is the #1 most common and most damaging error in quant ML.

**Netrunner Integration:** `nr-quant-auditor` TEMPORAL_AUDIT scans for split functions. Any function that doesn't enforce strict temporal ordering triggers a CRITICAL finding.

---

## Case 2: Target Normalization Leakage

**Symptom:** Model performed well across all time periods in backtest, even during regime changes. This was suspicious — real models degrade during regime shifts.

**Root Cause:** Target variable (log returns) was normalized using `log_return_idx=None`, which applied normalization across the entire dataset, including future data. The model effectively learned that "returns in this period are below the full-dataset average" — information unavailable in real-time.

**How It Was Found:** Audit of the feature pipeline revealed that normalization statistics (mean, std) were computed once on the full dataset before splitting. When re-run with expanding-window normalization (only using data available at each point), regime-dependent performance emerged.

**Fix:** All normalization must use expanding windows. At time t, normalization uses only data from [0, t-1]. Implementation: `ExpandingNormalizer` class that maintains running mean/std.

**Lesson:** **Normalization is a feature transformation — it must obey the same temporal constraints as features.** Using full-dataset statistics (mean, std, min, max, quantiles) injects future information. This applies to: z-scoring, min-max scaling, rank normalization, quantile transformation.

**Netrunner Integration:** `quant-code-patterns.md` Pattern 2 (Normalization Leakage). nr-quant-auditor scans for `StandardScaler().fit(full_data)`, `(x - x.mean()) / x.std()` on full arrays, and similar patterns.

---

## Case 3: Regime Classification with Future Data

**Symptom:** Regime-conditional strategies showed excellent performance — momentum in trending regimes, mean-reversion in ranging regimes. Regime classification appeared highly accurate.

**Root Cause:** Regime labels were constructed using a Hidden Markov Model (HMM) fitted on the full dataset. The HMM's Viterbi decoding uses both past AND future observations to determine the most likely state sequence. When applied to the full dataset before splitting, every point's regime label incorporated future information.

**Partial Fix:** Re-fit HMM using only past data (online/expanding mode). However, HMM regime labels at transition points are inherently uncertain — the model needs several bars of future data to "confirm" a regime change.

**Deeper Issue:** Regime inference has a fundamental detection lag. In real-time, you're always uncertain about the current regime. Any strategy that assumes immediate regime knowledge is unrealistic.

**Lesson:** **Regime detection must use only causal (past) data, AND must account for detection lag.** The strategy must perform acceptably during the lag period (when regime is uncertain). Strategies that only work when regime is known with certainty are useless in practice.

**Netrunner Integration:** `quant-code-patterns.md` Pattern 3 (Regime Detection with Future Data). Build-strategy Phase 4 explicitly validates regime detection lag impact.

---

## Case 4: Massive Strategy Parameter Overfitting

**Symptom:** Exhaustive parameter search (281 configurations) found strategies with excellent in-sample Sharpe ratios. ALL 281 configurations had negative Sharpe in test data.

**Root Cause:** Classic multiple testing problem. With 281 independent tests, the expected maximum in-sample Sharpe due to chance alone is ~2.5 (even with pure noise). The best configuration was selected as if it had genuine alpha, but it was simply the luckiest draw from random variation.

**Key Numbers:**
- 281 configurations tested
- Expected max Sharpe from random: E[max] ≈ √(2 * ln(N)) ≈ √(2 * ln(281)) ≈ 3.36
- Deflated Sharpe Ratio of best config: probability of genuine skill = 6.8%
- ALL configs negative in test: the entire strategy class had no alpha

**How It Was Found:** Application of the Deflated Sharpe Ratio (Bailey & Lopez de Prado) and comparison with theoretical expected maximum under null hypothesis.

**Fix:**
1. Apply Bonferroni correction: required significance = 0.05/281 = 0.000178
2. Use Deflated Sharpe Ratio as primary metric (not raw Sharpe)
3. Reduce parameter space — 281 configs was too many for the data available
4. Use walk-forward optimization instead of single in-sample/out-of-sample split

**Lesson:** **The more strategies you test, the higher the bar for declaring alpha.** With N tests, you must adjust significance thresholds. If your best strategy barely beats the Bonferroni-corrected threshold, it's probably noise. Rule of thumb: if >100 configs tested and best test Sharpe is < 1.0, there's no alpha in this strategy class.

**Netrunner Integration:** `overfitting-diagnostics.md` DSR and PBO implementations. nr-quant-auditor checks for parameter sweep scale vs dataset size.

---

## Case 5: LightGBM Feature Leakage (13-24% Accuracy Gap)

**Symptom:** LightGBM ensemble showed 13-24% accuracy gap between training and test sets across all target horizons. Training accuracy 75-85%, test accuracy 52-62%.

**Root Cause:** Multiple subtle leakage sources in the tree-based model pipeline:
1. Feature importance computed on training data guided feature selection — selection bias
2. Some features used current-bar information (OHLC of the prediction bar)
3. Cross-validation used standard KFold (not time series split) for hyperparameter tuning
4. Label smoothing applied across the full dataset

**Why It Persisted:** The gap was "expected" because "ML models always overfit somewhat." The team normalized a 13-24% gap as acceptable rather than investigating it as a red flag.

**Fix:** Requires complete pipeline reconstruction:
1. Strict point-in-time features only (1-bar delay buffer)
2. Purged time series CV for hyperparameter tuning
3. Feature selection via walk-forward importance (not single-fit importance)
4. Label construction with explicit temporal boundary

**Lesson:** **A large train-test gap is never "normal" — it's a signal of leakage.** Acceptable gaps in financial ML: <5% for classification, <10% for regression R². Anything larger demands investigation. "All models overfit" is true but not an excuse for a 20% gap — that's not overfitting, it's data leakage.

**Netrunner Integration:** `quant-code-patterns.md` covers tree-based model leakage patterns. nr-quant-auditor FEATURE_AUDIT mode checks for current-bar features and improper CV.

---

## Case 6: Fill Rate Illusion (2.3x Cost Inflation)

**Symptom:** Backtest assumed 100% fill rate at mid-price. Live trading showed:
- Actual fill rate: ~65% for limit orders
- Slippage: 3-5 bps on market orders
- Combined effect: 8.1 bps realized cost vs 3.5 bps assumed

**Root Cause:** Backtesting engine used `mid_price` for all fills. In reality:
- Limit orders at mid don't always fill (miss the queue, price moves away)
- Aggressive fills (market orders) pay the spread + slippage
- Partial fills create position management overhead
- Price moves during the 200-500ms execution latency

**Impact:** A strategy with Sharpe 2.0 after 3.5 bps costs became Sharpe 0.8 after 8.1 bps costs. Marginal profitability.

**Fix:**
1. Backtest with pessimistic fill model: 70% fill rate for limit orders
2. Add slippage model: `slippage = σ_daily × √(V_order / V_daily) × impact_factor`
3. Include latency model: price moves during 200-500ms window
4. Validate cost assumptions with first 2 weeks of live trading before scaling

**Lesson:** **Always backtest with pessimistic cost assumptions, then validate with small-size live trading.** The execution gap is where most strategies die. A strategy that's profitable only under optimistic fill assumptions isn't really profitable.

**Netrunner Integration:** `production-reality.md` cost models and capacity estimation. Build-strategy Phase 7 production readiness checklist.

---

## Case 7: Entry Latency Killing Signal Alpha

**Symptom:** Strategy showed strong signal on 1-minute bars. Live implementation had 200-500ms entry latency. By the time orders were placed, the edge had partially evaporated.

**Root Cause:** Signal alpha on 1-minute BTC perp futures decays significantly within seconds. The 200-500ms latency consumed ~15-30% of the expected move. Combined with spread and slippage, net alpha after execution was marginal.

**How It Was Quantified:** Signal persistence analysis: computed correlation between signal at t and return from t+Δ for various Δ values. At Δ=0 (instantaneous), IC=0.04. At Δ=500ms, IC=0.025. At Δ=1s, IC=0.018.

**Fix:** Two approaches:
1. Move to higher timeframes where signal has longer persistence (5m, 15m bars)
2. Implement signal-adjusted entry: only trade when signal strength exceeds latency-adjusted threshold

**Lesson:** **Signal persistence must exceed execution latency.** For each strategy, measure: "How quickly does the signal decay?" If signal half-life < execution latency, the strategy is unimplementable at your infrastructure level. Either improve infrastructure or find slower signals.

**Netrunner Integration:** `live-drift-detection.md` execution quality monitoring. `production-reality.md` latency budget requirements.

---

## Case 8: Orderbook Depth Stability Overestimation in Market Simulation

**Symptom:** Market simulator assumed stable orderbook depth with mean-reverting replenishment. Real markets showed orderbook depth can evaporate instantaneously during stress events.

**Root Cause:** Simulator used static bid/ask depth parameters drawn from average conditions. During volatility spikes:
- Depth drops 80-95% in milliseconds
- Replenishment takes 10-100x longer than modeled
- Liquidation cascades create feedback loops not captured by mean-reversion model

**Impact:** Strategy capacity estimates were 5-10x too optimistic. A strategy sized for $5M based on sim analysis could only support $500K-$1M in reality during high-vol periods.

**Fix:**
1. Use regime-conditional depth profiles (separate params for calm/stress/crisis)
2. Implement depth decay during large trades: `depth_remaining = depth_initial × exp(-k × V_traded/V_depth)`
3. Add liquidation cascade modeling with Hawkes process for arrival rates
4. Conservative capacity = capacity_at_10th_percentile_depth, not average depth

**Lesson:** **Simulate the worst case, not the average case.** Market depth, spread, and liquidity are non-stationary and regime-dependent. Size the strategy for stressed conditions, not normal conditions. If it can't survive a liquidity event, it will eventually encounter one.

**Netrunner Integration:** `risk-management-framework.md` stress testing scenarios. `production-reality.md` capacity estimation with stress adjustment.

---

## Case 9: Hawkes Branching Ratio Instability

**Symptom:** Hawkes process model for trade arrival rates worked well during normal conditions but diverged catastrophically during stress events. Branching ratio approached supercritical (>1.0), causing simulation explosion.

**Root Cause:** Hawkes process branching ratio (α/β) is regime-dependent:
- Normal markets: α/β ≈ 0.3-0.6 (subcritical, stable)
- Stressed markets: α/β → 0.8-1.2 (near-critical or supercritical)
- The model calibrated on normal data couldn't handle stress regimes

**Fix:**
1. Regime-conditional Hawkes parameters
2. Hard cap on branching ratio: force α/β ≤ 0.95 during simulation
3. Use marked Hawkes process with trade size marks for more realistic clustering
4. Validate against actual event clusters (flash crashes, liquidation cascades)

**Lesson:** **Self-exciting processes (Hawkes, INAR) require regime-conditional calibration.** Parameters calibrated on calm data will be wrong during stress. Always test: "what happens when this parameter hits its extreme?"

---

## Case 10: Short-Window Regime Inference Noise

**Symptom:** Regime detector using 20-bar rolling windows produced excessive regime switches (multiple per day on 1-minute data). Strategy whipsawed between momentum and mean-reversion modes.

**Root Cause:** Short windows have high estimation variance. With 20 one-minute bars, the realized volatility estimate has a standard error of ~30%. This means "low volatility" and "high volatility" regimes overlap significantly, causing frequent misclassification.

**Fix:**
1. Increase window to minimum 100 bars for regime inference
2. Add hysteresis: require N consecutive bars in new regime before switching
3. Use probabilistic regime assignments instead of hard labels
4. Validate regime detection accuracy: out-of-sample regime prediction should be >60% accurate over the detection lag period

**Lesson:** **Regime detection granularity must match the strategy's rebalancing frequency.** If you trade daily, you need a regime detector that's stable on daily timescales (weeks of data). If you trade every minute, you still need at least 30-60 minutes of data for meaningful regime inference.

---

## Cross-Cutting Failure Patterns

### Pattern A: "It Works in Backtest" False Confidence
Every case above showed profitable backtests. The failure patterns are:
1. **Temporal leakage** (Cases 1, 2, 3, 5) — Most common, highest impact
2. **Cost underestimation** (Cases 6, 7, 8) — Second most common
3. **Multiple testing** (Case 4) — Hard to detect without formal testing
4. **Non-stationarity** (Cases 8, 9, 10) — Market changes break calibrations

### Pattern B: Severity Ranking
| Pattern | Frequency | Severity | Detection Difficulty |
|---------|-----------|----------|---------------------|
| Temporal leakage | Very High | Critical | Medium (auditor catches most) |
| Cost underestimation | High | High | Low (compare to reality) |
| Multiple testing | High | High | High (requires DSR/PBO) |
| Regime assumptions | Medium | Medium-High | Medium |
| Feature normalization leakage | Medium | Critical | Medium |
| Parameter overfitting | High | High | Medium (walk-forward reveals) |

### Pattern C: Warning Signs
If you see ANY of these, investigate immediately:
- Train-test accuracy gap > 5%
- Sharpe > 3 on any configuration
- Strategy works equally well in all time periods
- No performance degradation during known regime changes (2020 COVID, 2022 crypto crash)
- Parameter sensitivity: small changes → large performance changes
- Feature importance dominated by a single feature (possible leakage channel)

## Integration Points

### For nr-quant-auditor
Each case maps to specific audit checks:
- Case 1 → TEMPORAL_AUDIT: check split function temporal ordering
- Case 2 → TEMPORAL_AUDIT: check normalization uses expanding windows
- Case 3 → TEMPORAL_AUDIT: check regime labels are causal
- Case 4 → VALIDATION_AUDIT: check DSR applied for parameter sweeps
- Case 5 → FEATURE_AUDIT: check train-test gap magnitude
- Case 6-7 → PRODUCTION_AUDIT: check cost model realism
- Case 8-10 → VALIDATION_AUDIT: check regime robustness tests

### For build-strategy.md
Phase progression gates should verify:
- Phase 2 (Data): Cases 1, 2 temporal checks passed
- Phase 3 (Features): Cases 3, 5 feature audit passed
- Phase 4 (Validation): Case 4 multiple testing correction applied
- Phase 6 (Evaluation): Cases 6-7 cost models validated
- Phase 7 (Production): Cases 8-10 stress scenarios covered

### For nr-researcher
When investigating strategy failure in a new project, reference these cases:
- "Is this similar to Case N?" accelerates root cause identification
- Symptom matching: compare observed failure signature to documented symptoms

### For quant-finance.md
New reasoning trigger: "Production Strategy Failing"
1. Check failure symptoms against case study signatures
2. Classify: temporal leakage, cost issue, regime shift, or statistical artifact
3. Follow the fix approach from the matching case study
4. Apply the lesson to prevent recurrence

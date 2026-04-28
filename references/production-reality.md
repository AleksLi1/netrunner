# Production Reality: Bridging the Backtest-Production Gap

## Purpose

This reference addresses the #1 failure mode in quantitative strategy development: strategies that perform well in backtests but fail in production. It provides concrete, measurable checks that every strategy must pass before deploying capital.

The core insight: **Backtests are optimistic by default.** Every simplification in a backtest adds optimism. The gap between backtest and production is the sum of all simplifications.

## The 12 Sources of Backtest-Production Divergence

### Source 1: Execution Cost Underestimation

**The Problem**: Backtests typically assume flat costs (e.g., 5 bps per round trip). Reality is 2-5x worse.

**Real Cost Components:**
```
Total Cost = Spread + Market Impact + Fees + Slippage + Latency Cost + Opportunity Cost

Where:
  Spread       = (ask - bid) / mid_price  [varies 0.1 bps to 50+ bps]
  Market Impact = Y * sign(trade) * sqrt(volume / ADV)  [Square Root Law]
  Fees         = maker_fee + taker_fee  [varies by exchange, volume tier]
  Slippage     = expected_fill - actual_fill  [varies with order size, urgency]
  Latency Cost = alpha_decay_rate * execution_delay  [signal degrades while waiting]
  Opportunity Cost = missed_trades * avg_trade_pnl  [partial fills, queue misses]
```

**Asset-Class Cost Benchmarks:**

| Asset Class | Spread (bps) | Market Impact (1% ADV) | Maker Fee | Taker Fee | Realistic RT Cost |
|-------------|-------------|----------------------|-----------|-----------|------------------|
| BTC Perps (Binance) | 0.5-2 | 1-5 bps | 2.0 bps | 5.0 bps | 8-15 bps |
| BTC Spot (major) | 1-5 | 2-8 bps | 0-2.5 bps | 3-5 bps | 7-20 bps |
| US Large-Cap Equity | 0.5-2 | 0.5-3 bps | Rebate | 3 bps | 3-8 bps |
| US Small-Cap Equity | 5-20 | 5-30 bps | Rebate | 3 bps | 15-60 bps |
| FX Major (EURUSD) | 0.3-1 | 0.2-1 bps | N/A | 0.5-1.5 bps | 1-4 bps |
| FX Minor | 2-10 | 1-5 bps | N/A | 1-3 bps | 5-20 bps |
| Futures (ES) | 0.25 tick | 0.5-2 bps | Exchange fee | Exchange fee | 2-5 bps |
| Alt-Crypto | 5-50 | 10-100 bps | 2-5 bps | 5-10 bps | 20-150 bps |

**Audit Rule**: Backtest cost assumptions MUST be documented and compared to these benchmarks. If backtest costs < 50% of benchmark, the backtest is INVALID.

**WRONG**: `cost = 5  # bps per round trip`
**CORRECT**:
```python
def estimate_realistic_cost(order_size_usd, adv_usd, spread_bps, maker_fee_bps, taker_fee_bps):
    participation_rate = order_size_usd / adv_usd
    market_impact_bps = 10 * np.sqrt(participation_rate)  # Square-root law, Y≈10 for crypto
    spread_cost = spread_bps  # Pay half-spread each way = full spread RT
    fee_cost = maker_fee_bps + taker_fee_bps  # Assume maker entry, taker exit
    slippage_bps = max(1.0, spread_bps * 0.3)  # 30% of spread as slippage
    return spread_cost + market_impact_bps + fee_cost + slippage_bps
```

### Source 2: Market Impact and Capacity

**The Problem**: Backtest returns are computed assuming zero market impact. In production, your own trades move prices against you. This effect is nonlinear — doubling position size more than doubles impact.

**The Square Root Law** (Bouchaud et al., confirmed universally in 2025):
```
Impact = Y * sigma * sqrt(Q / V)

Where:
  Y     = impact coefficient (~1.0 for most markets)
  sigma = daily volatility
  Q     = your order quantity
  V     = daily volume
  Q/V   = participation rate
```

**Capacity Estimation:**
```python
def estimate_capacity_usd(target_sharpe, backtest_sharpe, daily_volume_usd, daily_vol_pct):
    """Estimate max AUM where strategy remains profitable."""
    # At what participation rate does impact eat all alpha?
    alpha_bps = (backtest_sharpe - target_sharpe) * daily_vol_pct * 100 / np.sqrt(252)
    # Impact = Y * sigma * sqrt(Q/V), solve for Q:
    # alpha_bps = Y * sigma * sqrt(Q/V)
    # Q = V * (alpha_bps / (Y * sigma))^2
    Y = 1.0
    max_daily_volume = daily_volume_usd * (alpha_bps / (Y * daily_vol_pct * 100)) ** 2
    return max_daily_volume * 252  # Annualize for AUM estimate
```

**Audit Rule**: Every strategy must have a documented capacity estimate. If capacity < planned AUM, the strategy is not viable at that scale.

### Source 3: Fill Rate and Partial Fills

**The Problem**: Backtests assume 100% fill at the desired price. Production has:
- Limit orders that don't fill (sitting in queue behind others)
- Partial fills (only part of order executes)
- Adverse selection (fills happen when price moves against you)

**Fill Rate Benchmarks:**

| Order Type | Expected Fill Rate | Comment |
|-----------|-------------------|---------|
| Market order | 99.5%+ | Almost always fills, but at worse price |
| Limit at best bid/ask | 40-70% | Depends on queue position |
| Limit 1 tick away | 60-85% | Better fill rate, slight adverse selection |
| Chase maker (6 rounds) | 80-95% | Reprice to capture fill, but slower |
| Passive-then-aggressive | 70-90% maker, 100% total | Best of both worlds |

**WRONG**: Assume all orders fill at mid-price
**CORRECT**: Model maker/taker fill probability and adjust PnL:
```python
maker_fill_prob = 0.70  # Estimated from live data
rt_cost_if_maker = maker_fee + maker_fee  # Both sides maker
rt_cost_if_taker = taker_fee + taker_fee  # Both sides taker
expected_rt_cost = maker_fill_prob * rt_cost_if_maker + (1 - maker_fill_prob) * rt_cost_if_taker
```

### Source 4: Latency and Signal Decay

**The Problem**: Between signal generation and order execution, alpha decays. In fast-moving markets, this decay can consume the entire edge.

**Latency Budget:**
```
Total Latency = Data Latency + Computation + Network + Exchange Processing + Queue Position

Typical values:
  Data feed:        50-500ms (WebSocket to local processing)
  Feature compute:  10-100ms (depends on feature complexity)
  Model inference:  5-50ms (single model), 50-500ms (ensemble)
  Network to exchange: 50-300ms (depends on location)
  Exchange matching: 1-10ms (exchange internal)
  Queue position:   0-∞ms (limit orders wait in queue)

  TOTAL: 200ms-2000ms for a typical algo system
```

**Alpha Decay Rate by Timeframe:**

| Strategy Timeframe | Acceptable Latency | Alpha Decay per Second |
|-------------------|-------------------|----------------------|
| HFT (microsecond) | <1ms | 10-50% of edge |
| Intraday (minute) | <500ms | 1-5% of edge |
| Swing (hourly) | <30s | 0.01-0.1% of edge |
| Position (daily) | <5min | Negligible |

**Audit Rule**: Strategy alpha decay rate × expected latency must be < 10% of expected trade PnL.

### Source 5: Data Quality and Gaps

**The Problem**: Backtests use clean, continuous historical data. Production data has:
- WebSocket disconnections (10-20/month for crypto)
- Gap filling artifacts (REST backfill may differ from live stream)
- Stale data (delayed or missing updates)
- Duplicate data (reconnection replays)
- Corporate actions (equities: splits, dividends, delistings)

**Data Quality Checklist:**
```
[ ] WebSocket reconnection handling documented and tested
[ ] Gap detection threshold defined (e.g., >180s = gap)
[ ] Gap filling uses REST API backfill, verified against live data
[ ] Features recomputed after gap fill (not using stale cached values)
[ ] Duplicate bar detection and deduplication
[ ] Timestamp synchronization (system clock vs exchange clock)
[ ] Corporate action handling (equities) or funding rate handling (crypto perps)
[ ] Data validation on every bar (NaN check, range check, timestamp order)
```

### Source 6: Regime Non-Stationarity

**The Problem**: Backtests are validated on historical data that may not represent future market conditions. Markets are non-stationary — statistical properties change over time.

**Key Regime Shifts:**
- **Volatility regimes**: Low-vol → high-vol can happen in hours (flash crashes)
- **Correlation regimes**: Asset correlations spike during crises (diversification fails)
- **Liquidity regimes**: Depth can vanish instantly during stress
- **Market structure changes**: Fee changes, new exchanges, regulatory changes, participant changes

**Validation Requirement**: Strategy must be tested across MULTIPLE regimes:
```
Minimum regime coverage:
[ ] Bull market (trending up, low vol)
[ ] Bear market (trending down, high vol)
[ ] Sideways/chop (no trend, moderate vol)
[ ] Flash crash (sudden spike, then recovery)
[ ] Volatility expansion (low → high vol regime)
[ ] Volatility compression (high → low vol regime)

If ANY regime has negative Sharpe after costs:
  → The strategy is regime-dependent, not universally robust
  → MUST have regime detection + conditional deployment
```

### Source 7: Survivorship and Selection Bias

**The Problem**: Historical data often excludes assets that failed (delisted, bankrupt, hacked). Including only survivors inflates backtest returns.

**Bias Types:**
| Bias | Description | Typical Inflation |
|------|-------------|------------------|
| Survivorship | Only currently-existing assets in backtest | +2-5% annual return |
| Look-ahead (universe) | Using today's S&P 500 to select 2015 universe | +1-3% annual return |
| Backfill | Data provider adds history retroactively | +1-4% annual return |
| Selection (strategy) | Reporting best of N tested strategies | See PBO section |

**WRONG**: `universe = sp500_current_constituents()`
**CORRECT**: `universe = sp500_constituents_as_of(date)  # Point-in-time`

### Source 8: Overfitting and Multiple Testing

**The Problem**: Testing many strategy variants and selecting the best one inflates apparent performance. With 100 variants tested, the best will appear significant even if all are random.

**Reference**: See `references/overfitting-diagnostics.md` for complete framework.

**Quick Check**: If you tested N variants, the expected maximum Sharpe under zero alpha is:
```
E[max SR] ≈ sqrt(2 * ln(N)) / sqrt(T/12)

For N=100 variants, T=5 years:
  E[max SR] ≈ sqrt(2 * ln(100)) / sqrt(5*12/12) = 3.03 / 2.24 ≈ 1.35

This means: A Sharpe of 1.35 over 5 years with 100 tested variants is EXPECTED BY CHANCE.
```

### Source 9: Funding and Carrying Costs

**The Problem**: Strategies that hold positions incur costs not captured in simple backtests.

**Crypto Perpetuals:**
- Funding rate: ±0.01% every 8 hours (±10.95% annualized at max)
- If consistently long during positive funding → significant cost drag
- If consistently short during negative funding → significant cost drag

**Equities:**
- Short borrow costs: 0.5-100%+ annualized (hard to borrow stocks)
- Margin interest: 5-8% annualized on leveraged positions
- Dividend adjustments for short positions

**Audit Rule**: Strategies holding positions >24h must model carrying costs explicitly.

### Source 10: Position Sizing Drift

**The Problem**: Backtests typically compute position sizes from exact portfolio values. Production has:
- Balance queries that are milliseconds stale
- Unrealized PnL that changes between sizing and execution
- Rounding to exchange-specific lot sizes
- Leverage limits that vary by asset and exchange

**Drift Sources:**
```
Sizing Error = |intended_position - actual_position| / intended_position

Sources:
  Balance staleness:    ±0.1-1% (REST API lag during volatile markets)
  Unrealized PnL:       ±0.5-5% (position mark changes during execution)
  Lot size rounding:    ±0.01-5% (depends on asset minimum increment)
  Leverage rebalancing: ±1-10% (exchange may reduce leverage during vol)
```

### Source 11: Strategy Interaction Effects

**The Problem**: Strategies developed in isolation may interact badly when run together.

**Interaction Types:**
- **Correlation drag**: Two "uncorrelated" strategies become correlated in crisis
- **Capacity competition**: Multiple strategies trading same asset compete for fills
- **Hedge cancellation**: Long in strategy A, short in strategy B = net flat = wasted fees
- **Cascading stops**: Strategy A stop-loss triggers selling → triggers strategy B stop-loss

**Audit Rule**: If running multiple strategies, compute:
- Cross-strategy correlation by regime (not just overall)
- Net exposure by asset across all strategies
- Drawdown correlation (do strategies drawdown together?)

### Source 12: Operational Risk

**The Problem**: Production systems fail in ways backtests never simulate.

**Common Operational Failures:**
```
- Exchange API outage (1-4 hours, happens monthly)
- Server crash during active position (requires crash recovery)
- Incorrect configuration deployment (wrong parameters)
- API key expiration or rate limit changes
- Exchange maintenance windows (scheduled, but parameters change)
- Position reconciliation errors (local state ≠ exchange state)
- Network partition (orders sent but no confirmation received)
```

**Every production system MUST have:**
```
[ ] Crash recovery: Restores position state from persistent journal
[ ] Reconciliation: Compares local state to exchange on every restart
[ ] Circuit breakers: Auto-disable on N consecutive errors
[ ] Kill switch: Manual emergency flatten-all endpoint
[ ] Health monitoring: Alert when data is stale or system is degraded
[ ] Idempotent orders: Can safely retry without double-execution
```

## The Production Readiness Checklist

Every strategy MUST pass ALL items before receiving real capital:

### Tier 1: Methodology (Must Pass)
```
[ ] 1.  Walk-forward validation with purge gap (no leaked information)
[ ] 2.  Transaction costs modeled realistically (>= benchmark for asset class)
[ ] 3.  Multiple testing correction applied (DSR or PBO computed)
[ ] 4.  Out-of-sample period ≥ 6 months (or 100+ trades)
[ ] 5.  No survivorship bias in universe construction
[ ] 6.  Features use only causally available data (t-1 or earlier)
```

### Tier 2: Robustness (Must Pass)
```
[ ] 7.  Strategy profitable in ≥ 3 distinct market regimes
[ ] 8.  Performance degrades gracefully (not cliff-edge) with +50% costs
[ ] 9.  Parameter sensitivity analysis: profit plateau, not sharp peak
[ ] 10. Monte Carlo permutation test: p < 0.05 (edge is real, not noise)
[ ] 11. Walk-forward efficiency ratio > 0.3 (OOS/IS performance ratio)
[ ] 12. Capacity estimate exceeds planned deployment capital by ≥ 2x
```

### Tier 3: Production Infrastructure (Must Pass)
```
[ ] 13. Execution code matches backtest logic exactly (no divergence)
[ ] 14. Fill rate and slippage logging instrumented
[ ] 15. Crash recovery tested (kill process, restart, verify state)
[ ] 16. Gap filling and reconnection handling tested
[ ] 17. Circuit breakers configured (drawdown, error count, loss limits)
[ ] 18. Position reconciliation on every startup
```

### Tier 4: Risk Management (Must Pass)
```
[ ] 19. Maximum position size ≤ 2% of daily volume (market impact control)
[ ] 20. Hard drawdown stop defined and enforced (e.g., -10% → flatten)
[ ] 21. Regime detection monitored (alert when strategy enters unfavorable regime)
[ ] 22. Strategy kill criteria defined (Sharpe < X for Y period → stop)
```

### Tier 5: Validation (Must Pass Before Scaling)
```
[ ] 23. Paper trading for minimum 4 weeks with ≥ 50 trades
[ ] 24. Paper trading Sharpe within 50% of backtest Sharpe (degradation limit)
[ ] 25. TCA (Transaction Cost Analysis) shows actual costs within 150% of assumed
[ ] 26. No flash crashes or unexpected behavior observed during paper trading
[ ] 27. Capital ladder: Start at 10% → 25% → 50% → 100% with gates at each level
```

## Production Monitoring Metrics

After deployment, continuously monitor:

| Metric | Frequency | Alert Threshold | Action |
|--------|-----------|----------------|--------|
| Rolling 30-day Sharpe | Daily | < 50% of backtest | Investigate |
| Rolling 30-day Sharpe | Daily | < 0 | Reduce size 50% |
| Max drawdown from HWM | Real-time | > 2x backtest max DD | Flatten |
| Average per-trade PnL | Weekly | < 50% of backtest | Investigate costs |
| Fill rate (maker) | Daily | < 50% | Review execution |
| Feature drift (KS test) | Weekly | p < 0.05 | Check data pipeline |
| Signal distribution change | Weekly | KS p < 0.01 | Investigate regime |
| Win rate | Weekly | < backtest - 5pp | Investigate |
| Volume participation rate | Per-trade | > 5% of bar volume | Reduce size |

## Integration with Netrunner

### In BUILD_STRATEGY Phase 7 (Production Readiness)

The build-strategy workflow's Phase 7 MUST run the full Production Readiness Checklist above. Every item must be explicitly checked and documented.

### In nr-quant-auditor PRODUCTION_AUDIT Mode

New audit mode that checks deployed/paper-trading strategies against production reality:
```
PRODUCTION_AUDIT:
  1. Compare backtest cost assumptions to asset-class benchmarks
  2. Check for capacity constraints vs. intended deployment size
  3. Verify execution code matches backtest logic
  4. Check for proper crash recovery, reconciliation, circuit breakers
  5. Verify monitoring and alerting is instrumented
  6. Check risk management parameters against best practices
  7. Score: 0-100 based on checklist completion
```

### In nr-verifier Production Verification

After phase execution, verifier adds production reality checks:
```
PRODUCTION CHECKS:
  [ ] Costs modeled at ≥ benchmark level
  [ ] Capacity estimated and documented
  [ ] Fill rate assumptions stated and justified
  [ ] Regime robustness tested (≥ 3 regimes)
  [ ] Multiple testing correction applied if >5 variants tested
```

### Reasoning Triggers

Add to `references/quant-finance.md`:

**Trigger: Backtest Shows Excellent Results**
```
BEFORE celebrating, check:
1. What are the cost assumptions? Compare to asset-class benchmarks.
2. How many variants were tested? Compute expected max Sharpe by chance.
3. Was walk-forward used with purge gap?
4. Does the strategy work across regimes or only in one?
5. What is the capacity? Would your trades move the market?
6. What is the fill rate assumption? Is it realistic?
```

**Trigger: Strategy Deployed to Production**
```
BEFORE deploying capital, verify:
1. Paper trading completed (≥ 4 weeks, ≥ 50 trades)
2. Paper trading results within 50% of backtest
3. TCA logging active and showing realistic costs
4. Circuit breakers tested and armed
5. Capital ladder defined (don't go 0→100%)
```

**Trigger: Production Strategy Underperforming**
```
DIAGNOSTIC chain:
1. Check execution: Are actual costs >> assumed? → Execution problem
2. Check regime: Has market structure changed? → Regime shift
3. Check alpha: Is signal IC declining over time? → Alpha decay
4. Check competition: More participants trading same signal? → Crowding
5. Check data: Has data feed quality degraded? → Data problem
6. Check code: Has anything changed in the execution code? → Bug
```

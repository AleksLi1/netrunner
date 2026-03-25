# Netrunner Context — Trading v3 (BTC Trajectory Prediction)
# Last updated: 2026-03-18

<!--
  EXAMPLE: This is a reference example of a well-structured quant trading context file.
  It demonstrates all quant-specific sections that Netrunner expects when the quant persona
  activates. Use this as a template for trading/quantitative finance projects.
-->

---

## Project Goal

Predict which price extreme (high or low) BTC/USDT hits first in the next 60 minutes, and by how much. Output is used for directional trade entry timing. The three metrics that matter: `high_hit` (did price reach predicted high?), `low_hit` (did price reach predicted low?), `path_correct` (did we predict which extreme is hit first?). Trajectory shape (tc, MSE) is a means to these ends, not a goal.

---

## Current State

| Metric | Current | Target |
|--------|---------|--------|
| high_hit | 55–62% | 75%+ |
| low_hit | 49–60% | 75%+ |
| dir_acc | ~52% baseline, ~55% with trend inject | 75%+ |
| val_loss | 0.42 | 0.30 |

**Architecture**: EDM2 diffusion model — `MPSimpleSequenceEncoder` (context_len=1440, hidden=128) + `MPUNet1DDenoiser` (channels=96). Sigmoid schedule, v_prediction, DDIM sampling. 91 features (plus_weekly). Loss: 60% diffusion + 15% extrema_high + 15% extrema_low + 10% direct_path (PathHead BCE).

**Active work**: Operation 75 — targeting 75%+ direction accuracy. Trend inject (+1.76% raw_dir) is the current best signal.

---

## Market Structure

- **Asset class:** Crypto (BTC/USDT perpetual futures)
- **Frequency:** 1-minute bars, 1440-bar context window (24h)
- **Execution venue:** Binance Futures
- **Liquidity profile:** Highly liquid, ~$10B daily volume, tight spread

## Strategy Profile

- **Type:** Directional prediction (which extreme hits first)
- **Holding period:** Up to 60 minutes
- **Capacity:** High (crypto liquidity supports meaningful size)
- **Edge source:** Modeling — learning trajectory patterns that predict directional extremes

## Risk Framework

- **Max drawdown tolerance:** Not yet defined (research phase)
- **Position sizing:** Not yet implemented (research phase)
- **Tail risk:** Crypto flash crashes — model must handle 5%+ moves in minutes

---

## Hard Constraints

| Constraint | Detail |
|-----------|--------|
| Causal-only features | `actual[i-k]` for any k<60 is lookahead-tainted. Silent and deadly. |
| Retraining cost | Full retrain ~6h+. Don't suggest for minor experiments. |
| Block temporal CV | Only valid eval method. No full-data sorting before splits. |
| Regime mismatch | Train=bull, Val=crash. Solutions that ignore this fail in production. |
| tc is not the target | tc=0.78/0.63 were tainted by EMA lookahead bias. Not real numbers. |
| Three metrics only | high_hit, low_hit, path_correct. Don't optimise shape for its own sake. |

---

## Diagnostic State

**Active hypothesis:**
The diffusion model has learned trajectory shape (val_loss=0.42 is meaningful) but PathHead direction accuracy (~52%) is near random, suggesting directional signal is not being learned through the diffusion objective. Trend inject (+1.76% dir) is the only thing that moved direction accuracy — implying the model CAN learn directional signal when it's forced in strongly, but the training signal for direction is too weak relative to the 60% diffusion loss weight.

**Evidence for:**
- PathHead BCE adds only ~2% above random baseline (52% → ~54%), even with explicit direction loss component
- Trend inject (external directional signal injected at inference) gives +1.76% — larger effect than any trained signal
- Dir-focused retraining (dw=0.5) made things worse — direction loss and trajectory loss appear to be in tension

**Evidence against:**
- 23 signal methods all failed but impl. confidence is Unknown — can't rule out implementation errors
- High-confidence subset (47% coverage, 72.1% dir_acc) suggests some directional signal exists in the model

**Confidence:** Medium
**Open questions:**
- What is the model attending to? Are attention patterns dominated by trajectory shape features or something else?
- Does PathHead accuracy vary by market regime or is it uniformly random?
- What is the diversity of diffusion samples? Are trajectories collapsing to mean trajectory?
- Is the 52% dir_acc uniform across confidence levels, or is there a high-confidence subset with better accuracy?
- What exactly were the 23 signal methods? Were implementations verified as causally clean?

---

## What Has Been Tried

| Approach | Outcome | Impl. Confidence | Failure Mode | Notes |
|----------|---------|-----------------|--------------|-------|
| output_scale=0.005 | FIXED | High | N/A — bug fix | Was 200x too small. Now 1.0. |
| Autoregressive decoder | FIXED | High | N/A — design fix | Exposure bias collapsed variance. Now parallel decoder. |
| Loss variance penalty (original) | FIXED | High | N/A — bug fix | Caused Inf loss. Now log ratio with clamping. |
| EMA model selection | TAINTED | High | Lookahead bias | Used actual[i-1]. Inflated tc 0.17→0.65. Do not use. |
| Residual head (LightGBM+MLP, tc=0.78) | TAINTED | High | Built on tainted baseline | Based on EMA results. Not a real result. |
| volatility_weighting=True | REMOVED | Med | Regime overfit | Overfit to high-vol regimes. |
| path_temperature=1.0 | CHANGED to 0.5 | High | N/A — tuning | Sharper soft argmax matches eval. |
| output_len=30 | CHANGED to 60 | High | N/A — alignment fix | Align train/eval windows. |
| extrema_path loss (trajectory-based) | DISABLED | Med | Gradient instability | Unstable gradients. Direct PathHead is better. |
| GroupNorm in MP architecture | REMOVED | High | EDM2 incompatibility | Harmful with magnitude preservation. |
| trend_inject (ctx_mean_lr * 1e4) | +1.76% raw_dir | High | N/A — positive result | 77% of models improved. Combined pool +60% P&L. |
| Meta-learner (7 variants) | FAILED | High | Signal too weak | Per-model spread too small (std=1.8%). Can't select. |
| Direction-focused retraining (dw=0.5) | FAILED | Med | Loss conflict | Dir loss fights trajectory loss. Models worse overall. |
| Short context (ctx=4,5,10) | DEBUNKED | High | Normalisation artifact | Raw accuracy 50% (random). Not a real signal. |
| 23 signal methods | ALL FAILED | Unknown | Unknown | No detail on which methods, how implemented, or what failure looked like. Do not treat as closed. |

---

## Decision Log

| Phase | Decision | Reasoning | Outcome |
|-------|----------|-----------|---------|
| Design | EDM2 diffusion over LSTM/Transformer | Generates full trajectory distribution, captures uncertainty | Model learns shape well but direction signal weak |
| Design | Magnitude-preserving architecture | EDM2 requires it for stable training | GroupNorm removal confirmed necessary |
| Training | 60/15/15/10 loss weight split | Balance trajectory quality with extrema prediction | Direction component (10%) may be too weak |
| Eval | Block temporal CV only | Prevents data leakage through temporal proximity | Regime mismatch remains a concern |
| Signal | Trend inject at inference | Fastest way to test directional signal hypothesis | +1.76% confirms model can use direction info |

---

## Open Questions / Active Frontiers

- Can high_hit / low_hit reach 75%+? What's the ceiling given the data?
- Can dir_acc reach 75%+? PathHead barely above random (~52% base, ~55% with trend inject).
- Does regime-aware training (separate models or regime conditioning) help generalisation?
- Is confidence filter (47% coverage, 72.1% dir_acc) the right production strategy or can we get full coverage at that accuracy?
- Would caching v28 encoder features (~30s → ~2s startup) meaningfully accelerate iteration?
- **Bottleneck identification:** Is the core issue signal (data doesn't contain directional information), modeling (model can't extract it), or loss design (training objective conflicts with direction learning)?

---

## Update Log

| Date | Change |
|------|--------|
| 2026-03-18 | Initial context created |
| 2026-03-18 | Added trend inject results, meta-learner failure, short-ctx debunked, Operation 75 plan |

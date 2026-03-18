# Netrunner Context — Trading v3 (BTC Trajectory Prediction)
# Last updated: 2026-03-18

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

## What Has Been Tried

| Approach | Outcome | Notes |
|----------|---------|-------|
| output_scale=0.005 | FIXED | Was 200x too small. Now 1.0. |
| Autoregressive decoder | FIXED | Exposure bias collapsed variance. Now parallel decoder. |
| Loss variance penalty (original) | FIXED | Caused Inf loss. Now log ratio with clamping. |
| EMA model selection | TAINTED | Used actual[i-1]. Inflated tc 0.17→0.65. Do not use. |
| Residual head (LightGBM+MLP, tc=0.78) | TAINTED | Built on tainted EMA. Not a real result. |
| volatility_weighting=True | REMOVED | Overfit to high-vol regimes. |
| path_temperature=1.0 | CHANGED to 0.5 | Sharper soft argmax matches eval. |
| output_len=30 | CHANGED to 60 | Align train/eval windows. |
| extrema_path loss (trajectory-based) | DISABLED | Unstable gradients. Direct PathHead is better. |
| GroupNorm in MP architecture | REMOVED | EDM2: harmful with magnitude preservation. |
| trend_inject (ctx_mean_lr * 1e4) | +1.76% raw_dir | 77% of models improved. Combined pool +60% P&L. |
| Meta-learner (7 variants) | FAILED | Per-model spread too small (std=1.8%). Can't select. |
| Direction-focused retraining (dw=0.5) | FAILED | Dir loss fights trajectory loss. Models worse. |
| Short context (ctx=4,5,10) | DEBUNKED | Normalisation artifact. Raw accuracy 50% (random). |
| 23 signal methods | ALL FAILED | None improve direction accuracy ceiling. |

---

## Open Questions / Active Frontiers

- Can high_hit / low_hit reach 75%+? What's the ceiling given the data?
- Can dir_acc reach 75%+? PathHead barely above random (~52% base, ~55% with trend inject).
- Does regime-aware training (separate models or regime conditioning) help generalisation?
- Is confidence filter (47% coverage, 72.1% dir_acc) the right production strategy or can we get full coverage at that accuracy?
- Would caching v28 encoder features (~30s → ~2s startup) meaningfully accelerate iteration?

---

## Update Log

| Date | Change |
|------|--------|
| 2026-03-18 | Initial context created |
| 2026-03-18 | Added trend inject results, meta-learner failure, short-ctx debunked, Operation 75 plan |

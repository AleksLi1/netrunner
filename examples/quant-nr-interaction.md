# Example: /nr Interaction on a Quant Trading Project

<!--
  This example demonstrates how Netrunner's quant persona activates and reasons
  when a user invokes /nr on a trading strategy project. It shows:
  - Quant persona activation from context signals
  - Skeptical reasoning about reported results
  - Lookahead awareness in avenue generation
  - Expert-level diagnostic hypothesis
  - Pre-generation gate enforcement
-->

## Setup

The user has a `.planning/CONTEXT.md` with the trading-v3-context structure:
- BTC/USDT direction prediction model (diffusion-based)
- dir_acc: 52% (barely above random)
- 12 tried approaches in "What Has Been Tried"
- Active hypothesis: "Directional signal is too weak relative to trajectory loss"

## User Query

```
/nr "I added a momentum feature (20-bar SMA slope) and dir_acc jumped to 68%. Should I push further with more momentum features?"
```

## Netrunner Response

### Step 0 — Context loaded, quant persona activated

Context signals detected: dir_acc, diffusion model, BTC/USDT, walk-forward, regime, OHLCV, direction accuracy → **Quant persona active.**

*Loaded references/quant-finance.md — applying "Suspiciously Good Results" reasoning trigger.*

### Step 1 — Classification

**Shape:** OPTIMIZE:REFINEMENT
**Subtype:** SIGNAL (potential signal discovery — but requires validation)
**Domain:** Quantitative Finance / Trading

### Step 2 — Diagnostic questions

[Inferred from context — /nr --ask to force questions]

Context has 12+ tried entries, 4 constraints, active hypothesis → **RICH context, skipping questions.**

### Step 3 — Diagnosis and response

```
QUERY (reframed): User reports 52% → 68% dir_acc after adding 20-bar SMA slope feature.
  This is a +16% jump from a single feature addition — triggering suspiciously-good-result protocol.

METRICS IN SCOPE: dir_acc (52% → 68% claimed)
CONSTRAINTS ACTIVE: No lookahead features | Walk-forward validation only | Regime mismatch (train=bull, val=crash)
CLOSED PATHS: Short context (debunked), Meta-learner (7 variants, failed), Dir-focused retraining dw=0.5 (failed)
EXHAUSTED CLUSTERS: context-length experiments (3 entries), meta-learner variants (7 entries)
```

**Hypothesis:**

```
Hypothesis: The 16% dir_acc improvement from a single momentum feature is almost certainly
  an artifact — most likely lookahead contamination in the SMA computation or regime-specific
  overfitting (the SMA slope is a strong momentum signal that works in trending regimes but
  fails in mean-reverting regimes).

Evidence:
  - A single feature adding +16% to a metric that 12 prior approaches couldn't move more
    than +2% is a red flag. The base rate for genuine single-feature improvements of this
    magnitude is extremely low.
  - 20-bar SMA slope is a trend-following signal. The validation set may be in a trending
    regime where momentum works by construction.
  - No mention of temporal audit on the SMA computation. If the SMA uses data[i] instead
    of data[i-1], the current bar's close is leaking into the feature.

Mechanism: Either (a) the SMA computation includes the current bar (lookahead — the feature
  partially encodes the label), or (b) the feature works in the validation regime (trending)
  but will fail in production when regimes change.

Falsification test: Compute the SMA using data[i-20:i-1] (strictly lagged) and re-evaluate.
  If dir_acc drops back to ~52%, the feature was leaking. If it holds, evaluate across
  a non-trending validation period.
```

**Before I suggest next steps, we need to verify this result is real. Here's the priority order:**

**Avenue 1: Temporal Audit of SMA Feature** — Verify the SMA slope computation uses data[i-20:i-1], not data[i-19:i]. A single off-by-one error would explain the entire improvement. Expected: if the feature is clean, dir_acc holds; if contaminated, drops to ~52%. Effort: 30 min.
  Risk: If contaminated, all results with this feature are invalid. Next: Check the exact indexing in the feature computation code.

**Avenue 2: Regime-Stratified Evaluation** — Evaluate dir_acc separately on trending vs. mean-reverting periods in the validation set. A momentum feature that only works in trends is not a generalizable edge. Expected: if regime-dependent, dir_acc will be 75%+ in trends and <55% in mean-reversion. Effort: 1h.
  Risk: Discovering the feature is regime-specific means the headline 68% is misleading. Next: Partition validation data by regime classification.

**Avenue 3: Permutation Test** — Shuffle the SMA slope values randomly across samples and re-evaluate. If dir_acc stays elevated with random feature values, the improvement is structural (pipeline leakage), not from the feature. Expected: dir_acc should drop to ~52% if the feature is genuinely predictive. Effort: 1h.
  Risk: None — this is a diagnostic. Next: Run permutation test with 100 shuffles.

**Do NOT add more momentum features until Avenue 1 confirms the current feature is temporally clean.** Adding features on top of a potentially contaminated baseline compounds the error and makes it harder to diagnose later.

---

*Note: This response demonstrates the quant persona in action:*
- *Skepticism by default — a 16% improvement is treated as suspicious, not celebrated*
- *Lookahead awareness — immediately checks temporal integrity of the new feature*
- *Regime awareness — questions whether the improvement generalizes across market conditions*
- *Pre-generation gate — refuses to suggest "more momentum features" until the current result is verified*
- *Expert reasoning — uses mechanistic explanation (off-by-one indexing, regime-specific overfitting) not generic advice*

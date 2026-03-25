# Example: /nr Interaction on a Data Analysis Project

<!--
  This example demonstrates how Netrunner's data science persona activates and reasons
  when a user invokes /nr on a data analysis project. It shows:
  - Data science persona activation from context signals
  - Skeptical reasoning about reported A/B test results
  - Multiple testing awareness in avenue generation
  - Expert-level diagnostic hypothesis
  - Pre-generation gate enforcement
-->

## Setup

The user has a `.planning/CONTEXT.md` with the churn analysis structure from `examples/data-analysis-context.md`. They are in Phase 3 (Statistical Analysis) and have been running an A/B test on a retention email campaign.

Active hypothesis: "Targeted retention emails reduce churn for at-risk customers by at least 2 percentage points."

## User Query

```
/nr "Our A/B test shows the retention email reduced churn by 3.1%. Control was 5.2%, treatment was 2.1%. We tested 5 different email variants and this one works. Should we roll it out?"
```

## Netrunner Response

### Step 0 — Context loaded, data science persona activated

Context signals detected: A/B test, churn rate, control/treatment, statistical analysis, pandas, scipy, Benjamini-Hochberg → **Data science persona active.**

*Loaded references/data-analysis-reasoning.md — applying "A/B Testing" and "Statistical Significance Claims" reasoning triggers.*

### Step 1 — Classification

**Shape:** OPTIMIZE:REFINEMENT
**Subtype:** EVALUATION (A/B test result interpretation)
**Domain:** Data Analysis

### Step 2 — Diagnostic questions (inferred from context)

Context provides: A/B test structure, 5 variants tested, raw rates.
Missing but inferable: multiple testing not mentioned, confidence intervals absent, sample sizes unknown.

Skipping questions — sufficient context to diagnose. Will flag gaps directly.

### Step 3 — Diagnostic hypothesis

**Hypothesis:** The reported 3.1 percentage point lift is likely inflated due to multiple comparison bias (5 variants tested without correction) and possibly insufficient sample size. The true effect, if any, is smaller.

**Reasoning chain:**
1. Five email variants were tested. Even if none of them worked, the probability of at least one showing p < 0.05 is 1 - (0.95)^5 = 23%. This is not unlikely by chance alone.
2. The "best of 5" result is biased upward — this is the winner's curse. The best-performing variant in a sample overestimates its true effect.
3. No confidence interval was reported. A 3.1pp lift could have a CI of [0.5pp, 5.7pp] (meaningful) or [-1.2pp, 7.4pp] (includes no effect).
4. No sample size was provided. With small groups, a 3.1pp difference could easily be noise.

### Step 4 — Avenues

**Avenue 1: Apply multiple testing correction and recompute significance**
- **Mechanism:** With 5 comparisons, the significance threshold must be adjusted. Bonferroni: alpha = 0.05/5 = 0.01. Benjamini-Hochberg: rank p-values and adjust. The "winning" variant may no longer be significant after correction.
- **Gain:** Prevents rolling out a variant that won by chance. Saves the cost of a failed intervention.
- **Risk:** The variant may genuinely work but fail the stricter threshold. If so, consider running a confirmatory test with just this variant.
- **Verification:** Report adjusted p-values for all 5 variants, not just the winner.
- **Effort:** 30 minutes — recompute with `statsmodels.stats.multitest.multipletests`.

**Avenue 2: Compute confidence interval and effect size for the winning variant**
- **Mechanism:** A 3.1pp lift without a confidence interval is incomplete. Compute the 95% CI using Wilson score interval for proportions. If the CI includes zero, the result is not conclusive.
- **Gain:** Stakeholders understand the range of plausible effects, not just the point estimate.
- **Risk:** None — this is strictly informational and always adds value.
- **Verification:** CI must be computed on the pre-correction data. Report: "The estimated lift is 3.1pp (95% CI: [X, Y])."
- **Effort:** 15 minutes.

**Avenue 3: Run a confirmatory test with only the winning variant**
- **Mechanism:** The current test was exploratory (5 variants). Standard practice is to confirm the winner in a separate, pre-registered test with a single comparison and a pre-calculated sample size based on the observed effect.
- **Gain:** Eliminates winner's curse and multiple testing bias. If the variant wins again, confidence is high.
- **Risk:** Delays rollout by the duration of the confirmatory test. Calculate required duration from power analysis.
- **Verification:** Pre-register the hypothesis: "Variant X reduces churn by >= 2pp vs. control." Calculate sample size for 80% power at this effect size.
- **Effort:** 1-2 weeks of test runtime (varies by traffic).

**Avenue 4: Check for Sample Ratio Mismatch (SRM) and segment effects**
- **Mechanism:** Verify that the control and treatment groups have the expected size ratio. SRM indicates randomization failure. Also check if the effect is consistent across segments (plan tier, company size) or driven by one subgroup.
- **Gain:** SRM detection prevents acting on data from a broken experiment. Segment analysis reveals if the intervention works broadly or only for specific customers.
- **Risk:** If SRM is detected, the entire test may be invalid.
- **Verification:** Chi-squared test for expected vs. observed group sizes. Stratified analysis by key segments.
- **Effort:** 1 hour.

### Step 5 — Recommendation

Do NOT roll out yet. The result is promising but unverified. With 5 variants tested, the winner's curse makes the point estimate unreliable.

**Immediate actions:**
1. Compute adjusted p-values (Benjamini-Hochberg) for all 5 variants
2. Report 95% confidence interval for the winning variant's lift
3. Check for SRM to verify randomization integrity

**If the result survives correction:** Design a confirmatory A/B test with only the winning variant, pre-registered hypothesis, and sample size from power analysis targeting a 2pp minimum detectable effect.

---

*Note: This response demonstrates the data science persona in action:*
- *Skepticism by default — a 3.1pp improvement across 5 variants triggers multiple testing alarm*
- *Statistical rigor — demands CI, effect size, and correction before any decision*
- *Winner's curse awareness — recognizes the "best of N" selection bias*
- *Pre-generation gate — refuses to recommend rollout until statistical validity is confirmed*
- *Expert reasoning — uses mechanistic explanation (multiple comparison inflation, winner's curse) not generic advice*

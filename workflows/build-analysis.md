# Workflow: Build Analysis

<purpose>
End-to-end data analysis workflow from data understanding to reproducible reporting.
5 mandatory phases in strict order. Each phase has a quality gate that must pass before proceeding.
This workflow ensures methodological rigor — no shortcuts, no unreported assumptions.
</purpose>

<inputs>
- Analysis question/hypothesis from user (via run.md classification)
- `.planning/CONTEXT.md` — project context, data sources, stakeholder requirements
- Data files or database access
</inputs>

<prerequisites>
- Data analysis persona must be active (2+ detection signals in CONTEXT.md)
- References loaded: data-analysis-reasoning.md, data-analysis-methods.md, data-analysis-code-patterns.md
</prerequisites>

<phase_enforcement>

## Phase Order (NON-NEGOTIABLE)

```
PHASE_ORDER = [
    "DATA_UNDERSTANDING",   # Phase 1: Know your data before touching it
    "EDA",                  # Phase 2: Explore distributions and relationships
    "STATISTICAL_ANALYSIS", # Phase 3: Rigorous hypothesis testing
    "VISUALIZATION",        # Phase 4: Honest, accessible communication
    "REPORTING"             # Phase 5: Reproducible documentation
]

# NON-NEGOTIABLE: phases cannot be skipped or reordered.
# The ONLY exception: going BACKWARD (e.g., from STATISTICAL_ANALYSIS back to EDA).
# Forward skipping is NEVER allowed.
```

### Skip Prevention Logic

Before entering any phase N, verify:
1. All phases 1 through N-1 have status COMPLETE in STATE.md
2. All gates for phases 1 through N-1 have PASS status
3. No CRITICAL issues remain unresolved from prior phases

If any check fails, HALT and report which prerequisite is missing.

</phase_enforcement>

<procedure>

## Phase 1: DATA UNDERSTANDING

**Goal:** Fully understand the data before performing any analysis. Document schema, quality, and limitations.

### 1.1 Data Source Documentation

Document every data source:
- **Origin:** Where does the data come from? (database, API, file export, survey)
- **Collection method:** How was it collected? (automated logging, manual entry, sampling)
- **Time range:** What period does it cover?
- **Granularity:** What does each row represent? (user, event, transaction, day)
- **Known issues:** Any documented data quality problems?

### 1.2 Data Profiling

Run comprehensive profiling using the `profile_dataset()` function from data-analysis-methods.md:

```
Task(
  subagent_type="nr-executor",
  description="Profile all data sources",
  prompt="Run data profiling on all datasets:
    1. Shape, dtypes, memory usage
    2. Missing rates per column (flag >5%)
    3. Duplicate detection
    4. Numeric: min/max/mean/median/std, check for impossible values
    5. Categorical: cardinality, top values, unexpected categories
    6. Temporal: date range, gaps, frequency consistency
    Write results to .planning/analysis/DATA_PROFILE.md"
)
```

### 1.3 Data Quality Assessment

For each data quality issue found:
- **Severity:** CRITICAL (blocks analysis), MAJOR (biases results), MINOR (cosmetic)
- **Impact:** What analyses would be affected?
- **Resolution:** How will it be handled? (drop, impute, flag, exclude)

### 1.4 Stakeholder Alignment

Confirm with stakeholders:
- What specific questions must this analysis answer?
- What decisions will be made based on the results?
- What level of rigor is required? (quick directional vs. publication-quality)

### 1.5 Outputs

- `.planning/analysis/DATA_PROFILE.md` — complete data profile
- `.planning/analysis/DATA_QUALITY.md` — quality issues and resolution plan
- `.planning/analysis/QUESTIONS.md` — prioritized analysis questions

### Gate: DATA QUALITY REVIEW

The analysis CANNOT proceed until:
- [ ] All data sources documented with origin, collection method, and time range
- [ ] Data profile completed for all sources
- [ ] Missing data rates documented and mechanism assessed (MCAR/MAR/MNAR)
- [ ] Critical data quality issues resolved or documented with mitigation plan
- [ ] Analysis questions confirmed and prioritized with stakeholders

---

## Phase 2: EXPLORATORY DATA ANALYSIS

**Goal:** Understand distributions, relationships, and patterns. Generate hypotheses for statistical testing.

### 2.1 Univariate Analysis

For each variable of interest:

```
Task(
  subagent_type="nr-executor",
  description="Univariate distribution analysis",
  prompt="For each numeric variable:
    1. Plot histogram with KDE overlay
    2. Generate QQ plot for normality assessment
    3. Compute: mean, median, std, skewness, kurtosis
    4. Run Shapiro-Wilk normality test
    5. Identify and document outliers (IQR and modified Z-score)
  For each categorical variable:
    1. Bar chart of value counts
    2. Check for low-frequency categories (<1% of data)
    3. Check for unexpected values
  Save plots to .planning/analysis/plots/univariate/"
)
```

### 2.2 Bivariate Analysis

Examine relationships between features and target:

```
Task(
  subagent_type="nr-executor",
  description="Bivariate relationship analysis",
  prompt="Analyze pairwise relationships:
    1. Correlation matrix (Pearson and Spearman) with heatmap
    2. Flag high correlations (|r| > 0.7) as potential multicollinearity
    3. Target vs. each feature: scatter (continuous) or box plot (categorical)
    4. Pair plot for top features
    5. Chi-squared tests for categorical-categorical associations
  Save to .planning/analysis/plots/bivariate/"
)
```

### 2.3 Temporal Analysis (if applicable)

For time-indexed data:
- Trend decomposition (trend + seasonal + residual)
- Stationarity test (Augmented Dickey-Fuller)
- Autocorrelation and partial autocorrelation plots
- Structural break detection

### 2.4 Hypothesis Generation

Based on EDA findings, formulate specific, testable hypotheses:
- Each hypothesis must be falsifiable
- Specify the expected direction of effect
- Identify potential confounders for each hypothesis
- Prioritize by business relevance

### 2.5 Outputs

- `.planning/analysis/EDA_SUMMARY.md` — key findings, distributions, relationships
- `.planning/analysis/HYPOTHESES.md` — prioritized list of testable hypotheses
- `.planning/analysis/plots/` — all EDA visualizations

### Gate: EDA REVIEW

- [ ] All target-relevant variables profiled (distribution, outliers, missingness)
- [ ] Correlation analysis completed with multicollinearity flagged
- [ ] At least one specific, testable hypothesis formulated
- [ ] Confounders identified for each hypothesis
- [ ] No data transformations applied without documentation

---

## Phase 3: STATISTICAL ANALYSIS

**Goal:** Test hypotheses with appropriate statistical methods. Report effect sizes and confidence intervals.

### 3.1 Test Selection

For each hypothesis, select the appropriate statistical test:
- Check test assumptions (normality, independence, homoscedasticity)
- If assumptions fail, use non-parametric alternative
- Document test choice and justification

Spawn researcher for unfamiliar test scenarios:

```
Task(
  subagent_type="nr-researcher",
  description="Statistical test selection review",
  prompt="Review proposed statistical tests for each hypothesis:
    1. Are test assumptions met? Provide evidence.
    2. Is the test appropriate for the data type and sample size?
    3. Suggest alternatives if assumptions are violated.
    4. Calculate required sample size (power analysis) for desired effect size.
  Write review to .planning/analysis/TEST_PLAN.md"
)
```

### 3.2 Hypothesis Testing

For each test:
- Report test statistic, p-value, AND effect size
- Report confidence intervals for all estimates
- Apply multiple testing correction if testing >1 hypothesis (Benjamini-Hochberg)
- Run sensitivity analyses: do results hold under different assumptions?

### 3.3 Confounder Analysis

For correlational findings:
- Compute partial correlations controlling for identified confounders
- If causal claims are desired, assess feasibility of natural experiments
- Document which confounders were controlled and which were not

### 3.4 Robustness Checks

- Do results hold across different subgroups?
- Do results hold with different outlier treatment?
- Do results hold with different missing data handling?
- For A/B tests: check SRM (sample ratio mismatch), novelty effects

### 3.5 Outputs

- `.planning/analysis/RESULTS.md` — all test results with effect sizes and CIs
- `.planning/analysis/ROBUSTNESS.md` — sensitivity and robustness check results

### Gate: STATISTICAL VALIDITY REVIEW

- [ ] Every test has documented assumption checks
- [ ] Effect sizes reported alongside every p-value
- [ ] Confidence intervals provided for all key estimates
- [ ] Multiple testing correction applied if >1 hypothesis tested
- [ ] At least one robustness check per primary finding
- [ ] Confounders addressed for correlational findings

---

## Phase 4: VISUALIZATION AND COMMUNICATION

**Goal:** Create honest, accessible visualizations that tell a clear narrative.

### 4.1 Chart Design

For each key finding, design a visualization:

```
Task(
  subagent_type="nr-executor",
  description="Create publication-ready visualizations",
  prompt="For each key finding in RESULTS.md:
    1. Select chart type per data-analysis-methods.md chart selection guide
    2. Use colorblind-safe palette
    3. Include confidence intervals or error bars
    4. Title states the conclusion, not just the metric name
    5. Include data source and date range in annotation
    6. Y-axis starts at zero for bar charts
  Save to .planning/analysis/plots/final/"
)
```

### 4.2 Chart Audit

Every visualization must pass:
- [ ] Axis starts at zero (bar charts) or has clear justification
- [ ] Confidence intervals or uncertainty bands shown
- [ ] Colorblind-accessible palette used
- [ ] Title is informative (states finding, not just variable name)
- [ ] No 3D effects, no dual Y-axes without justification
- [ ] Source and date range annotated
- [ ] Full time range shown (not cherry-picked) or selection justified

### 4.3 Narrative Construction

Build the analysis narrative:
- Lead with the most impactful finding
- Connect each finding to a business question
- Address counterarguments and limitations in-line
- End with specific, actionable recommendations

### 4.4 Outputs

- `.planning/analysis/plots/final/` — all publication-ready charts
- `.planning/analysis/NARRATIVE.md` — written analysis narrative

### Gate: VISUALIZATION AND NARRATIVE REVIEW

- [ ] Every chart passes the chart audit checklist
- [ ] Narrative leads with actionable insight, not methodology
- [ ] Limitations are stated clearly and specifically
- [ ] Recommendations are specific and tied to findings

---

## Phase 5: REPORTING AND REPRODUCIBILITY

**Goal:** Package the analysis for reproducibility and handoff.

### 5.1 Report Assembly

Following the report structure from data-analysis-methods.md:
1. Executive Summary
2. Methodology
3. Findings (with visualizations)
4. Limitations
5. Recommendations
6. Reproducibility (code, data, environment)

### 5.2 Reproducibility Checks

```
Task(
  subagent_type="nr-verifier",
  description="Verify analysis reproducibility",
  prompt="Verify the analysis can be reproduced:
    1. All random seeds are set and documented
    2. Data version/hash is logged
    3. Python environment is pinned (requirements.txt or environment.yml)
    4. Running the analysis end-to-end produces identical results
    5. All intermediate outputs are regenerated, not cached
  Write verification results to .planning/analysis/REPRODUCIBILITY.md"
)
```

### 5.3 Code Quality

- Remove dead code and commented-out experiments
- Add docstrings to key functions
- Ensure consistent formatting
- Verify all file paths are relative (portable)

### 5.4 Handoff Package

Assemble the complete deliverable:
- Final report (format per stakeholder requirements)
- Cleaned, annotated code (notebook or scripts)
- Data dictionary
- Reproducibility instructions

### 5.5 Outputs

- Final report (markdown, notebook, or slide deck)
- `.planning/analysis/REPRODUCIBILITY.md` — verification results
- `requirements.txt` or `environment.yml` — pinned environment

### Gate: REPRODUCIBILITY CHECK

- [ ] All random seeds set and documented
- [ ] Data version tracked (hash or timestamp)
- [ ] Environment pinned with specific package versions
- [ ] Full re-run produces identical numerical results
- [ ] Report reviewed for accuracy, clarity, and honesty

</procedure>

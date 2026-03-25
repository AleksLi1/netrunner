# Example CONTEXT.md — Customer Churn Analysis

<!--
  Example CONTEXT.md for a data analysis project.
  Domain: DATA_ANALYSIS
  Project: Customer churn analysis for a SaaS product
-->

## Project
- **Name:** SaaS Customer Churn Analysis
- **Goal:** Identify factors driving customer churn and recommend interventions to reduce monthly churn rate from 5.2% to below 4%
- **Domain:** DATA_ANALYSIS
- **Shape:** OPTIMIZE:REFINEMENT
- **Subtype:** DIAGNOSTIC (root cause analysis of churn patterns)
- **Status:** Phase 2 (EDA) — data profiled, missing data strategy defined, initial distributions explored

## Stack
- **Language:** Python 3.11
- **Libraries:** pandas 2.1, numpy 1.26, scipy 1.12, statsmodels 0.14, matplotlib 3.8, seaborn 0.13, scikit-learn 1.4
- **Environment:** Jupyter notebooks, git-tracked with nbstripout
- **Data storage:** PostgreSQL (source), Parquet files (analysis snapshots)

## Analysis Profile
- **Analysis type:** Hypothesis testing + predictive modeling
- **Data sources:** Product database (usage events, subscription history), Stripe (billing), Intercom (support tickets)
- **Data size:** 45,000 customers x 87 features, 18 months of history
- **Primary tools:** pandas, scipy, matplotlib, sklearn
- **Target audience:** VP Product, Head of Customer Success
- **Decision context:** Prioritize retention interventions for Q3 budget allocation

## Data Quality
- **Missing data rate:** 12% overall; `last_support_ticket_date` 34% missing (customers who never contacted support), `company_size` 8% missing
- **Missing mechanism:** `last_support_ticket_date` is MNAR (no support contact = missing); `company_size` is MAR (smaller companies less likely to fill profile)
- **Known data issues:** Billing data has timezone inconsistencies (UTC vs local); 230 duplicate customer records from CRM migration; usage events have 3-day gap in Feb 2025 (infrastructure outage)
- **Data freshness:** Daily snapshot as of 2026-03-15

## Statistical Framework
- **Primary metrics:** Monthly churn rate (binary: churned/retained), Time to churn (survival)
- **Significance threshold:** alpha=0.05, Benjamini-Hochberg correction for multiple comparisons
- **Effect size targets:** Minimum 2 percentage point difference in churn rate between segments to be actionable
- **Validation approach:** Temporal holdout (train: months 1-15, test: months 16-18)

## Stakeholder Requirements
- **Deliverable format:** Executive slide deck (5-7 slides) + detailed Jupyter notebook for data team
- **Update frequency:** One-time analysis with quarterly refresh
- **Key questions:**
  1. What are the top 5 predictors of churn?
  2. Are there distinct churn "profiles" (early vs late churners, usage-based vs price-based)?
  3. Which customer segments have the highest leverage for retention interventions?
  4. Is there a critical engagement threshold below which churn risk spikes?

## Hard Constraints
- Do NOT use customer names or emails in any analysis output (PII policy)
- Churn prediction model must be interpretable (no black-box models for stakeholder presentation)
- All statistical claims must include confidence intervals
- Analysis must be reproducible from the Jupyter notebook alone (no manual steps)

## Tried So Far
1. [PARTIAL] Basic churn rate by plan tier — shows Enterprise churn is 2x higher than expected, needs confounder analysis (company size correlates with plan tier)
2. [DONE] Data profiling — schema documented, missing data strategy defined (KNN impute for company_size, binary flag for support contact)
3. [ACTIVE] Feature correlation analysis — high multicollinearity between login_frequency and feature_usage_count (r=0.89), need to address before modeling

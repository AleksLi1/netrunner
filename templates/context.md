# Netrunner Context -- {{PROJECT_NAME}}

<!--
  This is the living context file for your project. Netrunner reads it on every /nr invocation.
  Keep entries terse but specific. "PostgreSQL 15" not "a database". "52% dir_acc" not "low accuracy".
  Update after every significant session. This file IS your project memory.
-->

## Project Goal
{{OUTCOME_DESCRIPTION -- what success looks like, not technology choices}}

<!--
  Good: "Predict next-day stock direction with >60% accuracy on unseen tickers"
  Bad: "Build a machine learning model"
  The goal should be an outcome a human would verify, not a technology decision.
-->

## Project Overview
{{One-paragraph description of the project — stack, architecture, primary concerns.}}

<!--
  This section is ALWAYS loaded by Netrunner regardless of query scope.
  Keep it to a paragraph. It should read like a project README's opening.

  Example: "React 18 + Next.js 14 app store with Postgres backend, deployed on Vercel.
  Core concerns: semantic search over product catalog, cart checkout, infra cost,
  i18n for 7 locales, auth via Clerk."

  List the main concern areas so Netrunner can scope fresh queries against them.
-->

## Current State
| Metric | Current | Target |
|--------|---------|--------|
| {{metric_name}} | {{current_value}} | {{target_value}} |

<!--
  Example entries (uncomment and adapt):
  | dir_acc      | 52.1%   | 65%+    |
  | sharpe_ratio | 0.3     | 1.5+    |
  | val_loss     | 0.693   | <0.65   |
  | latency_p95  | 450ms   | <200ms  |

  Use exact numbers. Netrunner uses these to detect plateaus and measure progress.
  Keep 3-8 metrics. Too many dilutes focus.
-->

## Hard Constraints
| Constraint | Why | Cost of Violation |
|------------|-----|-------------------|
| {{constraint}} | {{reason}} | {{cost}} |

<!--
  Example entries (uncomment and adapt):
  | No full retrain (>6h)       | GPU budget limited            | Blocks iteration for a full day     |
  | Must run on single A100     | Production infra constraint   | Requires architecture redesign      |
  | Python 3.11 only            | Deployment environment locked | Incompatible dependencies           |
  | API response <500ms p95     | SLA requirement               | Contract violation, client churn    |

  Constraints are ABSOLUTE. Netrunner will never suggest approaches that violate these.
  If something is a preference, put it in Domain Knowledge instead.

  For quant/trading projects, ALWAYS include these if applicable:
  | No lookahead features       | Future data in features invalidates all results | Entire strategy is fake          |
  | Walk-forward validation only | Random splits on time series are meaningless    | All metrics are unreliable       |
  | Transaction costs in eval   | P&L without costs is fantasy                    | Profitable strategy becomes loss |
  | Out-of-sample holdout sacred | Touching test set corrupts it                  | No trustworthy performance est   |
-->

## Active Work
**Current focus:** {{What is actively being built/fixed right now — one line}}
**Keywords:** {{comma,separated,keywords,for,scope,matching}}
**Session started:** {{YYYY-MM-DD of when this focus became active}}
**Related files:** {{path/to/file1, path/to/file2}}

<!--
  IMPORTANT: This section is ONLY loaded by Netrunner when the current query
  matches one of the Keywords. For orthogonal queries ("is infra cost optimised"
  when active work is "semantic search"), Netrunner SKIPS this section to avoid
  anchoring bias.

  Keep Keywords specific. Good: "semantic,search,embedding,vector,pgvector,RAG".
  Bad: "feature,code,app".

  Update this every time you switch focus. Stale Active Work causes Netrunner
  to anchor on irrelevant history — the exact bug this section prevents.

  Example:
  **Current focus:** Implementing semantic search over product catalog
  **Keywords:** semantic,search,embedding,vector,pgvector,rag,product,catalog
  **Session started:** 2026-04-05
  **Related files:** lib/search.ts, api/search/route.ts, db/migrations/add_embeddings.sql
-->

## Diagnostic State
**Active hypothesis:** {{What is the core challenge and WHY does it exist?}}
**Evidence for:** {{signals supporting hypothesis}}
**Evidence against:** {{signals contradicting}}
**Confidence:** {{High/Medium/Low}}
**Open questions:** {{What would resolve uncertainty?}}

<!--
  This section captures your current understanding of WHY things are the way they are.
  Not what to try next -- what is actually happening.

  Good hypothesis: "The model cannot distinguish trend reversals from noise because
  the 60-min input window is too short to capture multi-day momentum patterns"
  Bad hypothesis: "The model needs improvement"

  Update this after every diagnostic session. Even "Unknown" is valuable -- it tells
  Netrunner to ask diagnostic questions instead of assuming.
-->

## What Has Been Tried
| Approach | Topic | Outcome | Confidence | Failure Mode | Phase | Date |
|----------|-------|---------|------------|--------------|-------|------|

<!--
  Example entries (uncomment and adapt):
  | Attention pooling     | model      | FAILED  | High   | No improvement over mean pool; attention weights uniform | Phase 2 | 2025-03-15 |
  | Label smoothing 0.1   | model      | CHANGED | Medium | +0.5% val_acc but unstable training dynamics            | Phase 2 | 2025-03-14 |
  | Feature normalization | features   | TAINTED | Low    | Bug in norm code discovered after experiment            | Phase 1 | 2025-03-10 |
  | pgvector HNSW tuning  | search     | FIXED   | High   | Recall@10 hit target after ef_search=100                | Phase 3 | 2026-04-05 |

  Topic: short tag matching a project concern area (search, auth, infra, features, model, api, ui, db, etc).
    Netrunner filters this table by topic when the query is ORTHOGONAL to active work.
    If topic is empty, entry is treated as project-wide.
  Outcome values: FAILED / FIXED / CHANGED / TAINTED / REMOVED / DEBUNKED
  Confidence: High (rigorous test) / Medium (reasonable test) / Low (quick experiment) / Unknown

  CRITICAL: Low/Unknown confidence failures are NOT closed paths. Netrunner may suggest
  retrying them with proper verification. Only High confidence failures are excluded.
-->

## Domain Knowledge
{{Domain-specific knowledge -- ML signals, API patterns, infra constraints, etc.}}

<!--
  Put domain expertise here that informs decisions but isn't a hard constraint.
  Examples:
  - "Financial data has regime shifts (bull/bear/sideways) that affect feature distributions"
  - "The API rate-limits to 100 req/s but bursts to 500 for 10s windows"
  - "Users typically have 3-5 active sessions; session data is ~2KB each"
  - "Legacy system uses XML-RPC; migration to REST planned for Q3"
-->

<!--
  === QUANTITATIVE FINANCE / TRADING PROJECTS ===
  If this is a quant/trading project, add the following sections.
  These activate Netrunner's quant persona (head of quantitative research)
  and enable trading-specific diagnostic reasoning.

## Market Structure
- **Asset class:** {{equities|crypto|FX|futures|options|fixed income}}
- **Frequency:** {{tick|1s|1m|5m|15m|1h|daily}}
- **Execution venue:** {{exchange name, OTC, dark pool}}
- **Liquidity profile:** {{liquid|illiquid, avg daily volume, typical spread}}

## Strategy Profile
- **Type:** {{momentum|mean-reversion|stat-arb|market-making|directional|relative-value}}
- **Holding period:** {{seconds|minutes|hours|days|weeks}}
- **Capacity:** {{estimated AUM before alpha decay}}
- **Edge source:** {{speed|information|modeling|structural — WHY does this alpha exist?}}

## Risk Framework
- **Max drawdown tolerance:** {{percentage}}
- **Position sizing:** {{method, max single position}}
- **Tail risk:** {{how strategy behaves in crisis/flash crash}}
- **Kill switches:** {{automatic shutdown thresholds}}

  These sections help Netrunner reason about execution realism, regime
  awareness, and whether the strategy's edge is defensible.
-->

## Decision Log
| Phase | Decision | Reasoning | Outcome |
|-------|----------|-----------|---------|

<!--
  Record decisions that constrain future work. Not every choice -- just the ones
  that close off alternatives or commit to a direction.

  Example:
  | Phase 1 | Use transformer over LSTM | Parallel training + attention interpretability | Pending |
  | Phase 2 | Fixed 1440-step window    | Matches trading day granularity                | Limits multi-day patterns |
-->

## Update Log
| Date | Phase | Change |
|------|-------|--------|

<!--
  One line per significant update. Netrunner appends here automatically.
  Example:
  | 2025-03-20 | Phase 2 | Added regime-aware loss weighting; dir_acc 52.1% -> 54.3% |
  | 2025-03-19 | Phase 2 | Diagnosed attention collapse; weights uniform across heads |
-->

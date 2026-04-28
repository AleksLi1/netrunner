# Academic Research Protocol for Quantitative Strategy Development

## Purpose

This reference defines how Netrunner proactively integrates academic research into strategy development. The goal is to stand on the shoulders of published research — using it to identify promising directions, avoid dead ends, and benchmark against the state of the art — rather than reinventing wheels that academics have already tested.

## When to Trigger Academic Research

Academic research is NOT always needed. Trigger it when:

| Signal | Action |
|--------|--------|
| New strategy development (BUILD_STRATEGY) | MANDATORY: Literature review before Phase 1 |
| Feature engineering discussion | Search for published factor libraries and decay timelines |
| "State of the art" / "what's current" in user prompt | Comprehensive literature survey |
| Validation methodology questions | Search for latest cross-validation techniques |
| Model architecture selection | Search for benchmarks on financial time series |
| Alpha source identification | Search for published inefficiencies and their survival rates |
| Production failure investigation | Search for published alpha decay / regime shift research |
| Risk management design | Search for tail risk, portfolio construction research |

Do NOT trigger academic research for:
- Pure implementation tasks (bug fixes, refactoring)
- Infrastructure work (data pipelines, deployment)
- Tasks where the user has already specified the approach

## Search Strategy

### Primary Sources (Search in This Order)

1. **arXiv Quantitative Finance** (`arxiv.org/list/q-fin/`)
   - Subfields: `q-fin.TR` (Trading), `q-fin.PM` (Portfolio Mgmt), `q-fin.ST` (Statistics), `q-fin.CP` (Computation), `q-fin.RM` (Risk Mgmt)
   - Free, open access, most current (pre-prints)
   - Search: `site:arxiv.org q-fin [topic]`

2. **SSRN Finance** (`papers.ssrn.com`)
   - Working papers from practitioners and academics
   - Often more applied than pure academic journals
   - Search: `site:ssrn.com [topic] quantitative trading`

3. **Google Scholar** (`scholar.google.com`)
   - Aggregates across all sources
   - Useful for citation counts (proxy for influence)
   - Search: `[topic] quantitative finance` with date filter

4. **Key Authors to Track**
   - **Marcos Lopez de Prado**: Overfitting, validation, financial ML methodology
   - **Stefan Zohren** (Oxford): Deep learning for trading, DeepLOB, volatility
   - **Robert Pardo**: Walk-forward analysis, strategy validation
   - **Ernie Chan**: Mean reversion, stat arb, practical alpha
   - **Rishi Narang**: Inside the Black Box, quant strategy frameworks
   - **Jean-Philippe Bouchaud** (CFM): Market microstructure, impact models
   - **Albert Kyle**: Market microstructure theory
   - **Almgren & Chriss**: Optimal execution, market impact
   - **Harvey, Liu, Zhu**: Factor zoo, multiple testing in finance

5. **Key Conferences / Journals**
   - Journal of Financial Economics, Journal of Portfolio Management
   - Quantitative Finance, Journal of Computational Finance
   - NeurIPS/ICML Finance workshops, AAAI Finance
   - Risk.net, Journal of Risk

### Search Query Templates

For strategy development:
```
"[strategy type] [asset class] [timeframe] out-of-sample performance [year]"
"[feature type] alpha decay factor [asset class] [year]"
"[method] quantitative trading walk-forward validation [year]"
```

For validation methodology:
```
"backtest overfitting [method] financial [year]"
"cross-validation time series purged embargo [year]"
"multiple testing correction strategy selection [year]"
```

For market microstructure:
```
"market impact model [asset class] execution slippage [year]"
"order book dynamics [exchange] [year]"
"transaction cost analysis [asset class] [year]"
```

For alpha sources:
```
"[factor name] alpha decay post-publication [year]"
"[inefficiency type] [asset class] risk premium [year]"
"LLM alpha factor discovery quantitative [year]"
```

## Paper Evaluation Framework

NOT all papers are equal. Evaluate every paper through this lens:

### Tier 1: Publication Quality
| Score | Criteria |
|-------|---------|
| **A** | Top journal (JFE, RFS, JF, JPM) or 100+ citations |
| **B** | Good journal or 20+ citations or known author |
| **C** | Working paper / preprint with reproducible code |
| **D** | Blog post, medium article, no peer review |
| **F** | No methodology section, no out-of-sample test |

### Tier 2: Methodological Rigor
| Check | Pass/Fail |
|-------|-----------|
| Out-of-sample testing reported? | Required |
| Transaction costs included? | Required for strategy papers |
| Walk-forward or temporal split used? | Required |
| Multiple testing correction applied? | Required if >5 variants tested |
| Data period covers multiple regimes? | Required |
| Code or data available? | Strongly preferred |

### Tier 3: Practical Relevance
| Question | Answer determines usefulness |
|----------|----------------------------|
| What asset class / market? | Must match or be transferable |
| What capacity? | A strategy for $1M won't work for $100M |
| What data frequency? | HFT findings don't apply to daily strategies |
| What execution assumptions? | Mid-price vs. fill-price makes huge difference |
| Publication date? | >5 years old = likely decayed unless structural |

### Tier 4: Overfitting Red Flags
| Red Flag | Interpretation |
|----------|---------------|
| Sharpe > 3 with no explanation | Almost certainly overfit |
| Only in-sample results shown | Useless without OOS |
| Hundreds of strategy variants tested, best one reported | Selection bias |
| Works on one specific period/asset | Not generalizable |
| Parameters with many decimal places (RSI < 23.7) | Curve-fitted |
| No confidence intervals on performance | Can't assess significance |
| Paper promotes a commercial product | Conflict of interest |

## Academic Factor Decay Analysis

### The Factor Zoo Problem (Harvey, Liu & Zhu 2016)

Academic finance has published 400+ factors. Most are likely false discoveries:
- **Pre-2000 factors**: ~60% replicate, ~25% retain alpha post-publication
- **Post-2000 factors**: ~40% replicate, ~10% retain alpha post-publication
- **Post-2015 factors**: Crowding means faster decay (months, not years)

### Decay Timeline by Factor Type

| Factor Type | Publication → Peak Alpha | Peak → 50% Decay | 50% Decay → Zero | Total Lifespan |
|-------------|------------------------|-------------------|-------------------|----------------|
| Structural (carry, value) | Always existed | 10+ years | May never fully decay | Decades |
| Behavioral (momentum, low vol) | Known for decades | 5-10 years | 5-10 years | 15-20 years |
| Statistical (ML-mined) | Immediate | 6-18 months | 6-12 months | 1-3 years |
| HFT microstructure | Immediate | 1-6 months | 1-3 months | 3-12 months |
| Event-driven (earnings, news) | Varies | 1-3 years | 1-3 years | 3-7 years |
| Alternative data (satellite, NLP) | 1-2 years | 2-5 years | 2-5 years | 5-10 years |

### Implications for Strategy Development

1. **Don't build strategies around already-published alpha** unless:
   - The alpha is structural (has a persistent economic reason to exist)
   - You have an execution advantage (lower costs, faster fills)
   - You combine published factors in novel ways (combination alpha)
   - The factor is capacity-constrained (large funds can't exploit it)

2. **Use published research for what NOT to do:**
   - Published decay timelines tell you which factors are dead
   - Published failure modes tell you what validation is required
   - Published methodological critiques improve your research process

3. **Use published research for methodology:**
   - Validation frameworks (CSCV, PBO, purged CV)
   - Metric computation (Deflated Sharpe, robust statistics)
   - Feature engineering best practices (temporal safety)

## Integration with Netrunner Workflows

### In BUILD_STRATEGY Phase 1 (Ideation & Research)

```
ACADEMIC RESEARCH STEP (MANDATORY):

1. IDENTIFY the strategy domain:
   - Asset class, timeframe, strategy type (trend, mean-rev, stat-arb, ML)

2. SEARCH for published research:
   - Query: "[strategy type] [asset class] academic research [current year - 2]"
   - Query: "[strategy type] alpha decay factor crowding [current year - 2]"
   - Query: "[strategy type] out-of-sample performance replication [current year - 2]"

3. EVALUATE found papers through the Tier 1-4 framework above

4. EXTRACT from quality papers:
   - Validated features/signals with OOS performance numbers
   - Known decay timelines for the target alpha source
   - Recommended validation methodology
   - Execution cost assumptions and capacity estimates
   - Known failure modes and regime dependencies

5. DOCUMENT in RESEARCH.md:
   ## Academic Literature Review
   ### Papers Reviewed: [count]
   ### Key Findings:
   - [Paper 1]: [finding] (Tier: [A/B/C], OOS: [metric])
   - [Paper 2]: [finding] (Tier: [A/B/C], OOS: [metric])
   ### Dead Ends (Published Factors with Known Decay):
   - [Factor]: Published [year], decayed by [year], current IC: ~0
   ### Methodology Recommendations from Literature:
   - [validation technique from papers]
   ### Hard Constraints from Literature:
   - [e.g., "Transaction costs > X bps make this strategy unprofitable"]
```

### In nr-researcher Agent

When spawned for a quant project, the researcher MUST:

1. **Before any web search**, check existing research corpus (existing behavior)
2. **After corpus check**, perform academic literature search (NEW behavior):
   - Search arxiv q-fin, SSRN, Google Scholar for the specific topic
   - Evaluate papers through Tier 1-4 framework
   - Extract validated findings, decay timelines, methodology recommendations
3. **In output**, clearly separate:
   - "From existing research corpus: [findings with doc citations]"
   - "From academic literature: [findings with paper citations and evaluation tier]"
   - "Gap: [topics neither corpus nor literature cover]"

### In nr-quant-auditor Agent

When running any audit mode, check:
- Are published academic baselines being met or exceeded? (Red flag if significantly better)
- Is the validation methodology consistent with current academic best practices?
- Are known-dead factors being used as if they're still alive?

## Cutting-Edge Academic Frontiers (2024-2026)

### 1. LLM-Driven Alpha Discovery
- **QuantaAlpha** (2026): Multi-agent LLM framework for interpretable alpha mining. Self-evolving factors with diversity and redundancy control. Key innovation: redundancy-aware evolution preventing factor crowding.
- **HARLA** (2026): Hybrid approach combining LLM reasoning with reinforcement learning optimization. LLM suggests factor skeletons, RL refines. IC improvement: 75% over RL-only baseline.
- **Hubble** (2026): Safe, diverse, reproducible alpha discovery. Emphasis on family-level generalization and out-of-sample validation. Discovered factors retain positive IC over 195-day OOS window.
- **AlphaQuanter** (2025): Single-agent RL framework with tool-augmented decision workflow. Transparent reasoning chain for each trade decision.
- **Implication**: LLM-assisted alpha mining is becoming mainstream. The key differentiator is NOT the LLM but the validation rigor — most frameworks still don't properly control for multiple testing.

### 2. Robust Backtest Validation
- **GT-Score** (2026): Composite objective function embedding anti-overfitting structure. Improves walk-forward generalization ratio by 98% vs baseline objectives. Key: optimizing FOR robustness, not just returns.
- **Combinatorial Purged CV** (Lopez de Prado): Generates precise number of backtest paths needed while purging information leakage. The gold standard for financial ML validation.
- **Deflated Sharpe Ratio**: Corrects for selection bias under multiple testing + non-normal returns. Should be MANDATORY for any strategy claiming significance.
- **Implication**: Any strategy development workflow that doesn't use purged CV + DSR + PBO is methodologically incomplete.

### 3. Market Microstructure Intelligence
- **TradeFM** (2026): Generative foundation model for trade-flow and microstructure. Trained on US equities, zero-shot generalizes to China/Japan.
- **TRADES** (2025): Diffusion models for realistic market simulation. Agent-based models with reactive environments decomposing market impact from risk.
- **Square Root Law** (2025): Universal law for market impact confirmed with high-precision TSE data. Impact = Y * sqrt(volume / market_depth).
- **Implication**: Market impact modeling is converging on universal laws. Backtests that use flat cost assumptions are increasingly indefensible.

### 4. Regime-Aware Strategies
- **Macro-Market Fusion** (2025): Cross-attention combining macroeconomic features with price-based inputs. Purged CV with 5-day embargo. Performance is state-dependent — strongest near high-volume support nodes.
- **Multi-agent regime detection**: Multiple specialized agents handling different market states. Key insight: regime inference is infrastructure, not alpha.
- **Alpha decay diagnosis** (QuantaAlpha 2026): Factor-level analysis of alpha decay during regime transitions. Semantic diversity across information channels mitigates regime-specific decay.
- **Implication**: Single-regime strategies are dead. Production strategies must either be regime-robust or regime-adaptive with proper switching logic.

### 5. AI-Driven Alpha Self-Defeat
- **Algorithmic homogenization**: As AI adoption rises, strategies converge → reflexive market dynamics → alpha self-destruction at scale (SSRN 2026).
- **Crowding detection**: Published alpha sources decay faster as more participants exploit them.
- **Implication**: Novel, proprietary alpha sources are increasingly valuable. Published factors are commoditized within months.

## Research Output Template

When academic research is conducted, output to RESEARCH.md in this format:

```markdown
## Academic Literature Review

### Search Conducted
- Queries: [list queries run]
- Sources: [arxiv, SSRN, Google Scholar]
- Papers found: [N], Papers meeting Tier A-C: [M]

### Key Papers

| Paper | Authors | Year | Tier | Key Finding | OOS Performance | Relevance |
|-------|---------|------|------|-------------|-----------------|-----------|
| [title] | [authors] | [year] | [A/B/C] | [1-line finding] | [metric] | [HIGH/MED/LOW] |

### Validated Approaches (from literature)
1. [Approach]: [description] — validated by [paper], OOS: [metric]
2. [Approach]: [description] — validated by [paper], OOS: [metric]

### Dead Ends (published but decayed)
1. [Factor/approach]: Published [year], estimated current alpha: [near-zero/negative]
2. [Factor/approach]: Known to fail because [reason from literature]

### Methodology Recommendations
1. [Validation method]: Recommended by [paper/author] for [use case]
2. [Metric]: Preferred over [alternative] because [reason]

### Hard Constraints from Literature
1. [Constraint]: [explanation with citation]

### Open Questions (gaps in literature)
1. [Question]: No published research addresses this — original research needed
```

# Netrunner Transfer Protocol (NTP) Specification

**Version:** NTP/1
**Purpose:** Token-efficient LLM-to-LLM knowledge transfer across repositories.

## Design Principles

1. **WHAT not WHERE** — The exporting agent describes findings at the domain level. The importing agent maps them to its own codebase. Neither agent needs knowledge of the other's repository structure.
2. **Code over prose** — Executable code is the most compressed semantic representation. A function definition is more precise and shorter than describing what the function should do.
3. **Typed fields over sentences** — `IC:0.03 decay:5d regime:trend` is unambiguous in ~10 tokens. The prose equivalent is 50+.
4. **Delta over document** — Transfer only what changes. Use `+`/`~`/`-` notation for state changes.
5. **Spec as shared language** — Both agents read this file at the start of every session. No emergent compression needed — the protocol IS the shared language.

## Packet Structure

An NTP packet is a single file with section markers. Every token carries semantic weight — no filler.

```
NTP/1
FROM {repo-name}@{commit-hash} [{branch}]
TO {target-repo-name}
TS {ISO-8601-timestamp}
DOMAIN {domain-key}
CONFIDENCE {low|medium|high}

---SUMMARY
{1-3 line plain text summary of what this transfer contains and why it matters}

---FINDINGS
{finding-id} type:{type} name:{name} {key:value pairs}

---CODE
{finding-id}:
{language}
{code block}

---DISCOVERY
CONCEPTS {space-separated concept keywords}
TOUCHES {space-separated integration point keywords}
LANG {language}
DEPS {space-separated dependencies}
PATTERNS {space-separated code patterns to search for}

---CONSTRAINTS
{constraint-type} {value}

---VERIFY
{finding-id}: {verification criteria}
INTEGRATION {integration-level verification criteria}

---DELTA
{+|~|-}{field}:{value}
```

## Section Reference

### Header (required)

| Field | Format | Example |
|-------|--------|---------|
| Version | `NTP/{N}` | `NTP/1` |
| FROM | `{repo}@{commit} [{branch}]` | `quant-rd@abc123 [feature/vol-signal]` |
| TO | `{repo}` | `trading-exec` |
| TS | ISO-8601 | `2026-04-03T14:00:00Z` |
| DOMAIN | domain key from table below | `quant` |
| CONFIDENCE | `low\|medium\|high` | `high` |

### ---SUMMARY (required)

Plain text, 1-3 lines. What was found and why it matters. This is the only section where prose is acceptable — it gives the receiving agent a quick orientation before parsing structured data.

### ---FINDINGS (required)

One line per finding. Format:

```
{ID} type:{type} name:{name} {metric:value}* [valid:{method}] [status:{status}]
```

**Finding types by domain:**

| Domain | Valid types |
|--------|-----------|
| quant | `signal`, `feature`, `model`, `strategy`, `parameter`, `constraint`, `risk_model` |
| web | `component`, `hook`, `style`, `route`, `optimization`, `pattern` |
| api | `endpoint`, `schema`, `middleware`, `migration`, `integration` |
| systems | `config`, `service`, `pipeline`, `monitor`, `policy` |
| mobile | `screen`, `component`, `hook`, `navigation`, `native_module` |
| desktop | `window`, `ipc_handler`, `service`, `plugin`, `native_binding` |
| data-analysis | `analysis`, `model`, `visualization`, `pipeline`, `report` |
| data-eng | `pipeline`, `transform`, `schema`, `quality_check`, `connector` |
| general | `module`, `function`, `class`, `config`, `pattern` |

**Finding statuses:** `validated`, `experimental`, `deprecated`, `superseded_by:{id}`

### ---CODE (required for findings with implementations)

Code blocks keyed by finding ID. Include the actual implementation — not pseudocode.

```
{ID}:
{code}
```

Multiple findings can have separate code blocks:

```
F1:
def volume_zscore(df, lookback=20):
    ratio = df.volume / df.volume.rolling(lookback).mean()
    return ratio.rolling(lookback).apply(lambda x: (x[-1]-x.mean())/x.std())

F2:
def spread_momentum(df, lookback=10):
    spread = df.ask - df.bid
    return spread.pct_change(lookback)
```

### ---DISCOVERY (required)

Hints for the receiving agent to efficiently search its codebase. These are grep/glob targets, NOT integration specs.

| Field | Purpose | Example |
|-------|---------|---------|
| CONCEPTS | Domain concepts this transfer touches | `rolling_zscore volume_ratio feature_pipeline` |
| TOUCHES | Integration point keywords | `feature_computation signal_registry config model_input` |
| LANG | Primary language | `python` |
| DEPS | Required dependencies | `pandas>=1.5 numpy scipy` |
| PATTERNS | Code patterns to search for in target | `def compute_features class FeatureEngine register_signal` |

**Why this matters:** The receiving agent uses these hints to run targeted searches on a potentially huge codebase, instead of scanning everything. This is the difference between `O(n)` and `O(grep matches)`.

### ---CONSTRAINTS (required)

Structured constraints the receiving agent must respect during integration.

| Constraint type | Meaning | Example |
|----------------|---------|---------|
| TEMPORAL | Temporal safety status | `TEMPORAL safe:lookback_only` |
| REGIME | Market/environment conditions | `REGIME trending_markets` |
| RISK | Risk limits | `RISK max_allocation=0.1 max_drawdown=0.15` |
| DEPS | Hard dependencies | `DEPS pandas>=1.5 numpy` |
| COMPAT | Compatibility requirements | `COMPAT python>=3.9` |
| REPLACES | Supersedes existing code | `REPLACES old_volume_signal` |
| REQUIRES | Prerequisite that must exist | `REQUIRES base_data_pipeline` |
| EXCLUSIVE | Cannot coexist with | `EXCLUSIVE legacy_feature_v1` |

### ---VERIFY (required)

Criteria the receiving agent runs AFTER integration to confirm correctness.

Format: `{ID}: {metric}{operator}{threshold} [{condition}]`

```
F1: IC>0.02 holdout=30d pipeline_audit=clean
F2: IC>0.015 holdout=30d pipeline_audit=clean
INTEGRATION: backtest_match±10% full_pipeline_passes
```

**Verification levels:**
- **Finding-level:** Each finding has its own pass/fail criteria
- **Integration-level:** The combined system must pass end-to-end checks

### ---DELTA (optional)

State changes to track in the receiving repo's CONTEXT.md. Uses `+`/`~`/`-` notation:

| Prefix | Meaning | Example |
|--------|---------|---------|
| `+` | New addition | `+signals:2` |
| `~` | Modified/needs review | `~risk_budget:review` |
| `-` | Removed/deprecated | `-legacy_volume_signal` |

## Domain Abbreviation Tables

Both agents share these abbreviations. No expansion needed in NTP packets.

### Quant Finance
| Abbrev | Meaning |
|--------|---------|
| IC | Information Coefficient |
| SR | Sharpe Ratio |
| MDD | Maximum Drawdown |
| WF | Walk-Forward |
| PBO | Probability of Backtest Overfitting |
| HO | Holdout |
| CV | Cross-Validation |
| TS | Temporal Split |
| PnL | Profit and Loss |
| DD | Drawdown |
| HIT | Hit Rate / Direction Accuracy |
| TVR | Turnover |
| BPS | Basis Points |
| OOS | Out-of-Sample |
| IS | In-Sample |

### Web Development
| Abbrev | Meaning |
|--------|---------|
| LCP | Largest Contentful Paint |
| CLS | Cumulative Layout Shift |
| INP | Interaction to Next Paint |
| FCP | First Contentful Paint |
| TTFB | Time to First Byte |
| SSR | Server-Side Rendering |
| SSG | Static Site Generation |
| CSR | Client-Side Rendering |
| CWV | Core Web Vitals |
| TTI | Time to Interactive |

### API/Backend
| Abbrev | Meaning |
|--------|---------|
| RPS | Requests Per Second |
| P50 | 50th Percentile Latency |
| P95 | 95th Percentile Latency |
| P99 | 99th Percentile Latency |
| TPS | Transactions Per Second |
| QPS | Queries Per Second |
| MTTR | Mean Time to Recovery |
| SLO | Service Level Objective |

### Systems/Infrastructure
| Abbrev | Meaning |
|--------|---------|
| MTBF | Mean Time Between Failures |
| RPO | Recovery Point Objective |
| RTO | Recovery Time Objective |
| HA | High Availability |
| DR | Disaster Recovery |
| IaC | Infrastructure as Code |

## Partner Registry

Both repos maintain a partner registry at `.planning/ntp-partners.json`:

```json
{
  "ntp_version": "1",
  "self": {
    "name": "repo-name",
    "domain": "quant",
    "description": "Brief repo description"
  },
  "partners": [
    {
      "name": "partner-repo-name",
      "path": "/absolute/path/to/partner/repo",
      "domain": "quant",
      "import_path": ".planning/imports/",
      "last_transfer": "2026-04-03T14:00:00Z"
    }
  ]
}
```

**Auto-delivery:** When `partners[].path` is set and accessible, EXPORT writes directly to `{partner.path}/{partner.import_path}`. The partner's next `/nr:run` auto-detects the packet.

**Manual delivery:** When path is not set or not accessible (remote repos), EXPORT writes to `.planning/exports/` and instructs the user to copy the file.

## Token Budget Analysis

| Step | Prose (current) | NTP |
|------|----------------|-----|
| Export generation | ~3000 tok | ~400 tok |
| Import parsing | ~3000 tok input | ~400 tok input |
| Codebase mapping | ~3000 tok (full scan) | ~1000 tok (DISCOVERY-targeted) |
| **Total round-trip** | **~9000 tok** | **~1800 tok** |

**~5x reduction** with zero ambiguity loss. The structured format actually increases precision because every field is typed and unambiguous.

## Version Evolution

Packets declare their version in the first line (`NTP/1`). The receiving agent reads this spec for the declared version. Forward compatibility: unknown fields are ignored. Backward compatibility: required fields never removed, only deprecated.

**NTP/1** — Initial version. All sections above.

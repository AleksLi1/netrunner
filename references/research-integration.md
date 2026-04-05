# Research Corpus Integration Protocol

## Purpose

When a project has an existing research corpus (a `research/` directory with structured documents and a synthesis), Netrunner treats it as **authoritative domain expertise** — equivalent to having a senior researcher's complete analysis available before any work begins.

This protocol ensures every agent loads, references, and follows research recommendations rather than duplicating work or ignoring hard-won knowledge.

## Discovery

### Step 1: Scan for research directory

Check these locations in order (relative to project root):
1. `research/` — primary
2. `.planning/research/` — planning-integrated
3. `docs/research/` — docs-based

### Step 2: Find synthesis file

Within the research directory, look for:
1. `00_SYNTHESIS.md` or `SYNTHESIS.md` — numbered or plain
2. Any file containing "synthesis" or "roadmap" in the name
3. `README.md` within the research directory

The synthesis is the **master document** — it prioritizes, cross-references, and ranks all individual research docs.

### Step 3: Index research documents

Build a topic index from filenames and headers:
```
RESEARCH_INDEX = {
  "doc_id": "01",
  "filename": "01_crypto_microstructure.md",
  "topic": "crypto microstructure",
  "keywords": [extracted from title and first 10 lines]
}
```

This index is used for on-demand loading — only load full docs when relevant to the current task.

## Integration Rules

### Rule 1: Synthesis as Authoritative Guidance

The synthesis document represents completed expert analysis. Treat it as:
- **Tier rankings** → phase ordering guidance (Tier 0 before Tier 1 before Tier 2...)
- **Closed paths** → HARD CONSTRAINTS (same severity as CONTEXT.md closed paths)
- **Key numbers** → success criteria baselines and expected impacts
- **Implementation details** → specific parameters, approaches, code patterns to follow
- **Critical constraints** → non-negotiable rules (e.g., "NO LOOKAHEAD BIAS")

### Rule 2: Research Before Web Search

Before any web search or external research:
1. Check if the research corpus covers the topic
2. If covered: load the specific doc, cite it, use its recommendations
3. Only do fresh research for **gaps not covered** by existing docs
4. When citing: "Research Doc [N] recommends: [specific recommendation]"

### Rule 3: Research-Informed Planning

When planning a phase that maps to a research recommendation:
1. Load the relevant research doc(s) — not just the synthesis
2. Use research-specified parameters (exact values, not approximations)
3. Use research-specified expected impacts as success criteria baselines
4. Include `Research Reference: Doc [N]` in task metadata
5. Follow the research's recommended implementation approach unless there's a concrete, documented reason to deviate

### Rule 4: Research-Guided Execution

Before implementing any task:
1. Check if the PLAN references a research doc
2. If yes, load that specific doc for:
   - Exact parameter values (e.g., "N=30 buckets for VPIN", "q=0.7 for GCE loss")
   - Implementation details and code patterns
   - Known pitfalls and anti-patterns
   - Expected outputs and validation criteria
3. If deviating from research, log deviation with justification to CONTEXT.md

### Rule 5: Research Closed Paths are Hard Constraints

The synthesis's "Closed Paths" section lists confirmed dead ends. These are:
- **NEVER suggested as avenues** in diagnostic Q&A
- **NEVER planned as tasks** in phase planning
- **BLOCKED at pre-generation gate** with the same severity as CONTEXT.md hard constraints
- Documented with original research doc reference for traceability

## Constraint Frame Extension

When research corpus exists, the standard constraint frame gains a RESEARCH section:

```
PHASE [N] CONSTRAINT FRAME:
- Goal: [from roadmap]
- Hard constraints: [from CONTEXT.md + phase-specific]
- Closed paths: [from CONTEXT.md + RESEARCH closed paths]
- Research guidance: [specific recommendations from synthesis for this phase]
- Research references: [Doc numbers relevant to this phase]
- Expected impact: [from synthesis, labeled UNVALIDATED until walk-forward tested]
- Key risk: [what could go wrong]
- Success criteria: [measurable, from roadmap + research baselines]
```

## Agent-Specific Behavior

### nr-researcher
- **Pre-check:** Before ANY web search, scan research index for coverage
- **Skip signal:** If research doc covers the topic comprehensively, output: `"Existing research (Doc [N]) covers this topic. Key findings: [summary]. No additional research needed."`
- **Gap fill only:** If research covers 80%+ of needed info, only research the gaps
- **Citation:** Always cite research doc number when using existing findings

### nr-planner
- **Phase mapping:** Map each phase goal to relevant research tier/items
- **Task generation:** Generate tasks that implement research recommendations
- **Parameter precision:** Use exact values from research (not approximations)
- **Success criteria:** Derive from research expected impacts (labeled UNVALIDATED)
- **Deviation flag:** If plan deviates from research, document why in plan frontmatter

### nr-executor
- **Pre-implementation load:** Before each task, load referenced research doc
- **Implementation fidelity:** Follow research-specified approaches precisely
- **Parameter compliance:** Use exact research parameters in code
- **Deviation logging:** If deviating, commit message must explain why
- **Pitfall avoidance:** Check research doc's pitfall section before implementing

### nr-verifier
- **Research alignment check:** Verify implementation matches research recommendations
- **Parameter audit:** Check that research-specified parameters are used correctly
- **Expected impact baseline:** Compare actual results to research predictions
- **Deviation review:** Flag any deviations from research for human review

### Brain (brain-reason.md)
- **Context enrichment:** Load synthesis as part of brain context
- **Research closed paths:** Add to closed path set in constraint activation
- **Priority guidance:** Use research tiers to inform phase ordering decisions
- **Trajectory evaluation:** Compare progress against research-predicted outcomes

## Research Quality Signals

Not all research is equally reliable. When loading research, assess:

| Signal | Interpretation |
|--------|---------------|
| Labeled "HONEST" | Verified result — high confidence |
| Labeled "UPPER_BOUND" | Optimistic estimate — apply 30-50% discount |
| Labeled "UNVALIDATED" | Theory/prediction only — must be walk-forward tested |
| Labeled "TAINTED" | Contains known methodology issue — use with caution |
| Marked as "Closed Path" | Confirmed dead end — do not pursue |
| Has specific numbers | Actionable — use as implementation parameters |
| Has code patterns | Directly implementable — follow the pattern |

## Example: Research-Aware Phase Planning

Without research corpus:
```
Phase: "Add funding rate features"
→ Researcher does web search for funding rate feature engineering
→ Planner creates generic feature engineering tasks
→ Executor implements from scratch
```

With research corpus:
```
Phase: "Add funding rate features"
→ Research index match: Doc 01 (microstructure), Doc 11 (Binance data), Doc 14 (funding carry)
→ Planner loads Doc 01+11: "7 features: funding_raw, funding_zscore, funding_cumdev, funding_momentum, premium_basis, time_to_settlement, premium_basis_zscore"
→ Tasks reference specific parameters: "Premium index klines at 1min from Binance Vision"
→ Executor loads Doc 11 for exact API endpoints and data format
→ Expected impact: "strongest signal at extremes, AC = 0.966-0.998"
```

The difference: zero wasted effort re-discovering what's already known.

# Netrunner Improvements — From Real Usage

Based on 20+ `/nr` invocations across multi-day sessions on a trading ML project (trajectory transformers, 60+ experiments). These aren't theoretical — every point comes from actual friction observed during use.

---

## 1. Add a STRATEGY classification for "what now?" queries

**Problem**: The most common query type was strategic — "so what to do", "where do we go from here?", "what's the single best avenue?". These aren't MODEL_DEV (no diagnosis needed), DEBUGGING (nothing's broken), or RESEARCH (not exploratory). They're **prioritization** queries: "given everything we've tried, what's highest-leverage?"

**Current behavior**: These get shoehorned into MODEL_DEV or RESEARCH, triggering either a diagnostic flow (overkill — we already know what the model does) or the lighter non-MODEL_DEV flow (too generic).

**Fix**: Add `STRATEGY` classification:
- Skip diagnosis (model behavior is already understood)
- Skip questions if context.md has >10 "tried" entries (enough signal to infer)
- Lead with **one recommendation**, then offer alternatives
- Format: single paragraph recommendation → "Want alternatives?" → expand to 2-3 avenues

```
STRATEGY flow:
1. Load context
2. Scan "What Has Been Tried" for exhausted clusters
3. Scan "Open Questions / Active Frontiers" for ready-to-run items
4. Rank remaining approaches by (novelty × expected_gain × inverse_effort)
5. Present top recommendation with one-line justification
6. Optional: "Want alternatives?" expands to full avenue format
```

**Why this matters**: In iterative sessions, the user doesn't need a 500-word analysis. They need "do X next, because Y." The current format wastes their time re-reading constraints they already know.

---

## 2. Make questions adaptive — skip when context is rich enough

**Problem**: Questions were dismissed or answered perfunctorily in 60%+ of invocations. After 5+ `/nr` calls in a session, the context.md is rich enough that questions add friction without information gain.

**Current behavior**: Always asks 2-3 questions regardless of context richness. Same question format for cold start and 10th invocation.

**Fix**: Add a context richness heuristic:

```
RICH context (skip questions, infer everything):
  - context.md has ≥10 entries in "What Has Been Tried"
  - AND ≥3 entries in "Hard Constraints"
  - AND "Diagnostic State" is not "Unknown"
  - AND this is NOT the first /nr call in the session

MODERATE context (ask 1 question only — the most valuable one):
  - context.md exists but is thin
  - OR first /nr call in session

COLD (ask all 2-3 questions):
  - No context.md, or context.md has <3 tried entries
```

When skipping questions, add a one-liner: `[Inferred from context — ask again with /nr --ask to force questions]`

---

## 3. Fix bypass mode — infer and proceed, don't stop

**Problem**: Current bypass mode says "Do NOT proceed to Step 3. Output as plain text and stop." This forces the user to re-run with `-- Q1: ... | Q2: ...` syntax, which nobody wants to do.

**Current behavior**: Outputs questions as plain text, stops, waits for re-run.

**What actually happened**: When questions were suppressed, I inferred the constraint frame from context and conversation, then proceeded. The users preferred this. The prompt should **support** this behavior.

**Fix**: Replace the bypass fallback with:

```markdown
**Fallback — AskUserQuestion unavailable or dismissed:**

Infer the constraint frame from context.md + conversation history:
- Behavior pattern → from context.md "Current State" + "Diagnostic State"
- Failure confidence → from context.md "What Has Been Tried" impl. confidence column
- Constraints → from context.md "Hard Constraints"
- Diagnostic visibility → from context.md "Diagnostic State" evidence list

Log: `[auto] Inferred constraint frame — /nr --ask to force questions`

Proceed to Step 3 with inferred frame. Do NOT stop.
```

---

## 4. Detect experiment clusters to prevent repetition

**Problem**: We ran 5 context length experiments (Avenues C, F, G, H-Part1, H-Part2). Each was logged individually. On the 4th call, I was STILL suggesting context length variations because the skill saw them as separate entries, not an exhausted theme.

**Current behavior**: Checks individual entries in "What Has Been Tried" for exact matches. Doesn't detect thematic clusters.

**Fix**: Before generating avenues, group "What Has Been Tried" entries by theme:

```
Clustering heuristic:
- Same first word/phrase in approach name → same cluster
- Same "Notes" references (e.g., "ctx=1440", "context length") → same cluster
- ≥3 entries in a cluster → mark cluster as EXHAUSTED
- EXHAUSTED clusters get a single-line mention in the constraint frame:
  "EXHAUSTED CLUSTERS: context length (5 experiments, all confirmed ctx=1440)"
```

Then: **never suggest an avenue that falls within an exhausted cluster** unless the user explicitly asks to revisit it.

This also helps with context.md readability — the "tried" table could optionally collapse clusters:

```markdown
| Context length (5 exps) | CONFIRMED ctx=1440 | High | All variations tested | C, F, G, H1, H2 |
```

---

## 5. Lighter avenue format for iterative sessions

**Problem**: 6 fields per avenue (mechanism, gain, risk, impl-risk, verification, effort) produces wall-of-text output. Users often just said "try the first two" without reading the detail.

**Current behavior**: Always uses the full 6-field format.

**Fix**: Two avenue formats based on context:

**Full format** (cold start, MODEL_DEV:RANDOM, first session call):
```
Avenue N: Name
- Mechanism: ...
- Expected gain: ...
- Risk: ...
- Implementation risk: ...
- Verification: ...
- Effort: ...
```

**Compact format** (iterative sessions, STRATEGY classification, rich context):
```
Avenue N: Name — [one sentence mechanism]. Expected: +X%. Effort: Y.
  Risk: [one sentence].
```

The compact format fits 3 avenues in the space the full format needs for 1. Better for the user who's been iterating all day and just wants the next action.

Add to prompt: `Use compact format when classification is STRATEGY or context has ≥10 tried entries.`

---

## 6. Constraint enforcement — pre-generation validation

**Problem**: I suggested multi-seed experiments despite "1 seed, fast iteration" being an explicit hard constraint. The user was furious ("STOP TESTING DIFFERENT FUCKING SEEDS!!!!"). The constraint was in context.md but I didn't check it before generating avenues.

**Current behavior**: Says "do not suggest high-confidence failures or violate constraints" but has no verification step.

**Fix**: Add an explicit pre-check before Step 3 output:

```markdown
## Step 2.5 — Constraint validation (silent)

Before generating any avenue:
1. Load Hard Constraints from context.md
2. For each candidate avenue, check:
   - Does it violate any hard constraint? → DISCARD with note
   - Does it overlap an EXHAUSTED cluster? → DISCARD with note
   - Does it match a high-confidence failure? → DISCARD with note
3. If discarded avenues > generated avenues, note:
   "X approaches discarded due to constraints. Remaining solution space is narrow."
```

This is a checklist, not AI judgment. Hard constraints should be treated as boolean gates.

---

## 7. Action-oriented output — bridge to execution

**Problem**: After avenues, the user invariably said "try avenue X." Then I had to write an experiment script from scratch. There was no bridge between the recommendation and the execution.

**Current behavior**: Avenues end with "Effort: ~2h experiment." No actionable next step.

**Fix**: Add an optional `Next step` field:

```
Avenue 1: Feature Subset Diversity
- Mechanism: ...
- Next step: Modify `scripts/feature_subset_diversity.py` to use alternating_3d split,
  then run: `python scripts/feature_subset_diversity.py --epochs 15`
```

Or if no script exists:
```
- Next step: Write experiment script following `scripts/avenue_ctx_fair.py` pattern.
  Key function: train with feature mask, evaluate raw direction + P&L.
```

This collapses the gap between "decide" and "do." The user can say "run avenue 1" and the skill (or the next turn) knows exactly what to execute.

---

## 8. Context.md schema migration

**Problem**: Our actual context.md used a simpler format (no Diagnostic State, no Impl. Confidence columns, simpler Tried table) because it was created before the skill was updated. The skill didn't detect or migrate the older schema.

**Current behavior**: Assumes context.md matches the current schema. If it doesn't, information is mislocated or missing.

**Fix**: In Step 0, after loading context.md, check for schema version:

```markdown
Schema detection:
- Has "Diagnostic State" section? → v2 (current)
- Has "Impl. Confidence" column in Tried table? → v2
- Otherwise → v1 (legacy)

If v1: silently migrate by:
1. Adding empty "Diagnostic State" section with "Unknown — not yet established"
2. Adding "Impl. Confidence" and "Failure Mode" columns to Tried table (default: Unknown)
3. Add note to Update Log: "Schema migrated to v2"
```

---

## 9. Session-aware context updates

**Problem**: Context.md was updated after every /nr invocation, making the update log noisy (5+ entries per day during active iteration). The updates were also inconsistent — sometimes detailed, sometimes one-liners.

**Current behavior**: "Always update context.md after producing response."

**Fix**: Batch updates within a session:

```markdown
Context update rules:
- First /nr call in session: full update (new metrics, new tries, update log)
- Subsequent calls in same session: only update "What Has Been Tried" for completed experiments
- Update Log: one entry per SESSION, not per invocation
  Format: "2026-03-20 | Session: tried A, B, C; confirmed X; new constraint Y"
```

Also: when "What Has Been Tried" exceeds 15 entries, prompt the user:
```
"Context.md has [N] tried approaches. Consider archiving exhausted clusters
to .claude/netrunner/archive/[cluster].md to keep context.md focused."
```

---

## 10. First-class support for `/nr explain` queries

**Problem**: Multiple times the user asked `/nr` to explain a result or mechanism (e.g., "explain alternating_3d split"). These aren't MODEL_DEV or STRATEGY — they're comprehension queries. The skill forced them through the avenue-generation flow, which was awkward.

**Current behavior**: No classification for "explain this to me" queries. Gets classified as RESEARCH or MODEL_DEV and produces unnecessary avenues.

**Fix**: Add `EXPLAIN` classification:

```
EXPLAIN classification:
- Triggered by: "explain", "how does X work", "why did X happen", "what does X mean"
- Flow: Load context → provide clear explanation → no avenues needed
- Format: direct answer, optionally with "implications for our project" section
- Do NOT ask questions — explanation queries have enough info in the query + context
- Do NOT generate avenues unless the explanation reveals a new opportunity
```

---

## Summary — Priority Order

| # | Improvement | Impact | Effort |
|---|------------|--------|--------|
| 3 | Fix bypass mode (infer, don't stop) | High — currently broken UX | Low |
| 6 | Constraint enforcement pre-check | High — prevents user frustration | Low |
| 1 | STRATEGY classification | High — most common query type | Med |
| 4 | Experiment cluster detection | High — prevents repetitive suggestions | Med |
| 2 | Adaptive question skipping | Med — reduces friction | Low |
| 5 | Compact avenue format | Med — better for iteration | Low |
| 7 | Action-oriented output | Med — bridges decide→do gap | Low |
| 10 | EXPLAIN classification | Med — common query type | Low |
| 9 | Session-aware updates | Low — cosmetic but helpful | Low |
| 8 | Schema migration | Low — one-time issue | Low |

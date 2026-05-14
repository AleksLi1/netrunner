# Netrunner v2

## What This Is

A Claude Code skill that collapses the LLM solution space before answering. Users invoke `/nr <query>` on any project, and Netrunner loads a living context file, classifies the query, asks targeted diagnostic questions, and produces constraint-aware answers that activate the right domain knowledge in the LLM. V2 addresses 10 concrete friction points discovered across 20+ real invocations on a multi-day trading ML project.

## Core Value

Every `/nr` invocation must produce a better answer than the user would get asking the same question without Netrunner — by surfacing binding constraints, ruling out exhausted approaches, and activating domain-specific knowledge the LLM already has but wouldn't reach with a generic query.

## Requirements

### Validated

- ✓ Context file schema (`context-template.md`) — working, used in production
- ✓ Init flow — reads repo, git history, builds context file automatically
- ✓ MODEL_DEV classification with 6 sub-types (CEILING, RANDOM, OVERFIT, REGIME, SIGNAL, DYNAMICS)
- ✓ Non-MODEL_DEV classifications (DEBUGGING, RESEARCH, TOOLING, EVALUATION)
- ✓ 2-3 diagnostic UI questions with context-specific options (actual numbers, actual approaches)
- ✓ Structured response: constraint frame → diagnostic hypothesis → avenues → recommendation
- ✓ Context file auto-update after each invocation
- ✓ Bypass mode for suppressed UI (inference path — infers from context.md, not a dead end). Validated in Phase 1: Bypass Mode Fix
- ✓ Implementation confidence tracking on failures

### Active

- [ ] STRATEGY classification for "what now?" prioritization queries
- [ ] Adaptive question skipping based on context richness
- ✓ Fix bypass mode — infer and proceed, don't stop. Validated in Phase 1: Bypass Mode Fix
- [ ] Experiment cluster detection to prevent repetitive suggestions
- [ ] Compact avenue format for iterative sessions
- ✓ Constraint enforcement pre-check before generating avenues. Validated in Phase 3: Constraint Enforcement
- [ ] Action-oriented output with next-step bridging to execution
- ✓ Context schema migration (v1 → v2 detection and silent upgrade). Validated in Phase 2: Schema Migration
- [ ] Session-aware context updates (batch per session, not per invocation)
- [ ] EXPLAIN classification for comprehension queries

### Out of Scope

- Generalization beyond MODEL_DEV as primary domain — deferred to v3, keep current domain classifications working
- Standalone product / non-Claude-Code interfaces — this is a Claude Code skill
- Multi-project context linking — each project gets its own context file
- Automatic experiment execution — Netrunner recommends, user executes

## FE/BE Parity Initiative (started 2026-05-14)

After v2.5.0, observed that the Web and API/Backend branches lag the quant branch in depth and enforcement strength. Quant has: dedicated auditor with 8 modes, 13 references, mandatory audit pipelines, 4 hard gates baked into the skill prompt, and mechanism-named subtypes. Web and API had: 3 references each, no active scanner, no audit pipelines, only soft "domain principle" lines.

Diagnosis: not a content gap (4,100 lines of FE/BE references already exist), but a **mechanism gap** — the quant branch works because of *active scanning + hard gates + audit pipelines + mechanism subtypes* operating together. References alone activate weakly without enforcement.

**Phase 1 (complete — 2026-05-14):**
- ✓ `references/web-code-scan-patterns.md` — 26 grep-able anti-patterns
- ✓ `references/api-code-scan-patterns.md` — 26 grep-able anti-patterns
- ✓ `agents/nr-web-auditor.md` — 7 audit modes (ACCESSIBILITY, PERFORMANCE, BUNDLE, RENDER, HYDRATION, SECURITY, FULL)
- ✓ `agents/nr-api-auditor.md` — 9 audit modes (SECURITY, AUTH, N_PLUS_ONE, CONTRACT, IDEMPOTENCY, RATE_LIMIT, RELIABILITY, OBSERVABILITY, FULL)
- ✓ Web hard gates added to `commands/nr.md` (6 gates)
- ✓ API hard gates added to `commands/nr.md` (7 gates)
- ✓ Auditor availability lines added to Web and API domain detection sections

**Phases 2-4 (planned, see `.planning/ROADMAP.md`):**
- Phase 2: Audit pipelines (accessibility, performance, contract) + `/nr:run` AUDIT action wiring + build workflow gates
- Phase 3: Failure case studies + mechanism-named subtype rename
- Phase 4: Validation harness against real projects + v2.6.0 release

## Creativity / Lateral Mode Initiative (started 2026-05-14)

After Phase 1 of the FE/BE work, observed that Netrunner had no explicit activation pathway for divergent/lateral thinking. When conventional thinking exhausts (3+ exhausted clusters), the existing detector refuses to suggest repeats but offers no alternative reasoning mode — a missed opportunity exactly at the moment of maximum user value.

Diagnosis: this is not a model-capability problem (LLMs have read Aristotle, Picasso, Feynman, every cross-domain thinker). It is an **activation-pathway problem** — default sampling on "how do I make X better?" collapses to the median professional response. Same thesis as the rest of Netrunner: knowledge is there, framing prevents activation.

**Phase 1 (complete — 2026-05-14):**
- ✓ `references/lateral-reframings.md` — 7 operational primitives (Analogical Transfer, Constraint Inversion, First-Principles Regression, Naive Question, Adversarial Probing, Combinatorial Recombination, Negative Space)
- ✓ `references/analogy-library.md` — 48 curated cross-domain analogies indexed by software primitive
- ✓ `references/creative-precedent.md` — empty seed for the per-project personal learning library
- ✓ LATERAL classification added to `commands/nr.md` Special classifications table
- ✓ Lateral / creativity awareness section added (alongside Cross-repo transfer and Auto-research awareness)
- ✓ Four-phase response shape added to Step 3 (Reframing → Analogical Transfer → Assumption Inversion → Reconverge, optional Phase 5 META)
- ✓ 7 lateral-mode hard gates added to pre-generation gate section
- ✓ Auto-upgrade STRATEGY → LATERAL when 3+ exhausted clusters detected (uses existing infrastructure)
- ✓ Success criteria updated

**Phases 2-4 (planned, see `.planning/ROADMAP.md`):**
- Phase 2: Validation against 5 real problems + wire the personal-library learning loop + expand analogy library to 80-100
- Phase 3: Outsider expert persona overlay
- Phase 4: Release as v2.7.0 (or v2.6.0 if released independently of FE/BE)

## Context

Netrunner was born from a real problem: 12+ hours stuck at a 52% accuracy ceiling on a trading ML project because the LLM kept suggesting "try more data" instead of identifying that normalization was destroying trend signal. The LLM had the knowledge — the conversation framing prevented it from activating.

V1 works and has been used extensively on the trading-v3 project (trajectory transformers, 60+ experiments). The 10 improvements in `IMPROVEMENTS.md` are all from real friction — not theoretical. Priority order is already established there based on impact and effort.

The skill is a single markdown file (`nr.md`) installed to `~/.claude/commands/`. No build step, no dependencies. Context files live at `.claude/netrunner/context.md` per project.

## Constraints

- **Single file**: The entire skill must remain in `nr.md` — no external scripts, no build tools
- **Claude Code skill format**: Must follow the `---` frontmatter + markdown prompt format
- **No breaking changes to context files**: Existing `context.md` files (like trading-v3) must continue to work — migrate silently
- **AskUserQuestion dependency**: UI questions are the primary interaction mechanism; bypass mode must work gracefully when suppressed
- **Prompt size**: `nr.md` is already ~280 lines; improvements must be integrated without making the prompt unwieldy

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Improvements before generalization | Real friction points have higher ROI than broadening scope | — Pending |
| Keep MODEL_DEV as primary classification | It's the most validated flow with 20+ real invocations | — Pending |
| Priority order from IMPROVEMENTS.md | Impact × effort already assessed from real usage | — Pending |

---
*Last updated: 2026-05-14 — Creativity / Lateral Mode Initiative Phase 1 complete (lateral-reframings + analogy-library + LATERAL classification + four-phase pipeline + auto-trigger on exhaustion + 7 lateral-mode hard gates). FE/BE Parity Phase 1 also complete earlier same day.*

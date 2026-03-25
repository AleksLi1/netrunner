# Phase Prompt Template

> **Note:** Planning methodology is in `agents/nr-planner.md`.
> This template defines the PLAN.md output format that the agent produces.

Template for `.planning/phases/XX-name/{phase}-{plan}-PLAN.md` - executable phase plans optimized for parallel execution.

**Naming:** Use `{phase}-{plan}-PLAN.md` format (e.g., `01-02-PLAN.md` for Phase 1, Plan 2)

## File Template

```markdown
---
phase: XX-name
plan: YY
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: []
user_setup: []
must_haves: []
---

# Phase [X] Plan [Y]: [Name]

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/CONTEXT.md

# Only include SUMMARY refs if genuinely needed:
# - This plan imports types from prior plan
# - Prior plan made decision affecting this plan
# - Prior plan's output is input to this plan
#
# Independent plans need NO prior SUMMARY references.
# Do NOT reflexively chain: 02 refs 01, 03 refs 02...

@src/relevant/source.ts
</context>

## Constraint Frame
<!-- Brain-generated constraints for this plan -->
MUST: [requirements from brain reasoning]
MUST NOT: [constraints + closed paths from CONTEXT.md]
PREFER: [reasoning-informed preferences]

## Tasks

### Task 1: [Name]
**Type:** code
**Files:** [files to create/modify]
**Done criteria:** [Observable, testable outcome]
**Instructions:**
[Specific implementation instructions]

### Task 2: [Name]
**Type:** code
**Files:** [files to create/modify]
**Done criteria:** [Observable, testable outcome]
**Instructions:**
[Specific implementation instructions]

### Task 3: [Name]
**Type:** code|test|checkpoint:human-verify
**Files:** [files to create/modify]
**Done criteria:** [Observable, testable outcome]
**Instructions:**
[Specific implementation instructions]
```

## Frontmatter Fields

| Field | Required | Purpose |
|-------|----------|---------|
| `phase` | Yes | Phase identifier (e.g., `01-foundation`) |
| `plan` | Yes | Plan number within phase (e.g., `01`, `02`) |
| `type` | Yes | Always `execute` for standard plans, `tdd` for TDD plans |
| `wave` | Yes | Execution wave number (1, 2, 3...). Pre-computed at plan time. |
| `depends_on` | Yes | Array of plan IDs this plan requires. |
| `files_modified` | Yes | Files this plan touches. |
| `autonomous` | Yes | `true` if no checkpoints, `false` if has checkpoints |
| `requirements` | Yes | **MUST** list requirement IDs from ROADMAP. Every roadmap requirement MUST appear in at least one plan. |
| `user_setup` | No | Array of human-required setup items (external services) |
| `must_haves` | Yes | Goal-backward verification criteria (see below) |

**Wave is pre-computed:** Wave numbers are assigned during `/nr:plan-phase`. Execute-phase reads `wave` directly from frontmatter and groups plans by wave number. No runtime dependency analysis needed.

**Must-haves enable verification:** The `must_haves` field carries goal-backward requirements from planning to execution. After all plans complete, execute-phase spawns a verification subagent that checks these criteria against the actual codebase.

## Parallel vs Sequential

**Parallel execution** (wave-based):
- Plans in the same wave execute concurrently
- Each plan is self-contained within its wave
- Wave 2 plans can depend on wave 1 outputs

**Sequential execution** (single wave):
- All plans in wave 1
- Execute in order: 01, 02, 03...

Default to parallel when plans touch different files. Use sequential when later plans need earlier outputs.

## Context Section

**Parallel-aware context:**

```markdown
<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/CONTEXT.md

# Only include SUMMARY refs if genuinely needed
@src/relevant/source.ts
</context>
```

**Bad pattern (creates false dependencies):**
```markdown
<context>
@.planning/phases/03-features/03-01-SUMMARY.md  # Just because it's earlier
@.planning/phases/03-features/03-02-SUMMARY.md  # Reflexive chaining
</context>
```

## Scope Guidance

Each plan should be:
- 2-3 tasks (50% context max)
- A vertical slice of functionality
- Self-contained within its wave

If a plan exceeds 3 tasks, split it.

## TDD Plans

For TDD plans, set `type: tdd` and follow RED-GREEN-REFACTOR:
- Task 1: Write failing tests (RED)
- Task 2: Implement to pass (GREEN)
- Task 3: Clean up (REFACTOR)

## Task Types

| Type | Description |
|------|-------------|
| `code` | Write/modify source code |
| `test` | Write/modify tests |
| `config` | Configuration changes |
| `checkpoint:human-verify` | Human verification needed |
| `checkpoint:decision` | Decision needed from user |
| `checkpoint:human-action` | Manual step required |

## Must-Haves (Goal-Backward Verification)

The `must_haves` field defines what MUST be true after the plan executes. These are verification criteria, not task descriptions.

```yaml
must_haves:
  - artifact: "src/api/auth.ts"
    criteria: "Exports loginUser and registerUser functions"
    verification: "grep -E 'export.*(loginUser|registerUser)' src/api/auth.ts"
  - artifact: "src/middleware.ts"
    criteria: "Checks JWT token on protected routes"
    verification: "grep -E 'jwt|token|verify' src/middleware.ts"
```

**Rules:**
- Every must-have references a concrete artifact (file, endpoint, behavior)
- Every must-have has a verification method (command, test, manual check)
- Must-haves are checked AFTER all tasks complete
- Failure triggers investigation, not automatic retry

## User Setup (External Services)

When a plan introduces external services requiring human configuration, declare in frontmatter:

```yaml
user_setup:
  - service: stripe
    why: "Payment processing requires API keys"
    env_vars:
      - name: STRIPE_SECRET_KEY
        source: "Stripe Dashboard -> Developers -> API keys -> Secret key"
    dashboard_config:
      - task: "Create webhook endpoint"
        location: "Stripe Dashboard -> Developers -> Webhooks -> Add endpoint"
    local_dev:
      - "stripe listen --forward-to localhost:3000/api/webhooks/stripe"
```

**The automation-first rule:** `user_setup` contains ONLY what the agent literally cannot do:
- Account creation (requires human signup)
- Secret retrieval (requires dashboard access)
- Dashboard configuration (requires human in browser)

**NOT included:** Package installs, code changes, file creation, CLI commands the agent can run.

## Anti-Patterns

**Avoid these in plans:**

1. **Vague done criteria:** "Works correctly" -- instead: "Returns 200 with JWT token containing user ID"
2. **Missing file paths:** "Update the auth module" -- instead: "Modify src/api/auth.ts"
3. **Implicit dependencies:** Assuming prior plan output without declaring in depends_on
4. **Over-scoping:** More than 3 tasks or 50% context -- split the plan
5. **Generic instructions:** "Implement authentication" -- instead: step-by-step specifics
6. **Reflexive SUMMARY chaining:** Referencing prior SUMMARY just because it's earlier

## Guidelines

- Always use XML structure for agent parsing
- Include `wave`, `depends_on`, `files_modified`, `autonomous` in every plan
- Prefer vertical slices over horizontal layers
- Only reference prior SUMMARYs when genuinely needed
- Group checkpoints with related auto tasks in same plan
- 2-3 tasks per plan, ~50% context max

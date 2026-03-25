# Model Profiles

Model profiles control which model each Netrunner agent uses. This allows balancing quality vs token spend, or inheriting the currently selected session model.

## Profile Definitions

| Agent | `quality` | `balanced` | `budget` | `inherit` |
|-------|-----------|------------|----------|-----------|
| nr-planner | opus | opus | sonnet | inherit |
| nr-roadmapper | opus | sonnet | sonnet | inherit |
| nr-executor | opus | sonnet | sonnet | inherit |
| nr-phase-researcher | opus | sonnet | haiku | inherit |
| nr-project-researcher | opus | sonnet | haiku | inherit |
| nr-research-synthesizer | sonnet | sonnet | haiku | inherit |
| nr-debugger | opus | sonnet | sonnet | inherit |
| nr-codebase-mapper | sonnet | haiku | haiku | inherit |
| nr-verifier | sonnet | sonnet | haiku | inherit |
| nr-plan-checker | sonnet | sonnet | haiku | inherit |
| nr-integration-checker | sonnet | sonnet | haiku | inherit |

## Profile Philosophy

**quality** - Maximum reasoning power
- Opus for all decision-making agents
- Sonnet for read-only verification
- Use when: quota available, critical architecture work

**balanced** (default) - Smart allocation
- Opus only for planning (where architecture decisions happen)
- Sonnet for execution and research (follows explicit instructions)
- Sonnet for verification (needs reasoning, not just pattern matching)
- Use when: normal development, good balance of quality and cost

**budget** - Minimal Opus usage
- Sonnet for anything that writes code
- Haiku for research and verification
- Use when: conserving quota, high-volume work, less critical phases

**inherit** - Follow the current session model
- All agents resolve to `inherit`
- Best when you switch models interactively
- **Required when using non-Anthropic providers** (OpenRouter, local models, etc.) -- otherwise Netrunner may call Anthropic models directly, incurring unexpected costs
- Use when: you want Netrunner to follow your currently selected runtime model

## Resolution Logic

Profile is resolved in this order:
1. Per-agent override in config (if set)
2. Project-level profile in `.planning/config.json`
3. Default: `balanced`

## Per-Agent Overrides

In `.planning/config.json`:
```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "nr-planner": "opus",
    "nr-executor": "sonnet"
  }
}
```

## Switching Profiles

Runtime: `/nr:set-profile <profile>`

Per-project default: Set in `.planning/config.json`:
```json
{
  "model_profile": "balanced"
}
```

## Using Non-Anthropic Models (OpenRouter, Local, etc.)

If you're using Claude Code with OpenRouter, a local model, or any non-Anthropic provider, set the `inherit` profile to prevent Netrunner from calling Anthropic models for subagents:

```bash
# Via settings command
/nr:settings
# -> Select "Inherit" for model profile

# Or manually in .planning/config.json
{
  "model_profile": "inherit"
}
```

Without `inherit`, Netrunner's default `balanced` profile spawns specific Anthropic models (`opus`, `sonnet`, `haiku`) for each agent type, which can result in additional API costs through your non-Anthropic provider.

## Design Rationale

**Why Opus for nr-planner?**
Planning involves architecture decisions, goal decomposition, and task design. This is where model quality has the highest impact.

**Why Sonnet for nr-executor?**
Executors follow explicit PLAN.md instructions. The plan already contains the reasoning; execution is implementation.

**Why Sonnet (not Haiku) for verifiers in balanced?**
Verification requires goal-backward reasoning - checking if code *delivers* what the phase promised, not just pattern matching. Sonnet handles this well; Haiku may miss subtle gaps.

**Why Haiku for nr-codebase-mapper?**
Read-only exploration and pattern extraction. No reasoning required, just structured output from file contents.

**Why `inherit` instead of passing `opus` directly?**
Claude Code's `"opus"` alias maps to a specific model version. Organizations may block older opus versions while allowing newer ones. Netrunner returns `"inherit"` for opus-tier agents, causing them to use whatever opus version the user has configured in their session. This avoids version conflicts and silent fallbacks to Sonnet.

**Why `inherit` profile?**
Some runtimes let users switch models at runtime. The `inherit` profile keeps all Netrunner subagents aligned to that live selection.

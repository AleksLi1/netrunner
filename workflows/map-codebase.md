# Workflow: Map Codebase

<purpose>
Orchestrate parallel codebase mapper agents to analyze the codebase and produce structured documents in `.planning/codebase/`. Each agent has fresh context, explores a specific focus area, and writes documents directly. The orchestrator only receives confirmation, then writes a summary.
</purpose>

<inputs>
- Codebase root directory (current working directory)
- Optional: existing `.planning/codebase/` maps to refresh
</inputs>

<procedure>

## 1. Initialize

```bash
INIT=$(node ~/.claude/netrunner/bin/nr-tools.cjs init map-codebase 2>/dev/null)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract from init JSON: `mapper_model`, `commit_docs`, `codebase_dir`, `existing_maps`, `has_maps`, `codebase_dir_exists`.

## 2. Check Existing Maps

If `.planning/codebase/` already exists:
- List existing documents
- Ask: "Codebase maps already exist. Refresh them or keep existing?"
- On refresh: proceed with re-mapping (overwrites existing)
- On keep: exit early

## 3. Create Output Directory

```bash
mkdir -p .planning/codebase
```

## 4. Spawn Mapper Agents (Parallel)

Spawn 4 mapper agents simultaneously, each with a distinct focus area.

### Agent 1: Stack & Integrations

```
Task(
  subagent_type="nr-mapper",
  description="Map codebase stack and integrations",
  prompt="Focus: stack

Analyze this codebase's technology stack and external integrations.

Write these documents to .planning/codebase/:
- STACK.md -- Languages, runtime, frameworks, dependencies, configuration
- INTEGRATIONS.md -- External APIs, databases, auth providers, webhooks

Explore thoroughly. Write documents directly. Return confirmation with line counts only."
)
```

### Agent 2: Architecture & Structure

```
Task(
  subagent_type="nr-mapper",
  description="Map codebase architecture",
  prompt="Focus: architecture

Analyze this codebase's architecture and directory structure.

Write these documents to .planning/codebase/:
- ARCHITECTURE.md -- Pattern (MVC, microservices, etc.), layers, data flow, abstractions, entry points
- STRUCTURE.md -- Directory layout, key locations, naming conventions, file organization

Explore thoroughly. Write documents directly. Return confirmation with line counts only."
)
```

### Agent 3: Conventions & Testing

```
Task(
  subagent_type="nr-mapper",
  description="Map codebase conventions and testing",
  prompt="Focus: quality

Analyze this codebase's coding conventions and testing patterns.

Write these documents to .planning/codebase/:
- CONVENTIONS.md -- Code style, naming patterns, error handling, common patterns
- TESTING.md -- Test framework, structure, mocking patterns, coverage, test utilities

Explore thoroughly. Write documents directly. Return confirmation with line counts only."
)
```

### Agent 4: Concerns & Technical Debt

```
Task(
  subagent_type="nr-mapper",
  description="Map codebase concerns",
  prompt="Focus: concerns

Analyze this codebase for cross-cutting concerns and technical debt.

Write this document to .planning/codebase/:
- CONCERNS.md -- Security patterns, performance considerations, accessibility, tech debt, known issues, TODO/FIXME/HACK inventory

Explore thoroughly. Write document directly. Return confirmation with line counts only."
)
```

**Runtime note:** Use Claude Code `Task()` for parallel subagent dispatch. If Task() is unavailable, execute each mapper focus sequentially in the main context.

## 5. Collect Results

Wait for all mapper agents to complete.

For each agent:
- Verify documents were written
- Note line counts for summary
- Log any issues

If an agent fails:
- Log the failure
- Attempt to re-spawn once
- If still fails, note the gap in summary

## 6. Write Summary

Create `.planning/codebase/SUMMARY.md`:

```markdown
# Codebase Map Summary

## Documents Generated
| Document | Lines | Focus |
|----------|-------|-------|
| STACK.md | [N] | Languages, frameworks, dependencies |
| INTEGRATIONS.md | [N] | External services, APIs, databases |
| ARCHITECTURE.md | [N] | Patterns, layers, data flow |
| STRUCTURE.md | [N] | Directory layout, organization |
| CONVENTIONS.md | [N] | Code style, patterns |
| TESTING.md | [N] | Test framework, coverage |
| CONCERNS.md | [N] | Tech debt, security, performance |

## Key Findings
[Top 3-5 architectural observations from across all documents]

## Generated
[date]
```

## 7. Feed into CONTEXT.md

If `.planning/CONTEXT.md` exists:
- Add structural knowledge summary under a "Codebase" section
- Note key architectural patterns that inform constraint generation
- Update diagnostic state if architecture reveals relevant patterns

## 8. Commit (if configured)

```bash
git add .planning/codebase/
git commit -m "docs: map codebase structure and conventions"
```

</procedure>

<outputs>
- `.planning/codebase/STACK.md` -- technology stack and dependencies
- `.planning/codebase/INTEGRATIONS.md` -- external services and APIs
- `.planning/codebase/ARCHITECTURE.md` -- patterns, layers, data flow
- `.planning/codebase/STRUCTURE.md` -- directory layout and organization
- `.planning/codebase/CONVENTIONS.md` -- code style and patterns
- `.planning/codebase/TESTING.md` -- test framework and coverage
- `.planning/codebase/CONCERNS.md` -- tech debt, security, performance
- `.planning/codebase/SUMMARY.md` -- aggregated summary of all maps
</outputs>

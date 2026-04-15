# Export Plan — Portable Multi-Model Handoff

Converts Netrunner PLAN.md files into model-agnostic task lists for execution by
Codex, Copilot, Cursor, or any other coding agent. Strips Netrunner-specific
metadata and produces clear, self-contained instructions.

## When to use

- User wants to plan with Netrunner and implement with a cheaper/faster model
- User workflow: "plan with Claude → hand off to Codex"
- User explicitly requests `/nr:run export-plan`
- After any PLAN action, user says "export this for Codex" or similar

## Input

One or more PLAN.md files from `.planning/phases/*/`.

If no phase specified, export the CURRENT phase (from STATE.md `current_phase`).
If `--all` flag, export all planned phases.
If `--phase N` flag, export that specific phase.

## Process

### 1. Collect plan files

Read all `*-PLAN.md` files for the target phase(s).

### 2. Extract task data

For each PLAN.md, extract:
- Phase name and goal (from YAML frontmatter + objective)
- Files to modify/create (from frontmatter `files_modified` + task `<files>` tags)
- Tasks in execution order (respecting wave dependencies)
- Per-task: what to do, which files, acceptance criteria

### 3. Transform to portable format

Strip Netrunner-specific elements:
- Remove YAML frontmatter
- Remove `<execution_context>`, `<context>`, `<interfaces>` blocks
- Remove `<verify>` automated checks (replace with human-readable criteria)
- Remove wave/dependency metadata (flatten to ordered list)
- Remove file path references to `~/.claude/netrunner/` (internal)
- Keep `<acceptance_criteria>` content (universal)
- Keep `<action>` content (the actual instructions)

### 4. Write output

Write to `.planning/HANDOFF.md` (or `.planning/phase-{N}/HANDOFF.md` for specific phases).

## Output Format

```markdown
# Task Handoff: [Phase Name]

## Goal
[One paragraph from objective — what this phase achieves]

## Files Involved
- `path/to/file1.ext` — [what changes]
- `path/to/file2.ext` — [what changes]

## Prerequisites
- [Any setup needed before starting]
- [Dependencies that must be installed]

## Tasks

### Task 1: [Name]
**Files:** `path/to/file.ext`
**What to do:**
[Clear, specific instructions extracted from <action> block.
All Netrunner-specific references replaced with direct descriptions.]

**Done when:**
- [Acceptance criterion 1]
- [Acceptance criterion 2]

### Task 2: [Name]
[Same format...]

## Verification
After all tasks complete, verify:
- [High-level acceptance criteria from plan success_criteria]
- [Any test commands to run]

## Notes
- Exported from Netrunner plan on [date]
- Original plan: .planning/phases/[phase]/[plan].md
```

## Integration Points

This workflow is invoked by:
- `/nr:run export-plan` — explicit export request
- `/nr:run export-plan --phase 3` — specific phase
- `/nr:run export-plan --all` — all planned phases
- After any PLAN action, if user says "export" / "hand off" / "for Codex"

The orchestrator reads the plan files, applies the transform, and writes the output.
No agent spawn needed — this is a direct transformation, not a reasoning task.

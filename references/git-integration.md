# Git Integration

<overview>
Git integration for Netrunner framework.
</overview>

<core_principle>

**Commit outcomes, not process.**

The git log should read like a changelog of what shipped, not a diary of planning activity.
</core_principle>

<commit_points>

| Event                   | Commit? | Why                                              |
| ----------------------- | ------- | ------------------------------------------------ |
| BRIEF + ROADMAP created | YES     | Project initialization                           |
| PLAN.md created         | NO      | Intermediate - commit with plan completion       |
| RESEARCH.md created     | NO      | Intermediate                                     |
| DISCOVERY.md created    | NO      | Intermediate                                     |
| **Task completed**      | YES     | Atomic unit of work (1 commit per task)         |
| **Plan completed**      | YES     | Metadata commit (SUMMARY + STATE + ROADMAP)     |
| Handoff created         | YES     | WIP state preserved                              |

</commit_points>

<git_check>

```bash
[ -d .git ] && echo "GIT_EXISTS" || echo "NO_GIT"
```

If NO_GIT: Run `git init` silently. Netrunner projects always get their own repo.
</git_check>

<commit_formats>

<format name="initialization">

## Project Initialization (brief + roadmap together)

```
docs: initialize [project-name] ([N] phases)

[One-liner from PROJECT.md]

Phases:
1. [phase-name]: [goal]
2. [phase-name]: [goal]
3. [phase-name]: [goal]
```

What to commit:

```bash
node "nr-tools.cjs" commit "docs: initialize [project-name] ([N] phases)" --files .planning/
```

</format>

<format name="task-completion">

## Task Completion (During Plan Execution)

Each task gets its own commit immediately after completion.

```
{type}({phase}-{plan}): {task-name}

- [Key change 1]
- [Key change 2]
- [Key change 3]
```

**Commit types:**
- `feat` - New feature/functionality
- `fix` - Bug fix
- `test` - Test-only (TDD RED phase)
- `refactor` - Code cleanup (TDD REFACTOR phase)
- `perf` - Performance improvement
- `chore` - Dependencies, config, tooling

**Examples:**

```bash
# Standard task
git add src/api/auth.ts src/types/user.ts
git commit -m "feat(08-02): create user registration endpoint

- POST /auth/register validates email and password
- Checks for duplicate users
- Returns JWT token on success
"

# TDD task - RED phase
git add src/__tests__/jwt.test.ts
git commit -m "test(07-02): add failing test for JWT generation

- Tests token contains user ID claim
- Tests token expires in 1 hour
- Tests signature verification
"

# TDD task - GREEN phase
git add src/utils/jwt.ts
git commit -m "feat(07-02): implement JWT generation

- Uses jose library for signing
- Includes user ID and expiry claims
- Signs with HS256 algorithm
"
```

</format>

<format name="plan-completion">

## Plan Completion (After All Tasks Done)

After all tasks committed, one final metadata commit captures plan completion.

```
docs({phase}-{plan}): complete [plan-name] plan

Tasks completed: [N]/[N]
- [Task 1 name]
- [Task 2 name]
- [Task 3 name]

SUMMARY: .planning/phases/XX-name/{phase}-{plan}-SUMMARY.md
```

What to commit:

```bash
node "nr-tools.cjs" commit "docs({phase}-{plan}): complete [plan-name] plan" --files .planning/phases/XX-name/{phase}-{plan}-PLAN.md .planning/phases/XX-name/{phase}-{plan}-SUMMARY.md .planning/STATE.md .planning/ROADMAP.md
```

**Note:** Code files NOT included -- already committed per-task.

</format>

<format name="handoff">

## Handoff (WIP)

When pausing work mid-plan (session ending, context limit):

```
wip({phase}-{plan}): pause at task [X]/[Y]

Completed:
- [Task 1] (abc123f)
- [Task 2] (def456g)

Remaining:
- [Task 3]
- [Task 4]

Resume: .planning/phases/XX-name/.continue-here-{plan}.md
```

What to commit:

```bash
node "nr-tools.cjs" commit "wip({phase}-{plan}): pause at task [X]/[Y]" --files .planning/
```

**Handoff creates `.continue-here-{plan}.md`** with:
- Completed task list with commit hashes
- Current task state (what's been done, what remains)
- Any in-progress file modifications
- Context needed to resume

**Resume protocol:**
1. Read `.continue-here-{plan}.md`
2. Verify committed tasks still pass
3. Continue from next incomplete task
4. Delete `.continue-here-{plan}.md` when plan completes

</format>

</commit_formats>

<commit_strategy_rationale>

## Why Per-Task Commits?

1. **Atomic rollback** -- If task 3 breaks, revert task 3 without losing tasks 1-2
2. **Bisect-friendly** -- `git bisect` can pinpoint which task introduced a bug
3. **Review-friendly** -- Each commit tells a coherent story
4. **Resume-friendly** -- After interruption, completed tasks are safely committed

**Why NOT per-file commits?**
- Too granular -- a task modifying 3 files should be one logical commit
- Loses context -- "what was this change for?" requires reading multiple commits

**Why NOT per-plan commits?**
- Too coarse -- if anything fails, must revert everything
- Loses granularity for debugging

</commit_strategy_rationale>

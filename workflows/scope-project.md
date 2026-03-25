# Workflow: Scope Project

<purpose>
Initialize a new project with diagnostic questioning and artifact generation.
Called by run.md when starting a new project (no .planning/ exists).
</purpose>

<inputs>
- User's project description
- Classification from Brain's CLASSIFY step (shape + subtype)
</inputs>

<procedure>

## 1. Accept Project Description

If no description provided, ask:
```
What are you building? Describe the project, feature, or system in a few sentences.
```

Wait for response before continuing.

## 2. Brain Classification

Classify using the two-tier system:

### Shape Detection
| Shape | Signal |
|-------|--------|
| `BUILD:GREENFIELD` | No existing codebase for this feature, starting from scratch |
| `BUILD:BROWNFIELD` | Existing codebase, adding/modifying functionality |
| `FIX:DEBUGGING` | Something broken that needs systematic investigation |
| `OPTIMIZE:REFINEMENT` | Working system that needs improvement |

### Subtype Detection
Analyze for domain signals:
- **ML/Data Science:** model training, data pipeline, evaluation, inference
- **Web/Frontend:** UI, components, routing, state management, styling
- **API/Backend:** endpoints, database, authentication, services
- **Systems/Infra:** deployment, CI/CD, configuration, monitoring
- **General:** tooling, documentation, testing frameworks

### Brownfield Detection
If existing code is present in the repo:

```
Task(
  subagent_type="nr-mapper",
  description="Quick codebase scan for project scoping",
  prompt="Scan the current repository structure. Report: languages, frameworks, architecture pattern, key directories, existing tests. Brief output only."
)
```

Use mapper results to inform classification and phase structure.

## 3. Diagnostic Questions (adaptive, 2-3 maximum)

Based on classification, ask targeted questions. Skip if CONTEXT.md already provides rich context (10+ tried approaches = RICH context).

**For BUILD:GREENFIELD:**
- "What's the core constraint? (time, performance, compatibility, learning curve)"
- "Who is the user / what's the primary use case?"
- "Any existing systems this must integrate with?"

**For BUILD:BROWNFIELD:**
- "What's the integration point with existing code?"
- "What can't change? (APIs, data formats, dependencies)"
- "What's the definition of done?"

**For FIX:DEBUGGING:**
- "What's the specific symptom?"
- "When did it start / what changed?"
- "What have you already tried?"

**For OPTIMIZE:REFINEMENT:**
- "What's the current metric and target?"
- "What's the performance budget / constraint?"
- "What's already been attempted?"

**For Quantitative Finance / Trading projects** (replaces or augments domain questions):
- "What asset class and frequency?"
- "What's the strategy type and edge hypothesis?"
- "What's your current validation framework?"
- "Has a lookahead audit been performed on the feature pipeline?"

Present questions via AskUserQuestion when available for structured responses.

## 4. Brain Reasoning -- Phase Structure

With classification + answers, reason about the project structure:

```
PROJECT ANALYSIS:
- Shape: [detected shape]
- Subtype: [detected subtype]
- Complexity: [Low | Medium | High]
- Key constraints: [from answers]
- Risk areas: [identified from classification]

PHASE STRATEGY:
- [Why this many phases]
- [Why this ordering]
- [What each phase must prove before the next begins]
```

## 5. Generate Artifacts

### 5a. `.planning/PROJECT.md`

```markdown
# [Project Name]

## What This Is
[1-2 sentence description from user input + brain refinement]

## Classification
- Shape: [shape]
- Subtype: [domain subtype]
- Complexity: [Low | Medium | High]

*Created: [date]*
```

### 5b. `.planning/REQUIREMENTS.md`

```markdown
# Requirements

## Active
- [ ] **REQ-01**: [Requirement from scoping]
- [ ] **REQ-02**: [Requirement from scoping]

## Out of Scope
- [Explicitly excluded items]

## Validated
[Empty -- populated as requirements are verified]
```

### 5c. `.planning/CONTEXT.md`

```markdown
# Project Context

## Project Identity
- **Name:** [project name]
- **Type:** [shape:subtype]
- **Stack:** [detected or declared]
- **Started:** [date]

## Current State
[Initial metrics or state description]

## Hard Constraints
[From diagnostic questions -- things that cannot change]

## Diagnostic State
**Behavior Pattern:** [Initial -- no patterns yet]
**Active Hypothesis:** [None -- project starting]
**Evidence:** []
**Confidence:** N/A

## What Has Been Tried
| Approach | Result | Impl. Confidence | Notes |
|----------|--------|-----------------|-------|
| Project scoped | N/A | N/A | Initial scoping complete |

## Open Questions / Active Frontiers
[Questions identified during scoping]

## Update Log
- [date]: Project scoped
```

### 5d. `.planning/STATE.md`

Initialize via CLI:
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs init scope 2>/dev/null
```

### 5e. `.planning/config.json`

```json
{
  "project_name": "[name]",
  "classification": {
    "shape": "[shape]",
    "subtype": "[subtype]"
  },
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true
  },
  "created": "[date]"
}
```

## 6. Spawn Roadmapper

```
Task(
  subagent_type="nr-roadmapper",
  description="Generate project roadmap",
  prompt="Create a phased roadmap for this project.

Project: [description]
Classification: [shape + subtype]
Requirements: [from REQUIREMENTS.md]
Constraints: [from diagnostic answers]

Generate phases with:
- Phase number and name
- Goal (what this phase proves)
- Success criteria (measurable)
- Dependencies (what must be done first)
- Plans section (populated during planning)

Write to .planning/ROADMAP.md"
)
```

## 7. Optional: Codebase Mapping

For BUILD:BROWNFIELD or projects with existing code, trigger codebase mapping.
See `workflows/map-codebase.md` for the full procedure.

Ask: "Map the existing codebase now? (Recommended for brownfield projects)"
- On yes: execute workflows/map-codebase.md
- On no: skip, can be triggered later

</procedure>

<outputs>
- `.planning/PROJECT.md` -- project identity and classification
- `.planning/REQUIREMENTS.md` -- structured requirements
- `.planning/CONTEXT.md` -- diagnostic state (Brain's memory)
- `.planning/STATE.md` -- execution position tracker
- `.planning/config.json` -- workflow configuration
- `.planning/ROADMAP.md` -- phased execution plan (from nr-roadmapper)
</outputs>

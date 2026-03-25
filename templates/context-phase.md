# Phase Context Template

Template for `.planning/phases/XX-name/{phase_num}-CONTEXT.md` - captures implementation decisions for a phase.

**Purpose:** Document decisions that downstream agents need. Researcher uses this to know WHAT to investigate. Planner uses this to know WHAT choices are locked vs flexible.

**Key principle:** Categories are NOT predefined. They emerge from what was actually discussed for THIS phase. A CLI phase has CLI-relevant sections, a UI phase has UI-relevant sections.

**Downstream consumers:**
- `nr-phase-researcher` -- Reads decisions to focus research (e.g., "card layout" -> research card component patterns)
- `nr-planner` -- Reads decisions to create specific tasks (e.g., "infinite scroll" -> task includes virtualization)

---

## File Template

```markdown
# Phase {{N}} Context -- {{Phase Name}}

**Gathered:** [date]
**Status:** Ready for planning

<domain>
## Phase Boundary

[Clear statement of what this phase delivers -- the scope anchor. This comes from ROADMAP.md and is fixed. Discussion clarifies implementation within this boundary.]

</domain>

## Phase Goal
{{What this phase must achieve}}

## Constraint Frame
{{Brain-generated constraints specific to this phase}}

MUST: [requirements]
MUST NOT: [constraints + closed paths from CONTEXT.md]
PREFER: [reasoning-informed preferences]

## Approach
{{Brain's reasoned approach for this phase}}

<decisions>
## Implementation Decisions

### [Area 1 that was discussed]
- [Specific decision made]
- [Another decision if applicable]

### [Area 2 that was discussed]
- [Specific decision made]

### [Area 3 that was discussed]
- [Specific decision made]

### Agent's Discretion
[Areas where user explicitly said "you decide" -- agent has flexibility here during planning/implementation]

</decisions>

<specifics>
## Specific Ideas

[Any particular references, examples, or "I want it like X" moments from discussion. Product references, specific behaviors, interaction patterns.]

[If none: "No specific requirements -- open to standard approaches"]

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

[List every spec, ADR, feature doc, or design doc that defines requirements or constraints for this phase. Use full relative paths so agents can read them directly. Group by topic area when the phase has multiple concerns.]

### [Topic area 1]
- `path/to/spec-or-adr.md` -- [What this doc decides/defines that's relevant]
- `path/to/doc.md` section N -- [Specific section and what it covers]

### [Topic area 2]
- `path/to/feature-doc.md` -- [What capability this defines]

[If the project has no external specs: "No external specs -- requirements are fully captured in decisions above"]

</canonical_refs>

## Dependencies
{{What this phase needs from prior phases}}

## Risk Assessment
{{What could go wrong and mitigation strategies}}

<code_context>
## Existing Code Insights

### Reusable Assets
- [Component/hook/utility]: [How it could be used in this phase]

### Established Patterns
- [Pattern]: [How it constrains/enables this phase]

### Integration Points
- [Where new code connects to existing system]

</code_context>

<deferred>
## Deferred Ideas

[Ideas that came up during discussion but belong in other phases. Captured here so they're not lost, but explicitly out of scope for this phase.]

[If none: "None -- discussion stayed within phase scope"]

</deferred>

---

*Phase: XX-name*
*Context gathered: [date]*
```

<guidelines>
**This template captures DECISIONS for downstream agents.**

The output should answer: "What does the researcher need to investigate? What choices are locked for the planner?"

**Good content (concrete decisions):**
- "Card-based layout, not timeline"
- "Retry 3 times on network failure, then fail"
- "Group by year, then by month"
- "JSON for programmatic use, table for humans"

**Bad content (too vague):**
- "Should feel modern and clean"
- "Good user experience"
- "Fast and responsive"
- "Easy to use"

**After creation:**
- File lives in phase directory: `.planning/phases/XX-name/{phase_num}-CONTEXT.md`
- `nr-phase-researcher` uses decisions to focus investigation AND reads canonical_refs to know WHAT docs to study
- `nr-planner` uses decisions + research to create executable tasks AND reads canonical_refs to verify alignment
- Downstream agents should NOT need to ask the user again about captured decisions

**CRITICAL -- Canonical references:**
- The `<canonical_refs>` section is MANDATORY. Every CONTEXT.md must have one.
- If your project has external specs, ADRs, or design docs, list them with full relative paths grouped by topic
- If ROADMAP.md lists `Canonical refs:` per phase, extract and expand those
- Inline mentions like "see ADR-019" scattered in decisions are useless to downstream agents -- they need full paths and section references in a dedicated section they can find
- If no external specs exist, say so explicitly -- don't silently omit the section
</guidelines>

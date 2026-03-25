# Requirements -- {{PROJECT_NAME}}

## Overview
{{Brief description of what these requirements cover -- the scope and purpose of this document}}

<!--
  This file tracks all requirements for the project. Keep it as the single source of truth.
  Update Status as work progresses. Use the Priority levels consistently.
-->

## Functional Requirements

| ID | Requirement | Priority | Status | Phase |
|----|-------------|----------|--------|-------|
| REQ-01 | {{requirement description}} | P0/P1/P2 | pending | -- |

<!--
  Priority levels:
  - P0: Must have -- project fails without this
  - P1: Should have -- significant value, plan for it
  - P2: Nice to have -- if time permits

  Example entries (uncomment and adapt):
  | REQ-01 | Predict next-day price direction for top 100 tickers    | P0 | complete    | Phase 1 |
  | REQ-02 | Support real-time inference with <500ms latency          | P0 | in-progress | Phase 3 |
  | REQ-03 | Generate confidence scores alongside predictions         | P1 | pending     | Phase 4 |
  | REQ-04 | Expose predictions via REST API with auth                | P1 | pending     | Phase 5 |
  | REQ-05 | Dashboard showing prediction accuracy over trailing 30d  | P2 | deferred    | --      |
-->

## Non-Functional Requirements

| ID | Requirement | Priority | Status | Phase |
|----|-------------|----------|--------|-------|
| NFR-01 | {{requirement description}} | P0/P1/P2 | pending | -- |

<!--
  Non-functional requirements cover: performance, scalability, security,
  reliability, maintainability, observability, compliance.

  Example entries:
  | NFR-01 | Inference latency <200ms p95                             | P0 | pending | Phase 3 |
  | NFR-02 | Training pipeline completes in <4h on single A100        | P1 | pending | Phase 2 |
  | NFR-03 | All API endpoints require authentication                 | P0 | pending | Phase 5 |
  | NFR-04 | System recovers from crash without data loss             | P1 | pending | Phase 4 |
  | NFR-05 | Code coverage >80% for core prediction logic             | P2 | pending | Phase 3 |
-->

## Cross-Cutting Requirements

| ID | Requirement | Priority | Applies To |
|----|-------------|----------|------------|
| XCR-01 | {{requirement that spans phases}} | P0/P1/P2 | All phases |

<!--
  Cross-cutting requirements affect multiple phases or the entire project.

  Example entries:
  | XCR-01 | All experiments must be reproducible (fixed seeds, logged configs)  | P0 | All phases  |
  | XCR-02 | Configuration via environment variables, no hardcoded secrets       | P1 | Phases 3-5  |
  | XCR-03 | Structured logging with correlation IDs for all services           | P1 | Phases 4-5  |
-->

## Requirement Dependencies

| Requirement | Depends On | Reason |
|-------------|-----------|--------|
| REQ-XX | REQ-YY | {{why this dependency exists}} |

<!--
  Track which requirements block others.

  Example entries:
  | REQ-04 | REQ-02 | API can't serve predictions without real-time inference pipeline |
  | REQ-05 | REQ-04 | Dashboard reads from the prediction API                         |
  | NFR-01 | REQ-02 | Latency target only measurable once inference pipeline exists   |
-->

## Acceptance Criteria Template
For each requirement, acceptance criteria should be:
- **Specific:** Clear pass/fail condition
- **Measurable:** Can be verified objectively
- **Testable:** Can write a test or manual check

<!--
  When a requirement moves to in-progress, expand it with acceptance criteria.
  Example for REQ-01:

  ### REQ-01: Predict next-day price direction
  - [ ] Model outputs UP/DOWN/FLAT for each ticker
  - [ ] Directional accuracy >60% on held-out test set (2024-01 to 2024-06)
  - [ ] Predictions generated before market open (6:00 AM ET)
  - [ ] Handles missing data gracefully (skip ticker, log warning)
-->

## Status Legend
- `pending` -- Not yet started
- `in-progress` -- Being implemented
- `complete` -- Implemented and verified
- `deferred` -- Postponed to future milestone
- `dropped` -- Removed from scope (with reason noted in Decision Log)

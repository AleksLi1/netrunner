# User Stories — {{PROJECT_NAME}}

## Original Goal
{{The user's stated goal, verbatim from their initial prompt. This is the north star for acceptance testing.}}

## Stories

<!--
  Each story represents a concrete user workflow that must work end-to-end.
  Stories are derived from REQUIREMENTS.md but written from the USER's perspective.
  The acceptance criteria are machine-testable — they drive automated acceptance tests.

  Story states: pending | testable | passed | failed
  - pending: not enough has been built to test this yet
  - testable: enough infrastructure exists to run acceptance tests
  - passed: acceptance tests pass
  - failed: acceptance tests fail (triggers self-healing loop)
-->

### STORY-01: {{Story title}}

**As a** {{user role}},
**I want to** {{action/capability}},
**So that** {{outcome/value}}.

**Traces to:** REQ-XX, REQ-YY
**Testable after:** Phase N
**Status:** pending

**Acceptance Criteria:**

```gherkin
Scenario: {{Scenario name}}
  Given {{precondition}}
  When {{action}}
  Then {{expected outcome}}
```

```gherkin
Scenario: {{Edge case or error scenario}}
  Given {{precondition}}
  When {{action that should fail gracefully}}
  Then {{expected error handling}}
```

<!--
  GUIDELINES FOR WRITING GOOD STORIES:

  1. ONE user workflow per story. If you need "and" in the title, split it.

  2. Acceptance criteria MUST be testable by automation:
     - Web: "I see X on the page" → Playwright can check this
     - API: "I get a 200 with field Y" → HTTP assertion
     - CLI: "Running `cmd args` outputs X" → bash assertion
     - Data: "Output file contains N rows matching pattern" → file assertion

  3. Include at least one HAPPY PATH and one ERROR PATH per story.

  4. "Testable after" links the story to the earliest phase where enough
     is built to run the acceptance test. This drives WHEN acceptance
     tests run in the chain loop.

  5. Keep scenarios concrete — use real values, not placeholders:
     BAD:  Then I should see a success message
     GOOD: Then I should see "Welcome back, {{username}}" on the dashboard

  DOMAIN-SPECIFIC PATTERNS:

  Web/Frontend:
    Given I navigate to "/login"
    When I fill in "email" with "test@example.com"
    And I fill in "password" with "Test1234!"
    And I click "Sign In"
    Then I should see "Dashboard" in the page title
    And the URL should be "/dashboard"

  API/Backend:
    Given the API server is running
    When I POST to "/api/auth/login" with {"email":"test@example.com","password":"Test1234!"}
    Then the response status should be 200
    And the response body should contain "token"

  CLI Tool:
    Given the tool is installed
    When I run `mytool --version`
    Then stdout should contain the version number
    And the exit code should be 0

  Data Pipeline:
    Given input file "data/raw/sample.csv" exists with 1000 rows
    When I run the pipeline with `python -m pipeline.run --input data/raw/sample.csv`
    Then output file "data/processed/result.parquet" should exist
    And it should contain exactly 1000 rows
    And column "score" should have no null values

  Quant/Trading:
    Given historical data for 2023-01-01 to 2023-12-31 is loaded
    When I run the backtest with `python -m strategy.backtest --start 2023-01-01 --end 2023-12-31`
    Then the Sharpe ratio should be printed to stdout
    And no future data beyond the current bar should be accessed (temporal safety)
    And the results file should contain daily returns for each trading day
-->

## Acceptance Test Strategy

**Domain:** {{web | api | cli | data | mobile | desktop | quant}}

**Test runner:** {{Playwright | HTTP assertions | bash | pytest | jest | custom}}

**Setup requirements:**
- {{What needs to be running/available before tests execute}}
- {{Environment variables, test data, services}}

**Teardown:**
- {{Cleanup after tests — reset DB, remove temp files, stop services}}

## Story-Phase Mapping

<!--
  Maps which stories become testable after which phase.
  The ACCEPT_TEST action uses this to decide which stories to test.
-->

| Story | Testable After | Dependencies | Status |
|-------|---------------|-------------|--------|
| STORY-01 | Phase N | {{what must exist}} | pending |

## Acceptance Test Results

<!--
  Populated by the ACCEPT_TEST action during chain execution.
  Each run appends results here for traceability.
-->

| Run | Date | Stories Tested | Passed | Failed | Self-Healed |
|-----|------|---------------|--------|--------|-------------|

# Workflow: Acceptance Test

<purpose>
Run acceptance tests against user stories to verify that what was built actually works from the user's perspective. This is the bridge between "code passes verification" and "user can achieve their goal."

Unlike code-level verification (verify-phase.md), acceptance testing starts the actual application, interacts with it as a user would, and checks that user workflows complete successfully.

When acceptance tests fail, the self-healing loop diagnoses the issue, fixes it, and re-tests — up to 3 iterations before escalating.
</purpose>

<inputs>
- `.planning/STORIES.md` — user stories with Given/When/Then acceptance criteria
- Phase number (which phase just completed)
- `.planning/ROADMAP.md` — to determine which stories are now testable
- `.planning/CONTEXT.md` — constraints and diagnostic state
- Project codebase — the built product to test
</inputs>

<procedure>

## 1. Determine Testable Stories

Read `.planning/STORIES.md` and the Story-Phase Mapping table.

**Filter stories for this run:**
- Stories with `Testable After: Phase N` where N <= current completed phase
- Stories with status `pending` or `failed` (re-test failures)
- Skip stories with status `passed` (unless `--retest-all` flag)

If NO stories are testable after this phase → skip acceptance testing, return SKIP.

```
TESTABLE_STORIES = [stories where testable_after <= current_phase AND status != passed]
if len(TESTABLE_STORIES) == 0:
  return SKIP — "No stories testable after Phase [N]"
```

## 2. Detect Domain and Test Strategy

Read the Acceptance Test Strategy section from STORIES.md. If not populated, auto-detect:

| Signal | Domain | Test Runner | Setup |
|--------|--------|------------|-------|
| React, Vue, Angular, Next.js, HTML, CSS | `web` | Playwright MCP | Start dev server |
| Express, FastAPI, Flask, REST, GraphQL | `api` | HTTP assertions (curl/fetch) | Start API server |
| CLI tool, argparse, commander, yargs | `cli` | Bash assertions | Build/install tool |
| pandas, Spark, Airflow, pipeline | `data` | pytest + file assertions | Prepare test data |
| React Native, Flutter, iOS, Android | `mobile` | Platform-specific | Build app |
| Electron, Tauri, desktop | `desktop` | Playwright (Electron mode) | Build app |
| backtest, strategy, trading | `quant` | pytest + metric assertions | Load test data |

**Hybrid projects:** If multiple domains detected, run domain-specific tests for each.

## 3. Environment Setup

Before running any tests, ensure the test environment is ready.

### 3a. Dependency Check
```bash
# Check test runner is available
# Web: npx playwright --version (install if missing: npx playwright install)
# API: curl --version (always available)
# CLI: the built tool exists and is executable
# Data: python -c "import pytest" (install if missing: pip install pytest)
```

### 3b. Application Startup

**Web projects:**
```bash
# Find and start the dev server
# Common patterns: npm run dev, npm start, yarn dev, python manage.py runserver
# Detect from package.json "scripts.dev" or "scripts.start"
# Wait for server to be ready (poll health endpoint or wait for port)
SERVER_PID=$!
# Store PID for cleanup
```

**API projects:**
```bash
# Find and start the API server
# Detect from package.json, Procfile, or main entry point
# Wait for health endpoint to respond
SERVER_PID=$!
```

**CLI projects:**
```bash
# Build the tool if needed (npm run build, go build, cargo build)
# Verify the binary/script exists and is executable
```

**Data projects:**
```bash
# Prepare test fixtures
# Copy sample data to test directory
# Set up test database if needed
```

### 3c. Test Data Setup
If STORIES.md specifies test data requirements:
- Create test fixtures (users, data files, etc.)
- Seed database with test data
- Set environment variables for test mode

## 4. Generate Acceptance Tests

For each testable story, generate a test file from its Given/When/Then scenarios.

### 4a. Web Domain — Playwright Tests

```javascript
// Generated: .planning/acceptance-tests/story-{NN}.spec.{js|ts}
// Uses Playwright MCP for browser automation

import { test, expect } from '@playwright/test';

test.describe('STORY-{NN}: {title}', () => {
  test('{scenario name}', async ({ page }) => {
    // Given: {precondition}
    await page.goto('{url}');

    // When: {action}
    await page.fill('{selector}', '{value}');
    await page.click('{selector}');

    // Then: {expected outcome}
    await expect(page.locator('{selector}')).toContainText('{expected}');
  });
});
```

**Alternative — Playwright MCP direct execution:**
When Playwright MCP is available in the runtime, use it directly instead of generating test files:
```
mcp__playwright__browser_navigate(url="{app_url}")
mcp__playwright__browser_snapshot()  // capture current state
mcp__playwright__browser_fill_form(fields=[...])
mcp__playwright__browser_click(ref="{element_ref}")
mcp__playwright__browser_snapshot()  // verify result
// Assert on snapshot content
```

This is preferred when available because:
- No test file installation needed
- No Playwright dependency to install
- Direct browser control with screenshots for debugging
- Immediate feedback without test runner overhead

### 4b. API Domain — HTTP Assertion Tests

```python
# Generated: .planning/acceptance-tests/story-{NN}_test.py
import requests
import json

BASE_URL = "http://localhost:{port}"

class TestStory{NN}:
    """STORY-{NN}: {title}"""

    def test_{scenario_slug}(self):
        # Given: {precondition}
        # setup...

        # When: {action}
        response = requests.{method}(f"{BASE_URL}/{path}", json={body})

        # Then: {expected outcome}
        assert response.status_code == {expected_status}
        data = response.json()
        assert "{expected_field}" in data
```

### 4c. CLI Domain — Bash Assertion Tests

```bash
#!/bin/bash
# Generated: .planning/acceptance-tests/story-{NN}.sh

echo "STORY-{NN}: {title}"
PASS=0; FAIL=0

# Scenario: {scenario name}
echo -n "  {scenario name}... "
# Given: {precondition}
# When: {action}
OUTPUT=$({command} 2>&1)
EXIT_CODE=$?
# Then: {expected outcome}
if echo "$OUTPUT" | grep -q "{expected}" && [ $EXIT_CODE -eq {expected_code} ]; then
  echo "PASS"; ((PASS++))
else
  echo "FAIL (got: $OUTPUT, exit: $EXIT_CODE)"; ((FAIL++))
fi

echo "Results: $PASS passed, $FAIL failed"
exit $FAIL
```

### 4d. Data Domain — Pytest Assertion Tests

```python
# Generated: .planning/acceptance-tests/story-{NN}_test.py
import os
import subprocess
import pandas as pd

class TestStory{NN}:
    """STORY-{NN}: {title}"""

    def test_{scenario_slug}(self):
        # Given: {precondition}
        assert os.path.exists("{input_file}")

        # When: {action}
        result = subprocess.run(["{command}"], capture_output=True, text=True)

        # Then: {expected outcome}
        assert result.returncode == 0
        df = pd.read_parquet("{output_file}")
        assert len(df) == {expected_rows}
        assert df["{column}"].notna().all()
```

### 4e. Quant Domain — Metric Assertion Tests

```python
# Generated: .planning/acceptance-tests/story-{NN}_test.py
import subprocess
import json

class TestStory{NN}:
    """STORY-{NN}: {title}"""

    def test_{scenario_slug}(self):
        # Given: {precondition}

        # When: {action}
        result = subprocess.run(["{backtest_command}"], capture_output=True, text=True)

        # Then: {expected outcome}
        assert result.returncode == 0
        metrics = json.loads(result.stdout)
        assert "sharpe_ratio" in metrics
        # Temporal safety: no future data contamination
        # (Verified by quant-auditor, not re-tested here)
```

## 5. Execute Acceptance Tests

Run each story's test and collect results.

### 5a. Run Tests

```
For each STORY in TESTABLE_STORIES:
  1. Run the generated test file:
     - Playwright: npx playwright test .planning/acceptance-tests/story-{NN}.spec.js
     - Playwright MCP: Execute directly via MCP tools (preferred when available)
     - API/Data/Quant: python -m pytest .planning/acceptance-tests/story-{NN}_test.py -v
     - CLI: bash .planning/acceptance-tests/story-{NN}.sh

  2. Capture: exit code, stdout, stderr, screenshots (web)

  3. Record result:
     - exit_code == 0 → STORY PASSED
     - exit_code != 0 → STORY FAILED (capture failure details)
```

### 5b. Collect Results

```
RESULTS = {
  total: N,
  passed: [...story IDs],
  failed: [...{story_id, failure_output, failure_reason}]
}
```

## 6. Self-Healing Loop

When stories FAIL, attempt automatic diagnosis and repair.

```
For each FAILED story:
  HEAL_ATTEMPTS = 0
  MAX_HEAL_ATTEMPTS = 3

  WHILE HEAL_ATTEMPTS < MAX_HEAL_ATTEMPTS AND story is FAILED:
    HEAL_ATTEMPTS += 1

    ## 6a. Diagnose
    Analyze the failure output:
    - What did the test expect?
    - What actually happened?
    - Is this a test issue or an implementation issue?

    Classify failure:
    | Type | Signal | Action |
    |------|--------|--------|
    | MISSING_ELEMENT | Element not found, 404, command not found | Implementation gap — need to build it |
    | WRONG_BEHAVIOR | Wrong text, wrong status code, wrong output | Logic bug — need to fix it |
    | SETUP_FAILURE | Server didn't start, dependency missing | Environment issue — need to configure |
    | TIMING_ISSUE | Timeout, element not yet visible | Race condition — need wait/retry |
    | TEST_ISSUE | Test itself is wrong (bad selector, wrong URL) | Fix the test, not the code |

    ## 6b. Fix
    Based on diagnosis:

    MISSING_ELEMENT / WRONG_BEHAVIOR:
      Spawn nr-executor with targeted fix:
      ```
      Task(subagent_type="nr-executor", description="Fix acceptance failure: STORY-{NN}",
        prompt="Acceptance test for STORY-{NN} failed.
        EXPECTED: {what test expected}
        ACTUAL: {what happened}
        DIAGNOSIS: {failure type and cause}
        FIX: {specific fix needed}
        Commit with message: 'fix: acceptance test STORY-{NN} — {description}'")
      ```

    SETUP_FAILURE:
      Fix environment setup (install dep, fix config, start service).
      No executor needed — fix inline.

    TIMING_ISSUE:
      Add explicit waits or retry logic to the test.
      Regenerate test file with better timing.

    TEST_ISSUE:
      Regenerate the test with corrected selectors/assertions.
      Do NOT change the acceptance criteria — only the test implementation.

    ## 6c. Re-test
    Re-run the specific story's test.
    If passes → mark healed, record in results.
    If still fails → increment HEAL_ATTEMPTS, loop.

  IF HEAL_ATTEMPTS == MAX_HEAL_ATTEMPTS AND still FAILED:
    Escalate — this story needs human attention.
    Record in STORIES.md: "Failed after 3 self-heal attempts. Last failure: {details}"
```

## 7. Update STORIES.md

After all tests complete, update the stories file:

```markdown
## Acceptance Test Results

| Run | Date | Stories Tested | Passed | Failed | Self-Healed |
|-----|------|---------------|--------|--------|-------------|
| 1   | {date} | {N} | {passed} | {failed} | {healed} |
```

For each story, update its status:
- All scenarios passed → `status: passed`
- Failed but self-healed → `status: passed` (add note: "Self-healed on attempt N")
- Failed after max attempts → `status: failed`

## 8. Environment Teardown

```bash
# Stop any servers started in setup
if [ -n "$SERVER_PID" ]; then kill $SERVER_PID 2>/dev/null; fi

# Clean up test data
rm -rf .planning/acceptance-tests/tmp/

# Remove test database entries (if applicable)
```

## 9. Report and Route

### All stories PASSED:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► ACCEPTANCE TESTS PASSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Stories tested: [N]/[total]
 All passed: [N] (self-healed: [M])
 Untested (future phases): [K]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
→ Route to TRANSITION

### Some stories FAILED (after self-healing):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 NR ► ACCEPTANCE TESTS: {passed}/{total} PASSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Passed: [N] (self-healed: [M])
 Failed: [K]
   STORY-XX: {failure summary}
   STORY-YY: {failure summary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Routing on failure:**

| Failed Count | Route |
|-------------|-------|
| 1-2 failures, non-critical stories | → TRANSITION (log failures as PASS_WITH_NOTES) |
| 3+ failures OR any P0 story failed | → REMEDIATE (treat like verification failure) |
| All critical stories failed | → HALT (fundamental issue) |

## 10. Brain Write-back

```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-tried \
  'Acceptance test Phase [N]: [passed]/[total] passed, [healed] self-healed, [failed] failed' --cwd .
```

If self-healing fixed issues:
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs brain add-decision \
  '{"phase":"[N]","decision":"Self-healed acceptance failures","reasoning":"[what was fixed and why]"}' --cwd .
```

</procedure>

<outputs>
- `.planning/acceptance-tests/` — generated test files
- Updated `.planning/STORIES.md` — test results and story status changes
- Updated `.planning/CONTEXT.md` — acceptance test outcomes logged
- Self-healing commits — `fix: acceptance test STORY-NN — {description}`
</outputs>

<domain_strategies>

## Web — Playwright MCP (Preferred) / Playwright Test Files

**Preferred approach (Playwright MCP available):**
Use `mcp__playwright__*` tools for direct browser control:
- `browser_navigate` → navigate to pages
- `browser_snapshot` → capture accessibility tree for assertions
- `browser_fill_form` → fill forms
- `browser_click` → click elements
- `browser_take_screenshot` → capture visual evidence on failure

Advantages: No Playwright installation needed, immediate feedback, screenshots for debugging.

**Fallback approach (Playwright MCP unavailable):**
Generate `.spec.js` files, install Playwright, run via `npx playwright test`.

**Common web assertions:**
- Page contains expected text
- URL changed to expected path
- Form submission produces expected response
- Navigation between pages works
- Error states display correctly
- Responsive layout at key breakpoints

## API — HTTP Request Assertions

Use `curl` or Python `requests` for HTTP-level testing:
- Correct status codes
- Response body contains expected fields
- Authentication works (valid token → 200, no token → 401)
- Error responses have correct format
- CORS headers present (for browser-consumed APIs)

## CLI — Bash Script Assertions

Direct command execution with output/exit code checking:
- Commands produce expected output
- Flags and options work correctly
- Error messages are helpful
- Exit codes are correct (0 for success, non-zero for errors)
- File I/O works as expected

## Data — File and Pipeline Assertions

Python-based testing with pandas/file checks:
- Output files exist and have correct format
- Row counts match expectations
- Column types and nullability correct
- Pipeline is idempotent (run twice, same result)
- Error handling for bad input data

## Quant — Metric and Temporal Assertions

Specialized for trading/quant projects:
- Backtest produces expected metrics
- No temporal contamination (defer to quant-auditor for deep check)
- Walk-forward results are reproducible
- Risk metrics within expected bounds

</domain_strategies>

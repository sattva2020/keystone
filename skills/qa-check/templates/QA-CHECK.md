<!-- derived from ai-factory@2.19.0 skills/aif-qa-check/templates/QA-CHECK.md (MIT); see THIRD_PARTY_NOTICES.md -->
# QA Check: [Test Area]

Source test cases: `[test_cases_path]`
Plan: `[plan path | n/a]`
Mode: `[human | agent]`
Tested revision: `[commit SHA | n/a]`
Working-tree digest: `[digest | n/a]`
Manual build/version identifier: `[manual_build_id | n/a]`
Source digest: `[test-cases.md digest]`
Replay directory: `[qa_dir]/replay/`
Browser tool: `[built-in browser | Playwright MCP | none | n/a]`
Target environment: `[local / development / staging / test / production / unknown / n/a]` · `[URL | n/a]`
Last updated: `[YYYY-MM-DD HH:mm]`

---

## Summary

- Total: [N]
- Passed: [N]
- Failed: [N]
- Blocked: [N]
- Pending: [N]
- Stale: [N]

## Intent coverage

| Intent line | Cases | State                                              |
|-------------|-------|----------------------------------------------------|
| I-1         | TC-001, TC-004 | [all passed / failed / blocked / pending]  |

## Execution Results

- [ ] TC-001: [Test Case Name]
  - Case digest: [per-case digest]
  - Priority: [High / Medium / Low]
  - Type: [Positive / Negative / Edge / Regression]
  - Covers: [I-n / Done means clause / unrequested / n/a]
  - Status: Pending
  - Tester: [human | agent]
  - Replay:
    - Path: [replay/TC-001.spec.js / n/a]
    - Case digest: [embedded case digest / n/a]
    - Target: [embedded target / n/a]
    - Proof status: [Proven / Unproven / n/a]
    - Preserved previous script: [replay/history/TC-001-<old-digest>.spec.js / n/a]
    - Initial replay error: [concise redacted error / n/a]
  - Comment: [User failure reason, redacted if sensitive; agent observation, blocker, or blank]
  - Evidence: [required for Passed — redacted URL, browser observation, command + exit status, test name + result, file + matched condition]

## Supporting Automated Checks

Automated checks that support one or more `TC-*` results or add QA confidence. Not counted as `TC-*` results.

- [ ] [Check name]
  - Area: [covered behavior]
  - Command / filter: `[command]`
  - Status: [Pending / Passed / Failed / Blocked]
  - Evidence: [exit code, assertion count, relevant output summary, or blocker]

## Stale / Removed Cases

- [ ] TC-000: [Prior Test Case Name]
  - Previous status: [Passed / Failed / Blocked]
  - Stale reason: [tested revision changed | working tree changed | manual build changed | source digest changed | case digest changed | replay script changed | target changed | case removed]
  - Previous tested revision: [commit SHA | n/a]
  - Previous source digest: [digest]
  - Previous case digest: [digest]
  - Previous comment: [preserved comment]
  - Previous evidence: [redacted evidence]

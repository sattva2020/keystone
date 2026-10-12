<!-- derived from ai-factory@2.19.0 skills/aif-qa/templates/TEST-PLAN.md (MIT); see THIRD_PARTY_NOTICES.md -->
## Test Plan: [Task / MR / Feature Name]

**Date:** [YYYY-MM-DD]
**Plan / ref:** [plan path | ref | staged | working]
**Environment:** [staging / development / local]

---

### 1. Testing Goal

[What we are verifying and why. Brief: what functionality changed and whether it works correctly.]

---

### 2. Test Scope

**In Scope** — we test:

- [Component / feature 1]
- [Component / feature 2]

**Out of Scope** — we don't test:

- [What is excluded and why]

---

### 3. Test Types

| Type              | Priority   | Area                                   |
|-------------------|------------|----------------------------------------|
| Functional        | 🔴 High    | [Core changed functions]               |
| Regression        | 🟡 Medium  | [Adjacent functionality]               |
| Edge cases        | 🟡 Medium  | [Input edge cases]                     |
| Negative          | 🟡 Medium  | [Error scenarios]                      |
| Security          | 🔴 High    | [Only if authorization is affected]    |

---

### 4. Test Data

| Category          | Data      | Purpose             |
|-------------------|-----------|---------------------|
| Valid data        | [example] | Happy path          |
| Boundary values   | [example] | Edge cases          |
| Invalid data      | [example] | Negative scenarios  |
| Special cases     | [example] | [Project-specific]  |

---

### 5. Preconditions

- [ ] Environment is deployed and accessible
- [ ] Test data is prepared
- [ ] Required roles / accounts are created
- [ ] [Additional condition]

---

### 6. Acceptance Criteria

- [ ] All 🔴 high-priority test cases pass
- [ ] Critical regression scenarios pass
- [ ] Negative scenarios return expected errors
- [ ] [With a plan: one criterion per clause of the plan's `Done means:` line, quoted, with the intent IDs it proves]
- [ ] [Project-specific criterion]

**Not testable manually** (intent lines with no manual check): [I-n — reason | none]

---

### 7. Plan Risks

| Risk     | Impact               | Mitigation     |
|----------|----------------------|----------------|
| [Risk 1] | High / Medium / Low  | [How to reduce]|
| [Risk 2] | High / Medium / Low  | [How to reduce]|

### 8. Checklist

| Check     | Priority              |
|-----------|-----------------------|
| [Check 1] | High / Medium / Low   |
| [Check 2] | High / Medium / Low   |

<!-- derived from ai-factory@2.19.0 skills/aif-qa/references/TEST-CASES.md (MIT); see THIRD_PARTY_NOTICES.md -->
# Reference: Test Cases (test-cases)

> **When to use:** When invoked with the `test-cases` argument (or as the third stage of `--all`).

---

## Step 1: Verify Previous Stage Artifacts

Check for both files:

- `<qa_dir>/change-summary.md`
- `<qa_dir>/test-plan.md`

**If `change-summary.md` is NOT found — STOP:** AskUserQuestion: the artifact was not found and test cases cannot be written
without it — run `/keystone:qa change-summary` first / cancel.

**If `test-plan.md` is NOT found — STOP:** AskUserQuestion: the artifact was not found and test cases cannot be written
without it — create the test plan first with `/keystone:qa test-plan` / cancel.

Do not continue until both artifacts are present. If both are found — read them and use as the basis. Proceed to Step 2.

---

## Step 2: Determine What to Test

Prioritize:

1. Core business logic of the changes
2. Edge cases and non-standard inputs
3. Negative scenarios (errors, invalid data)
4. Regression checks on adjacent functionality

Use the evidence and assumptions from `change-summary.md` and `test-plan.md` to keep test cases grounded.

## Step 3: Coverage Strategy

For each changed area, write test cases grouped as follows:

**Positive scenarios (Happy path):** standard usage with valid data; main user scenarios; different variants of valid inputs.

**Negative scenarios:** invalid or incorrect input data; missing required fields or parameters; business rule violations and
constraint breaches; unavailable dependencies (if applicable).

**Edge cases:** minimum and maximum values; empty strings, zero values, null/undefined; very long strings or large data
volumes; special characters and different encodings; concurrent requests (if applicable).

**Regression checks:** adjacent functionality that might have broken; integrations with other system components.

## Step 4: Write Test Cases

Use `${CLAUDE_SKILL_DIR}/templates/TEST-CASES.md` as the structure source, in the language the user writes in.

- Fill in all placeholders with actual data for the current change.
- Optional fields in the template may be omitted when not applicable.
- Negative tests are optional but recommended.
- High-priority tests are mandatory.
- Test case IDs such as `TC-001` stay unchanged.
- Technical identifiers, code names, branch names, API names, CLI commands, file paths, config keys, and raw error messages stay unchanged.

**Plan link (when a plan exists).** Every case carries a `Covers:` line — the intent IDs it proves (`I-1, I-3`), the `Done means`
clause it checks (quoted), or `unrequested` for behaviour the diff added that no intent line asks for. Cases that cover an
intent line are never lower than Medium priority. Add an **Execution surface** to every case so `/keystone:qa-check agent`
can pick a way to run it: `browser-ui`, `cli`, `backend-test`, `api`, `file-docs`, `database-read`, `hybrid` or `human`.
After the cases, add the table **Intent coverage**: `I-n → TC-…` for every intent line, `Not testable manually — <reason>`
where it applies. An `I-n` with neither cases nor a reason is a defect of this artifact — fix it before saving.

## Step 5: Save Artifact

Save the result to `<qa_dir>/test-cases.md`.

## Step 6: Next step and context cleanup

Tell the user the cases are saved and how to run them: `/keystone:qa-check human` (the user walks through them) or
`/keystone:qa-check agent` (the agent executes and records evidence). Offer to free up context: `/clear` (recommended) or `/compact`.

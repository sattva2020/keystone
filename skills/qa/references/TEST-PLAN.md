<!-- derived from ai-factory@2.19.0 skills/aif-qa/references/TEST-PLAN.md (MIT); see THIRD_PARTY_NOTICES.md -->
# Reference: Test Plan (test-plan)

> **When to use:** When invoked with the `test-plan` argument (or as the second stage of `--all`).

---

## Step 1: Verify Previous Stage Artifact

Check for the file `<qa_dir>/change-summary.md`.

**If the file is NOT found — STOP:** AskUserQuestion: explain that the `change-summary.md` artifact was not found and a test
plan cannot be created without it — run `/keystone:qa change-summary` first / cancel. Do not continue until the artifact is created.

**If the file is found** — read it and use it as the basis for the test plan. Proceed to Step 2.

---

## Step 2: Clarify Context

Ask the user only if something is not obvious from the code and change-summary:

- What feature or fix was implemented?
- Are there existing test cases for this area?
- What environment is available for testing?
- Are there constraints or dependencies to account for?

**Skip this step when `all_mode = true`** — proceed with what is available from the change-summary and codebase context.
When a plan exists, the intent and the plan already answer the first question — do not ask it.

## Step 3: Define Test Scope

Based on the change analysis, determine:

**In Scope** — what we test:

- Directly changed functionality
- Adjacent components with high regression risk
- Integration points affected by the changes

**Out of Scope** — what we don't test:

- Unrelated functionality
- Components without changes and without dependencies on changed ones

## Step 4: Define Test Types

Use functional, regression, edge-case, negative, security, and performance categories when relevant.

## Step 5: Build the Verification Checklist

Describe checks as a checklist with priority labels (high / medium / low).

## Step 6: Acceptance criteria from the plan

When a plan exists, build the acceptance criteria from it: each clause of the plan's `Done means:` line becomes one criterion
(quote the clause), and each intent line `I-n` with observable behaviour is mapped to the checks that will prove it. An intent
line that cannot be checked manually goes to "Not testable manually" with the reason. Without a plan, derive the criteria from
the change summary and say so.

## Step 7: Generate the Test Plan

Use `${CLAUDE_SKILL_DIR}/templates/TEST-PLAN.md` as the structure source, in the language the user writes in. Keep file paths,
commands, code identifiers and raw error messages unchanged.

Use the change summary evidence when prioritizing checks. If a high-priority test is based on an assumption rather than
observed code/diff evidence, mark that assumption explicitly.

## Step 8: Save Artifact

Save the result to `<qa_dir>/test-plan.md`.

## Step 9: Next Step

**If `all_mode = true`** — do NOT show the prompt. Proceed directly to `${CLAUDE_SKILL_DIR}/references/TEST-CASES.md`.

**Otherwise:** AskUserQuestion: the test plan was saved — proceed to writing test cases (`/keystone:qa test-cases`) or stop here.

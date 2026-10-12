---
name: qa-check
description: "Keystone: executes the test cases written by /keystone:qa — human-guided (asks the user case by case) or agent mode (browser via the built-in browser tools or Playwright MCP, CLI, tests, API, file checks) — and records pass / fail / blocked per case with evidence in <task folder>/qa/qa-check.md. A case without evidence is not pass. Reusable browser replay = Playwright test scripts in <task folder>/qa/replay/. Use for 'run the QA', 'walk through the test cases', 'verify the cases', 'rerun QA'."
argument-hint: "[human | agent] [<plan.md path | qa folder | branch>]"
allowed-tools: Read Write Grep Glob Bash AskUserQuestion mcp__Claude_Browser__* mcp__playwright__*
model: sonnet
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-qa-check/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# QA Check — Execute Test Cases

Runs the `test-cases.md` artifact produced by `/keystone:qa` and records execution status in `qa-check.md`.
For browser/UI cases, agent mode saves executable replay scripts (Playwright tests) under `<qa_dir>/replay/`; later runs
execute those scripts first, so fixes are retested and prior behavior gets regression coverage without regenerating the
browser automation.

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

**Next step (mandatory).** The answer always ends with one line `Next: <the exact command with paths>` — e.g.
`Next: /keystone:verify docs/keystone/2026-10-12-x/plan.md` — or, when nothing is to be run now,
`Next: nothing now — waiting for <event>; then <command>`. Never end on a caveat or an open-ended question.

The skill does not assume a framework, package manager or agent runtime. In agent mode it uses the appropriate available
execution surface for each case: live browser automation, CLI commands, project test runners, HTTP/API calls, database-safe
read checks, file/document inspection, or other non-destructive automated verification.

## Modes

| Argument | Mode | What you do |
|----------|------|-------------|
| `human` | Human-guided QA | Show exactly one test case, ask the user whether it works, and record their answer |
| `agent` | Automated-agent QA | Execute test cases through the most appropriate available capability and record observed results |

If no mode is provided, ask the user which mode to run.

## Workflow

### Step 0 — Project context

Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`; `.claude/rules/**/*.md`
(rules with `paths:` apply only to matching files); `AGENTS.md`. FALLBACK only when the project uses AI Factory and those
are absent: `.ai-factory/{DESCRIPTION,ARCHITECTURE,RULES}.md` and `.ai-factory/rules/*.md` (all fallback).
MUST / MUST NOT lines are project rules. The project docs and `CLAUDE.md` also tell where the app runs and how to start
it and run its tests — use them before asking the user.

### Step 1 — Locate the QA folder and verify the inputs

Parse `$ARGUMENTS`: the first word `human` or `agent` is the mode (remove it); the rest, if any, is a `plan.md` path or a QA
folder. Resolve `qa_dir`:

1. a given plan path → `<plan folder>/qa/`; a given folder containing `test-cases.md` → that folder; a branch or git ref →
   the folder `/keystone:qa <ref>` created for it (`docs/keystone/qa/*-<ref slug>/`), or the qa folder of the plan whose
   commits are on that branch;
2. else the active plan — the newest `docs/keystone/*/plan.md` (or `paths.specs` from `.ai-factory/config.yaml` when the
   project has AI Factory) whose Status is draft, approved or implementing → `<its folder>/qa/`;
3. else the newest `docs/keystone/qa/*/` that has `test-cases.md`. `.ai-factory/qa/` is a FALLBACK read location only.

Check for `<qa_dir>/test-cases.md`. If it is missing, STOP and ask: run `/keystone:qa test-cases` first / cancel.
Read it; extract test cases by ID (`TC-001`…), title, priority, type, execution surface, `Covers:`, preconditions, steps,
expected result and test data, in order. Also read `change-summary.md` and `test-plan.md` when present.

Paths: `qa_check_path = <qa_dir>/qa-check.md`, `replay_dir = <qa_dir>/replay/`.

**Source binding.** Results are valid only for the code and the cases they were run against. Record in `qa-check.md`:
`source_digest` (`git hash-object --no-filters <test-cases.md>`), a `case_digest` per case (hash of its block from the line
with `TC-NNN` to the line before the next case, line endings normalized to LF, trailing spaces trimmed), `tested_revision`
(`git rev-parse HEAD`) and `tree_digest` (hash of `git status --porcelain=v1 --untracked-files=all` plus
`git diff --binary HEAD --`, excluding `qa_check_path` and `replay_dir`; the digest of the string `clean` when there is
nothing). Not a git work tree → ask the user for a build/version identifier (`manual_build_id`) and do not accept an empty one.

If `qa-check.md` exists, resume from it only after comparing this binding with the stored one:

- `tested_revision`, `tree_digest` or `manual_build_id` changed → every prior result becomes `Stale`, unchecked; keep the
  old comment and evidence as history; retest is required. Stale results are never counted as current.
- `source_digest` changed → compare `case_digest`s: keep a result only for a case whose digest is unchanged and whose
  revision / working-tree binding is unchanged; a changed case is `Stale`; a new case is `Pending`; a removed case moves
  to "Stale / Removed Cases".
- Never overwrite earlier pass / fail comments unless the user chooses to retest that case.

If `qa-check.md` does not exist, create it from `${CLAUDE_SKILL_DIR}/templates/QA-CHECK.md` — every case unchecked, `Pending`.

### Step 2 — Agent mode preflight (before any case runs)

Agent mode is user-only (`disable-model-invocation: true`) because it can run live browser actions, shell commands and
service calls with real side effects.

1. **Capabilities.** Detect what the runtime offers: shell and project test runners; a live browser — **prefer the built-in
   browser tools (`mcp__Claude_Browser__*`) if available, otherwise Playwright MCP (`mcp__playwright__*`)**; HTTP/API checks;
   file inspection. Say which browser tool you will use, or that there is none.
2. **Classify** each case by the evidence it needs: `browser-ui`, `cli`, `backend-test`, `api`, `file-docs`,
   `database-read`, `hybrid`, `human`, `unknown` (use the case's `Execution surface:` unless the text clearly contradicts it).
   Choose the least invasive surface that produces concrete evidence. A browser/UI-observable case needs a browser — do not
   substitute CLI, unit tests or static inspection (they may only be supporting evidence). No browser available → only that
   case is `Blocked`; other cases continue.
3. **Target.** Find the URL / start command / test command from the project docs, `CLAUDE.md`, scripts and the cases. If it
   is not clear, ask the user; never invent URLs, credentials, commands or fixtures. State the environment class:
   `local`, `development`, `staging`, `test`, `production` or `unknown`, and the URL; record both.
4. **Login / user state.** Before blocking a case for missing credentials, look for a test identity in the project's seeders,
   fixtures, factories and docs; on a clearly `local`/`test` target create a minimal disposable fixture only if the project
   tooling does it safely; otherwise ask the user for an account or for permission to create a disposable one. Never store
   passwords, tokens or cookies in any file.
5. **Safety.** No browser actions, API writes, commands with side effects, database writes, destructive commands, payments,
   emails, exports or deploys against a `production` or `unknown` target without the user's explicit authorization right
   before the step; the same for any case that is destructive or has external side effects (`rm`, `git reset`, database
   resets, migrations on shared environments, deploys). Prefer read-only, test-scoped commands. Authorization denied or unclear →
   leave the case unchecked, `Blocked`, write the blocker, do not run it.

**Redaction is mandatory** for every comment and evidence line, agent- or human-written: credentials, cookies, authorization
values, session tokens, API keys, one-time codes and sensitive URL parameters (`token`, `access_token`, `code`, `secret`,
`password`, `key`, `session`, `sid`, `jwt`…) become `[REDACTED]`. No raw cookies, storage dumps or token-bearing URLs.

### Step 3 — Human mode

Run exactly one pending or selected test case at a time. For each case:

1. Show only that test case's title, priority, preconditions, steps, test data and expected result, with a short summary.
2. The summary question MUST mean: "Test this and answer whether it works." Ask with AskUserQuestion: works / does not work /
   stop for now.
3. Works → mark `[x]`, status `Passed`, tester `human`, and ask for a short note (what the user saw — a human answer is the
   evidence; a screenshot path or value is welcome, not required). Does not work → keep `[ ]`, `Failed`, ask for the reason and
   write the user's wording as the comment (only redaction applied).
4. Save `qa-check.md` after every case so progress survives context resets.

Do not show the next test case until the current one has a result or the user stops.

### Step 4 — Agent mode

Agent mode MUST produce concrete, case-appropriate evidence. **A case without evidence is not `Passed`.** Evidence is a
browser observation (page, text, state), a command with its exit status and relevant output, a test name and result, an API
response summary, or a file path and the matched condition — and it must directly cover the case's steps and expected result.

Internal deterministic invariants (service calls, cache state, exact arrays, raw database values, formula outputs) are
automated checks, not manual QA: classify them `backend-test`, `cli`, `api` or `database-read`, first look for an existing
test or command that covers the invariant and, if it passes, use its name, filter, exit status and result as evidence (one run
may cover several cases — reuse it on each). No suitable automated coverage → `Blocked: missing automated test coverage`;
do not ask the user to check internals by hand.

For each pending or selected case:

1. Run it on its surface: `browser-ui` — the saved replay first (below), else drive the browser; `cli` — the project command,
   inspect exit code and output; `backend-test` — the narrowest existing test command or filter, broaden only if needed;
   `api` — the endpoint through existing tooling or safe local commands; `file-docs` — Read/Grep/Glob plus project validation
   commands; `database-read` — read-only checks only; `hybrid` — combine, record each evidence type.
2. Execute the steps as written; compare observed with expected.
3. Stalled by a missing URL, credentials, fixture, selector, route, command or test filter → ask the user exactly for that
   before marking the case blocked; continue the same run when the answer comes.
4. Matches → `[x]`, `Passed`, concise redacted evidence. Differs → `[ ]`, `Failed`, the observed vs expected behaviour.
   Cannot be run (capability missing, authorization denied, service down) → `[ ]`, `Blocked`, the blocker. A blocked case is
   not a product defect unless there is observed evidence.
5. Save `qa-check.md` after every case.

#### Browser replay (Playwright scripts)

For every `browser-ui` case (and `hybrid` with browser steps) keep one replay file `<replay_dir>/TC-NNN.spec.js` — a
Playwright test, one case per file so a failed case reruns alone:

- the smallest `import { test, expect } from '@playwright/test'` test with navigation, stable selectors, inputs and explicit
  assertions that throw on mismatch; base URL from `process.env.QA_BASE_URL`, never an absolute target URL;
- first lines `// case-digest: <case_digest>` and `// target: <environment class> <normalized base URL>`;
- never a password, token, cookie or one-time code in the file — use an authorized existing session or env variables;
- **show the file to the user before writing it**, then write it. Do not add Playwright (or any runner) to the project
  just for replay: run it with the project's own Playwright (`npx playwright test <file>`) when it is installed; otherwise
  execute the same steps through the browser tool, keep the file as `Unproven`, and say so.

A replay is `matching` only when its embedded `case-digest` equals the current case digest and its target equals the
approved target; verify both before running. A script that ran once is `Proven` (the exact content executed — not that the
product passed); a new or changed script counts as its own proof run and is not run twice automatically. Before repairing
an existing script, keep the old one as `<replay_dir>/history/TC-NNN-<digest>.spec.js`. Classify a replay failure honestly:
a syntax or runner error is an automation defect (repair, re-prove); a missing selector is a possible product regression
(repair the locator only with browser evidence that the same element and behaviour still exist, otherwise `Failed`); an
assertion that fails is `Failed` — regression evidence, not a reason to regenerate the script. After a revision or
working-tree change, replay all matching scripts including previously passed cases, so regressions show up.

### Step 5 — Final report

Write `qa-check.md` (counts, per-case status, evidence, binding, the browser tool used, target and environment class), then
report:

```text
QA check: <human|agent> · folder: <qa_dir> · tested: <revision | build id>
Cases: <n> = passed <a> + failed <b> + blocked <c> + pending <d> + stale <e>
Intent: <I-n with all cases passed | I-n with a failed/blocked/pending case>   ← when the cases carry `Covers:`
Failed: <TC-… one line each | none> · Blocked: <TC-… and why | none>
Files: <qa-check.md> · <replay/ files created or run | none>
Blocked on me: <authorizations, credentials, decisions | none>
Next: <failed → fix and rerun /keystone:qa-check <mode>; blocked human-verifiable → /keystone:qa-check human; all passed → /keystone:verify>
```

After an agent run with `Blocked` cases that a person can check (`human`, `browser-ui`, `hybrid` with observable steps,
`unknown`), ask whether to run them now in human mode and continue in the same call if yes. Do not offer human mode for
blocked `backend-test`, `cli`, `api`, `file-docs` or `database-read` cases — recommend adding the automated check or
providing the missing command, fixture or service instead.

## Artifacts and gates

Writes only: `qa-check.md`, `replay/TC-NNN.spec.js`, `replay/history/*`. Never rewrites `test-cases.md`, `test-plan.md` or
`change-summary.md` and never touches code or context files. Replay scripts under `docs/` are not code edits, so the
draft-plan gate does not block this skill; lift a gate with `Status: abandoned` or `KEYSTONE_GATES=off`.

## Critical Rules

1. MUST NOT run without `test-cases.md`.
2. MUST show only one case at a time in human mode.
3. MUST ask the user whether the case works in human mode.
4. MUST preserve failed-user comment wording except mandatory redaction of sensitive values before writing.
5. MUST NOT mark a case passed in agent mode without concrete evidence from an appropriate execution surface for that case.
6. MUST NOT block non-browser cases merely because live browser automation is unavailable.
7. MUST classify deterministic internal/backend/CLI/API/database invariant cases as automated checks and MUST NOT route them to human manual QA as a substitute for missing automated coverage.
8. MUST bind current results to (`tested_revision` and `tree_digest`) or `manual_build_id`, plus `source_digest` and `case_digests`, and mark them stale when any of these changes.
9. MUST require explicit authorization for production/unknown targets and destructive or external-side-effect cases.
10. MUST redact credentials, cookies, authorization values, tokens and sensitive URL parameters before writing comments or evidence.
11. MUST save progress after every case.
12. MUST ask the user for missing user-suppliable execution context (URL, credentials location, login route, selectors, commands, fixtures) before blocking an agent-mode case.
13. MUST save browser/UI automation as case- and target-bound replay scripts, show the file before writing it, and execute matching scripts before generating new browser actions.
14. MUST NOT add a browser test dependency or runner solely for replay artifacts.
15. MUST NOT automatically execute a new or updated replay twice.

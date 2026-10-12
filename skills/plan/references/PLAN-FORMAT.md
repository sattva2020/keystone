<!-- derived from ai-factory@2.19.0 skills/aif-plan/references/TASK-FORMAT.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone plan format

Read this before writing `plan.md`. The header and section order are parsed by hooks and by `/keystone:implement`,
`/keystone:check`, `/keystone:verify` — keep them exact.

## Template

```markdown
# Plan: <short name>

Level: <M|L> · Mode: feature · Status: draft
Authority: intent.md — `<path>` (Created <date>, <accepted | planned from draft intent — accepted by user at planning time>)
Settings: tests — <yes|no> (<why, from repo>) · logging — <minimal|standard|verbose> (<why>) · docs — <yes|no> (<why>)
Done means: <verifiable outcomes — what is run and what must come out; on L from I-n, on M from the request>

## Original Request
<exact user-provided request text, never translated, summarized or normalized>

## Design
<optional: decisions that tasks rely on — placement, interfaces, data/control flow, compatibility, failure behaviour>

## Requirements Reconciliation
Authority: <declared source priority, or "none declared">

| Decision | Source | Verification evidence |
|---|---|---|
| <material rule or supported combination> | intent — I-1 | <test, command or manual check> |
| <rule from another source> | `<path>` — <section> | <test, command or manual check> |

Project rules check: read <CLAUDE.md, AGENTS.md, .ai-factory/RULES.md …> — MUST violations: none
<!-- Check each task's full text, incl. its Logging/Testing lines, against every MUST/MUST NOT; a task that contradicts a rule is a violation to fix before Approve. -->

## Risks
- Could break: <existing behaviour / module / data at risk, with paths>
- Riskiest step: Task <n> — <why, and how the plan limits it>
- Rejected alternatives: <option> — <why not>

## Tasks
- [ ] 1. <deliverable and expected behaviour> — files: <paths> — check: <command or observable result>
  - Source: <intent — I-n | path — section>
  - Combinations: <supported combinations, when the gate applies>
  - Logging: <what / where / levels, per Settings>
  - Depends on: <task numbers or "none">
- [ ] 2. …

## Commit Plan
- **Commit 1** (after tasks 1-3): "feat: add base models and types"
- **Commit 2** (after tasks 4-6): "feat: implement core service logic"
```

Rules for the template:

- `Authority:` line only when an intent exists (L, or M with an intent). Header lines are exactly the three shown.
- `Status` is always `draft` when written; `/keystone:plan` flips it to `approved` only on the human's Approve.
- `Original Request` is raw source input: no translation, even when the plan is in another language.
- The `## Requirements Reconciliation` heading and the table header `| Decision | Source | Verification evidence |`
  are compatibility tokens — never rename. `Source` is `intent — I-n` or `<path> — <section>`.
- The Rules check line sits directly under the table (or after `Settings:` when there is no table); the next line is
  `Coverage: …`, written by `/keystone:check` (on M it is absent).
- Every task is one checkbox line `- [ ] N. … — files: … — check: …`; detail goes on indented non-checkbox bullets.
  Never put a second `- [ ]` inside a task — hooks and implement count checkbox lines.
- A blocked task gets `BLOCKED: <reason>` appended to the END of its `- [ ] N.` line (never in a nested bullet).
- `## Commit Plan` only with 5+ tasks: a checkpoint every 3-5 tasks, grouped logically, conventional-commit messages.
  With fewer than 5 tasks: one commit at the end, no section.
- No test tasks when Settings say `tests — no`; no summary/report task at the end ever.

## Example task

```markdown
- [ ] 3. Add POST /api/auth/login — files: src/api/auth/login.ts, src/services/auth.ts — check: `npm test -- auth/login` covers every row of the combination list
  - Source: `docs/auth.md` — Login contract; intent — I-2
  - Combinations: valid/invalid credentials × active/disabled user → 200 + JWT / 401 / 403; no session row written on 401/403
  - Behaviour: accepts email and password; validates against the users table; returns a JWT on success, 401 on invalid credentials, 403 on a disabled user
  - Logging: entry with request context; validation result with reasons; external calls and responses; errors with full context; format `[AuthService.login] message {data}`; DEBUG/INFO/WARN/ERROR levels
  - Depends on: 1, 2
```

## Logging checklist (apply when Settings say `logging — standard` or `verbose`)

Every task description specifies, in the amount the Settings level asks for:

- what to log: inputs, outputs, state changes, errors;
- where: key checkpoints and external boundaries;
- levels: DEBUG for verbose flow, INFO for major events, ERROR for failures;
- control: environment-driven (`LOG_LEVEL` or `DEBUG`);
- safety: the production log level can be reduced without code edits.

`logging — minimal`: WARN/ERROR only. Follow the project's existing logger and format; the Settings line outranks this
checklist.

## Required Detail Gate

Before presenting the plan, verify every task has all of the following:

1. Exact file paths and relevant existing symbols, or an explicit statement that a new path/symbol will be introduced.
2. Ordered edits detailed enough to implement without choosing an architecture.
3. Inputs, outputs, contracts, data flow, and dependency effects.
4. Error handling, edge cases, and logging behavior.
5. Tests and commands when testing is enabled; an explicit no-test statement when testing is disabled.
6. Observable acceptance criteria and verification commands/checks.
7. Requirement source anchors and applicable supported combinations when the Requirements Reconciliation Gate applies.
8. No unresolved implementation choice hidden behind words such as "handle", "support", "wire up", "as needed", or
   "etc." If a decision truly cannot be made during planning, record it as a blocking open question in the plan instead
   of delegating the guess to the implementer.

9. A `Done means:` header line with verifiable conditions (what is run, what must come out). "Done means" without
   verifiable conditions is a blocking open question.

Plan integrity (check before saving):

- every dependency points to an existing task number;
- every task number appears exactly once;
- every non-struck `I-n` of the intent has a reconciliation row, and every row has evidence.

---
name: verify
description: "Keystone: verify finished work against its plan and intent — runs build/test/lint, then an independent verifier agent in a clean context gives every plan task, Reconciliation row and intent line ok / missing / wrong / not proven / BLOCKED, flags unrequested work, and returns PASS, PASS-UNPROVEN or FAIL. A checked box is not evidence. Writes verify.md; on PASS sets Status verified. Use after implementation on M and L changes, or for 'verify', 'did we miss anything', 'is it really done'. `/keystone:verify accept` records a human decision on unproven rows."
argument-hint: "[<plan path> [base git ref]] [--strict] | accept"
allowed-tools: Read Glob Grep Bash Agent AskUserQuestion Write Edit Skill
model: opus
effort: high
---
<!-- derived from ai-factory@2.19.0 skills/aif-verify/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · verify — plan and intent vs. the actual diff

Judgment is delegated to the `keystone:verifier` agent, which did not write the code and sees no conversation. This
skill runs the commands, collects the verdict, and writes the record. **Write/Edit are allowed for exactly two things:**
`<plan folder>/verify.md` and the `Status:` value in the plan header (plus `Accepted unproven by …` in verify.md for
`accept`). Never edit code, the intent, the rest of the plan, or tests. Fixing what verify finds is `/keystone:fix` or
`/keystone:implement`, not this skill.

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

**Next step (mandatory).** The answer always ends with one line `Next: <the exact command with paths>` — e.g.
`Next: /keystone:verify docs/keystone/2026-10-12-x/plan.md` — or, when nothing is to be run now,
`Next: nothing now — waiting for <event>; then <command>`. Never end on a caveat or an open-ended question.

**No decisions through verify.** If the user asks to put a decision or change into the intent or the plan, do not edit
anything: answer that this is `/keystone:intent <path>` (intent) or `/keystone:plan <plan path>` (plan), and that verify
must be run again afterwards. Never attribute to the user an edit the agent made.

Arguments: `$ARGUMENTS` — `<plan path> [base ref]`, or `accept`, or empty (= the active plan).

## Step 0 — find the plan, intent, rules

- Active plan = the plan.md of the newest task folder under docs/keystone/ (or paths.specs) — newest by the date prefix of the folder name, ties broken by the plan.md modification time — whose Status is draft, approved or implementing. (`paths.specs` comes from the fallback `.ai-factory/config.yaml` when that file exists.) If none: ask for the path, or stop with `no plan to verify`.
- A plan with `Status: draft` was never approved: stop and say so — verify measures an implementation, not a draft.
- Read the plan header (`Level`, `Mode`, `Status`, `Authority`, `Settings`), the intent named in `Authority:` (or
  `intent.md` next to the plan), and the project rules (those that exist): `CLAUDE.md`, `.claude/CLAUDE.md`,
  `docs/architecture.md`, `.claude/rules/**/*.md` (`paths:` rules apply only to matching files), `AGENTS.md`; fallback
  only for AI Factory projects without them.
  Fallback files: `.ai-factory/RULES.md`, `.ai-factory/rules/*.md`. MUST / MUST NOT lines
  there are project rules.
- A plan in the fallback AI Factory format (`.ai-factory/plans/<x>.md`, no task folder): `verify.md` goes next to the intent when the
  plan has an `Authority:` line or a link to an intent; otherwise `<plan>.verify.md`.
- `accept` → jump to **Accept** below.

## Step 1 — the diff to verify

Base = the given ref. Otherwise: `P` = first commit that added the plan
(`git log --diff-filter=A --format=%H -- <plan>`, the last line); `C` = the first commit after `P`
(`git rev-list --reverse P..HEAD | head -1`); base = the parent of `C`. No commit after `P` → base = `P`. If `P`
contains files outside the task folder, base = `P^`.
Count only this task's commits: `git log --first-parent <base>..HEAD`, and only the files of those commits (plus
uncommitted changes, `git status --porcelain`). Commits that arrived by merge from other branches or parallel sessions
never make a file `unrequested`. Files of the task folder (plan.md, intent.md, verify.md) are never `unrequested`.
Print the base and the file count. `Mode: fix` plans: also note whether existing test files were edited (a violation of the fix contract).

## Step 2 — run the checks

Read `${CLAUDE_SKILL_DIR}/references/CHECKS.md` and run build, test, lint and the import/dependency check it lists
for this project. Running the project's test command and read-only HTTP checks (`curl` GET against a local/staging URL
named in the plan) is allowed; **installing dependencies is not.** A tool or command that is missing → `not run — <reason>`; never
write it down as a pass. Honour the plan's `Settings:` — `tests — no` means no test run and no failure for it.
Output is one line per check, as CHECKS.md says.
Two more gates join the same lines:
- **Architecture gate.** If `docs/architecture.md` exists, read its layer dependency rules and grep the changed files'
  imports against them: each `MUST NOT:` line written by `/keystone:architecture` carries its own `check: <grep>` —
  run it on the changed files only; `check: review` lines go to the verifier. Print
  `Architecture gate: pass | fail — <rule, file:line> | n/a` (n/a = no such file or no rules in it).
- **Security gate.** On L whose plan has the `Threats:` block or a `/keystone:security` task (security/auth/payments/PII),
  `/keystone:security` must have been run for this diff: take its `Security gate: pass | warn | fail` line from that
  run in this session, or run it now with the Skill tool (`/keystone:security <plan path>`) and read the line from its answer. `fail` without a matching entry in `docs/keystone/security-ignores.md` → verdict FAIL; none run →
  `not proven`. Not a security change → `n/a`. Strictness: **L is strict by default** (`--strict` for M) — then a
lint warning, an unfinished-work marker (TODO / FIXME / HACK) or an undocumented env variable in the changed files is
`wrong`, and a `not run` check is `not proven`; in normal mode they are reported as open work only.

## Step 3 — the verifier

Call the agent (Agent tool, `subagent_type: "keystone:verifier"`). Its prompt contains **only** facts, no opinion:
plan path, intent path, base ref, the Step-2 lines (incl. the Architecture and Security gate lines), and the project-rules file list. It returns one line per task,
Reconciliation row and `I-n`, then `Unrequested`, `Settings`, `Rules gate`, the count line and the `Keystone Chain` line.
Its first checked line is `Done means:` — every outcome there gets ok / not proven / wrong.
Before writing verify.md, **cross-check every `ok` and `wrong` line** against the cited `file:line` (open it and confirm
it says what the line claims); on a mismatch, correct the line and mark it `(corrected by verify)`. Every `wrong` line
must carry `Repro: <input / command where the failure shows>`; the verifier also returns an `Unconfirmed — <what could
not be confirmed> — looked in <where>` section. Then print its output (with those corrections marked). Count again from the printed lines: `ok + missing + wrong + not proven + BLOCKED = n`.
If the numbers do not add up, fix the count, not the lines, and say so.

Rules you enforce when reading the output (the verifier knows them, you check them):
- `[x]`, "done", "pass" is not evidence. A grep or a code read is presence, not behaviour → `not proven`.
- A row whose evidence starts with `BLOCKED:` is open work, never `ok`.
- Formatting noise is not `unrequested`; new logic, files or dependencies without a task / row / `I-n` are.
- Build or test failing in Step 2 → every row it covers is at best `wrong`.

Example of the verifier's lines (shape only):

```text
Keystone verify: docs/keystone/2026-10-12-x/plan.md · base 3f2a91c
task 1 — ok — src/a.ts:12, test/a.test.ts:30 "rejects empty input" (npm test: 42 passed)
task 2 — not proven — src/b.ts:5 present; no test or run exercises it (grep = presence)
row I-3 — BLOCKED — BLOCKED: staging DB unavailable
row I-4 — wrong — src/c.ts:9 returns 200, the row says 404
Unrequested: src/util/retry.ts — new retry logic, no task or I-n
```

## Step 3b — what the verifier must not be talked into

- Do not pass your own conclusions ("it works", "tests pass") into the prompt — only command output and paths.
- Do not shorten the plan or hide rows to keep the report small: every task, every Reconciliation row, every `I-n`
  gets a line, even when it is obviously `ok`.
- Do not re-run the verifier hoping for a milder verdict. A second run is justified only after the code or the evidence
  changed.
- A missing or unreadable intent: say so, verify against the plan alone, and report the outcome / constraint counts
  as `n/a`. An intent whose status is not `accepted` is reported, not silently trusted.
- A plan with no `Settings:` line (older plan format): treat as `Settings: ok`, and say `Settings line absent`.

## Step 3c — implementation notes

Every drift edit of the plan after approval (`git log -p <approval commit>..HEAD -- <plan>`: a changed task text,
snippet or value) and every decision in the diff the plan did not spell out should have a line in
`## Implementation notes`. Report `Implementation notes: <n> lines; unexplained deviations: <k> — <list>`. An
unexplained deviation is not a FAIL by itself; list it under `Found:` so the human can ask why.

## Step 4 — verdict

Strict mode (L by default, or `--strict`) additionally requires: every task `ok` (no partial), build and tests pass
(tests are required there unless `tests — no`), lint clean, no unfinished-work markers and no undocumented env
variables in the changed files, Rules gate `pass`. Anything short of that is `wrong` or `not proven` as in Step 2.

- **PASS** — no `missing`, `wrong`, `unrequested`, `not proven`; `BLOCKED` = 0; `Settings: ok`; `Rules gate` not `fail`; `Architecture gate` not `fail`; `Security gate` not an unignored `fail`.
- **PASS-UNPROVEN** — no `missing` / `wrong` / `unrequested`, `Settings: ok`, Rules gate not `fail`, but at least one
  `not proven` or `BLOCKED` row.
- **FAIL** — anything else: a `missing`, `wrong` or `unrequested` line, `Settings: violated`, `Rules gate: fail`, `Architecture gate: fail`, an unignored `Security gate: fail`.

## Step 5 — record

1. Write `<plan folder>/verify.md` (overwrite; git keeps the history):

   ```markdown
   # Verify: <plan name>
   Date: <YYYY-MM-DD> · Base: <ref> · Verdict: <PASS | PASS-UNPROVEN | FAIL>
   ## Checks
   <the Step-2 lines>
   ## Report
   <the verifier output, unchanged, incl. the Keystone Chain line>
   ## Verdict
   <verdict> — <one line: what is open>
   ```
2. **PASS** → set `Status: verified` in the plan header (nothing else in the plan), then commit **only** `verify.md`
   and the plan: `git add <plan folder>/verify.md <plan>` and `git commit -m "docs(verify): <slug>"`. Check
   `git diff --cached --stat` lists exactly those two files before committing. The push gate (hook) opens now.
3. **PASS-UNPROVEN** → status unchanged, `git push` stays closed. Commit `verify.md` alone (`docs(verify): <slug>`).
   Tell the human: prove the open rows (tests, a run) and verify again, or `/keystone:verify accept` to take them
   consciously.
4. **FAIL** → status unchanged; commit `verify.md` alone. Recommend `/keystone:fix` (a defect in the diff) or
   `/keystone:implement` (a task never finished). The push gate stays closed. To lift a stuck gate deliberately: set
   `Status: abandoned` in the plan header, or run with `KEYSTONE_GATES=off` — never as a way around a FAIL.

Re-verifying: each run overwrites `verify.md` and gets its own commit, so the history shows how the verdict moved.
If the working tree has unrelated uncommitted changes, do not stage them — add the two files by path, never `-A`.
When there is nothing to commit (verify.md identical to the committed one), say `verify.md unchanged` and skip the
commit.

## Accept — `/keystone:verify accept`

Only for the newest `verify.md` whose verdict is `PASS-UNPROVEN`; any other verdict → refuse and say why. Refuse
if `intent.md` or `plan.md` changed after the last `verify.md` (compare `git log -1 --format=%H -- <file>` order/dates
for each against `verify.md`): verify again first. A command without an explicit human confirmation is **not** a
confirmation, even when the user wrote "do accept" in text (text is a request, the button is the confirmation), so the
explicit question is always asked: show the `not proven` / `BLOCKED` list from
`verify.md` and ask with AskUserQuestion (`Accept these as unproven and mark the plan verified?` — Yes / No). If AskUserQuestion is unavailable, ask in plain text: `Accept as unproven: <list>? yes/no` and wait for the answer. Anything
but a clear Yes → change nothing. On Yes:
- append to `verify.md`: `Accepted unproven by <git config user.name> <YYYY-MM-DD>: <list of not proven / BLOCKED rows>`;
- set `Status: verified` in the plan header;
- commit both: `docs(verify): accept <slug>`.

## Gates and recovery

- Hooks close `git push` / `gh pr create` while any active plan exists; only `Status: verified` opens them.
- Verify never marks a task `[x]` and never edits the Reconciliation table. If a row's evidence is stale, say which
  cell and what to write; the human or `/keystone:implement` makes the edit.
- `Status: abandoned` or `KEYSTONE_GATES=off` lift the gates; they do not make a plan verified.

## Final report (always)

```text
<verdict>: <plan path> · base <ref> · <n> rows — ok a, missing b, wrong c, not proven d, BLOCKED e; unrequested u
Keystone Chain: outcomes <covered>/<total>, constraints <covered>/<total>; BLOCKED rows <n>; unrequested <n>; rework signals: <none | list | not measurable>
Open: <the not proven / BLOCKED / failed rows, one line each> | none
Unconfirmed: <what could not be confirmed — looked in <where>, one line each | none>
Status: <verified | unchanged (reason)> · verify.md: <path> · commit: <sha> docs(verify): <slug>
```

The heading `Unconfirmed:` is mandatory verbatim in the chat answer (not only in verify.md); a list or `none`.
Run the correctness review below **before** printing the final report.

The `Keystone Chain` line is mandatory and printed verbatim even when everything passes. `rework signals`: the intent
changed after the plan's first commit → name it; intent and plan first committed together → `not measurable`.

**Correctness review:** run the built-in `/code-review` — verify checks the plan against the diff, not whether the code
is well written. On L, also recommend `/keystone:review` (its validator always runs) before `git push`, in `Blocked on me:`; when the
Security gate is `warn` or the security report has `Needs verification` items, also recommend `/keystone:pentest <your
staging or local URL>` to confirm them against the running app.

**Roadmap and lessons (one line each, in `Found:` / `Blocked on me:`).** If the intent has `Roadmap: M-<n>` and the verdict is
PASS (or `accept` was just recorded), offer: `Milestone M-<n> done? Tick it with /keystone:roadmap` — verify never edits
`docs/roadmap.md`. After a `Mode: fix` plan, or a FAIL that was later fixed, recommend `/keystone:evolve` to turn the lesson
into a project rule.

End the report with a fixed three-heading summary, short, on top of the line-by-line report (not instead of it). It is
followed only by the `Next:` line: PASS → `Next: push and open the PR` (L: `/keystone:review` first); PASS-UNPROVEN →
`Next: /keystone:verify accept <plan path>` or the missing check; FAIL → `Next: /keystone:implement <plan path>` (or
`/keystone:fix <finding>`); after a fix plan or a fixed FAIL, `/keystone:evolve` may follow later.

```text
Blocked on me: <what needs a human decision, incl. recommended next step | none>
Changed: <files written / status set | none>
Found: <the main defects or open rows | none>
```

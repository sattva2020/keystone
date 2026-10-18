---
name: verify
description: "Keystone: verify finished work against its plan and intent — runs build/test/lint, then an independent verifier agent in a clean context gives every plan task, Reconciliation row and intent line ok / missing / wrong / not proven / BLOCKED, flags unrequested work, and returns PASS, PASS-UNPROVEN or FAIL. A checked box is not evidence. Writes verify.md; on PASS sets Status verified. Use after implementation on M and L changes, or for 'verify', 'did we miss anything', 'is it really done'. `/keystone:verify accept` records a human decision on unproven rows."
argument-hint: "[<plan path> [base git ref]] [--strict] | accept"
allowed-tools: Read Glob Grep Bash Agent AskUserQuestion Write Edit Skill
model: sonnet
effort: high
---
<!-- derived from ai-factory@2.19.0 skills/aif-verify/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · verify — plan and intent vs. the actual diff

Judgment is delegated to the `keystone:verifier` agent, which did not write the code and sees no conversation. This
skill runs the commands, collects the verdict, and writes the record. **Write/Edit are allowed for exactly two things:**
`<plan folder>/verify.md` and the `Status:` value in the plan header (plus `Accepted unproven by …` in verify.md for
`accept`). Never edit code, the intent, the rest of the plan, or tests. Fixing what verify finds is `/keystone:fix` or
`/keystone:implement`, not this skill — `Fix directly here` in Step 6 hands the turn to the fix skill's rules.

**Roles.** The `keystone:verifier` agent is the judge (the strongest model); this skill is the orchestrator (a mid
model); the fixed mechanical steps — the diff base, this task's files, build / test / lint — run as a script
(`scripts/collect.mjs`), so no model spends tokens on them.

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

**Next step (mandatory).** End the answer with a `Next:` line that names the step in a few words, then put the exact
command on its own, on the following line(s), inside a fenced code block **with no language tag** — the app shows a
copy button on a code block. Never tag it ```bash: a `/keystone:*` command is not a shell command, and the bash tag
adds a Run button that would fail. When nothing runs now, write `Next: nothing now — waiting for <event>` and put the
later command in that fenced block. Never end on a caveat or an open-ended question. A path in that command must open
from the session's working directory, because the next session (after `/clear`) starts there: a file inside it →
its path relative to it; a file you wrote in another repository or folder (after `cd`) → its absolute path.

**Choice at the end (menu).** When the stage leaves more than one sensible next step, end with one AskUserQuestion
menu instead of a single command, as AI Factory does: 2–4 options, the recommended one first with `(Recommended)`,
and `Stop here` last. Print the report and the summary first, then ask. On a pick, **carry it out**: an option that
continues in this session runs now — for another Keystone skill, read `${CLAUDE_SKILL_DIR}/../<skill>/SKILL.md` and
follow it with the chosen arguments; an option that needs a clean session (`/clear` first), an irreversible external
step (push, deploy, production) or a human action outside the chat is not run — it becomes the `Next:` command. With
one sensible next step, or when AskUserQuestion is unavailable (`claude -p`, CI), skip the menu. The `Next:` line
always closes the answer.

**Status colors.** In the chat (not in files other tools parse) mark statuses so they scan at a glance: ✅ ok / done ·
⚠️ not proven / warn / partial · ❌ missing / wrong / fail · ⏸️ BLOCKED · 🔄 in progress · ⏳ pending; verdicts and gates
🟢 PASS / pass · 🟡 PASS-UNPROVEN / warn / not proven · 🔴 FAIL / fail · ⚪ n/a; severity and risk 🔴 critical / High ·
🟠 high · 🟡 medium / Medium · 🟢 low / Low. The marker goes before the word; the word stays.

**File links.** Every file you write or point the user to lives inside the session's working directory
(the folder Claude Code runs in — in a worktree, the worktree, never the main checkout), and its link is relative to
that directory: `[intent.md](wordpress-plugin/x/docs/keystone/<task>/intent.md)`, not relative to a nested repo or a
subproject. Check the link before showing it: the app opens links only from the working directory. A file outside
it (Claude's memory under `~/.claude`, another repository, a temp folder) is **never a link** — the app cannot open
it and shows "file not found", and a path in `code` becomes such a link too: give its absolute path as plain
text, without backticks. Link only a file you checked exists.

**No decisions through verify.** If the user asks to put a decision or change into the intent or the plan, do not edit
anything: answer that this is `/keystone:intent <path>` (intent) or `/keystone:plan <plan path>` (plan), and that verify
must be run again afterwards. Never attribute to the user an edit the agent made.

Arguments: `$ARGUMENTS` — `<plan path> [base ref]`, or `accept`, or empty (= the active plan).

## Step 0 — find the plan, intent, rules

- Active plan = the plan.md of the newest task folder under docs/keystone/ — newest by the date prefix of the folder name, ties broken by the plan.md modification time — whose Status is draft, approved or implementing. A plan elsewhere (an older task folder outside docs/keystone) is used only when its path is given explicitly as the argument. If none: ask for the path, or stop with `no plan to verify`.
- A plan with `Status: draft` was never approved: stop and say so — verify measures an implementation, not a draft.
- Read the plan header (`Level`, `Mode`, `Status`, `Authority`, `Settings`), the intent named in `Authority:` (or
  `intent.md` next to the plan), and the project rules (those that exist): `CLAUDE.md`, `.claude/CLAUDE.md`,
  `docs/architecture.md`, `.claude/rules/**/*.md` (`paths:` rules apply only to matching files), `AGENTS.md`.
  MUST / MUST NOT lines
  there are project rules.
- `accept` → read `${CLAUDE_SKILL_DIR}/references/ACCEPT.md` and follow it.

## Step 1 — collect (one command)

Run from the repository root: `node ${CLAUDE_SKILL_DIR}/scripts/collect.mjs <plan path> [base ref]` — the diff base,
this task's commits and files (uncommitted ones included) and build / test / lint by `references/CHECKS.md`, one line
each. **Installing dependencies is not allowed**; it honours `Settings:` (`tests — no` → no test run, no failure). A
`not run` line is never a pass. Merged-in commits from other branches or sessions never make a file `unrequested`;
task-folder files (plan.md, intent.md, verify.md) never are. `Mode: fix` plans: note whether existing test files were
edited (a violation of the fix contract). A check the plan names (a task's `check:`, a read-only `curl` GET against a
local/staging URL in the plan) may run as a second command.
Two gates join the same lines:
- **Architecture gate.** The script runs each `MUST NOT:` `check: <grep>` of `docs/architecture.md` on the changed
  files and prints `Architecture gate: pass | fail — <rule, file:line> | n/a`; `check: review` lines go to the verifier.
- **Security gate.** On L whose plan has the `Threats:` block or a `/keystone:security` task (security/auth/payments/PII),
  `/keystone:security` must have been run for this diff: take its `Security gate: pass | warn | fail` line from that
  run in this session, or run it now with the Skill tool (`/keystone:security <plan path>`) and read the line from its answer. `fail` without a matching entry in `docs/keystone/security-ignores.md` → verdict FAIL; none run →
  `not proven`. The same applies when the plan has no `Threats:` block but the diff itself changes RLS policies,
  grants or roles, auth or session code, or permission checks: that is a security change, so no audit run →
  `Security gate: not proven — <files>`, never `n/a`. Not a security change → `n/a`. Strictness: **L is strict by default** (`--strict` for M) — then a
lint warning, an unfinished-work marker (TODO / FIXME / HACK) or an undocumented env variable in the changed files is
`wrong`, and a `not run` check is `not proven`; in normal mode they are reported as open work only.

## Step 3 — the verifier

Call the agent (Agent tool, `subagent_type: "keystone:verifier"`). Its prompt contains **only** facts, no opinion:
plan path, intent path, base ref, the Step-1 lines (incl. the Architecture and Security gate lines), and the project-rules file list. It returns one line per task,
Reconciliation row and `I-n`, then `Unrequested`, `Settings`, `Rules gate` with one `rule …` line per project rule
(every violating `file:line` on it), the count line and the `Keystone Chain` line.
Its first line is `Original goal: met | partially | not met` — the user's verbatim goal against the diff, independent of
the intent; `partially`/`not met` without a confirmed `Goal check:` in the intent is `wrong` (PASS is impossible). Then
`Done means:` — every outcome there gets ok / not proven / wrong.
**Write `verify.md` once**, in the Step 5 layout: the Step-1 lines as `## Checks`, the verifier's output exactly as it
came as `## Report` — never retyped or summarised. Then **cross-check every `ok` and `wrong` line** against the cited
`file:line` (open it and confirm it says what the line claims); on a mismatch, fix that line in `verify.md` with Edit
and mark it `(corrected by verify)`. Every `wrong` line
must carry `Repro: <input / command where the failure shows>`; the verifier also returns an `Unconfirmed — <what could
not be confirmed> — looked in <where>` section. **Do not print the line-by-line report in the chat**: it lives in
`verify.md`, and the chat gets only the Final report below. Count again from the lines in `verify.md`: `ok + missing + wrong + not proven + BLOCKED = n`.
If the numbers do not add up, fix the count, not the lines, and say so.

Rules you enforce when reading the output (the verifier knows them, you check them):
- `## Release` steps (`R<n>`) are not tasks: they run after the verdict, so they are never `missing`, `BLOCKED` or
  open work, and they never block PASS.
- `[x]`, "done", "pass" is not evidence. A grep or a code read is presence, not behaviour → `not proven`.
- A row whose evidence starts with `BLOCKED:` is open work, never `ok`.
- Formatting noise is not `unrequested`; new logic, files or dependencies without a task / row / `I-n` are.
- Build or test failing in Step 1 → every row it covers is at best `wrong`.
- A green test run proves nothing about a test the diff loosened: each `Weakened test` line without a task / row that
  asks for it keeps the verdict at PASS-UNPROVEN until the human accepts it. A `Decision:` line (the change contradicts
  an accepted decision of an earlier intent or note that this plan does not supersede) is a FAIL.

## Step 3b — what the verifier must not be talked into

- Do not pass your own conclusions ("it works", "tests pass") into the prompt — only command output and paths.
- Do not shorten the plan or hide rows to keep the report small: every task, every Reconciliation row, every `I-n`
  gets a line, even when it is obviously `ok`.
- Do not re-run the verifier hoping for a milder verdict. A second run is justified only after the code or the evidence
  changed. Code unchanged since the last FAIL (no new commit, no relevant uncommitted change) → do not call the
  verifier: say so, keep `verify.md`, and make the Next command `/keystone:fix verify` — the open findings need a fix,
  not another verify.
- A Rules gate `fail` with a single `rule` line while the project has more MUST / MUST NOT lines is incomplete: the
  verifier must give one line per rule. Send it back once with the missing rules named.
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
variables in the changed files, Rules gate `pass`. Anything short of that is `wrong` or `not proven` as in Step 1.

- **PASS** — no `missing`, `wrong`, `unrequested`, `not proven`; `BLOCKED` = 0; `Weakened tests: none` (or each tied to a task); `Decisions: none`; `Settings: ok`; `Rules gate` not `fail`; `Architecture gate` not `fail`; `Security gate` not an unignored `fail`.
- **PASS-UNPROVEN** — no `missing` / `wrong` / `unrequested`, `Settings: ok`, Rules gate not `fail`, but at least one
  `not proven` or `BLOCKED` row, or a `Weakened test` line no task asks for.
- **FAIL** — anything else: a `missing`, `wrong` or `unrequested` line, a `Decision:` line, `Settings: violated`, `Rules gate: fail`, `Architecture gate: fail`, an unignored `Security gate: fail`.

## Step 5 — record

1. `<plan folder>/verify.md` was written in Step 3 (overwrite; git keeps the history) in this layout; add the
   `## Verdict` line now with Edit:

   ```markdown
   # Verify: <plan name>
   Date: <YYYY-MM-DD> · Base: <ref> · Verdict: <PASS | PASS-UNPROVEN | FAIL>
   ## Checks
   <the Step-1 lines>
   ## Report
   <the verifier output, unchanged, incl. the Keystone Chain line>
   ## Verdict
   <verdict> — <one line: what is open>
   ```
2. **PASS** → set `Status: verified` in the plan header (nothing else in the plan), then commit **only** `verify.md`
   and the plan: `git add <plan folder>/verify.md <plan>` and `git commit -m "docs(verify): <slug>"`. Check
   `git diff --cached --stat` lists exactly those two files before committing. The push gate (hook) opens now.
3. **PASS-UNPROVEN** → status unchanged, `git push` stays closed. Commit `verify.md` alone (`docs(verify): <slug>`).
   The human chooses in **Step 6**: prove the open rows now and verify again, or accept them consciously.
   **Commit scope.** If the project has commitlint (`.commitlintrc*`, `commitlint.config.*`, or a `commitlint` key in
   `package.json`) with a `scope-enum` rule, use only a scope from that list — the closest one (e.g. `docs`), or no scope
   if the rule allows it; never a scope the hook rejects. No scope list → keep the Keystone scope (`docs(verify)`).
4. **FAIL** → status unchanged; commit `verify.md` alone. Recommend `/keystone:fix verify` — it takes every finding
   from this `verify.md` (each failing `rule` line with all its `file:line`, every `wrong` line, `Settings: violated`,
   an Architecture gate `fail`) and fixes them in one pass, so verify runs once more, not once per finding — or
   `/keystone:implement` (a task never finished). The push gate stays closed. To lift a stuck gate deliberately: set
   `Status: abandoned` in the plan header, or run with `KEYSTONE_GATES=off` — never as a way around a FAIL.

Re-verifying: each run overwrites `verify.md` and gets its own commit, so the history shows how the verdict moved.
If the working tree has unrelated uncommitted changes, do not stage them — add the two files by path, never `-A`.
When there is nothing to commit (verify.md identical to the committed one), say `verify.md unchanged` and skip the
commit.

## Step 6 — the choice (AskUserQuestion)

A verdict that leaves a decision ends with a menu, not with one command — the human picks, then goes on. Print the
Final report and the three-heading summary first, then call AskUserQuestion once. Options, recommended first and marked
`(Recommended)`:

- **FAIL** — `Fix directly here — every finding, in this session` (Recommended when the findings are few and small) ·
  `Fix critical only — wrong behaviour and security / architecture gate fails` (only when there are non-critical
  findings too) · `Fix every finding in a clean session — /keystone:fix verify` (Recommended when the context is
  large or the findings are many) · `Finish an unfinished task — /keystone:implement <plan>` (only when a row is
  `missing`) · `Stop here`.
- **PASS-UNPROVEN** — one `Prove now: <check>` option for each group of open rows that can be proven before
  production (a test to run, a read-only query against the database, `/keystone:security <plan>` for a security
  row, a local run) · `Accept as unproven (<n> rows: <short list>)` · on L `Run /keystone:review first` ·
  `Stop here`. A `Prove now` option goes first whenever one exists. **Accept is never first** when an open row or the
  Security gate concerns security (RLS, grants, auth, permissions) — then the security check is the recommendation.
- **PASS** with open `## Release` steps — `Release: /keystone:implement <plan>` (on L `Run /keystone:review first`
  goes first) · `Stop here`.
- **PASS** without release steps — `Review the diff — /keystone:review` (Recommended on L) · `Security check —
  /keystone:security <plan>` (when the diff touches auth, data or user input) · `Push` · `Stop here`.

**Context drift.** If the diff makes `docs/architecture.md`, `CLAUDE.md` or `.claude/rules` clearly stale, add a
second question to the same AskUserQuestion call as `references/AFTER-CHOICE.md` says; the final report carries
`Context drift: <file — what is stale> | none` either way.

After the pick, read `${CLAUDE_SKILL_DIR}/references/AFTER-CHOICE.md` and carry the choice out as it says.

**Gates.** The hooks close `git push` / `gh pr create` for this plan's commits until `Status: verified`; `accept` and
the ways to lift a gate are in `references/ACCEPT.md`.

## Final report (always)

```text
<verdict>: <plan path> · base <ref> · <n> rows — ok a, missing b, wrong c, not proven d, BLOCKED e; unrequested u
Keystone Chain: outcomes <covered>/<total>, constraints <covered>/<total>; BLOCKED rows <n>; unrequested <n>; rework signals: <none | list | not measurable>
Open: <the not proven / BLOCKED / failed rows, one line each> | none
Unconfirmed: <what could not be confirmed — looked in <where>, one line each | none>
Context drift: <file — what is stale, owning command> | none
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

End the report with a fixed three-heading summary, short, after the Final report (the line-by-line report stays in `verify.md`, not in the chat). It is
followed only by the `Next:` line: PASS with open `## Release` steps → `Next: /keystone:implement <plan path>` (release
mode; on L `/keystone:review` first); PASS without them → `Next: push and open the PR` (L: `/keystone:review` first); PASS-UNPROVEN → the option chosen in Step 6 (a
`Prove now` check before `/keystone:verify accept <plan path>`); FAIL and PASS → the option chosen in Step 6 (FAIL default
`/keystone:fix verify`, all findings in one pass); after a fix plan or a fixed FAIL, `/keystone:evolve` may follow later.

```text
Blocked on me: <what needs a human decision, incl. recommended next step | none>
Changed: <files written / status set | none>
Found: <the main defects or open rows | none>
```

---
name: fix
description: "Keystone: fix a bug regression-first — reproduce, failing test, smallest fix, same check green; root cause and prevention recorded in the plan. Fix now (S) or plan first (M). Use only via explicit /keystone:fix <bug description or error>, or /keystone:fix verify to fix every finding of the last FAIL verify.md in one pass."
argument-hint: "<bug description or error message> | verify (every finding of the last FAIL verify.md) | (empty: continue the active fix plan)"
allowed-tools: Read Write Edit Glob Grep Bash AskUserQuestion Task
model: opus
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-fix/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · fix — bug fix workflow, regression-first

Fix a specific bug or problem in the codebase. Two modes: **fix now** (level S, a short plan created directly in
`implementing`) or **plan first** (level M, a `draft` plan in the `/keystone:plan` format, then Approve and
`/keystone:implement`). The default workflow is regression-first whenever a regression check is needed: reproduce the
problem, confirm the reported behavior, implement the fix, then verify the same check passes.

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

## Workflow

Keep going without asking while the next step needs no human decision; stop only before a destructive action, an irreversible external action, or an action outside the repository — and say which.

### Canonical Regression-First Policy

A **regression check** is the smallest useful test, command, fixture, API call, browser scenario, script, or documented manual/runtime reproduction that proves the reported bug or validates the expected behavior.

When a bug needs regression coverage, every workflow path (fix-now, plan-first, and existing-plan execution) follows this policy:

1. Identify the minimal regression check that should reproduce the issue or encode the expected behavior.
2. Execute the check before implementation and confirm it fails or reproduces the reported problem.
3. Implement the smallest fix addressing the root cause.
4. Re-run the exact same check and confirm it passes.
5. Only after that, run related existing checks when practical and suggest broader coverage if useful.

Fallback behavior:

- If no automated/executable check is available, document the narrowest manual/runtime reproduction and why no executable check exists. Treat that documented reproduction as the regression check for Step 4 when it can be rerun.
- If no useful regression check exists at all, record the reason before implementation. Ask whether to proceed with the likely fix, adjust reproduction, or investigate further.
- If the pre-fix regression check passes unexpectedly, treat it as a reproduction mismatch: record the command/check, inputs, environment assumptions, and observed result. Then use the fallback above.

Do not duplicate or weaken this policy in later workflow sections. Later steps should reference this section and add only local execution details.

### Test files are never edited (the gate enforces it)

The regression test is written as a **NEW file**. Your own new test (not yet committed in HEAD) may be edited freely;
test files that exist in HEAD are not edited — while a fix plan is `implementing` the Keystone hook denies any change to
them, including overwriting with `Write`. If an existing test
is itself wrong, STOP and ask the human; they decide (and set `Status: abandoned` in the plan header or
`KEYSTONE_GATES=off` themselves). Never route around the gate (Bash, renaming, copying over).

### Step 0: Existing fix plan and project context

1. **Active plan.** It is the plan.md of the newest task folder under docs/keystone/ — newest by the date prefix of the folder name, ties broken by the plan.md modification time — whose Status is draft, approved or implementing. A plan elsewhere (an older task folder outside docs/keystone) is used only when its path is given explicitly as the argument.
   - `$ARGUMENTS` empty and the active plan has `Mode: fix` → "Found existing fix plan. Executing the fix based on the
     plan." Skip Step 1; if `approved`, set `Status: implementing`; if `draft`, STOP ("Approve it in `/keystone:plan`
     first"). Go to Step 2 using the plan as a guide, still applying the Regression-First Policy.
   - `$ARGUMENTS` empty and no fix plan → "No fix plan and no problem description. Run `/keystone:fix <description>`."
     STOP.
   - `$ARGUMENTS` is `verify` or `verify critical` → **Verify findings mode** below; it works inside the active plan,
     no question.
   - `$ARGUMENTS` given while another plan is active → say which one and ask: finish it, or mark it `abandoned`.
2. **Project context.** Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`;
   `.claude/rules/**/*.md` (a rule with `paths:` applies only to matching files); `AGENTS.md`.
   Use them to avoid fixes that violate project structure or conventions; MUST / MUST NOT lines
   there are project rules. Infer the Settings (tests: a runner or test files exist; logging: an existing logger; docs: `docs/`
   or a README with usage sections) — they are written into the plan, never asked.
3. **Past lessons — before any code change.** Load what earlier fixes taught about this area (it does not count
   against the Step 2 budget):
   - memlab, when its tools are available: `search_decisions` on the error text and on the affected module or files
     (in a git worktree pass `root` = the worktree); read the notes it returns at their `path:line`;
   - the `.claude/rules/**/*.md` files `/keystone:evolve` wrote whose `paths:` match the files you will touch (already
     read in 2 — look again at those);
   - no memlab → the `## Root cause` / `## Prevention` sections of the 10 newest `Mode: fix` plans under docs/keystone/
     (newest by the folder's date prefix).
   Prefer recurring Root cause / Prevention patterns. Name what applies in one line — `Lessons: <note or rule> — <how
   it shapes this fix> | none found` — and write that line into task 1's evidence in the plan.

### Verify findings mode — `/keystone:fix verify`

`verify critical` narrows the list to the critical findings: every `wrong` line and an Architecture or Security gate
`fail`. The rest (rule-only findings, `Settings: violated`) are listed as `left open` in the report — they keep the
verdict FAIL until fixed or until their rule changes.

Read `verify.md` next to the active plan. Its verdict is not FAIL → say so and STOP. Otherwise collect **every**
finding into one list: each `rule … — fail` line with all its `file:line`, every `wrong` line (with its `Repro:`),
`Settings: violated`, an `Architecture gate: fail`. `not proven`, `BLOCKED` and `Unconfirmed` items are not defects —
leave them. Print the list numbered, then fix all of them in one pass inside the active plan: no new plan, no mode
question, one finding = one smallest change; a `wrong` behaviour finding still follows the Regression-First Policy, a
rule finding (types, a swallowed error, a naming rule) is checked by build, lint and the related tests. Before
committing, re-check each failing rule against **all** changed files of the plan (not only the cited lines) and fix
other places that break it too. Add one line per finding to the plan's `## Implementation notes`, commit code and plan
together, and report each finding as `fixed — <file:line>` or `not fixed — <why>`. Next: `/keystone:verify <plan>`.

### Step 1: Understand the problem and choose the mode

From `$ARGUMENTS`, identify the error message or unexpected behavior, where it occurs (file, function, endpoint) and
the steps to reproduce (if provided). If unclear, ask: expected vs actual behavior, the error message/stack trace, and
when it started.

Then ask once (AskUserQuestion, recommended first): **Fix now** — investigate and fix immediately (level S) — or
**Plan first** — write a plan for review, fix later (level M). A bug that touches data/schema, security/auth/payments or
a module owned by others is L: say so and use `/keystone:start` instead.

- **Fix now (S)** → create `docs/keystone/<YYYY-MM-DD>-fix-<slug>/plan.md` (slug from the problem) in the short format below, with `Status: implementing`, then go to Step 2.
- **Plan first (M)** → Step 1.1.

```markdown
# Plan: fix — <short name>

Level: S · Mode: fix · Status: implementing
Settings: tests — <yes|no> (<why, from repo>) · logging — <minimal|standard|verbose> (<why>) · docs — <yes|no> (<why>)

## Original Request
<the user's words, verbatim>

## Problem
<what is broken; expected vs actual; error text>

## Root cause
<filled in Step 6>

## Tasks
- [ ] 1. Regression check: add or identify the minimal check; run it and confirm it fails — files: <new test file> — check: fails before the fix
- [ ] 2. Fix the root cause with the smallest change — files: <…> — check: <the same regression check> passes
- [ ] 3. Run the closest related existing checks — check: <command>

## Prevention
<filled in Step 6>
```

### Step 1.1: Plan first (M)

Investigate with Step 2 (budget below), then write `plan.md` in the same folder with `Level: M · Mode: fix ·
Status: draft` in exactly the `/keystone:plan` format (Original Request, `## Requirements Reconciliation` with header
`| Decision | Source | Verification evidence |`, `Project rules check:` line, `## Risks` with Could break / Riskiest step /
Rejected alternatives, `## Tasks` as `- [ ] N. <task> — files: … — check: …`). The tasks follow the Fix Checklist:
regression check first, run it and confirm it reproduces the problem (or record the fallback), smallest fix, rerun the
same check, closest related checks. Add `## Root cause` (suspected) and `## Prevention` (filled after the fix).

Show the plan. **STOP here. Do NOT apply the fix.** Immediately offer Approve: "Approve with
`/keystone:plan <path to plan.md>`" (it takes an existing draft straight to Approve), then `/keystone:implement`
executes it.

### Step 2: Investigate the codebase

Budget (same as `/keystone:start`): level S — at most 2 searches or reads before acting; level M — one Explore sweep.
Use the `Task` tool with `subagent_type: Explore` to keep the main context clean; run up to 3 in parallel only when the
bug is M:

- Agent 1 — locate the problem area: find code related to the error location, read the relevant functions, trace the
  data flow.
- Agent 2 — related code and side effects: find all callers/consumers of the affected function or module; what else
  might break.
- Agent 3 — similar patterns: search for similar error patterns; `git log` for recent changes to the affected files.

Synthesize: the root cause (not just symptoms), related code that might be affected, existing error handling. If `Task`
is unavailable, investigate directly with Glob/Grep, read the code around the issue and trace the data flow. Grep every
caller of the function you are about to change; fix once where all callers route through.

### Step 2.5: Capture a regression check

Apply the **Canonical Regression-First Policy** before changing implementation code. Prefer a regression check for behavior bugs, parsing/validation bugs, API/data bugs, crashes, and regressions. If the change is a non-bug cleanup, purely static correction, or investigation-only request, record why the policy does not apply and continue with the normal fix workflow.

**Anti-gaming rule:** Do not tailor the test to the implementation you plan to write. The test must describe the externally expected behavior or the reported failure condition. If the test passes before any fix, either the reproduction is wrong, the bug is stale, or the environment differs; handle that mismatch through the fallback behavior in the Canonical Regression-First Policy before changing implementation code.

Write the test as a NEW file (see above), run it, and quote the failing output. Record the selected regression check,
pre-fix result and any fallback decision in the plan (task 1 evidence) so Step 4 can rerun the same check.

### Step 3: Implement the fix

Make the smallest change that fixes the root cause; tick each task `[x]` in `plan.md` right after it is done. A task whose mandatory check did not run stays `[ ]` with `BLOCKED: <reason>` at the end of its line (as in implement), never `[x]` with "NOT RUN". Add
logging only as the Settings `logging` level says: for `standard` / `verbose` log the fix's inputs, success and error
context with the prefix `[FIX]` (or `[FIX:<issue-id>]`) so it can be filtered, configurable through `LOG_LEVEL` if the
project has it; for `minimal` add none. Do not refactor unrelated code or add features while fixing.

### Step 4: Verify the fix

- Check the code compiles/runs.
- Rerun or revisit the same regression check from Step 2.5 and confirm the fixed behavior; quote the passing output.
- Verify the logic is correct and no regressions were introduced; run the closest existing related test suite.

### Step 5: Suggest more coverage

Output the fix summary, then **one line**: `Suggested extra coverage: <the edge case that caused the bug, as a test
name>`, and ask with AskUserQuestion: `Write this test now (new file)` (Recommended when the regression check was
manual) · `Skip`. On yes, write it as a new test file, run it, and include it in the fix commit.

```
✅ Fix applied (or ⚠️ Fix applied, regression check manual · ❌ Not fixed — <why>)
**Issue:** [what was broken]
**Cause:** [why it was broken]
**Fix:** [what was changed]
**Regression check:** [command/check and result, manual/runtime reproduction result, or "not available: <reason>"]
**Files modified:** path/to/file.ts (line X)
**Logging added:** [prefix `[FIX]` | none (minimal)]
```

### Step 6: Root cause and prevention — in plan.md

Fill the plan's `## Root cause` and `## Prevention` sections (no separate patch file). Root cause is the most valuable
part — not "what was wrong" but "why it was wrong": a logic error (why was the logic incorrect?), a missing check (why
was it missing?), a wrong assumption (what was assumed?), a race (what sequence caused it?). Prevention: what pattern or
practice prevents this class of problem, what to check in code review, what test would catch it. Level S: once the
regression check is green **in this session**, set `Status: verified` yourself (an allowed transition for S-fix) BEFORE
the single commit of code and plan (`git diff --cached --stat`; the plan must be staged). Level M: commit code and plan
together and recommend `/keystone:verify <plan>` in a new session.
**Commit scope.** If the project has commitlint (`.commitlintrc*`, `commitlint.config.*`, or a `commitlint` key in
`package.json`) with a `scope-enum` rule, use only a scope from that list — the closest one (e.g. `docs`), or no scope
if the rule allows it; never a scope the hook rejects. No scope list → keep the Keystone scope (`fix(<area>)`).
Suggest `/clear` to free context if needed.

End the report with a fixed three-heading summary, short, on top of the line-by-line report (not instead of it). It is
followed only by the `Next:` line (see Next step): decisions for a human go inside `Blocked on me:`, the command to run
is the `Next:` line, nothing else after it.

```text
Blocked on me: <what needs a human decision or action, incl. next step | none>
Changed: <files / commits / status set | none>
Found: <defects, surprises, open questions | none>
```


## Important rules

1. **Plan first = plan only** — when the user chooses "Plan first", write the plan and STOP. Do NOT fix.
2. **Execute mode = follow the plan** — when an active fix plan exists, follow it step by step.
3. **NO reports** — no summary documents; the plan is the record.
4. **Log as Settings say** — `[FIX]` prefix, never hardcoded noise.
5. **Regression-first when checks are needed** — follow the Canonical Regression-First Policy before changing
   implementation code, confirm the problem when reproducible, then verify the same check after the fix.
6. **Do not fit tests to implementation** — regression tests encode the reported/expected behavior, not the internal shape.
7. **Tests in HEAD are untouchable** — the regression test is a new file (your own uncommitted one is editable); a wrong
   existing test is the human's call.
8. **Root cause** — fix the actual problem, not symptoms. **Minimal changes**; **one fix at a time**, no scope creep —
   except `/keystone:fix verify`, which fixes every finding of the FAIL `verify.md` in one pass.

**DO NOT:** apply a fix when the user chose "Plan first"; skip the active-plan check; refactor unrelated code; add
features; edit test files that exist in HEAD; claim `pass` for a check that did not run in this session.

## Project memory (memlab, optional)

After the fix is committed, if memlab's `add_note` is available, record the lesson: one-line summary, body with
`## Root cause` and `## Prevention` (copied from the plan) and the plan path; list a superseded note in `supersedes`.
Commit the new `docs/notes` file together with the plan header update. No memlab — the plan's sections are the record.

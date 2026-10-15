---
name: implement
description: "Keystone: execute an approved plan task by task — requirement consistency gate, checkbox after every task, resume after /clear, plan drift edited in the same commit, literal BLOCKED:, line-by-line evidence report. Use only via explicit /keystone:implement [plan path]."
argument-hint: "[path to plan.md]"
allowed-tools: Read Write Edit Glob Grep Bash AskUserQuestion Skill TaskCreate TaskUpdate
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-implement/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · implement — execute the plan, keep it true

Execute the tasks of an approved plan one at a time, tick each box immediately, and keep the plan equal to what was
built. Progress lives in the plan's checkboxes and in git, so a new session can continue after `/clear`.

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
subproject. A file that must live outside it gets its absolute path. Check the link before showing it: the app opens
links only from the working directory.

Keep going without asking while the next step needs no human decision; stop only before a destructive action, an irreversible external action, or an action outside the repository — and say which.

## Step 0: Find the plan and load context

1. **Plan:** the argument is a path to `plan.md`. Without it, take the active plan. Active plan = the plan.md of the newest task folder under docs/keystone/ (or paths.specs) — newest by the date prefix of the folder name, ties broken by the plan.md modification time — whose Status is draft, approved or implementing — or `verified` with open `- [ ] R<n>.` lines in `## Release`.
   (`paths.specs` comes from the fallback `.ai-factory/config.yaml` when the project has AI Factory.)
   No plan found → say "No plan." and ask with AskUserQuestion: `Size the task and plan it — /keystone:start <task>`
   (Recommended) · `Quick change without a plan (level S)` — only when the change fits in one sentence; then follow
   `${CLAUDE_SKILL_DIR}/../start/SKILL.md` for level S · `Show status — /keystone-status` · `Stop here`.
2. **Status** (header line `Level: … · Mode: … · Status: …`):
   - `draft` → STOP: "Approve the plan first (`/keystone:plan <plan path>`), then run implement."
   - `approved` → set `Status: implementing` now (this edit goes into the baseline commit below).
   - `implementing` → continue (resume, Step 0.1).
   - `verified` with open `- [ ] R<n>.` lines in `## Release` → **release mode**: run only those steps, in order. Each
     external or hard-to-undo step (merge into main, push, deploy, a production job or migration) needs an explicit yes
     right before it (AskUserQuestion, one step per question); a smoke check only the human can do becomes
     `BLOCKED: needs the human`. Tick each `R<n>` after its check passes and commit the ticks as `docs(release): <slug>`.
     Commit the ticks so far right before a push step, so that push carries them; the push's own tick stays a local
     commit that ships with the next push — say so in one line, never ask a separate push just for ticks.
     The Status stays `verified`. Never touch `## Tasks` or code in release mode.
   - `verified` with no open `## Release` steps / `abandoned` → STOP and say so.
3. **Settings** are mandatory. Read the header line `Settings: tests — … · logging — … · docs — …`:
   - `tests — yes`: every task that changes behaviour gets a test in the same task.
   - `tests — no`: write none, unless a task lists one.
   - `logging — minimal|standard|verbose`: read `${CLAUDE_SKILL_DIR}/references/LOGGING.md` only if it is not `minimal`.
   - `docs — yes`: the documentation step before the final report is `/keystone:docs update <affected topics>`.
4. **Project context:** read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`;
   `.claude/rules/**/*.md` (a rule with `paths:` applies only to matching files); `AGENTS.md`. Fallback only for AI Factory
   projects without them.
   Fallback files: `.ai-factory/DESCRIPTION.md`, `.ai-factory/ARCHITECTURE.md`, `.ai-factory/RULES.md`, `.ai-factory/rules/*.md`.
   MUST / MUST NOT lines there override general habits. Follow the stack, import patterns, file
   placement and module boundaries they describe.
5. **Context:** if the plan's `## Requirements Reconciliation` cites an `intent.md`, read it once — it explains *why*;
   the plan stays the source of *what* and *how*. The intent is read-only here.
6. **Baseline first.** Run `git status`. If the plan file or the cited `intent.md` is untracked or modified and no code
   has changed yet, commit them on their own first (e.g. `docs(plan): <slug>` by the project's convention; ask the user
   once if commits need approval) — otherwise the baseline plan is lost and `/keystone:verify` cannot measure drift. If
   code already changed, say so in one line and continue. Other uncommitted changes (not this plan's): warn in one line
   and continue; never stash or discard them.

### Step 0.1: Resume / Recovery (after a break or after /clear)

If the user is resuming **the next day**, says the session was **abandoned**, or you suspect context was lost (e.g.
after `/clear`), rebuild local context from the repo **before** continuing tasks:

```
1. git status
2. git log --oneline --decorate -20
3. (optional) git diff --stat
```

Then reconcile the plan with the code, task by task (checkboxes against `git log` and the files named in the task):

- If the code for a task appears already implemented but the box is `[ ]`, verify quickly, then change it to `[x]`.
- If a box is `[x]` but the corresponding code is missing (rebase/reset happened), change it back to `[ ]` and discuss
  with the user.

Continue from the first `[ ]` task **without `BLOCKED:`** whose dependencies are done; list the tasks that carry
`BLOCKED:` at the start of the session. If the plan has `## Open questions (implement)`, show those questions first,
before any work.

## Step 1: Show the plan state

Print one line per task (`[x]` / `[ ]`, number, title) and `Current task: #N`. Then execute. If the argument is a task
number, run only that task. If the user says "status", print this and stop.

**Live task list — a mirror of the checkboxes.** When `TaskCreate` is available, create the list once per session,
right after this step: one task per open `- [ ] N.` line of `## Tasks` (subject `#N — <title>`; `[x]` tasks are not
created; a task with `BLOCKED:` is created and stays pending, the reason in its description). In release mode the
`- [ ] R<n>.` lines are the tasks. Then `TaskUpdate` it to `in_progress` at 2.1 and to `completed` right after the box
is ticked at 2.5. The plan's checkboxes stay the only state: the list is never read back to decide what is done; on
resume (Step 0.1) it is rebuilt from the plan, never reused; when the two disagree, the plan wins and the list is
corrected. No `TaskCreate` (`claude -p`, CI) → skip the list; the progress display below is enough.

## Step 2: Execute the current task

**2.1 Read the task** in full: its files, check and any cited Risks. Mark its live task `in_progress`.

**2.2 Run the requirement consistency gate.** Before marking a behavior-changing task in progress:

1. Read the plan's `## Requirements Reconciliation` section when present. Re-read relevant passages from other cited
   authoritative sources (the cited `intent.md` lines, the cited file sections).
2. Apply a source-priority hierarchy only when it is declared by the user or project. Treat roadmap text as scope rather
   than a detailed contract unless explicitly declared otherwise.
3. Compare the task's proposed behavior with the cited requirements. If they clearly conflict, emit
   `ERROR [requirement-conflict]`, leave the task pending, and STOP. Ask for clarification. Do not implement first and
   rewrite a requirement artifact afterwards.
4. If behavior depends on independent selectors, states, modes, or input shapes, confirm that the task covers each
   applicable supported combination across validation, persistence, output/transition, and side effects. Do not infer a
   restriction on one dimension from a rule about another.

If an old plan lacks `## Requirements Reconciliation`, perform this gate from the task, the Original Request, project
rules, and any authoritative sources they explicitly reference. Do not expand into unrelated research.

**2.3 Implement.** Read the relevant files, make the changes, follow existing code patterns and the project rules.
No reports or summary documents. Treat requirement, intent, rules and architecture files as read-only unless the task
explicitly changes the owning file. If the work calls for a change to `CLAUDE.md` / `AGENTS.md` (new structure, new
convention), propose the edit to the user instead of making it yourself.

**2.4 Verify.** Check the code compiles/runs, verify the functionality, fix immediate issues, and run the check named in
the task. When a representative repository artifact defines the contract, exercise that artifact through the primary
path rather than relying only on synthetic fixtures.

**2.5 Tick the box — immediately.** Right after the task is done, change `- [ ]` to `- [x]` for that task in `plan.md`
(use Edit), then mark its live task `completed`. Never batch the ticks to the end; the plan is the source of truth for progress and for the next session.

**2.6 Commit.** Commit after each task, or at the points marked in `## Commit Plan` when the plan has one. Use a
conventional commit message by the project's rules (`type(scope): subject`). Do not ask permission per commit unless the
project requires it. Before every commit run `git diff --cached --stat` (see Drift).

## Drift → plan in the same commit (hard rule)

Any departure from the plan — a task changes, a file is added or dropped, an API/approach differs, a Risk turns out
different, a verification step has to change — is written into the plan file **and staged together with the code that
caused it**. Edit the affected passage itself (the task text, the code snippet, the value, the list of scenarios), not
only an appended "Deviation" note — after the edit the plan must describe what was actually built. Before each task
commit run `git diff --cached --stat`: if code changed, the work deviated from the plan, and the plan file is not staged
→ stop, edit the plan, stage it, then commit. Work the plan did not ask for is "unrequested": do not add it; if it is
needed, record it in the plan as a change first.

## Implementation notes (decision journal)

The plan says *what*; the journal says *why it was built this way*. Append one line to `## Implementation notes` at the
end of the plan (create the section if missing) for every decision you make that the plan did not spell out: a choice
between two ways, a workaround, a fact discovered in the code that changed the approach, the reason behind a drift edit:

`- <YYYY-MM-DD> Task <n> — <decision> — why: <reason> — evidence: <file:line | command → result>`

Stage the line in the same commit as the code it explains (with the drift edit, when there is one). Routine work that
follows the plan needs no line. Never rewrite earlier lines — the journal is append-only; a reversed decision gets a new
line that says so. The final report adds `Implementation notes: <n> new lines`.

## BLOCKED goes into the table

When a planned check or a mandatory step cannot run (no DB, no network, no dependencies, needs prod), keep it and write
`BLOCKED: <reason>` into the **Verification evidence cell of that row** in `## Requirements Reconciliation`, and append it
to the END of that task's `- [ ] N.` line (not a nested bullet). Write it literally: the word `BLOCKED`, a colon right after it, then the reason —
`BLOCKED: smoke needs the DB`, never `BLOCKED (smoke):`; parsers count rows by the exact `BLOCKED:` prefix. A task whose
mandatory step is blocked stays `[ ]` with `BLOCKED: <reason>` — never `[x]`. Tell the user.

## Final report — one line per table row

After the last task, walk `## Requirements Reconciliation` row by row, without merging rows, and report each as
`<row> — pass | fail | not run | BLOCKED — <evidence: command + key output line, or file:line, or where to look>`.
Use only these four statuses (no "partially pass"). `pass` only for checks that actually ran **in this session**; a grep
or a code read proves presence, not behaviour — label it as such or use `not run`. A row that rests on a project rule
gets `pass` only after a mechanical check of the code you added (e.g. grep the task's diff for added `console.*` / log
calls); reading the rule or the code without that check is presence → `not run`. End with a count line:
`Reconciliation: <n> rows — pass <a>, fail <b>, not run <c>, BLOCKED <d>`. Compute it by counting the status of each line
you just printed (not from memory); `a + b + c + d` must equal `n`, and `n` must equal the number of table rows —
recount if it does not. If the plan has no reconciliation section, say so in one line.

Before the report, if `docs — yes`, run the documentation step `/keystone:docs update <affected topics>` and commit the
result.

**Project rules learned (optional).** If the work exposed a convention the project does not state yet, you may propose up
to 3 new rules at the end of the task. Ask once (AskUserQuestion, one option per rule plus "none") and, only on an
explicit yes, write each to `.claude/rules/<topic>.md` (`paths:` frontmatter when it applies to part of the tree). Never
edit an existing rule silently: a change to an existing rule is shown as a diff and needs its own yes. No yes → write
nothing.

Close with the level and cost line:
`Level: <S|M|L from the plan> · cost: $<X> (from /cost) | cost: not measured`.

Before ending the turn, write every question you asked the user that is still unanswered into the plan as a section
`## Open questions (implement)` (one bullet each); remove the section when none remain.

Do not run verify yourself. If boxes remain `[ ]` without `BLOCKED:`, the Stop hook will remind you once (lift:
`Status: abandoned` in the plan header or `KEYSTONE_GATES=off`). No summary document, no report file.

End the report with a fixed three-heading summary, short, on top of the line-by-line report (not instead of it). It is
followed only by the `Next:` line: decisions for a human go inside `Blocked on me:`, and the last line is
`Next: /clear, then /keystone:verify <plan path>` (or `Next: /keystone:implement <plan path>` when tasks remain).
Before it, the menu (see Choice at the end): all tasks done → `Verify in a clean session — /clear, then
/keystone:verify <plan>` (Recommended) · `Verify now in this session` (small plan, small context) · `Stop here`;
tasks remain → `Continue with task <n>` · `Pause here`. Release mode done → `Stop here` only, no menu.

```text
Blocked on me: <what needs a human decision or action; next step: /keystone:verify <plan path> in a new session | none>
Changed: <files / commits / status set | none>
Found: <defects, surprises, open questions | none>
```

## Progress display and blockers

After each task print a short status so the user can follow without reading the diff:

```
✅ #1 — <task title>
✅ #2 — <task title>
✅ #3 — <task title>
🔄 #4 — <task title>
⏳ #5 — <task title> · ⏳ #6 · ⏸️ #7 BLOCKED: <reason>
Progress: 3/7 tasks
```

When a task cannot proceed (unclear requirement, missing dependency, failing check you cannot fix within the task):
say what blocks it in one or two lines, leave the box `[ ]`, and either ask the user (with AskUserQuestion) or — if the blocker is an
environment limit — write `BLOCKED: <reason>` as above and continue with independent tasks. Never "fix" a blocker by
quietly changing the requirement. If every remaining task is blocked, go straight to the final report.

If you deliberately interrupt the session (a pause, a question to the user), say so in one line, e.g. "Pausing here:
<why>"; the Stop hook allows an announced interruption.

Session continuity: the plan's checkboxes and the git log are the state. The user may stop at any time; in a new
session `/keystone:implement` resumes at the first `[ ]` (Step 0.1). Suggest `/clear` rather than `/compact` between
sessions on a long plan.

## Execution rules

### DO

- Execute one task at a time; finish it before the next.
- Follow existing code conventions and the project's rules files.
- Create the files named in the task and handle the edge cases the task lists.
- Write the tests the Settings line asks for (`tests — yes`), in the same task as the behaviour change.
- Stop and ask if a task is unclear.

### DON'T

- Create report files or summary documents.
- Add tasks that are not in the plan, or skip tasks without the user's permission.
- Mark incomplete tasks as done; a checked box is not evidence.
- Violate the project's architecture and file-placement conventions.
- Run `git push` or open a PR — the gate denies it until the plan is `verified`.

## Critical rules

1. **Settings decide tests and logging** — `tests — yes` means a test per behavior-changing task; `no` means none unless
   the task lists one. Logging follows the `logging` level (see `references/LOGGING.md`); never hardcode logs that
   cannot be turned off.
2. **NEVER create reports** or summary documents after completion.
3. **ALWAYS update the checkbox** in `plan.md` — `- [ ]` → `- [x]` immediately after each task.
4. **PRESERVE progress** — tasks survive session boundaries through the checkboxes and git.
5. **ONE task at a time** — focus on the current task only.
6. **Drift goes into the plan in the same commit**; `BLOCKED:` is literal; the report is line by line.

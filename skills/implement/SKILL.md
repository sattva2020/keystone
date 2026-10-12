---
name: implement
description: "Keystone: execute an approved plan task by task — requirement consistency gate, checkbox after every task, resume after /clear, plan drift edited in the same commit, literal BLOCKED:, line-by-line evidence report. Use only via explicit /keystone:implement [plan path]."
argument-hint: "[path to plan.md]"
allowed-tools: Read Write Edit Glob Grep Bash AskUserQuestion
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-implement/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · implement — execute the plan, keep it true

Execute the tasks of an approved plan one at a time, tick each box immediately, and keep the plan equal to what was
built. Progress lives in the plan's checkboxes and in git, so a new session can continue after `/clear`.

Keep going without asking while the next step needs no human decision; stop only before a destructive action, an irreversible external action, or an action outside the repository — and say which.

## Step 0: Find the plan and load context

1. **Plan:** the argument is a path to `plan.md`. Without it, take the active plan. Active plan = the plan.md of the newest task folder under docs/keystone/ (or paths.specs) — newest by the date prefix of the folder name, ties broken by the plan.md modification time — whose Status is draft, approved or implementing.
   (`paths.specs` comes from `.ai-factory/config.yaml` when the project has AI Factory.)
   No plan found → say "No plan. Run `/keystone:start <task>` first." and STOP.
2. **Status** (header line `Level: … · Mode: … · Status: …`):
   - `draft` → STOP: "Approve the plan first (`/keystone:plan <plan path>`), then run implement."
   - `approved` → set `Status: implementing` now (this edit goes into the baseline commit below).
   - `implementing` → continue (resume, Step 0.1).
   - `verified` / `abandoned` → STOP and say so.
3. **Settings** are mandatory. Read the header line `Settings: tests — … · logging — … · docs — …`:
   - `tests — yes`: every task that changes behaviour gets a test in the same task.
   - `tests — no`: write none, unless a task lists one.
   - `logging — minimal|standard|verbose`: read `${CLAUDE_SKILL_DIR}/references/LOGGING.md` only if it is not `minimal`.
   - `docs — yes`: do a documentation step before the final report (update the docs the change affects).
4. **Project context:** read `CLAUDE.md`, `AGENTS.md`, `.ai-factory/RULES.md` and `.ai-factory/rules/*.md` when they
   exist, plus a `docs/` overview. Rules there are MUST / MUST NOT; they override general habits. Follow the stack, import
   patterns, file placement and module boundaries they describe.
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

## Step 2: Execute the current task

**2.1 Read the task** in full: its files, check and any cited Risks.

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
(use Edit). Never batch the ticks to the end; the plan is the source of truth for progress and for the next session.

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

Before the report, if `docs — yes`, do the documentation step: update the docs the change affects and commit them.

Close with the level and cost line:
`Level: <S|M|L from the plan> · cost: $<X> (from /cost) | cost: not measured`.

Before ending the turn, write every question you asked the user that is still unanswered into the plan as a section
`## Open questions (implement)` (one bullet each); remove the section when none remain.

Do not run verify yourself. If boxes remain `[ ]` without `BLOCKED:`, the Stop hook will remind you once (lift:
`Status: abandoned` in the plan header or `KEYSTONE_GATES=off`). No summary document, no report file.

End the report with a fixed three-heading summary, short, on top of the line-by-line report (not instead of it). It is
the **very last thing** in the answer: any "next / recommend / what to do" goes inside `Blocked on me:`, nothing after
the block. Put the recommendation `/keystone:verify <plan path>` in a **new session** (`/clear`) there.

```text
Blocked on me: <what needs a human decision or action; next step: /keystone:verify <plan path> in a new session | none>
Changed: <files / commits / status set | none>
Found: <defects, surprises, open questions | none>
```

## Progress display and blockers

After each task print a short status so the user can follow without reading the diff:

```
✅ Completed: #3 — <task title>
Progress: 3/7 tasks · Current task: #4 — <task title>
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

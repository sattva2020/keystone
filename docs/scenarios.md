# What to run next — Sattva scenarios

The hardest part of any skill chain is knowing what you are doing now and what comes next. Sattva answers it in three
places:

1. **The last line of every skill's answer**: `Next: <command with paths>` or `Next: nothing now — waiting for <event>;
   then <command>`.
2. **The dim suggestion in the empty prompt box** after a Sattva turn — the same command with the plan path; Tab or →
   takes it.
3. **`/sattva-status`** at any time: the active plan, its status, tasks, gates, cost and a `Next:` line. No model call.
   The same next commands sit as buttons above the prompt box (a click fills the box, you press Enter); file paths in
   answers are clickable; when the context grows, `/sattva-handoff` moves the task to a clean session through the plan. Back after more
   than an hour (the prompt cache is gone), the band offers **Start clean** — `/clear` with no model turn, the plan's
   next command in the box — so the whole history is not re-read at full price.

If none of these helps, find your situation below.

## Where am I (by plan status)

| What you see | Where you are | Next command |
|---|---|---|
| No active plan | nothing started | `/sattva:start <task in your words>` |
| `intent.md` exists, `Status` is not `accepted` | the intent waits for your sign-off | read it, then `/sattva:intent accept <path>` |
| Intent accepted, no plan | ready to plan | `/sattva:plan <intent.md path>` |
| Plan `Status: draft` | the plan waits for Approve; code edits are gated | read it and answer Approve in `/sattva:plan <plan.md path>` |
| Plan `approved` | ready to build | `/clear`, then `/sattva:implement <plan.md path>` (on Sonnet) |
| Plan `implementing`, open `- [ ]` tasks | build not finished | `/sattva:implement <plan.md path>` — resumes at the first open task |
| Plan `implementing`, all tasks `[x]` or `BLOCKED` | ready to verify | `/clear`, then `/sattva:verify <plan.md path>` |
| verify **PASS**, plan has open `## Release` steps | ready to ship | `/sattva:implement <plan.md path>` — release mode: each merge / push / deploy step after your yes |
| verify **PASS**, no `## Release` | done | push and open the PR (on L run `/sattva:review` first) |
| verify **PASS-UNPROVEN** | some rows unproven | run the missing check, or `/sattva:verify accept <path>` with your sign-off |
| verify **FAIL** | `missing` / `wrong` rows, Rules gate `fail` | `/sattva:fix verify` (every finding in one pass), or `/sattva:implement <path>` for an unfinished task |
| Plan `verified` or `abandoned` | task closed | next task: `/sattva:start …` |

## Scenarios

### A feature with decisions (level L)
`/sattva:start <feature>` → L → `/sattva:intent <idea>` (grill asks, you answer) → `/sattva:intent accept <path>` →
`/sattva:plan <intent path>` (runs check itself) → Approve → `/clear` → `/sattva:implement <plan>` → `/clear` →
`/sattva:verify <plan>` → on L `/sattva:review` → push and PR.

### A clear task across several files (M)
`/sattva:start` → M → `/sattva:plan <task>` → Approve → `/sattva:implement` → `/sattva:verify` → push.

### A deadline is burning
`/sattva:start --rush <task>` → M: `/sattva:plan <task> --rush`, L: `/sattva:intent --rush <idea>` →
`/sattva:intent accept <path>` → `/sattva:plan <intent path>` → one batch of questions → Approve → the chain runs
by itself to the verdict. Stopped (`Rush остановлен на …`) → `/sattva:implement <plan>` continues where it stopped.
Turn it off by deleting `Pace: rush` from the plan header.

### A small edit (S)
`/sattva:start <edit>` → S → the agent edits and checks right away, no plan. Report `Level: S`. Done.

### A bug
`/sattva:fix <description or error>` → fix now (S) or plan first (M) → for M: Approve → `/sattva:implement` →
`/sattva:verify`. The regression test is a new file; committed tests are locked by a gate.

### I only ran grill — now what?
grill saves nothing: decisions D1…Dn live in the chat. Record them: `/sattva:intent <topic> — decisions D1…Dn above`
(L) or `/sattva:start <topic> — D1…Dn above` when the level is unclear. Decided to wait (an external event)? Say so —
`Next: nothing now — waiting for <event>`; when it happens, `/sattva:start <topic>` with a pointer to the decisions.

### Back after a break
`/sattva-status` → the `Next:` line (in a new session it names the plan; running that command binds the session to it). Or open `docs/sattva/`, take the newest folder with a `plan.md`: it is the active
task and its header holds the status.

### Waiting for an external event (deploy, a WAF rule, a colleague)
Run nothing. The task keeps its status; when the event happens, `/sattva-status` shows where to resume.

### The main session started child sessions
When a child session ends a turn, the app tells the main session and Sattva sorts the family by itself (`/sattva:sessions`; run it by hand any time): finished ones are archived, an unfinished idle one gets one message with its next step, and the rest are listed as waiting for you with a reason. In the CLI the same sort is shown read-only for the worktrees.

### A second session on the same plan
The second `/sattva:implement` (or `/sattva:fix`) stops before any edit: «План <folder> ведёт <place> · ветка …». Answer `Стоп` and run it later, or `Забрать план` when the first session is gone (after 2 h without a beat that is the recommended answer); the first one stops at its next task. Offline or without origin the guard covers only the worktrees of this machine.

### A new project, or no CLAUDE.md
`/sattva:setup` (context, rules, MCP) → optionally `/sattva:architecture`, `/sattva:docs`, `/sattva:dockerize`,
`/sattva:ci` → then ordinary tasks through `/sattva:start`.

### Before a deploy / after auth, payments or input changes
`/sattva:security <plan path or folder>` → `Security gate: pass | warn | fail`. On L, verify requires it.

### Test it by hand or by an agent
`/sattva:qa <plan>` (scenarios) → `/sattva:qa-check human` or `/sattva:qa-check agent`.

### The same mistakes keep coming back
`/sattva:evolve` → rules in `.claude/rules/` after your yes. From another project — `/sattva:transfer <path>`.

### You need a fact, not an opinion
`/sattva:ask <question>` — answers only on evidence, otherwise "insufficient information: …".

### The project started with AI Factory
Sattva does not read `.ai-factory/*`: plans there are not active plans for it, and the gates ignore them. Start new
tasks with `/sattva:start`, not `/aif-plan`; to keep decisions from an old plan, give them in your words to
`/sattva:intent <topic> — decisions: …`.

# What to run next — Keystone scenarios

The hardest part of any skill chain is knowing what you are doing now and what comes next. Keystone answers it in three
places:

1. **The last line of every skill's answer**: `Next: <command with paths>` or `Next: nothing now — waiting for <event>;
   then <command>`.
2. **The dim suggestion in the empty prompt box** after a Keystone turn — the same command with the plan path; Tab or →
   takes it.
3. **`/keystone-status`** at any time: the active plan, its status, tasks, gates, cost and a `Next:` line. No model call.

If none of these helps, find your situation below.

## Where am I (by plan status)

| What you see | Where you are | Next command |
|---|---|---|
| No active plan | nothing started | `/keystone:start <task in your words>` |
| `intent.md` exists, `Status` is not `accepted` | the intent waits for your sign-off | read it, then `/keystone:intent accept <path>` |
| Intent accepted, no plan | ready to plan | `/keystone:plan <intent.md path>` |
| Plan `Status: draft` | the plan waits for Approve; code edits are gated | read it and answer Approve in `/keystone:plan <plan.md path>` |
| Plan `approved` | ready to build | `/clear`, then `/keystone:implement <plan.md path>` (on Sonnet) |
| Plan `implementing`, open `- [ ]` tasks | build not finished | `/keystone:implement <plan.md path>` — resumes at the first open task |
| Plan `implementing`, all tasks `[x]` or `BLOCKED` | ready to verify | `/clear`, then `/keystone:verify <plan.md path>` |
| verify **PASS** | done | push and open the PR (on L run `/keystone:review` first) |
| verify **PASS-UNPROVEN** | some rows unproven | run the missing check, or `/keystone:verify accept <path>` with your sign-off |
| verify **FAIL** | `missing` / `wrong` rows | `/keystone:implement <path>` on the list, or `/keystone:fix <finding>` |
| Plan `verified` or `abandoned` | task closed | next task: `/keystone:start …` |

## Scenarios

### A feature with decisions (level L)
`/keystone:start <feature>` → L → `/keystone:intent <idea>` (grill asks, you answer) → `/keystone:intent accept <path>` →
`/keystone:plan <intent path>` (runs check itself) → Approve → `/clear` → `/keystone:implement <plan>` → `/clear` →
`/keystone:verify <plan>` → on L `/keystone:review` → push and PR.

### A clear task across several files (M)
`/keystone:start` → M → `/keystone:plan <task>` → Approve → `/keystone:implement` → `/keystone:verify` → push.

### A small edit (S)
`/keystone:start <edit>` → S → the agent edits and checks right away, no plan. Report `Level: S`. Done.

### A bug
`/keystone:fix <description or error>` → fix now (S) or plan first (M) → for M: Approve → `/keystone:implement` →
`/keystone:verify`. The regression test is a new file; committed tests are locked by a gate.

### I only ran grill — now what?
grill saves nothing: decisions D1…Dn live in the chat. Record them: `/keystone:intent <topic> — decisions D1…Dn above`
(L) or `/keystone:start <topic> — D1…Dn above` when the level is unclear. Decided to wait (an external event)? Say so —
`Next: nothing now — waiting for <event>`; when it happens, `/keystone:start <topic>` with a pointer to the decisions.

### Back after a break
`/keystone-status` → the `Next:` line. Or open `docs/keystone/`, take the newest folder: its `plan.md` is the active
task and its header holds the status.

### Waiting for an external event (deploy, a WAF rule, a colleague)
Run nothing. The task keeps its status; when the event happens, `/keystone-status` shows where to resume.

### A new project, or no CLAUDE.md
`/keystone:setup` (context, rules, MCP) → optionally `/keystone:architecture`, `/keystone:docs`, `/keystone:dockerize`,
`/keystone:ci` → then ordinary tasks through `/keystone:start`.

### Before a deploy / after auth, payments or input changes
`/keystone:security <plan path or folder>` → `Security gate: pass | warn | fail`. On L, verify requires it.

### Test it by hand or by an agent
`/keystone:qa <plan>` (scenarios) → `/keystone:qa-check human` or `/keystone:qa-check agent`.

### The same mistakes keep coming back
`/keystone:evolve` → rules in `.claude/rules/` after your yes. From another project — `/keystone:transfer <path>`.

### You need a fact, not an opinion
`/keystone:ask <question>` — answers only on evidence, otherwise "insufficient information: …".

### The project started with AI Factory
Keystone reads `.ai-factory/*` as a fallback: `check` finds plans in `.ai-factory/plans/`, and a plan's D1… decision
list stands in for the intent. Start new tasks with `/keystone:start`, not `/aif-plan`.

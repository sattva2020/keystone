---
name: plan
description: "Keystone: plan an M or L change into docs/keystone/<date>-<slug>/plan.md — reconnaissance, Requirements Reconciliation Gate against intent.md (I-n) and project rules, Rules check, Risks, tasks with files and checks, a pre-approval interrogation round, and on L an independent /keystone:check. Settings are inferred from the repo, never asked. Explicit /keystone:plan only."
argument-hint: "<path to intent.md or its folder | task text> [S | M | L]"
allowed-tools: Read Write Edit Glob Grep Bash(git *) AskUserQuestion Task Skill
model: opus
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-plan/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · plan — a plan an engineer can implement without this conversation

Chain: `intent.md` → **plan** → code → verify (Anthropic AI-native SDLC playbook, adapted: the plan is the spec, there
is no separate spec document). Output: `plan.md` with `Status: draft`, then `approved` on the human's Approve.
Format, template, example task, logging checklist and the Required Detail Gate:
read `${CLAUDE_SKILL_DIR}/references/PLAN-FORMAT.md` before writing the plan.

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

**Next step (mandatory).** End the answer with a `Next:` line that names the step in a few words, then put the exact
command on its own, on the following line(s), inside a fenced code block **with no language tag** — the app shows a
copy button on a code block. Never tag it ```bash: a `/keystone:*` command is not a shell command, and the bash tag
adds a Run button that would fail. When nothing runs now, write `Next: nothing now — waiting for <event>` and put the
later command in that fenced block. Never end on a caveat or an open-ended question.

Do not skip a step: re-read the step list before you finish and confirm each applicable one is done.

## Step 0: Level, input, project context

**Level.** Take it from the argument (`S` / `M` / `L`) or from what `/keystone:start` decided in this conversation.
If it is not set, propose one by the `/keystone:start` signs and confirm once (AskUserQuestion, recommended first):
`Level: <S|M|L> — <one-line reason>. OK / S / M / L?` Any single L sign (several user decisions, data/schema/migration,
security/auth/payments, a module owned by others, unclear "done") makes it L.

- **S — no plan.** Say: "this is S — make the change directly and run the check, or use `/keystone:fix` for a bug",
  and STOP. Do not write a plan file.
- **M.** Task text in, plan out, in a new folder `docs/keystone/<YYYY-MM-DD>-<slug>/` (a new folder only on M). No
  intent required, no `/keystone:check`.
- **L.** Intent mode (below). No intent given → recommend `/keystone:intent` first and stop unless the user says
  "Plan anyway".

**Task folder.** `docs/keystone/<YYYY-MM-DD>-<slug>/` (slug: lowercase, hyphenated, ≤ 50 characters). If the project
has AI Factory, as a fallback location (`.ai-factory/config.yaml` exists), read only `paths.specs` from it and use that
directory instead of `docs/keystone`. Active plan = the plan.md of the newest task folder under docs/keystone/ (or paths.specs) — newest by
the date prefix of the folder name, ties broken by the plan.md modification time — whose Status is draft, approved or
implementing.

**Existing plan (one plan per task).** If the argument is a path to an existing `plan.md` (or its folder) with
`Status: draft`, do not create a folder or rewrite the plan: go straight to § Before approval → § On Approve (used by
`/keystone:fix` M, `/keystone:implement` draft-stop, `/keystone:check`, and a plan with open questions). If a plan for
this intent/task already exists (in the task folder, or in a fallback `.ai-factory/plans/*.md` that cites this intent), refine it
instead of creating a second one.

**Intent mode** — the argument is a path to an `intent.md` or to a folder that contains one. Always L.
`plan.md` is written into the SAME folder as `intent.md` (no new folder). Read `intent.md` in full; it is an authoritative
source for the gate, the chat is not. If the argument is plain task
text, it is the request (M); an intent file that sits next to it is then not assumed.

**Original Request.** The text the user gave, after the level token is removed and only outer whitespace is trimmed.
Preserve internal whitespace, line breaks, wording, casing and punctuation exactly. It goes into the plan under
`## Original Request`; do not rewrite, summarize, translate or normalize it. In intent mode the request is the user's
words that came with the path; if there were none, the intent's Problem line is cited instead and the section says so.

**Project context.** Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`;
`.claude/rules/**/*.md` (a rule with `paths:` frontmatter applies only to matching files); `AGENTS.md` if present.
Fallback only if the project uses AI Factory and those files are absent.
Fallback files: `.ai-factory/DESCRIPTION.md`, `.ai-factory/ARCHITECTURE.md`, `.ai-factory/RULES.md`, `.ai-factory/rules/*.md`.
MUST / MUST NOT lines there are
project rules. Use this context when exploring, writing task text (correct
technologies) and planning file structure (follow project conventions and layer boundaries). Treat explicit rules as
authoritative requirements: more specific area rules override base rules, which override project-wide axioms.
**Rules beat the template:** if a project rule says "tasks MUST include X" or "plan MUST have section Y", augment the
template accordingly. After generating the plan, verify it against every such rule and fix violations before you
present it — a plan that breaks a project rule is a bug.

**Settings — do not ask.** Infer from the repo and write one line in the header; the human adjusts it at Approve:

- `tests` — yes if a test runner or test files exist, no otherwise (say which);
- `logging` — minimal / standard / verbose from the existing logger and its habits (no logger → minimal);
- `docs` — yes if `docs/` or a README with usage sections exists, no otherwise.

The line binds the rest of the work: no test tasks when `tests — no`; log instructions in tasks follow `logging`.

**Intent status gate (L).** Read the `Status:` line of `intent.md`. If it is not `accepted`, emit
`WARN [keystone] <file> is <status>, not accepted — the human has not signed it off`, ask once (AskUserQuestion:
"Plan anyway" / "Stop — I'll review and run /keystone:intent accept first"; recommend Stop) and continue only on an
explicit "Plan anyway". Record it in the header as `(planned from <status> intent — accepted by user at planning time)`.
Do not edit the intent while planning; if a resolved conflict narrows an outcome, tell the user to update it
(`/keystone:intent`) and record the narrowing in the reconciliation row. Open questions in the intent that block a
decision you need are user-owned decisions → § Clarifications.

## Step 1: Reconnaissance

From the request extract the core functionality, key domain terms and type (feature, enhancement, fix, refactor).

**Use the `Task` tool with `subagent_type: Explore` to understand the relevant parts of the codebase.** It runs as a
subagent and keeps the main context clean. Launch 1-2 Explore agents in parallel:

```
Task(subagent_type: Explore, model: haiku, prompt:
  "In [project root], find files and modules related to [feature domain keywords].
   Report: key directories, relevant files, existing patterns, integration points.
   Thoroughness: quick. Be concise — return a structured summary, not file contents.")
```

This is reconnaissance, not deep analysis; deep exploration happens in Step 3. If the project docs already give
sufficient context, skip it.

## Step 2: Analyze requirements and reconcile them

Identify: core functionality to implement, components/files that need changes, dependencies between tasks, edge cases
to handle. If requirements are ambiguous, ask clarifying questions before planning.

### Clarifications

If the open user-owned decisions contain a dependency edge (answer B depends on answer A), clarify by the
`/keystone:grill` contract instead of scattered questions; a single fork or a batch of independent questions stays an
ordinary question. Facts from the codebase are looked up, never asked. Confirmed decisions go to the intent's
`## Decisions log` only by telling the user to update the intent — the plan does not edit it.

### Requirements Reconciliation Gate

For work governed by existing requirements, reconcile them before exploring an implementation:

1. Treat roadmap items and task summaries as scope indicators, not detailed behavioral contracts, unless the project
   explicitly declares otherwise.
2. Follow any source-priority hierarchy declared by the user or project context. If no hierarchy exists, do not
   silently choose between conflicting sources. With an intent the default is: `intent.md` owns **what** (Problem,
   Desired outcome, Constraints); project rules constrain **how**. A rule that makes an intent line impossible is a
   conflict.
3. Record each material behavioral rule with its source path/section. When two sources overlap, state whether they
   agree, one refines the other, or they conflict. When an unresolved conflict would change the implementation: ask the
   user and STOP.
4. Do not edit source requirements while creating the plan. Report stale or contradictory artifacts and route them to
   their owner command or the user.

When behavior depends on two or more independent selectors, states, modes, or input shapes, enumerate the supported
combinations before writing tasks. Cover only combinations allowed by the requirements, not a speculative Cartesian
product. For each material combination specify:

- accepted input and validation;
- persisted state;
- returned output or next transition;
- side effects and invariants;
- one verification scenario. If testing is enabled, make it a test; otherwise provide a runnable/manual verification
  step without adding a test task.

When repository data, configuration, fixtures, schemas, or content define the real contract, include at least one
representative existing artifact in an end-to-end verification path instead of validating only synthetic fixtures.

**Keystone rows.** Every intent `Desired outcome` line and every `Constraint` line is its own row of the table in the
plan's `## Requirements Reconciliation`, cited `intent — I-n` — including "must not break" constraints (prove them with
a check that the protected code/path is untouched). An intent without IDs: cite `Desired outcome #n` / `Constraint #n`.
Other material rules cite `<path> — <section>`. Self-check before saving: every non-struck `I-n` has a row; an outcome
without evidence is a gap — add a task or a check, do not drop the row. Without an intent, include the section only
when several authoritative sources constrain the work, a conflict was resolved, independent dimensions exist, or a
real artifact is required.

## Step 3: Explore the codebase

Before planning, understand the existing code through **parallel exploration**. Launch 2-3 Explore agents
simultaneously, each on a different aspect (`model: haiku`):

```
Agent 1 — Architecture & affected modules:
Task(subagent_type: Explore, model: haiku, prompt:
  "Find files and modules related to [feature domain]. Map the directory structure,
   key entry points, and how modules interact. Thoroughness: medium.")

Agent 2 — Existing patterns & conventions:
Task(subagent_type: Explore, model: haiku, prompt:
  "Find examples of similar functionality already implemented in the project.
   Show patterns for [relevant patterns: API endpoints, services, models, etc.].
   Thoroughness: medium.")

Agent 3 — Dependencies & integration points (if needed):
Task(subagent_type: Explore, model: haiku, prompt:
  "Find all files that import/use [module/service]. Identify integration points
   and potential side effects of changes. Thoroughness: medium.")
```

M: one wave (1-2 agents) is enough. L: as needed, facts only. Use the Step 1 reconnaissance as a starting point and focus
the agents on areas that need deeper understanding. After they return, synthesize: which files to create/modify, what
patterns to follow, dependencies between components, potential risks or edge cases. If `Task` is unavailable, use
Glob/Grep/Read directly.

## Step 4: Write the plan

Create the task folder and write `plan.md` in the shape of `references/PLAN-FORMAT.md`, in this order: header
(`Level` · `Mode: feature` · `Status: draft`, `Authority:` line when an intent exists, `Settings:` line, then `Done means:` — verifiable outcomes, on L from I-n, on M from the request) · Original
Request · Design (optional) · Requirements Reconciliation table + `Project rules check:` line · Risks · Tasks · Commit
Plan (5+ tasks) · Release (only when the change ships: merge, push, deploy, production jobs — never as Tasks).

**Task requirements.** Every task has a clear deliverable and expected behavior, file paths to change/create, a
verifying check, logging instructions as the `logging` Settings value asks, dependency notes when applicable, and
requirement source anchors plus applicable behavior combinations when the gate applies. Each task is completable in one
focused session; tasks are ordered by dependency (do X before Y). Run the Required Detail Gate from the reference on
every task: no "handle / support / wire up / as needed / etc."; an undecidable point becomes a blocking open question.

**Rules check.** One line after the reconciliation table (after `Settings:` when there is none):
`Project rules check: read <files> — MUST violations: none` (`/keystone:check` later adds its `Coverage:` line directly
after it). Check the **text of every task** — including its Logging and Testing lines — against each MUST/MUST NOT (e.g. rule
"log only rows/leads/code" vs a task "log { code, message }" is a violation: fix the plan before Approve). List every
MUST/MUST NOT the plan would break as
`MUST violations: <rule> — <task>`. A MUST violation is a **blocker**, not a risk: fix the plan or ask the user.

If `docs/architecture.md` exists, the Rules check includes its layer dependency rules: a task whose files import across a
forbidden direction is a MUST violation like any other.

**Risks.** `## Risks` after the Rules check line: `Could break:` / `Riskiest step:` / `Rejected alternatives:` — three
lines on M, more allowed on L.

**L touching security / auth / payments / PII** (the L sign from `/keystone:start`): add a `Threats:` block to Risks — one
line per threat (what an attacker or a mistake could do, where, and the task that closes it) — and add a task
`Run /keystone:security <scope> — files: … — check: Security gate pass|warn` before the final verify. Not security → no
block, no task.

## Important rules

1. **No tests if Settings say no** — don't sneak in test tasks.
2. **No reports** — don't create summary/report tasks at the end.
3. **Actionable tasks** — each task has a clear deliverable.
4. **Right granularity** — not too big (overwhelming), not too small (noise).
5. **Dependencies matter** — order tasks so they can be done one after another.
6. **Include file paths** — help the implementer know where to work.
7. **Commit checkpoints for large plans** — 5+ tasks need a commit plan with checkpoints every 3-5 tasks.
8. **Reconcile before planning** — do not let a roadmap summary, lower-priority source, or internally consistent
   implementation override an unresolved behavioral requirement.
9. **Ownership** — this skill writes only the plan file; intent, rules and roadmap belong to their owners.

## Before approval

1. Answer against the draft and fix it: **What could this change break? Which step is the riskiest? What did you
   reject, and why?** Apply the **readiness bar**: an engineer who never saw this conversation can implement from the
   plan alone — every task names files, nothing says "as discussed", every reconciliation row has evidence.
2. **L only — independent check.** Invoke the Skill tool with `keystone:check` and the arguments
   `<intent path> <plan path>`. It orchestrates fresh-context Opus agents from the main context. Fix every `missing`,
   `unrequested` and rule violation it reports and run it again; keep its final `Coverage: … verdict` line. Never
   self-check in this context instead.
3. Show the user the three answers (2-5 lines) and, on L, the coverage line, plus the `Settings:` line (they may change
   it). Then AskUserQuestion: "Approve plan" / "Adjust". On "Adjust", revise and repeat.

## On Approve

Set `Status: approved` in the plan header. Make the baseline commit of intent and plan by the project's commit
convention (the chain is the audit trail; stage only the task folder). Then tell the user:

- implement in a **fresh session** — a new conversation or `/clear` (not `/compact`) — with
  `/keystone:implement <plan path>`; Sonnet is enough for a plan this explicit;
- finish with `/keystone:verify`;
- while the plan is `draft`, a hook refuses code edits outside `docs/keystone/`; lift it with `Status: abandoned` in the
  header or the env var `KEYSTONE_GATES=off`.

STOP after planning; the user decides when to implement. If the plan is not ready for implementation (a blocking open
question remains), say so, leave it `draft`, and list the questions.

Suggest freeing context before implementation: `/clear` (full reset), not `/compact`.

## Project memory (memlab, optional)

If memlab is available, use it before broad exploration: `search_code` for the files and symbols the tasks will touch
(then read point-wise at the returned `path:line`), `search_decisions` for prior decisions, ADRs and postmortems on the
same area. A prior decision is a source in the Requirements Reconciliation Gate like any other: cite it, and treat a
conflict with it as a conflict (ask and STOP). No memlab — Explore as above.

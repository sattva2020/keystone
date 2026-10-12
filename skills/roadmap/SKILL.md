---
name: roadmap
description: "Keystone: create or update docs/roadmap.md — a strategic checklist of milestones with stable IDs (M-1, M-2, …) that intents can reference (Roadmap: M-<n>). Modes: create, update, check progress (reads task folders to propose ticks). Writes only after you see the diff and say yes. Use for 'roadmap', 'milestones', 'what to build next'."
argument-hint: "[check | project vision or requirements]"
allowed-tools: Read Write Edit Glob Grep Bash(git *) AskUserQuestion
model: opus
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-roadmap/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · roadmap — strategic project planning

Create and maintain a high-level project roadmap with major milestones in `docs/roadmap.md`. A milestone is a goal worth many
tasks; one task is `/keystone:intent` or `/keystone:plan`. This skill plans only — it never edits code.
Arguments: `$ARGUMENTS`.

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

## Step 0 — project context

Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`; `.claude/rules/**/*.md`; `AGENTS.md`.
Fallback only when the project uses AI Factory and the Keystone files are absent: `.ai-factory/DESCRIPTION.md`,
`.ai-factory/ARCHITECTURE.md`, `.ai-factory/ROADMAP.md` (a fallback source for existing milestones — offer to migrate them into
`docs/roadmap.md`, do not edit the old file). Take the stack, architecture and non-functional requirements from there. MUST/MUST NOT
lines are project rules. Standalone use is fine: the user's own words replace missing files.

## Step 1 — determine the mode

- Argument is `check` → **Mode 3: Check progress** (needs `docs/roadmap.md`).
- Otherwise `docs/roadmap.md` does **not exist** → **Mode 1: Create**; **exists** → **Mode 2: Update**.

## File format — `docs/roadmap.md`

```markdown
# Roadmap

> <project vision — one line>

## Milestones

- [ ] M-1 <name> — <outcome: what is true when it is done>
- [ ] M-2 <name> — <outcome>
- [x] M-3 <name> — <outcome>

## Completed

| Milestone | Date |
|-----------|------|
| M-3 <name> | YYYY-MM-DD |
```

**IDs are stable.** `M-<n>` is assigned once, in creation order, and never renumbered, reused or reordered by number — an intent,
a plan or a commit may already point at it. Reordering priorities changes the line order only. A removed milestone keeps its ID
as a struck-out tombstone: `- [ ] ~~M-4 <name>~~ — dropped YYYY-MM-DD: <reason>`.

## Mode 1 — create

**1.1 Gather input.** If `$ARGUMENTS` holds a vision or requirements, use it as the primary input. Otherwise ask once
(AskUserQuestion): "What are the major goals for this project?" — 1. Let me describe the vision · 2. Analyze the codebase and
suggest milestones · 3. Both: I describe, you add what is missing. For 1 and 3 collect the description, then ask: "Any priorities
or deadlines?" — 1. Yes, let me specify · 2. No, order by logical sequence · 3. Skip, I will reprioritize later.

**1.2 Explore the codebase.** Scan what is already built: `Glob` for the structure (key directories, modules), `Grep` for implemented
features (routes, models, services), `git log --oneline -20` for completed work. Also list `docs/keystone/*/intent.md` — intents
with `Status: accepted` and a verified plan are evidence of done work.

**1.3 Draft.** Build the file in the format above.

- Each milestone is a **high-level goal**, not a granular task (that is `/keystone:plan`).
- 5–15 milestones is the sweet spot — fewer is too vague, more is too granular.
- Order by logical sequence, dependencies first.
- Mark already-completed milestones `[x]`, add them to the Completed table with today's date.

**1.4 Confirm.** Show the draft and ask: 1. Looks good — save it · 2. Add more milestones · 3. Remove/modify some · 4. Rewrite — I will
give better input. Apply changes, show again, write only after "1" (see Writing).

## Mode 2 — update

**2.1 Read the current state:** `docs/roadmap.md`, the project context, a brief look at the codebase for what changed since the
last update.

**2.2 Determine the action.** Arguments with new milestones or changes → apply them directly. No arguments → ask: 1. Review
progress — check what is done, tick completed milestones · 2. Add new milestones · 3. Reprioritize · 4. Rewrite — major revision.

- **Review progress** → run the check logic of Mode 3 below, interactively.
- **Add** → ask the user to describe them; give each the next free `M-<n>`; insert in logical order.
- **Reprioritize** → show the current order, take the user's new order, move lines; IDs stay as they are.
- **Rewrite** → new vision/milestones allowed, but existing IDs keep their meaning; replaced ones become tombstones.

**2.3 Save** (see Writing), then print: `Total milestones: N · Completed: X/N · Next up: M-<n> <name>` and
`To start on it: /keystone:intent <milestone outcome>` (put `Roadmap: M-<n>` into the intent) or `/keystone:plan <milestone>` for a
small one.

## Mode 3 — check progress (`check`)

Read-only scan; proposes ticks, changes nothing until confirmed. Requires `docs/roadmap.md` — if absent, tell the user to run
`/keystone:roadmap` first.

**3.1 Read** the roadmap and project context. **3.2 Collect evidence** for every `- [ ]` milestone:

1. Task folders: `docs/keystone/*/intent.md` (or AI Factory `paths.specs` fallback) that carry a line `Roadmap: M-<n>`, and the
   `plan.md` beside each. Read the plan header `Status:`. **`verified` = done** for that task; `implementing` / `approved` / `draft` =
   in progress. A milestone is **done** when every task folder pointing at it is `verified` (an `abandoned` one does not block if
   the rest are verified) and at least one exists. A checked task box alone is not evidence — only the Status counts.
2. Code and git: what files, routes, models, configs or tests would prove the outcome? `Glob`/`Grep` for them;
   `git log --oneline --all -30` for related commits. Milestones with no task folder rely on this evidence alone — say so.

Score each milestone: **done** (strong evidence), **partial** (some work started), **not started**.

**3.3 Report**, in this shape:

```
## Roadmap progress check
Done (ready to tick):
- M-1 <name> — evidence: docs/keystone/2026-10-01-auth/plan.md verified; src/auth/ exists
In progress:
- M-2 <name> — docs/keystone/2026-10-09-payments/plan.md implementing; Stripe webhook handler missing
Not started:
- M-3 <name>
Tick the done milestones? (1)
```

**3.4 Apply (only if confirmed):** mark the done ones `[x]` and add them to the Completed table with today's date. Partial and not
started stay unchanged. Print `Completed: X/N · Next up: M-<n> <name>`.

## Writing — diff first, then yes

Every write to `docs/roadmap.md` (create, update, tick) goes through the same gate:

1. Show the full text (new file) or a unified diff (update).
2. Ask for an explicit yes. Changes requested → redraft, show again. No answer = nothing written.
3. After the yes: `mkdir -p docs`, write; on update use Edit and touch only the changed lines.

Closing note: `/keystone:intent` can record `Roadmap: M-<n>`; when a task bound to a milestone is accepted in `/keystone:verify`, this
skill's `check` mode is how the milestone gets ticked.

## Critical rules

1. **Milestones are high-level** — each is a major feature or capability, not a task.
2. **`docs/roadmap.md` is the source of truth** — always read it before modifying.
3. **Never remove milestones silently — always confirm with user before removing** (and leave the tombstone, the ID stays taken).
4. **Completed table tracks history** — every ticked milestone gets a date entry.
5. **IDs never change** — no renumbering, no reuse.
6. **NO implementation** — this skill only plans; `/keystone:plan` starts a task, `/keystone:implement` executes it.
7. **Ownership boundary** — this skill owns the roadmap's structure and content; other skills may only propose a tick.

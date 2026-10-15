---
name: intent
description: "Capture a change as intent.md — what and why, in the originator's words, decisions confirmed via /keystone:grill, every line with an ID (I-1…) — and have the human sign it off. The first file of the Keystone chain intent → plan → code → verify (Anthropic's AI-native SDLC playbook, adapted: the plan is the spec). Use for 'intent', 'capture the idea', 'what exactly do we want', or before planning an L-level change."
argument-hint: "[idea text] | accept <path to intent.md or its folder>"
allowed-tools: Read Write Edit Glob Grep Bash(git *) Bash(mkdir *) AskUserQuestion Task
model: opus
effort: high
---

# Keystone · intent — the first file of the chain

Source: Anthropic, "The AI-native SDLC playbook" (claude.com/blog, 2026-08-21), adapted.
Rule of the chain: **every stage ends with a committed file, and the next stage starts by reading it — not the chat.**

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

Chain: `intent.md` → plan → code + tests → verify. There is **no separate spec stage**: the plan is the spec.
This skill captures only *what and why*; *how* belongs to the plan.

Two subcommands:

- `/keystone:intent [idea]` — interview, then write `intent.md`
- `/keystone:intent accept <intent>` — flip `Status:` to `accepted` after the human has read and corrected it

## Step 0: Context

- **Where it lives.** Default `docs/keystone/`. Fallback for AI Factory projects: if `.ai-factory/config.yaml` exists,
  use its `paths.specs` (default fallback `.ai-factory/specs/`). Intent home: `<root>/<YYYY-MM-DD>-<slug>/intent.md` — one folder
  per change; `slug` = kebab-case of the idea, ≤ 6 words, ASCII. In plain Claude Code the plan goes next to it as
  `plan.md`.
- **Research (L, optional).** If the "how" is unclear — a new integration, an unfamiliar library, several architectural
  paths — offer research before the interview (AskUserQuestion: "Research first" / "Skip"). On yes: facts are collected
  by a subagent (`Task`, `subagent_type: Explore`, `model: haiku`, facts only — no opinions) and by Context7 for library
  docs, and written to `<intent home>/research.md` with a `## Active summary` (what is established, what stays unknown) and
  a `## Sources` list (file:line or URL for every fact). The interview then starts from that file: facts in it are not
  asked again. The user declined, or the "how" is already clear → no research, no file.
- **No idea given.** Take the idea from the current conversation and say in one line what you took and from where.
  Nothing to take → ask for the idea in one line and stop.
- **Plan already exists** for this change (a plan file in the folder or one the user names): this intent is
  **retrospective**. Write it all the same, add `Written after plan: <plan path>` to the header, and tell the user
  that `/keystone:check` must reconcile intent and plan before implementation continues.

## `/keystone:intent [idea]` — intent.md

1. **Interview by the `/keystone:grill` contract** (read its SKILL.md and follow it here — explicitly, not as a
   one-line hand-off). Seed the tree with the intent sections as root nodes: scope (in / out) → affected users and
   systems → constraints ("must not break", security, data, deadlines) → **what success looks like** (observable,
   testable later). Facts from code/docs you look up yourself.
   **Reusing an earlier interview.** A `/keystone:grill` confirmed in this conversation → reuse its `D#` list.
   An interview by another grilling skill (any Q&A rounds the user answered) → first normalize it to a `D#` list,
   show it, and get one explicit confirmation; "ok to all" given to the raw rounds is not that confirmation.
   **Scope decisions first:** any decision that changes how much work this is belongs to the first rounds — never
   leave it as an Open question.
2. **One change per intent.** If the confirmed decisions describe several independent changes, propose splitting into
   separate intents before writing, and write only the one the user picks first.
3. **Write in the originator's words.** No solutions, no architecture, no task list — that is plan work.
4. **Source check before saving.** Every statement in Problem and Affected must trace to the user's words or to a fact
   you verified (cite it). Anything else — your assumption about how things are today — moves to Open questions,
   phrased as a question. Timelines and release gates go to Constraints, not to Desired outcome.
5. Save `<intent home>/intent.md`:

```markdown
# Intent: <short name>

Author: <git user.name or the user's name> · Created: <YYYY-MM-DD> · Status: draft
Source: <idea | ticket URL | incident/alert link>
<Written after plan: <path> — only for a retrospective intent>
<Roadmap: M-<n> — optional; only when docs/roadmap.md exists and the task belongs to a milestone>
Goal check: <matches | narrowed — confirmed <date>: "<user's words>" | replaced — confirmed <date>: "<user's words>">

## Original goal
<the user's first request for this change, verbatim — never edited, never paraphrased>

## Problem
<what hurts today, for whom, how often — originator's words>

## Desired outcome
- I-1 <observable result; testable later — "operator sees X within Y", not "improve X">
- I-2 …

## Affected users and systems
- Users/roles: …
- Systems/modules: … (paths if known)

## Constraints
- I-3 <must-not-break, security/data/compliance, budget, deadline>

## Open questions
- [ ] <question> — <who can answer>

## Decisions log
- <YYYY-MM-DD> Q: <question asked> → A: <answer> (D<n>)
```

   `Roadmap: M-<n>` is optional: add it only when `docs/roadmap.md` exists and the task belongs to that milestone
   (ask in one line if unclear); `/keystone:verify` then offers to tick the milestone via `/keystone:roadmap`.
   The template is mandatory: Status, Goal check, Original goal, Problem, Desired outcome, Affected users and systems,
   Constraints, Open questions, Decisions log.

   **Goal check (anti-substitution).** `# Intent:` names the user's goal, not a workaround. Compare the Desired outcome
   with `## Original goal`: if together they still deliver it, `Goal check: matches`. If they deliver less (narrowed) or
   something else (replaced) — e.g. the user asked for automatic clicks and the outcome is a reminder to click — ask one
   explicit question before saving: "You asked for <X>. This intent delivers only <Y>, because <Z>. <X> stays undone.
   Confirm?" Record the answer verbatim in `Goal check:` and as a decision. Without a confirmed answer the intent stays
   `draft`. A limit of the agent (it cannot enter a password, pass a login, solve a CAPTCHA) is never a reason to narrow
   silently: offer the ways that still reach X first (a script the user configures with his own access, partial
   automation), and only then the narrowing. I-n numbers ascend in order of appearance.

   **IDs.** Desired outcome and Constraint lines share one sequence `I-1, I-2, …`. IDs are never renumbered or reused:
   a new line gets the next free number; a dropped line stays struck through (`~~I-4 …~~ dropped <date>: <why>`).
   Plans, checks and reports cite these IDs. **Decisions log** gets one line per confirmed decision, dated, appended on
   every later grill — it is the audit trail of *why*.
6. **Finish the review step — always, in the same turn.** Show the path and ask the human to **read the file whole and
   correct what Claude got wrong** (the playbook's key review step). Do not mark it accepted yourself. Suggest committing
   by the project's commit convention (e.g. `docs(intent): <slug>`).
7. **If another command interrupts** before step 6 is done, the file stays `Status: draft`; finish step 6 as soon as
   that command ends. Every `/keystone:*` skill that finds a `draft` or uncommitted intent for the change it works on
   says so in one line first.
8. Next: `/keystone:intent accept <path>`, then `/keystone:plan <path>/intent.md` (it runs `/keystone:check` before Approve).

## `/keystone:intent accept <path>`

Set `Status: accepted` on the given intent.md. `/keystone:intent accept <path>` typed by the human **is** the explicit
confirmation — do not ask again. If accept was invoked by another skill or agent rather than the human, ask first. If Open questions still contain an item that changes
the scope (what is in or out), refuse and list it. If `Goal check:` is `narrowed` or `replaced` without a confirmed
answer in the user's words, refuse and ask that question first.

## Rules

- Never write code, a design, or a task plan here.
- Never invent answers: unknown → Open questions.
- Editing intent.md after the plan was written is allowed — append to the Decisions log; the check and verify treat it
  as a rework signal.

## Project memory (memlab, optional)

With memlab available, the interview starts from `search_decisions` on the idea (see `/keystone:grill`). Earlier
intents, plans and verdicts under `docs/keystone/` (or `paths.specs`) are part of the memory once indexed: cite them in
Problem or Affected when they explain the current state; list a decision this intent replaces in the Decisions log as
`supersedes <path>`.

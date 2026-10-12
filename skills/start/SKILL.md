---
name: start
description: "Keystone: size a change as S, M or L and route it — S (diff in one sentence) → code + check, no intent, no plan; M (one clear approach) → short plan with 3-line Risks; L (several decisions, data, security, other teams' modules) → intent → plan → implement → verify. Picks the model per stage, caps exploration, and asks for the cost line in the report. Use at the start of any task: 'start', 'what level is this', 'how should we do this'."
argument-hint: "<task in your own words>"
allowed-tools: Read Glob Grep Bash(git *) AskUserQuestion Task
---

# Keystone · start — balance quality, tokens and time

Ceremony must match the change. Anthropic's best practices: "If you could describe the diff in one sentence, skip the
plan." The playbook's full chain (intent → plan → code → verify) pays off only when decisions are open.

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`.

**Next step (mandatory).** End the answer with a `Next:` line that names the step in a few words, then put the exact
command on its own, on the following line(s), inside a fenced code block **with no language tag** — the app shows a
copy button on a code block. Never tag it ```bash: a `/keystone:*` command is not a shell command, and the bash tag
adds a Run button that would fail. When nothing runs now, write `Next: nothing now — waiting for <event>` and put the
later command in that fenced block. Never end on a caveat or an open-ended question.

## 1. Size it (agent proposes, human confirms)

Look only at what you can see cheaply (the task text, file names, one or two searches). Then propose a level:

| Level | Signs | Route |
|---|---|---|
| **S** — light mode | the diff fits in one sentence; one file or a few lines; no decision for the user; behaviour is covered by an existing check | do it directly, run the check, report. No intent, no plan file. A bug → `/keystone:fix` (S mode) |
| **M** | one obvious approach; several files; no open user decisions; no data migration, no auth/security, no other team's module | `/keystone:plan <task>` → Approve → `/keystone:implement` → `/keystone:verify` (bug: `/keystone:fix`, plan-first mode) |
| **L** | several decisions the user owns, **or** data/schema/migration, **or** security/auth/payments, **or** a module owned by others, **or** an unclear "done" | `/keystone:intent` → `/keystone:plan <intent>` (runs `/keystone:check`) → Approve → fresh session → `/keystone:implement` → `/keystone:verify` |

Any single L sign makes it L. Unsure between two levels → propose the higher one and say why in one line. Decisions
already closed in a grill still count as "several decisions the user owns" — they belong in a signed intent, so the
level stays L. Production, secrets and other people's access are L however small the code change is.

No `CLAUDE.md` in the project (root or `.claude/`)? Add one line to the answer: "No CLAUDE.md — `/keystone:setup`
creates it (stack, commands, rules) after your yes." Do not block and do not run it; on S add nothing else.

Ask once: `Level: M — <one-line reason>. OK / S / L?` (AskUserQuestion, recommended first). The human's answer wins;
record the level in the plan header or the report.

**An active plan already exists.** Active plan = the plan.md of the newest task folder under docs/keystone/ (or paths.specs) — newest by the date prefix of the folder name, ties broken by the plan.md modification time — whose Status is draft, approved or implementing. If this is a different task → ask once: continue that plan, or mark it `Status: abandoned` and start
this one. Its gates (no edits while draft, no push before verify) apply until you choose.

**The task already has an intent or a plan.** Only record the level; create no new artifacts. If the user picked M while
an intent exists for the task and then runs `/keystone:intent`, warn that this is an L route and offer L.

**External irreversible actions** (submitting an application or a domain, live payment settings, deploy, DNS, mailings)
only after their prerequisites are explicitly checked (e.g. legal pages, test mode passed). Repeat the warning even if
the user picked the risky option (lesson: a domain was submitted to a payment provider before the legal pages existed).

## 2. Budget per level

| | S | M | L |
|---|---|---|---|
| Exploration | ≤ 2 searches/reads before acting | ≤ 1 Explore subagent sweep | Explore subagents as needed, facts only |
| Model | session model, low effort | Opus plans, Sonnet implements | Opus: grill, intent, plan, check, verify · Sonnet: implement · Haiku: Explore (fact lookup) |
| Artifacts | none — the commit message is the record | `plan.md` | `intent.md`, `plan.md`, check report |
| Effort | low | plan, fix: high · implement: low–medium | grill, intent, plan, check, verify: high · implement: low–medium · fix: high |
| Review | the check's output | `/keystone:verify` | `/keystone:check` before approve + `/keystone:verify` |

`effort` in a skill's frontmatter applies only for the turn the skill is invoked; for multi-turn plan/grill/check
sessions set `/effort high` for the session.

Exceeding the exploration budget is allowed only after saying why in one line. Re-size up (S→M, M→L) as soon as a sign
from the higher row appears — say so; never re-size down silently.

## 3. Route

- **S** — no files. Make the change, run the check named in the table, report. A bug that needs a regression test is
  `/keystone:fix` (S mode).
- **M** — `/keystone:plan <task in your words>`: it writes `docs/keystone/<YYYY-MM-DD>-<slug>/plan.md`, infers the
  Settings (tests, logging, docs) from the repo instead of asking, asks the three risk questions and Approve / Adjust.
- **L** — `/keystone:intent <idea>` (grill → intent.md → human reads and accepts), then `/keystone:plan <intent path>`,
  which runs `/keystone:check` (analyzer + validator in clean contexts) before Approve.
- **Where the other skills switch on.** Not separate steps — each is pulled in by the stage that needs it: L with
  security/auth/payments/PII → `/keystone:plan` adds a threat block and a `/keystone:security <scope>` task, and
  `/keystone:verify` requires its result; `docs — yes` → `/keystone:implement` runs `/keystone:docs update`;
  `docs/architecture.md` exists → `/keystone:verify` runs the architecture gate (`/keystone:architecture` creates that
  file); L → `/keystone:verify` recommends `/keystone:review` before push; a new project → `/keystone:setup`,
  later `/keystone:dockerize` and `/keystone:ci` on request. S gets none of these.
- After Approve: commit, then a **fresh session** (`/clear`, not `/compact`) → `/keystone:implement <plan>` on Sonnet →
  `/keystone:verify <plan>` in a fresh session. Until verify passes, `git push` / `gh pr create` are closed by the hook.

## 4. Report — always

End every level with:

```text
Level: <S|M|L> · checks: <command → result> · cost: $<X> (from /cost) | cost: not measured
```

You cannot see your own spend; ask the user to paste `/cost` if they want the number, otherwise write `not measured`.
Reference costs measured on the test bench (2026-10-11): small edit $3.9–10.2, plan from ready requirements $6, full
chain with a separate spec $30 — the reason S and M exist.

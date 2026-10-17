---
name: architecture
description: "Keystone: recommend an architecture pattern from the project's real stack and code, check the existing structure against it, and write docs/architecture.md (folder structure, dependency rules in a form /keystone:verify can grep, anti-patterns) after you confirm the diff. Re-running updates the file, never overwrites silently. Use for 'which architecture', 'document the architecture', after /keystone:setup, or before a structural refactor."
argument-hint: "[microservices|layers|structured|structured-layers|structured-vertical|explicit|explicit-layers|explicit-vertical|explicit-flat] (legacy aliases: clean, ddd, monolith, vertical)"
allowed-tools: Read Write Edit Glob Grep Bash(git ls-files*) Bash(mkdir *) AskUserQuestion
model: opus
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-architecture/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · architecture — pick a pattern, write `docs/architecture.md`

Writes only: `docs/architecture.md`, and one pointer line in `CLAUDE.md` — each after the diff is shown and the user said yes.
Never touches code. Arguments: `$ARGUMENTS`.

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
it and shows "file not found": give its absolute path in `code`, so it can be copied.

## Step 0 — project context

Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`; `.claude/rules/**/*.md`;
`AGENTS.md`. Fallback only when the project uses AI Factory and the Keystone files are absent: `.ai-factory/DESCRIPTION.md`,
`.ai-factory/ARCHITECTURE.md`, `.ai-factory/RULES.md`. Take the stack (language, framework, database/ORM), project size, core
features and non-functional requirements from there and from the package manifest (`package.json`, `pyproject.toml`, `go.mod`,
`composer.json`, `Cargo.toml`, …). If there is no description, infer the stack from manifests and `git ls-files | head -200`, and
ask one short question only for what the repo cannot tell (team size, expected scale). Standalone use is fine: the user's own
answers replace the missing files.

If `docs/architecture.md` exists, this is an **update**: read it, keep what is still true, change only what the user asks or the
code disproves, and say which sections changed.

## Step 1 — recommend

Read `${CLAUDE_SKILL_DIR}/references/PATTERNS.md` before choosing or writing anything (terminology, dependency direction, matrix).

If `$ARGUMENTS` names a pattern, use it directly:
- Legacy aliases: `clean`, `ddd`, `vertical` → Explicit (`vertical` = Explicit, vertical slice by entity); `monolith` →
  Structured Modules.
- `layers` → Layered; `microservices` → Microservices; `structured` / `explicit` → ask the folder variant (below).
- `structured-layers` / `structured-vertical`, `explicit-layers` / `explicit-vertical` / `explicit-flat` → the variant is fixed.
- Without a suffix ask: "Which folder structure variant? 1. Technical layer 2. Vertical slices by entity" (Explicit also: "3. Flat
  vertical slice — simplified"). Wait for the answer.

Otherwise score the project against the decision matrix (team size, domain complexity, scale, feature independence) and the evolution
triggers, then ask once (AskUserQuestion), recommendation first: the pattern with the reasons from *this* project, and 2–3 alternatives
with one line each. Give a recommendation, not a survey.

## Step 2 — Codebase Alignment Check

Compare the chosen pattern's ideal folder structure with what the repo actually has. Empty or mostly matching → continue.

**On significant discrepancies do NOT silently merge the ideal architecture with the messy reality.** Stop and ask:
"The current project structure differs significantly from the ideal [Pattern]. [1–2 main differences.] How should we write the doc?
1. Describe the application as it is (document reality). 2. Write the strict ideal (the code will need refactoring to match)."
Wait for the answer. It decides the folder structure and which closing section is added (below).

## Step 3 — draft `docs/architecture.md`

Adapt every example to the project's language, framework and import paths (no TypeScript examples for a Go project). Keep it practical:
only rules that affect day-to-day development.

```markdown
# Architecture: [Pattern Name]

## Overview
[1-2 paragraphs: what this is and why it was chosen for THIS project]

## Decision Rationale
- **Project type:** …  - **Tech stack:** …  - **Key factor:** …

## Folder Structure
[tree in the framework's real conventions: Next.js app/, Laravel app/, Go cmd/ …]

## Dependency Rules
- MUST NOT: domain/ imports infrastructure/        check: grep -rnE "from ['\"].*infrastructure/" src/domain
- MUST NOT: controllers/ imports repositories/     check: grep -rnE "(import|require).*repositories" src/controllers
[one line per rule, in this exact form; `check: review` where grep cannot prove it]

## Layer/Module Communication
- [how layers or modules talk: DTOs, ports, events, public module API]

## Key Principles
1. …  2. …  3. …

## Legacy vs New Code Policy        [only if the user chose the strict ideal]
- New features MUST follow this document. Legacy code is touched only for bug fixes, explicit refactoring, or adaptation for new
  features; legacy is reached from new code through adapters/interfaces/facades.

## Code Organization Note           [only if the user chose to describe reality]
- New code should follow this document where practical; existing code is documented as-is, not rewritten for alignment.

## Code Examples
### [Example 1] / ### [Example 2 — shows a dependency rule]

## Anti-Patterns
- ❌ [what NOT to do in this architecture]  - ❌ [common mistake]
```

The `Dependency Rules` lines are the contract with `/keystone:verify`: `MUST NOT: A imports B` plus a `check:` grep that prints nothing when
the rule holds. Use the project's real import syntax; do not invent folders that do not exist (Option 1 documents real paths).

## Step 4 — confirm, write, point

1. Show the full text (new file) or a unified diff (update) and ask for an explicit yes. Changes requested → redraft, show again.
2. After the yes, `mkdir -p docs` and write `docs/architecture.md`. On update use Edit, only the changed sections.
3. Pointer: if `CLAUDE.md` exists and has no line mentioning `docs/architecture.md`, propose exactly one line, e.g.
   `Architecture: docs/architecture.md (pattern: <name>) — follow its Dependency Rules.`, show the diff, add it only on a yes.
   Keep `CLAUDE.md` within 60 lines; if it would exceed that, say so instead of adding. No `CLAUDE.md` → suggest `/keystone:setup`, write nothing.
4. Report: `Blocked on me:` (none, or the open question) · `Changed:` (files, new or updated sections) · `Found:` (pattern chosen, mode
   documented-reality vs strict-ideal, number of grep-checkable rules, number of `check: review` rules).

Closing note to the user: plans (`/keystone:plan`) and `/keystone:verify` read `docs/architecture.md`; verify runs each `check:` grep and
treats a hit as an architecture violation.

## Rules

- Never silently overwrite an existing `docs/architecture.md`; never write it without a yes on the shown diff.
- Never refactor or move code; this skill documents and recommends only.
- Do not recommend Microservices below ~10 people or with unclear domain boundaries, and do not recommend Explicit Architecture for a
  simple CRUD app — say why instead.

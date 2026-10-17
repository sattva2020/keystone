---
name: evolve
description: "Keystone: turn the lessons of finished tasks into project rules. Reads fix plans (Root cause, Prevention), verify FAIL and Found lines, Implementation notes deviations, saved review and security findings and docs/notes; finds recurring patterns and stack pitfalls; proposes rules for .claude/rules/ — written only after you see the diff and say yes. Processed sources are logged in docs/keystone/evolve-log.md so a re-run skips them. `add <rule text>` writes one rule you dictate (dedupe, topic file, paths:) after the same diff and yes. Use for 'evolve', 'learn from our fixes', 'what keeps going wrong', after several fixes, and for 'add rule', 'remember this convention', 'always do X'."
argument-hint: "[all | plan | implement | fix | verify | <rules topic> | add <rule text>]"
allowed-tools: Read Write Edit Glob Grep Bash(git *) AskUserQuestion
model: opus
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-evolve/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · evolve — lessons become project rules

```
fix plans (Root cause, Prevention) + verify FAIL/Found + Implementation notes + review/security findings + docs/notes
    ↓
analyze recurring problems, tech-specific pitfalls, project conventions
    ↓
propose rules → diff → explicit yes → .claude/rules/
```

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

Claude Code loads `.claude/rules/*.md` by itself, so a lesson written there reaches every later session with no extra
layer. **Keystone has no per-skill override layer and its skills are never edited** — a plugin's files are replaced on
update. Everything evolve learns becomes a **project rule**.

Arguments: `$ARGUMENTS` — `all` or empty (every source and topic), a Keystone stage (`plan`, `implement`, `fix`,
`verify`, `check`, `review`) to look only at lessons for that stage, or any other word as a rules topic filter.
The first word `add` switches to **Mode add** below; the rest of the argument is the rule text.

## Mode add — one rule you dictate (`/keystone:evolve add <rule text>`)

No sources, no registry, no 8-proposal cap: the human's words are the evidence. Steps 1–3 are skipped.

1. **Text.** `add` with no text → ask for the rule (AskUserQuestion, or plain text and wait). Several rules at once
   (one per line, or split by `;`) → each is handled as its own rule below.
2. **Context.** Step 0 — the loaded rules are the baseline for dedupe.
3. **Wording.** One short imperative line in English, the user's meaning kept, a concrete format, name or command kept
   verbatim. The user says always / never / must → `MUST` / `MUST NOT` (only those lines are checked by
   `/keystone:review rules` and the verifier's Rules gate); a preference → a plain imperative, and say it will not be
   gated. Evidence comment: `<!-- evolve add: user, <YYYY-MM-DD> -->`.
4. **Target.** Use the table in "Where a rule goes": an existing `.claude/rules/<topic>.md` whose topic fits, else a new
   `<topic>.md` (kebab-case). The rule names files, folders or a language → `paths:` globs; Glob each one and drop or
   fix a glob that matches nothing. A whole-project rule gets no `paths:`.
5. **Dedupe** as in Step 2, against every loaded rule including `CLAUDE.md`: **Covered** → quote the existing rule with
   `file:line`, write nothing; **Partial** → propose the strengthened rule as a diff; **Conflict** → show both and let
   the human choose.
6. **Show, then write only after "yes".** Show the exact diff (new file content or the added line), then ask once:
   `Write` / `Change topic or paths` / `Cancel`. Only on `Write` follow the Writing rules of Step 4. `Change` → ask
   what, show the new diff, ask again.
7. **Log.** Append to `docs/keystone/evolve-log.md` an entry `## <date> — evolve add` with an `Added:` line (or
   `Rejected:` on Cancel) and no `Sources:` line. Then Step 6.

## Where a rule goes

| Lesson applies to | Target |
|---|---|
| Specific files or folders (a module, a test layout, a config) | `.claude/rules/<topic>.md` with `paths:` frontmatter listing the globs |
| The whole project (a convention, a pitfall of the stack) | `.claude/rules/<topic>.md`, no `paths:` |
| How a Keystone stage should be run in this project | `.claude/rules/keystone.md` under the heading `## plan`, `## implement`, `## fix`, `## verify`, `## check`, `## review` |

Rules are short imperative lines in English (agents read them), one rule = one bullet, each with its evidence in a
trailing comment, for example `- MUST guard nullable relations before reading nested fields. <!-- evolve: docs/keystone/2026-09-02-x/plan.md -->`.
Never write to `CLAUDE.md` from here; never touch anything under the plugin folder.

## Step 0: context

Read what exists: `CLAUDE.md`, `.claude/CLAUDE.md`, `docs/architecture.md`, every `.claude/rules/**/*.md` (note their
`paths:`), `AGENTS.md`.
From them take the **stack** and the **existing rules** — the baseline for dedupe.

Read `docs/keystone/evolve-log.md` if it exists (format in Step 5). Its listed sources are **already processed**.

Task folders: `docs/keystone/<date>-<slug>/`.

## Step 1: collect intelligence

**1.1 Sources.** Glob the task folders and read, newest first, skipping sources listed in `evolve-log.md`:

1. `plan.md` with `Mode: fix` — `## Root cause` and `## Prevention` (the richest source).
2. `verify.md` — the `FAIL` verdict, every `wrong` / `missing` / `unrequested` line and the `Found:` lines, especially
   from a FAIL that a later fix plan or re-verify resolved.
3. `plan.md` `## Implementation notes` — decisions that deviated from the plan and "unexplained deviation" entries.
4. Review and security findings saved in a task folder (`review.md`, `security.md`, `qa/` results).
5. `docs/notes/*.md` (memlab notes), when the folder exists.
6. `### Suggested rule updates` from a `/keystone:review rules` run earlier in this session — in the conversation, not
   a file; each line becomes a prevention point (source `review rules <date>`), and they are not added to the log's
   `Sources:` line.

**Re-run guard.** Never re-analyze a source listed in the log, unless the user asks for a full rescan (then ignore the
log for this run and say so). Sources not in the log are the "new" set. To limit the chance of skipping a point on one
pass, also re-read the 5 newest processed sources and mark them "overlap": they can produce proposals but are not
added to the log's `Sources:` line again.

**1.2 Prevention Point Registry.** Read every source. For each, extract:
- **Problem category** (null-check, async, validation, types, API, DB, migration, test flakiness, …)
- **Root-cause pattern** (the class of mistake)
- **Prevention points** — each independent actionable rule from Prevention / Found / the notes. A source often holds
  several independent points aimed at different stages. Extract EACH separately with its target (a rules topic or a
  Keystone stage). Do NOT treat a source as a single unit.

Build one flat registry:

```text
| # | Source (path) | Prevention point (specific action) | Target |
|---|---------------|------------------------------------|--------|
| 1 | docs/keystone/2026-09-02-x/plan.md | <concrete action to enforce> | .claude/rules/db.md |
| 2 | docs/keystone/2026-09-02-x/plan.md | <different action, same source> | keystone.md ## fix |
```

A patch with 5 prevention points produces 5 rows, not 1. The same holds for a plan, a verify.md or a note.

**1.3 Aggregate patterns.** Group by category. Identify:
- **Recurring problems** — the same category 3 or more times is systemic. Fewer than 3 stays a candidate, labelled so.
- **Tech-specific pitfalls** — problems tied to the stack (React re-renders, ORM N+1, timezone handling, …).
- **Missing guards** — what check, test or convention would have prevented the defect.

**1.4 Read codebase conventions** (focus on the target stage or topic when one was given): linter configs, test layout
and assertions, error-handling style, logging, import and file-structure conventions. They show which rules the code
already follows and which a lesson would newly demand.

## Step 2: gap analysis against existing rules

A gap exists only if **no existing rule covers it**. For each (prevention point × target) pair, check the loaded
rules (`.claude/rules/**`, `CLAUDE.md`, fallback files) for a rule that addresses the **specific action described**.

**Source reference ≠ full coverage.** A rule that cites a source's path covers one point of that source, not all of its
points. Verify the content of the existing rule against each prevention point individually.

Classify each existing rule that touches a point:

- **Covered** — equal or more complete → no proposal.
- **Partial** — the existing rule covers part → propose a **strengthened version as a diff**, never a silent rewrite.
- **Conflict** — a proposal contradicts an existing rule → show both, let the human choose; do not pick.
- **Stale** — an existing rule cites files, tools or a stack the project no longer has → list it under "Stale rules"
  with the evidence; propose removal only as a diff that needs its own yes.

After the scan print the count: `Prevention points: <total>, covered <a>, partial <b>, uncovered <c>`.
Uncovered and partial points become inputs for Step 3.

**Stack gaps.** Compare the stack with the rules: a framework the project uses but no rule mentions, an error-handling
or logging convention the code follows consistently but nobody wrote down. These are proposals too, with the code
location as evidence.

## Step 3: generate proposals

Quality rules (these are what the human reviews):
- **One prevention point = one rule.** Do not merge independent points into a vague summary.
- **Preserve concrete formats and patterns** from the source (an exact command, a header, a field name) verbatim.
- Every proposal is traceable: **evidence = a source path** (and the line or heading), a convention's file path, or a
  stack fact. No evidence, no proposal. No generic advice ("write clean code") — project-specific only.
- Minimal and additive: do not rewrite whole rule files. A new file only when no existing one fits the topic.
- Use MUST / MUST NOT only when the source shows a defect already happened; otherwise a plain imperative.
- Cap a run at **8 proposals**; if more qualify, show the 8 with the most evidence and say how many were left.

## Step 4: present, then write only after "yes"

Show the report:

```text
## Evolution report
Sources: <n new> new, <m overlap> overlap, <k skipped by the log>
Prevention points: <total>, covered <a>, partial <b>, uncovered <c> · recurring patterns: <list> · stack insights: <n>

### Proposed rules
1. [new]  .claude/rules/db.md (paths: src/db/**)
   Rule: MUST guard optional relations before reading nested fields.
   Evidence: docs/keystone/2026-09-02-x/plan.md ## Prevention; docs/keystone/2026-09-20-y/verify.md Found
   Why: 3 fixes in 6 weeks came from unguarded optional relations.
2. [strengthen]  .claude/rules/keystone.md ## fix
   <unified diff of the change>

### Stale rules   <list with evidence | none>
```

Then ask with AskUserQuestion (one question, up to 4 options per call; batch if more): **one option per proposed
rule** with its target and first words, plus `None — save nothing`. If AskUserQuestion is unavailable, ask in plain text
and wait. For each chosen rule show the **exact diff** (new file content or changed lines) before writing, unless the
human already saw it in the report and chose it explicitly.

Writing rules:
- Only chosen rules are written. No yes → nothing is written in `.claude/rules/`.
- An existing rule is never rewritten silently: a change is a diff with its own yes.
- Create `.claude/rules/` if absent. Keep `paths:` frontmatter valid YAML (a list of globs).
- Do not commit; end with `git status --short` of the touched files and suggest committing them (rules are project
  files and deserve a review in git).

## Step 5: log (append-only)

Append to `docs/keystone/evolve-log.md` (create it with the header `# Evolve log` if missing). Never edit or delete
earlier entries. One entry per run:

```markdown
## 2026-10-12 — evolve [all]
Sources: docs/keystone/2026-09-02-x/plan.md, docs/keystone/2026-09-20-y/verify.md, … (<n>)
Added: .claude/rules/db.md — "guard optional relations" (evidence: …)
Rejected: "<rule text>" — <why: not evidence-backed / human said no / conflicts with …>
Rules after: <n rules in .claude/rules/>
```

The `Sources:` line lists every source **read as new** (not the overlap), whether or not it produced a rule: a source
that gave nothing is still processed. If the human chose "None", ask once whether to log the sources anyway;
recommended: **no** — keep them for a re-run, since one pass can miss points. Log when at least one rule was added or
the human says to. `/keystone:transfer` writes to the same log (a `transfer from <project>` entry); those entries are
not sources of this project's lessons.

## Step 6: next steps

```text
## Evolution complete
Rules added: <n> · strengthened: <n> · rejected: <n> · stale found: <n>
Next: commit .claude/rules and docs/keystone/evolve-log.md; run /keystone:evolve again after 5–10 more fixes;
      /keystone:review on recent code to see the new rules at work
```

Context is heavy after reading many sources — suggest `/clear` or `/compact`.

## Rules

1. **Traceable** — every proposal links to a source path, a convention file or a tech fact (in Mode add, the user).
2. **Minimal** — add short rules; do not rewrite rule files or `CLAUDE.md`.
3. **Reversible** — the human approves each rule after seeing the diff; nothing is auto-applied.
4. **Cumulative** — each run builds on the log and the existing rules.
5. **No hallucination** — only what the sources and the code show.
6. **Plugin files are never edited**; Keystone has no per-skill override files.
7. **English only** for rule text; the report may follow the user's language.
8. **No new skills** — a pattern that keeps recurring and needs a procedure is a candidate for `/keystone:distill`.
9. **Read-only** towards sources: plans, verify.md and notes are never changed by evolve.
10. **Ownership** — evolve writes only `.claude/rules/**` and `docs/keystone/evolve-log.md`.

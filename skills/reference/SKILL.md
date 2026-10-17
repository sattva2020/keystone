---
name: reference
description: "Keystone: turn URLs, documents or files into a project reference in docs/references/<slug>.md. Library and SDK docs come from Context7 first; the reference keeps only project-specific conclusions, prices and limits, and live checks with date and source URL — no copies of docs Context7 already serves. Use for 'make a reference', 'document this API for the agent', 'save these pricing limits'."
argument-hint: "<url|path> [url2|path2] [--name <slug>] [--update] | list | show <slug> | delete <slug>"
allowed-tools: Read Write Edit Glob Grep Bash(mkdir *) Bash(ls *) Bash(wc *) WebFetch WebSearch AskUserQuestion mcp__context7__resolve-library-id mcp__context7__query-docs
model: sonnet
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-reference/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · reference — knowledge references for AI agents

Create structured knowledge references from external sources and store them in `docs/references/` so plans, implementation and
verification can reuse them later. Writes only `docs/references/*.md` and `docs/references/INDEX.md`; shows the text and gets a yes
first. Arguments: `$ARGUMENTS`.

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

## Step 0 — project context

Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`; `.claude/rules/**/*.md`; `AGENTS.md`.
Take the stack and library versions from there and from the package manifest / lock file; they decide which docs matter.

## The core rule — what a reference is and is not

**Library, SDK, framework and CLI documentation comes from Context7 first** (`resolve-library-id` → `query-docs`, the version from the
project's manifest). Context7 is the source for API signatures, options, usage patterns and version notes — they are served
fresh, so **do not copy them into a reference**. If Context7 has no entry, use the official documentation through `WebFetch`, then
`WebSearch`; say in the report which source each fact came from.

A reference keeps only what Context7 cannot give:

1. **Project-specific conclusions** — which API we use and why, the pattern chosen for our code, pitfalls we hit, paths in our repo.
2. **Prices, limits, quotas, plans** — numbers that decide design, each with date and source URL.
3. **Live checks** — what was actually run or observed (a curl, a sandbox call, a dashboard value): the command or action, the
   result, the date, the source URL. A claim without a date and a source is not allowed.
4. **Non-library sources** — internal docs, specs, PDFs, vendor pages: summarize what the project needs from them.

If a section would just restate the library's docs, replace it with a one-line pointer: `Docs: Context7 /org/project (v<x>)`.

## Argument detection

```text
Check $ARGUMENTS:
- Contains "--update"        -> Update mode: refresh an existing reference
- Contains URLs (http/https) -> URL mode: fetch and process web sources
- Contains file paths        -> File mode: process local documents
- "list"                     -> show docs/references/INDEX.md (or list the files)
- "show <slug>"              -> show the reference (".md" optional)
- "delete <slug>"            -> ask for confirmation, delete the file, update INDEX.md
- Empty                      -> interactive mode
```

`--name <slug>` fixes the file name (lowercase, hyphens, `.md` added if missing); otherwise derive it from the topic:
`stripe-billing.md`, `fastapi-endpoints.md`. Avoid generic names like `reference.md`.

## Workflow

### Step 1 — setup

`mkdir -p docs/references`, then `ls docs/references` to avoid duplicates. With `--update`, find the existing reference by
`--name` or by matching sources.

### Step 2 — collect sources

- **Library or SDK named** → Context7 first (see the core rule). Record the library ID and version; keep the answers you need for
  step 3, not for copying.
- **URLs** → `WebFetch` each; extract the topic, limits/prices/plans, terms and definitions the project needs, error and edge
  cases, version and compatibility notes, links to critical sub-pages (fetch up to 8 extra pages per source URL). Obvious gaps
  remain → 1–2 targeted `WebSearch` queries.
- **Local files** → `Read` each; follow references to other local files (up to 5 levels); detect the format (markdown, HTML,
  JSON, YAML, plain text) and extract accordingly.
- **Interactive mode** → ask: what topic or technology; URLs or files, or should you search; which aspects matter for the project.

### Step 3 — synthesize

Read `${CLAUDE_SKILL_DIR}/references/EXAMPLES.md` for the expected shape and the quality checklist. Structure:

```markdown
# <Topic> Reference

> Sources: <URLs / paths / Context7 library ID + version>
> Created: YYYY-MM-DD
> Updated: YYYY-MM-DD

## Overview
<1–3 paragraphs: what it is and why the project uses it>

## Project conclusions
<decisions, chosen patterns, pitfalls we met, where it lives in the repo>

## Prices and limits
| Item | Value | Checked | Source |
|------|-------|---------|--------|

## Live checks
- YYYY-MM-DD — <what was run/observed> → <result> — <source URL or command>

## Docs pointer
Context7: /org/project (v<x>) — <query to use>
```

Drop a section that has nothing to say; add a `Common pitfalls` or `Version notes` section only when it is specific to this project.

**Quality rules:** no hallucination — include only what was actually found, omit gaps; dense — maximum useful information per line;
every number carries date and source; code appears only when it is project code or a verified live-check command, verbatim.

### Step 4 — show, save, register

1. Show the full reference (new) or a unified diff (update). Ask for an explicit yes. Nothing is written before it.
2. After the yes, save `docs/references/<slug>.md`. Update `docs/references/INDEX.md` (create if missing):

```markdown
# References Index

| Reference | Topic | Sources | Updated |
|-----------|-------|---------|---------|
| [stripe-billing](stripe-billing.md) | Stripe plans and webhook limits | stripe.com, Context7 | 2026-10-12 |
```

3. Report: name and path, line count, sections included, sources used (Context7 / URL / file), and how to wire it in:
   suggest one line for `CLAUDE.md` or a `.claude/rules/` file, e.g. `For <topic> see docs/references/<slug>.md` — shown as a diff and
   added only on a yes.

## Update mode (`--update`)

1. Find the reference by `--name` or sources. 2. Re-run the live checks and re-fetch the sources in the header (Context7 again for
the library part). 3. Compare with the existing text; update only changed sections and the date of each re-checked number or
check. 4. Preserve `Created:`, set `Updated:`. 5. Show the diff, write on yes, report what changed.

## Guardrails

- **Max size:** aim for under 1000 lines; if larger, split into a directory `docs/references/<topic>/` with its own `INDEX.md`.
- **No duplication:** check existing references first; never copy what Context7 serves.
- **No stale data:** sources and dates are mandatory so the reference can be refreshed.
- **No opinions:** a reference reflects sources and checks; recommendations belong in the plan.
- **Respect access:** a URL that needs authentication or fails to load is reported, not guessed. Secrets are never written into a
  reference — use `${VAR}` names.
- **Ownership:** this skill owns `docs/references/`; every other file is read-only, except the one pointer line in `CLAUDE.md`
  or `.claude/rules/` offered in the report and added only on a yes.

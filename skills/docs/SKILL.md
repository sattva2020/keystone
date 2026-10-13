---
name: docs
description: "Keystone: generate and maintain project documentation — a lean README landing page plus topic pages in docs/, with navigation, consolidation of scattered *.md files (only with your yes, nothing deleted automatically) and a review against a checklist. `update <files|topics>` refreshes only the pages a change touched (called by /keystone:implement when Settings say docs — yes). Use for 'create docs', 'write documentation', 'update docs', 'generate readme', 'document project'."
argument-hint: "[update <files|topics>] [--web]"
allowed-tools: Read Write Edit Glob Grep Bash(git *) Bash(mkdir *) AskUserQuestion
model: sonnet
effort: high
disable-model-invocation: false
---
<!-- derived from ai-factory@2.19.0 skills/aif-docs/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Docs — project documentation

Generate and improve documentation as a landing-page README plus detailed pages in `docs/`. Everything that changes an
existing file is shown first and written only after an explicit yes.

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

**Next step (mandatory).** End the answer with a `Next:` line that names the step in a few words, then put the exact
command on its own, on the following line(s), inside a fenced code block **with no language tag** — the app shows a
copy button on a code block. Never tag it ```bash: a `/keystone:*` command is not a shell command, and the bash tag
adds a Run button that would fail. When nothing runs now, write `Next: nothing now — waiting for <event>` and put the
later command in that fenced block. Never end on a caveat or an open-ended question.

**File links.** Every file you write or point the user to lives inside the session's working directory
(the folder Claude Code runs in — in a worktree, the worktree, never the main checkout), and its link is relative to
that directory: `[intent.md](wordpress-plugin/x/docs/keystone/<task>/intent.md)`, not relative to a nested repo or a
subproject. A file that must live outside it gets its absolute path. Check the link before showing it: the app opens
links only from the working directory.

## Core Principles

1. **README is a landing page, not a manual.** ~80-120 lines. First impression, install, quick example, links to details.
2. **Details go to `docs/`.** Each file is self-contained — one topic, one page. A user should be able to read a single doc file and get the full picture on that topic.
3. **No duplication.** If information lives in `docs/`, README links to it — does not repeat it. Exception: the installation command can appear in both (users expect it in README).
4. **Navigation.** Every doc file has a header line with prev/next links following the Documentation table order: `[← Previous Page](prev.md) · [Back to README](../README.md) · [Next Page →](next.md)`. First page has no prev link; last page has no next link. Every page ends with a "See Also" section linking to 2-3 related pages.
5. **Cross-links use relative paths.** From README: `docs/workflow.md`. Between doc pages: `workflow.md`.
6. **Scannable.** Use tables, bullet lists, and code blocks. Avoid long paragraphs. Users scan, they don't read.

## Step 0 — Project context

Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`; `.claude/rules/**/*.md`;
`AGENTS.md`. FALLBACK only when the project uses AI Factory and those files are absent: `.ai-factory/DESCRIPTION.md` (fallback),
`.ai-factory/ARCHITECTURE.md` (fallback). MUST/MUST NOT lines there are project rules — also for the docs you write (language of
the existing README wins; no invented features).

Explore the code: `package.json`, `composer.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, the `src/` layout,
existing docs, comments, API endpoints, CLI commands. Detect real facts; never invent them.

Glob the project root for `*.md` (not `node_modules/`, `.git/`, `.claude/`, `docs/keystone/`): `CHANGELOG.md`,
`CONTRIBUTING.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `SECURITY.md`, `API.md`, `SETUP.md`, `DEVELOPMENT.md`,
`TESTING.md`… Record each file, its size and a one-line summary — used in Step 2.

## Step 1 — Mode

- **`update <files|topics>`** → Step 5 (targeted update). The argument is a list of changed files or topics.
- `--web` → also build an HTML site from the pages (Step 6).
- Otherwise determine the state:

```
State A: No README.md                    → full generation (README + docs/)
State B: README.md exists, no docs/      → analyze README, propose a split into docs/
State C: README.md + docs/ exist         → audit and improve (with --web: ask "HTML only / audit and improve first / audit only")
```

## Step 2 — Scattered markdown files

If Step 0 found root-level `.md` files, propose consolidating them into `docs/`:

| Root file | Target | Move or merge |
|---|---|---|
| `CONTRIBUTING.md` | `docs/contributing.md` | Move |
| `ARCHITECTURE.md` | `docs/architecture.md` | Move |
| `DEPLOYMENT.md` | `docs/deployment.md` | Move |
| `SETUP.md` | `docs/getting-started.md` | Merge (append) |
| `DEVELOPMENT.md` | `docs/getting-started.md` or `docs/contributing.md` | Merge |
| `API.md`, `TESTING.md`, `SECURITY.md` | `docs/api.md`, `docs/testing.md`, `docs/security.md` | Move |

Stay in root: `README.md`, `CHANGELOG.md`, `LICENSE*`, `CODE_OF_CONDUCT.md`. Show the list (file, lines, summary, suggested
action) and ask: apply all / pick which / skip. **Never force-move files.** When applying: create the target with the
navigation header and "See Also", **do not delete the originals**, add the page to README's Documentation table, fix
links that pointed at the old file, remember the list for Step 4.

## Step 3 — Generate or improve

**State A.** Pick topics: `getting-started.md` always; `architecture.md` (clear modules/layers), `api.md` (endpoints),
`configuration.md` (env vars, config), `deployment.md` (Dockerfile/CI), `contributing.md`, `security.md`, `testing.md`,
`cli.md` when they apply. Show the list and ask: generate all / pick / add topics. Then write README
(title, tagline blockquote, 2-3 sentence description, Quick Start with real commands detected from the package manager,
3-6 Key Features, one real Example, Documentation table, License — **no long descriptions, no API reference, no config
details**) and the approved pages (header, content, `## See Also`). Content per page: getting-started = prerequisites,
steps, first run, expected output, next steps; architecture = overview, directory structure, patterns, data flow;
api = base URL, auth, endpoints by resource, examples, errors; configuration = every variable with default.

**State B.** README over ~150 lines with no `docs/`: keep title, tagline, features, quick install, example, links; move
sections longer than ~30 lines on a single topic. Show the split plan and ask before writing; then verify no content was
lost — every old section exists somewhere.

**State C.** Audit: README length (<150 lines), missing topics, stale references to files/APIs that no longer exist,
navigation and "See Also", broken internal links, consistent format, standards gaps (table in
`${CLAUDE_SKILL_DIR}/references/CHECKLIST.md`, "Standards Compliance Check"). Present findings as ✅/⚠️/❌ with proposed
fixes and ask before applying.

## Step 4 — Review (mandatory after any content change)

Read every generated/modified file and run both checklists in `${CLAUDE_SKILL_DIR}/references/CHECKLIST.md`
(Technical, Readability — "New User Eyes"). Fix what fails before presenting the result; show a compact table with
✅/❌/⚠️. Skip only for "HTML only".

**Moved files.** After the review confirms the content is in `docs/`, ask whether to delete the originals: all / pick /
keep. **Do NOT auto-delete.** Before any deletion verify the target contains everything, then show `git status` so the
user can restore with `git checkout`.

**Pointers.** If `AGENTS.md` or `CLAUDE.md` exists and has a documentation list/table, synchronize it with the final set
of pages (README first, then docs in Documentation-table order, descriptions under 10 words), after showing the diff. If
neither has such a list, do nothing. This skill does not generate `AGENTS.md`.

## Step 5 — `update <files|topics>`

Used after a code change (by `/keystone:implement` when Settings say `docs — yes`, or by hand).

1. Map the argument to pages: grep `docs/` and README for the changed file names, symbols, commands, env vars and
   flags; pages that describe a topic named in the argument.
2. Read only those pages and the changed source. Fix what became wrong or missing: commands, options, env vars, paths,
   examples. Add a short section where a new feature has no home; create a new page only if no page fits, and then add
   it to the Documentation table and navigation.
3. Leave everything else untouched — no restructuring, no consolidation, no README rewrite beyond the affected lines.
4. Show the diff and ask for a yes before writing (when called from implement: the human already approved the plan,
   but docs edits are still shown as a diff first).
5. Run the Technical checklist on the touched pages only. Report `docs: updated <pages> | nothing to update`.

## Step 6 — HTML (`--web`)

`mkdir -p docs-html`; for README and every `docs/*.md` produce a page (`README.md` → `index.html`, `.md` links →
`.html`, a nav bar); no template file is shipped — keep the markup plain and self-contained. Add `docs-html/` to
`.gitignore` (shown first). Print the tree and `open docs-html/index.html`.

## Rules

1. **Always ask before changing existing documentation** — show the plan or diff first.
2. **Never delete content** without moving it somewhere else.
3. **Detect real project info** — don't invent features; read the manifests.
4. **Use the project's language** — a Russian README gets Russian docs.
5. **Preserve existing badges and logos.**
6. Ownership: `README.md`, `docs/*` and the documentation pointers in `AGENTS.md`/`CLAUDE.md` only. Never touch
   `docs/keystone/`, rules, or code.

## Report

`Blocked on me:` what needs the user's yes · `Changed:` files written · `Found:` problems left (broken links, stale
sections). Write `none` for an empty line. Suggest `/clear` or `/compact` if the context is heavy.

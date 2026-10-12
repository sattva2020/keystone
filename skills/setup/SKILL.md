---
name: setup
description: "Keystone: set up agent context for a project — analyze the stack, write a short CLAUDE.md, .claude/rules/base.md, a project .mcp.json (secrets only as ${VAR}) and recommend Claude Code plugins. Existing project, new project from a description, or an empty folder. Every write is shown as a diff and needs an explicit yes; a re-run adds only what is missing and never overwrites. Use for 'set up the project', 'configure AI context', 'init', 'what MCP / plugins do I need'."
argument-hint: "[project description for a new project — empty: analyze this repo]"
allowed-tools: Read Glob Grep Write Edit Bash(git *) Bash(ls *) AskUserQuestion
model: opus
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · setup — agent context for a project

Writes the few files that let an agent work in this repo without re-discovering it every session: `CLAUDE.md`,
`.claude/rules/base.md`, `.mcp.json`, plugin recommendations in `.claude/settings.json`. It ONLY sets up context.
Signals → rule/command/MCP/plugin table: read `${CLAUDE_SKILL_DIR}/references/STACK-SIGNALS.md` before step 3.

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

**Next step (mandatory).** The answer always ends with one line `Next: <the exact command with paths>` — e.g.
`Next: /keystone:verify docs/keystone/2026-10-12-x/plan.md` — or, when nothing is to be run now,
`Next: nothing now — waiting for <event>; then <command>`. Never end on a caveat or an open-ended question.

## Hard rules

1. **Show, then ask, then write.** Every file change is shown first (full content for a new file, a diff for an
   edit), then `AskUserQuestion`: **Write / Skip / Change**. Write only after "Write". "Change" → take the user's
   wording, show again.
2. **Never overwrite.** An existing file is read first; you add only what is missing, as an edit. A re-run on a set-up
   repo writes nothing and says so. (AIF re-wrote DESCRIPTION and rules on every run — this skill must not.)
3. **Secrets only as `${VAR}`.** Never a token, password or connection string in any file; never ask for one in chat.
4. **No project code.** No `src/`, no features, no scaffolding beyond the context files.
5. Ask in the user's language; files are written in the language the repo's existing docs use (default English).

## 1. Mode

```text
$ARGUMENTS has a description?  → Mode B: new project with description
no arguments:
  manifests exist (package.json, pyproject.toml, requirements.txt, go.mod, Cargo.toml, composer.json,
                   pom.xml, build.gradle*, Gemfile, *.csproj, docker-compose.yml, prisma/schema.prisma)
                                → Mode A: analyze the existing project
  nothing of the above          → Mode C: empty folder, interactive
```

Say the mode in one line. Also record what already exists: `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md`,
`docs/architecture.md`, `.mcp.json`, `.claude/settings.json`, `AGENTS.md`, `README.md`.
Project context to respect: read `CLAUDE.md`, `docs/architecture.md`, `.claude/rules/**/*.md`, `AGENTS.md`;
only if they are absent and the project uses AI Factory, fall back to `.ai-factory/DESCRIPTION.md`,
`.ai-factory/ARCHITECTURE.md`, `.ai-factory/RULES.md` (fallback source, never a target).

## 2. Mode A — analyze the existing project

Scan, reading only what exists: the manifests above, lockfiles, `Makefile`/`justfile`/`Taskfile`, `.github/workflows/`,
test configs, linters/formatters configs, `docker-compose.yml`, the top 2 levels of the tree (`src/`, `app/`, `api/`,
`packages/`), `git remote -v`. Facts come from files, never from guessing.

Present the analysis (this exact heading, then continue to step 3):

```markdown
## Project analysis
**Detected Stack:** <language>, <framework>, <database if any>, <package manager>
**Commands found:** build `…` · test `…` · lint `…` · run `…`   (source file for each; "not found" otherwise)
**Structure:** <5–8 lines: directory → purpose>
**Already present:** <files from step 1> · **Missing:** <files this skill can add>
```

## 2b. Mode B — new project with description

Ask the user to confirm the stack. Show YOUR recommendation with "(Recommended)" label, tailored to the project type,
and say WHY in one line each. Four questions (skip categories that do not apply — no database for a CLI tool, no
framework for a library), one `AskUserQuestion` per category, recommended option first:

1. **Programming language** — performance, ecosystem, team experience
2. **Framework** — only if the project type needs one
3. **Database** — by the data model
4. **ORM / query builder** — by language and database

The description plus the confirmed choices replace the "analysis" block of Mode A (commands are the framework's
standard ones, marked `(standard, not yet in repo)`). Continue to step 3.

## 2c. Mode C — empty folder

Say: "I don't see an existing project here. Let's set one up!" and ask what kind of project it is (one line:
"CLI tool for file processing", "REST API", "mobile app", "data pipeline"). Then run the four stack questions of 2b.
Create no source files — only the context files of step 3.

## 3. Propose the files (one change at a time)

Order of the questions: `CLAUDE.md` → `.claude/rules/base.md` → `.mcp.json` → plugins → `AGENTS.md`. Each one is its own
show → Write / Skip / Change round; collect the answers first and write only after the last round, in the write order below. A file that is complete is reported "already there" and skipped without a question.

**Write order and links.** Write in this order: `.claude/rules/base.md`, `.mcp.json`, then `CLAUDE.md` last, and let
`CLAUDE.md` and `AGENTS.md` point only to files that now exist — a skipped or refused file loses its pointer line.
Claude Code asks its own permission for anything under `.claude/` and for `.mcp.json`; say so once before the first
write ("Claude Code will ask permission for these paths — that prompt, not this chat, is the yes it needs"). A write
that is still refused is reported and skipped; never retry the same write or route around it (Bash, other paths), and
go on with the next file. Commit only what was written.

### 3.1 `CLAUDE.md` — at most 60 lines

Sections, in this order, each short:

```markdown
# <project name>
<one sentence: what it is>

## Stack
<language, framework, database, package manager — one line>

## Commands
- Build: `…`   - Test: `…`   - Lint: `…`   - Run: `…`      (only commands that exist; found in package.json /
  Makefile / pyproject / CI — write the file name in parentheses when it is not obvious)

## Structure
<5–8 lines: directory → purpose>

## Docs and rules
- Architecture: `docs/architecture.md` (if it exists, otherwise omit the line; `/keystone:architecture` creates it)
- Coding rules: `.claude/rules/` (base.md)
```

No prose about "how to work", no copies of README, no secrets. Over 60 lines → cut, do not split.

**`AGENTS.md` exists and no `CLAUDE.md`.** Claude Code (v2.1.277+) already reads that `AGENTS.md` as the project
instructions, and a new `CLAUDE.md` would switch it off. So the `CLAUDE.md` you propose starts with the line
`@AGENTS.md` (import) and holds only the sections `AGENTS.md` lacks; say this in one line. If the user prefers one
file, offer to append the missing sections to `AGENTS.md` instead and write no `CLAUDE.md`.

**CLAUDE.md already exists.** Do not touch the existing text. Compare with the section list above and show the user a
table `section | present | missing`. For the missing ones only: show the exact lines you would append and ask
Write / Skip / Change. An existing file that is already over 60 lines is reported, not trimmed.

### 3.2 `.claude/rules/base.md` — conventions from code

Analyze the codebase to detect: naming conventions (camelCase, snake_case, PascalCase), module boundaries
(`src/core/`, `src/cli/`, `src/utils/`), error handling patterns (try/catch, error codes), control flow patterns
(guard clauses, early returns), logging patterns, test patterns. Sample several real files per finding; a convention
seen once is not a convention. Write short `MUST` / `SHOULD` lines, one fact per line, no headings per language:

```markdown
# Base rules (detected from the code — edit as needed)
## Naming     - MUST name files in kebab-case (`user-service.ts`).   - SHOULD …
## Modules    - MUST NOT import from `src/cli/` inside `src/core/`.
## Errors     - MUST throw `AppError` subclasses, not bare `Error`.
## Logging    - MUST log through `logger`, never `console.log`.
## Control flow - SHOULD prefer guard clauses and early returns over nested conditionals.
```

Mode B/C (no code yet): write only the framework's standard conventions, marked `(standard — adjust)`.
File exists → add only the headings that are missing; never rewrite existing lines.

### 3.3 `.mcp.json` — by signals

Pick servers with the table in STACK-SIGNALS.md (github, postgres, playwright, context7 …). Entry shape for Claude
Code only: `{"mcpServers": {"<name>": {"command": "npx", "args": [...], "env": {"VAR": "${VAR}"}}}}`.
Remind about env vars: after the diff list every `${VAR}` the user must set in their shell or environment, and say
that a server stays inactive until it is set. **Existing `.mcp.json` → merge:** keep every entry untouched, add only
absent server names, show the diff. Invalid JSON in the existing file → stop, report, do not rewrite.

### 3.4 Plugins — recommend, never install

Skills from skills.sh and generated skills are deliberately not part of this setup. Instead, recommend Claude Code
plugins by signal (STACK-SIGNALS.md): memory for the project, code intelligence (LSP) for a typed language, and so on.
Where you are not sure of the exact plugin id, write "search `/plugin` for <topic>" — never invent a name. Show the
list; for the ones the user picks, show the `.claude/settings.json` edit (`enabledPlugins`, and
`extraKnownMarketplaces` when the plugin comes from a custom marketplace) and apply it only after "Write". Merge into
existing JSON; keep every other key. This skill never installs a plugin and never runs `/plugin` — the user does.

### 3.5 `AGENTS.md`

Only if it already exists: sync its pointers (stack line, commands, links to `CLAUDE.md`, `docs/architecture.md`,
`.claude/rules/`) with what you wrote, as a diff, with confirmation. If it does not exist, do not create it.

## 4. Re-run report

End every run with this table, even on the first run:

```text
| File                     | Result                        |
| CLAUDE.md                | already there / added (<n> lines) / skipped |
| .claude/rules/base.md    | …                             |
| .mcp.json                | …                             |
| .claude/settings.json    | …                             |
| AGENTS.md                | … / not present               |
Env vars to set: GITHUB_TOKEN, DATABASE_URL, …  (or: none)
```

A re-run where everything is "already there" prints the table and "nothing to add" — no writes, `git diff` stays empty.

## 5. Next steps and commit

`AskUserQuestion` with multi-select — only offered, never started on its own:

1. `/keystone:architecture` — architecture pattern and folder rules → `docs/architecture.md`
2. `/keystone:docs` — README and docs structure
3. `/keystone:dockerize` — Dockerfile and compose
4. `/keystone:ci` — CI workflow
5. Skip

Selected → tell the user the commands to run, in that order (or invoke them if the harness allows). Then, if files
changed, offer a commit following the project's convention (`chore: keystone setup` when none is evident):
"Commit these files? Yes / No". Commit only on "Yes", only the files this run wrote (`git add <paths>`, never
`git add -A`).

## Do not

- Start writing project code, create `src/` or features. This skill ONLY sets up context. Your job ends when
  `CLAUDE.md`, rules, `.mcp.json` and plugin recommendations are done; the user decides when to start implementation.
- Overwrite, reorder or "tidy" an existing file; put a secret anywhere; install a plugin, skill or package.
- Ask what the repo already answers (stack, commands, remote) — read it.
- Treat the `.ai-factory/` fallback files as targets; they are read-only context for projects that still have them.

Report: files touched with line counts, what was skipped and why, env vars still to set.

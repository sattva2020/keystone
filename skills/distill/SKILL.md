---
name: distill
description: "Keystone: distill books, documents, folders or URLs into compact, practical Claude Code skills — one reusable skill package or a split set of focused skills, each with a concise SKILL.md plus detailed references and examples. Asks where to save (project .claude/skills/ or personal ~/.claude/skills/) and shows the file list before writing."
argument-hint: "<path|url> [path|url...] [--name <skill-name>] [--path <directory>] [--update] [--redact-source-map] [--split|--split-by <strategy>]"
allowed-tools: Read Write Edit Glob Grep Bash(mkdir *) Bash(ls *) Bash(find *) Bash(wc *) Bash(python3 --version) Bash(python --version) Bash(py -3 --version) Bash(py --version) Bash(python3 *material-prep.py*) Bash(python *material-prep.py*) Bash(py -3 *material-prep.py*) Bash(py *material-prep.py*) WebFetch WebSearch AskUserQuestion
model: opus
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-distillation/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · distill

Turn source material into a useful skill. The output is not a summary dump: it is an operational skill that captures the best
practices, decision rules, workflows, checks, and examples from the material.

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

## Step 0 — project context and destination

Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`; `.claude/rules/**/*.md`; `AGENTS.md`.
They tell which
stack and conventions the generated skill should fit, and the language of generated content: use the language the user writes in,
or the source material's language when they say so.

**Where to save** — ask once with AskUserQuestion unless `--path` was given:
1. the project: `.claude/skills/<name>/` (shared with the team through git) · 2. personal: `~/.claude/skills/<name>/` (all your projects).
The chosen root is the **output root**. `--path <directory>` replaces the question and sets the output root directly.

## Inputs

Accept `$ARGUMENTS` as one or more:
- local files, local directories, URLs
- optional `--name <skill-name>`
- optional `--path <directory>` to save generated skill package directories under a custom output root
- optional `--update` to improve an existing skill instead of creating a duplicate
- optional `--redact-source-map` to skip generated source-map files and sections entirely, so exact source titles, URLs, local paths,
  repository paths, and link reference definitions are not written to output
- optional `--split` to create several focused skills from one material set
- optional `--split-by <strategy>`: `auto` (default; infer boundaries from user goals, triggers, workflows, source topics, use cases),
  `goal` (jobs-to-be-done), `topic` (major source topics or chapters), `workflow` (recurring actions an agent performs),
  `audience` (distinct roles or implementation contexts)

If the target skill name is missing, derive a concise, general, lowercase-hyphenated name from the material topic or user goal, such
as `clean-code-style`, `api-design-rules`, `decision-making`, `writing-feedback`, or `meeting-facilitation`.

Before any write, validate the final target skill name:
- It must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Reject empty names, overlong names, `.`, `..`, dots, path separators (`/` or `\`), absolute paths, Windows drive paths, and hidden names.
- Reject `keystone-*` names and names that shadow an existing skill in the output root (unless `--update` targets exactly that skill).
- Treat relative `--path` values as relative to the current working directory. Create the output root if it does not exist; reject it
  if it resolves to an existing file.
- Resolve the final destination path and confirm it is inside the output root before creating or updating files.

Single-skill destination: `<output-root>/<skill-name>/`. Split-mode destination: `<output-root>/<prefix>-<child-scope>/` for each child;
every child name shares one namespace prefix (`--name` preferred; otherwise a concise prefix from the material title; with
`--redact-source-map` a neutral topic prefix). Never save distilled skills into this plugin's own `skills/` directory.

## Workflow

1. **Prepare sources.**
   - Normal text, markdown, JSON, YAML, HTML or code files: read directly.
   - Large folders or PDFs: use `${CLAUDE_SKILL_DIR}/scripts/material-prep.py` only when a working Python 3 interpreter exists.
     Detect it with `python3 --version`, `python --version`, `py -3 --version`, then `py --version`; use the first that exits
     successfully and reports major version 3. Read `${CLAUDE_SKILL_DIR}/references/LARGE-MATERIALS.md` when the material is large
     (it has the exact command shapes, chunking and cleanup).
   - Expand the chosen interpreter to a concrete command, e.g. `python3 ${CLAUDE_SKILL_DIR}/scripts/material-prep.py <source...>` or
     `py -3 …`. Do not run arbitrary Python payloads.
   - No Python 3: do not invoke the helper. Continue with direct `Read`/`Glob`/`Grep`/`find`/`wc` sampling for accessible text files, ask
     the user for a text/markdown export for PDFs or very large sources, and clearly report the reduced coverage.
   - URLs: fetch the source and any critical linked pages needed to understand the topic.

2. **Distill, do not copy.**
   - Extract transferable principles, workflows, heuristics, checklists, terminology, and failure modes.
   - Inventory examples from the source, especially code snippets, before deciding the output structure; group them by topic so
     coverage can be checked later.
   - Preserve only short source excerpts when essential. Prefer paraphrase and cite sources.
   - Convert narrative advice into agent-operable instructions and source examples into original, reusable examples.

3. **Choose single-skill or split-skill design.**
   - Default to single-skill mode unless `--split` or `--split-by` is present.
   - In split mode, resolve one shared namespace prefix, then write a skill boundary map before any file: proposed prefixed name,
     user-facing job, trigger description, owned source topics, references/examples needed, overlap risks.
   - Prefer split mode when the material has independent goals that trigger separately (reviewing, planning, diagnosing, rewriting,
     teaching, deciding, testing, auditing, troubleshooting).
   - Name children by the user goal, not by an abstract source theme; avoid `principles`, `philosophy`, `chapter-4`, `mindset`,
     `overview` unless the user asked for that taxonomy.
   - Do not split into tiny skills that differ only by wording; merge candidates whose triggers, workflow and references overlap.
   - Every child is independently useful: its own frontmatter, workflow, references/examples, and (unless `--redact-source-map`)
     its own source map.

4. **Design the package.** Read `${CLAUDE_SKILL_DIR}/references/DISTILLATION-PROTOCOL.md` and
   `${CLAUDE_SKILL_DIR}/references/OUTPUT-STRUCTURE.md` before generating or updating a skill.
   - Generated `SKILL.md` stays focused on purpose, triggers and workflow; detailed knowledge goes to `references/`, prompts and
     transformed examples to `examples/`, scripts only when the workflow needs repeatable processing.
   - The description starts with an action verb and says what the skill reviews, improves, generates or checks. Near the top, answer in
     plain language: what it does, when to use it, what output it produces.
   - **Claude Code frontmatter**: `name` (= folder), `description` — wrap it in double quotes if it contains `: `, optional
     `argument-hint` and `allowed-tools`. No other fields are needed.
   - Code-teaching material gets adapted before/after examples; book-scale code material covers every major code-facing topic or
     states why a topic needs none. Never omit examples only because verbatim copying is inappropriate.
   - With `--redact-source-map`: no `references/SOURCE-MAP.md`, no "Source Map" section anywhere; in `--update` mode leave an existing
     non-empty `SOURCE-MAP.md` unchanged unless the user asks to remove it.

5. **Check existing content.** If the target already has matching references or examples, update them in place; no near-duplicate
   files; preserve useful existing material. In split mode also check sibling skills under the output root and update a matching one
   (`--update`) instead of creating a near-duplicate.

6. **Show before writing.** List every file that will be created or changed, with its role and an approximate line count, plus the
   output root and (split mode) the boundary map. Ask for an explicit yes (AskUserQuestion: write / change names / change scope).
   Nothing is created before the yes, including the output root.

7. **Write, then validate usefulness** (after the yes only).
   - The skill tells an agent what to do, when, what good output looks like, and which mistakes to avoid.
   - The name and description are invocation-ready: if a user would ask "what does this skill actually do?", rename or rewrite.
   - References are dense and navigable; examples demonstrate decisions or transformations, not filler.
   - Meaningful code snippets or worked examples in the source ⇒ adapted examples in the output; missing ones are a failure to fix.
   - Example coverage matches source coverage: recorded in the source map, or checked internally under `--redact-source-map`.
   - Skills that read or write project artifacts include an artifact-ownership section (what they own, what is read-only).
   - Split mode: every child has a distinct activation trigger; if two would fire for the same request, merge them.
   - Remove temporary chunk directories and downloads; keep only the final package (see `LARGE-MATERIALS.md`).

Use `${CLAUDE_SKILL_DIR}/examples/REQUESTS.md` for invocation patterns.

## Report

`Saved to:` (output root + package names) · `Files:` (list with line counts) · `Coverage:` (what was read in full, sampled, skipped —
state any reduced coverage honestly) · `Examples:` (topics covered or the reason none) · `Next:` how to invoke the new skill
(`/<name>` for a project skill, `/<name>` after a restart for a personal one).

## Artifact ownership

- Primary ownership: generated or updated skill packages under `<output-root>/<skill-name>/` (or the prefixed children in split mode).
- Read-only: project context files, existing skills other than the selected target in update mode, and the source material.
- Writes happen only after the file list was shown and confirmed.

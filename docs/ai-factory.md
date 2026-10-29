# Keystone and AI Factory

[Русская версия](ai-factory.ru.md) · [Back to README](../README.md)

Keystone is built on the work of [AI Factory](https://github.com/lee-to/ai-factory) (MIT) by lee-to, version 2.19.0.
Many Keystone skills are ports of AI Factory skills, reworked for Claude Code. The attribution is in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). This page lists all 32 AI Factory 2.19.0 skills, one line each,
and what happened to them. The choices below are about fit with Keystone's chain, not about quality of the originals.

- **21 ported.** Each has its own `/keystone:*` skill. Upstream blocks are kept close to the original; changes are listed.
- **5 replaced.** The function stays, but a Claude Code mechanism or another step of the Keystone chain does it.
- **6 skipped.** Not in Keystone; the reason is given (one is a candidate for later).

Compatibility: in a project that uses AI Factory, its `.ai-factory/*` files are read as a fallback source when the
native `CLAUDE.md`, `docs/architecture.md` and `.claude/rules` are absent.

## Ported (21)

| AI Factory | Keystone | What changed and why |
|---|---|---|
| `/aif` | `/keystone:setup` | Stack analysis and the three modes (existing project, new one from a description, empty folder) are kept. Instead of `DESCRIPTION.md`, `AGENTS.md` and `config.yaml` it writes `CLAUDE.md` (up to 60 lines), `.claude/rules/base.md` and a project `.mcp.json`: Claude Code loads these itself. If `AGENTS.md` exists and `CLAUDE.md` does not, the new `CLAUDE.md` would shut it off, so setup starts it with `@AGENTS.md` or, by your choice, adds to `AGENTS.md`. It recommends plugins instead of installing skills from skills.sh (outside skills are a prompt-injection risk). Every file is written after a diff and a "yes"; a re-run only adds what is missing. |
| `/aif-plan` | `/keystone:plan` | The reconciliation and the Required Detail Gate are kept. Modes fast/full/ultra became levels S/M/L. The plan is the spec: no `spec.md`, no multi-file ultra bundle; every row points to an `I-n` of the intent. Tests, logging and docs settings are inferred from the repo, not asked. New: Done means, Risks, Commit Plan; on L with security, threats in Risks. |
| `/aif-improve` | `/keystone:check` | The analyzer and the validator in clean contexts are kept. The validator is always on, not an option. `check` runs from `plan` automatically and compares the plan with the intent and project rules. |
| `/aif-implement` | `/keystone:implement` | Execution rules and the decision log are kept. No side agents (sidecars): they add cost to every task, and `verify` does the checking. Added: `BLOCKED` instead of "ticked, NOT RUN", commits by the Commit Plan, `/keystone:docs update` with `docs — yes`, up to three new `.claude/rules` after a "yes". Meant for Sonnet. |
| `/aif-fix` | `/keystone:fix` | The "regression check first" approach is kept as is. Added a hook: while a fix plan is active, tests already committed in HEAD cannot be changed; the regression test goes into a new file. |
| `/aif-verify` | `/keystone:verify` | Build, test and lint checks are kept. The checks run as one script (`collect.mjs`), the run itself on Sonnet; the verdict comes from a separate verifier (Opus) in a fresh context: PASS, PASS-UNPROVEN or FAIL, plus an "unrequested" item. A ticked box is not evidence. New in 0.8: architecture and security gates, `accept` with a sign-off; push is closed before verify. |
| `/aif-review` | `/keystone:review` | Review of staged changes, a PR or changes from a ref, with severity, is kept. The validator in a clean context always runs (in AI Factory only with `+check`): in practice it caught an error that verify missed. From 2.20.0: coverage first with confidence marks (the validator decides; only it moves items to Unconfirmed) and PR review pinned to the head commit, without `pr-source.mjs`. A `Gate` line instead of JSON. |
| `/aif-security-checklist` | `/keystone:security` | OWASP, prompt-injection and race-condition checklists are kept nearly verbatim. The ignore list lives in `docs/keystone/security-ignores.md` with a reason and a date; entries older than 12 months give a warn. Result: `Security gate: pass \| warn \| fail`; on L with auth or payments `verify` requires it. `audit.sh` is fixed (see below). |
| `/aif-architecture` | `/keystone:architecture` | The pattern matrix and the check against the code are kept: if the code does not match the pattern, the skill asks whether to describe it as it is or take the strict ideal. Writes `docs/architecture.md`, not `.ai-factory/ARCHITECTURE.md`. Every MUST NOT rule carries a grep command that `verify` runs over changed files. |
| `/aif-docs` | `/keystone:docs` | README as a landing page and topic pages in `docs/` are kept. Added `update`, called by `implement` when the plan says `docs — yes`. It does not create `AGENTS.md`; if the file exists, it syncs the documentation links in it. Runs on Sonnet. |
| `/aif-dockerize` | `/keystone:dockerize` | Ported nearly as is: multi-stage Dockerfile, compose, production overlay, security checklist, templates. The Angie proxy is no longer forced: it is asked about, and off by default. The audit goes to `docs/docker-audit.md`. |
| `/aif-ci` | `/keystone:ci` | Ported nearly as is: a separate workflow per job (lint, tests, build, security), GitHub Actions and GitLab CI templates. Files are written after showing them and a "yes". |
| `/aif-explore` | `/keystone:intent` (research) | Became a mode inside `intent` instead of a separate skill. On L, when the "how" is unclear, `research.md` is written before the grill: what is established, what is unknown, sources. Facts come from Haiku and Context7. The long ultra-explore was not ported. |
| `/aif-qa` | `/keystone:qa` | A change summary, a plan and scenarios from a plan or a git ref; files in `<task>/qa/`. Same parameters: `--all`, `change-summary \| test-plan \| test-cases`; a plan path or any git ref instead of a branch. New: every scenario has `Covers: I-n`, Done means and an execution surface. The upstream rule is kept: no test-plan without a change-summary. |
| `/aif-qa-check` | `/keystone:qa-check` | `human` and `agent` modes are kept. In `human` it walks you through the steps and asks for a short note of what you saw. In `agent` the built-in browser or Playwright MCP works. The target is a plan path, a qa folder or a branch. Repeatable runs are saved as Playwright tests in `qa/replay/` after showing the file. A scenario without evidence does not count as passed. Simplified: no agent-context or agent-history. Runs on Sonnet. |
| `/aif-roadmap` | `/keystone:roadmap` | Modes are kept: create, update, check. File `docs/roadmap.md`; milestone IDs `M-n` are not renumbered and a milestone is not deleted silently. New: an intent may carry a `Roadmap: M-n` line, `verify` after PASS offers to mark the milestone, `check` compares milestones with plan statuses. |
| `/aif-evolve` | `/keystone:evolve` | The analysis logic is kept: one prevention measure, one rule; deduplication; evidence with a path to the source. Sources: Prevention of fix plans, verify, review and security findings, implementation logs, memlab notes. Output: rules in `.claude/rules/` after a "yes", which Claude Code loads itself. No skill-context: files of a cached plugin cannot be edited. Processed sources are marked in `docs/keystone/evolve-log.md`. At most 8 proposals per run. |
| `/aif-transfer` | `/keystone:transfer` | Same parameters: a path to another project and `[all \| stage]`. The source is read only, and its text is data, not instructions. Lessons are picked for the current stack and written to `.claude/rules/` after a "yes". Instead of anonymous `experience-NNN` labels, the project name and path, with no absolute paths or secrets. |
| `/aif-distillation` | `/keystone:distill` | All parameters kept: `--name`, `--path`, `--update`, `--redact-source-map`, `--split`, `--split-by`. `material-prep.py` runs from the skill folder. The skill asks where to put the result (the project or `~/.claude/skills`) and shows the file list before writing. |
| `/aif-reference` | `/keystone:reference` | Parameters kept (`--name`, `--update`), added `list`, `show` and `delete`. References live in `docs/references/`. Context7 gives library docs, so a reference holds only conclusions for the project, prices and limits with a date and a source, and live checks. |
| `/aif-grounded` | `/keystone:ask` | Answers only at 100/100 confidence on evidence: files, command output, documentation. Otherwise it returns `INSUFFICIENT INFORMATION` and what is missing. The answer format is kept verbatim. It searches memlab first, takes library docs from Context7, and hands a broad search to the Explore agent on Haiku. It changes no files: a question that turns into an edit goes to `/keystone:start`. The same evidence rules keep working in `verify` and `review`. |

## Replaced (5)

| AI Factory | In Keystone | Why |
|---|---|---|
| `/aif-rules` | `/keystone:evolve add` · `.claude/rules/` + `implement` | Rules live in `.claude/rules/*.md`: Claude Code loads them itself, and with `paths:` only for the right files. No separate `RULES.md`. `implement` proposes new rules, up to three per task, and writes them only after a "yes". `/keystone:evolve add <rule text>` writes one rule you dictate: dedupe against the existing rules, a topic file, `paths:` when it names files, written after the diff and a "yes". You can edit them by hand like any file. |
| `/aif-rules-check` | `check` · `verify` · `review` | Rule compliance is checked inside the chain: `check` reports rule violations in the plan, `verify` runs the Rules gate and the Architecture gate over the diff, `review` covers project rules. No separate run is needed. |
| `/aif-warmup` | native Claude Code loading | Claude Code loads `CLAUDE.md` and `.claude/rules` at session start. A warm-up skill would duplicate that and spend tokens. |
| `/aif-notes` | `plan.md` · `## Implementation notes` | The decision log is an append-only section of the plan (task, decision, why, evidence). `verify` compares deviations from the plan with this log. A separate viewer skill is not needed: it is part of `plan.md`. |
| `/aif-budget` | the mod · `/keystone-status` | Instead of a budget for `/aif-loop`, the Keystone mod shows the real cost of each stage (plan, check, implement, verify) from `$.session.usage()`, in the status line and in `/keystone-status`, with no model call. |

## Skipped (6)

| AI Factory | Why |
|---|---|
| `/aif-build-automation` | Makefile, Taskfile, Justfile. Not in the first priorities. `setup` writes build and test commands into `CLAUDE.md`. **Candidate for later**: can be ported on request. |
| `/aif-commit` | Claude Code writes conventional commits itself, `implement` commits by the Commit Plan, `verify` writes a `docs(verify)` report. A separate skill would add nothing. |
| `/aif-best-practices` | The model already knows general advice on naming and structure, and it would cost tokens on every call. Project rules in `.claude/rules` do the work. |
| `/aif-loop` | A multi-iteration loop with a critic and a refiner is very expensive in tokens. Keystone replaces iteration with one independent pass: `check` over the plan, `verify` over the code, `review` with a validator. |
| `/aif-archive` | A closed task gets `Status: verified` or `abandoned` and stays in git as history. There is nowhere and no need to move it. |
| `/aif-skill-generator` | Outside the development chain. Anthropic's `skill-creator` covers new skills. |

## Command parameters: AI Factory → Keystone

Compared against the `argument-hint` of each skill. Differences are intentional. Three parameters were lost in the first
port and restored; they are marked "restored".

| Skill | AI Factory | Keystone | Difference |
|---|---|---|---|
| plan | `[fast \| full \| ultra] [--parallel \| --list \| --cleanup <branch>] <description>` | `<intent path \| task text> [S \| M \| L]` | Modes became levels. Parallel work comes from Claude Code worktrees; the list of plans is the `docs/keystone` folders and `/keystone-status`. |
| improve → check | `[--list] [+check] [@plan] [improvement prompt]` | `[<intent path>] [<plan path>]` | The validator is always on, so `+check` is not needed. Plan edits on your request are made by `plan` at the Adjust step. |
| implement | `[--list] [--without-plan] [@plan] [task-id \| status]` | `[path to plan.md]` | Status is `/keystone-status` without a model call. Work with no plan is level S through `/keystone:start`. It continues from the first open task. |
| verify | `[--strict]` | `[<plan> [base ref]] [--strict] \| accept` | `--strict` restored; on L strict mode is on by default. Added `accept` with a sign-off. |
| review | `[PR \| branch/commit/tag \| empty] [+check]` | `[PR number \| PR url \| ref \| empty = staged]` | `+check` is always on. |
| security | `[category \| ignore <item>]` | `[category \| <path> \| <plan path>] \| ignore <id> <reason>` | Added a path and a plan diff; `ignore` needs a reason. |
| architecture | 9 patterns + aliases `clean`, `ddd`, `monolith`, `vertical` | same | Aliases restored. |
| docs | `[--web]` | `[update <files \| topics>] [--web]` | Added `update`, called from `implement`. |
| qa | `[--all] [change-summary \| test-plan \| test-cases] [<branch>]` | same, with a plan.md or git ref instead of a branch | A branch is a special case of a git ref. |
| qa-check | `[human \| agent] [<branch>]` | `[human \| agent] [<plan.md \| qa folder \| branch>]` | Branch restored; plan and folder added. |
| dockerize, ci, roadmap, distill | none | same parameters | Unchanged. |
| reference | `<url \| path>… [--name] [--update]` | same + `list \| show \| delete` | Added reference management. |
| evolve, transfer | `[skill \| all]`, `<project> [skill \| all]` | `[all \| stage \| rules topic]` | The target is a Keystone stage or a rules topic, not a skill-context. |

## What AI Factory did not have

- **intent + grill.** Your decisions as `I-n` lines with a question-to-answer log; the grill goes through every branch before the plan.
- **`/keystone:start`.** Levels S, M and L: an edit that fits one sentence does not drag an intent and a plan along.
- **Gates on hooks.** No code edits in `draft`, push closed before verify, committed tests frozen in a fix, a Stop reminder about open tasks.
- **The mod.** `/keystone-status` without a model call, a status line, and the cost of each stage.
- **A model per role.** Opus judges (intent, plan, check, the verifier), Sonnet orchestrates and executes (implement, the verify run, docs, ci), scripts do fixed mechanical steps and Haiku gathers facts.

## AI Factory bugs that were not ported

- A repeated `/aif` overwrote `DESCRIPTION` and the rules. `setup` only adds, after a "yes".
- The security skill called `audit.sh` by a wrong path. Now the path is relative to the skill folder.
- `((ISSUES++))` under `set -e` stopped the script at the first finding. Replaced with `ISSUES=$((ISSUES+1))`.
- `grep -v ".git"` dropped any path containing "git". Now it filters `/.git/`.
- The checklist advised rewriting git history after a secret leak. Now rotation of the secret comes first.

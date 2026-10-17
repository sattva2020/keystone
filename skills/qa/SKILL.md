---
name: qa
description: "Keystone: QA workflow for testing a feature or task implementation — change summary, test plan and concrete manual test cases, written to <task folder>/qa/. Input is a Keystone plan path, a git ref, or nothing (staged/working diff). With a plan, cases cite intent IDs (I-n) and the plan's `Done means:`. Use for 'test this', 'write test plan', 'what should I test', 'QA this change'; run the cases with /keystone:qa-check."
argument-hint: "[--all] [change-summary | test-plan | test-cases] [<plan.md path | git ref>]"
allowed-tools: Read Write Grep Glob Agent AskUserQuestion Bash(git *) Bash(mkdir *)
model: opus
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-qa/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# QA — Implementation Testing

Generates change summaries, produces test plans, and describes test scenarios for a feature or task implementation.
It writes only its three artifacts under `<task folder>/qa/` and changes no code and no context file.

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

## Modes

The skill operates in three sequential modes.

| Argument         | Mode           | What you do                                                      |
|------------------|----------------|------------------------------------------------------------------|
| `change-summary` | Change summary | Analyze what changed, assess risks, produce a summary            |
| `test-plan`      | Test plan      | Create a structured test plan based on the change summary        |
| `test-cases`     | Test cases     | Describe concrete test scenarios based on the plan               |
| `--all`          | Full pipeline  | Run all three modes in sequence without prompting between stages |

## Workflow

### Step 0 — Project context

Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`; `.claude/rules/**/*.md`
(rules with `paths:` apply only to matching files); `AGENTS.md`. FALLBACK only when the project uses AI Factory and those
are absent: `.ai-factory/{DESCRIPTION,ARCHITECTURE,RULES}.md` and `.ai-factory/rules/*.md` (all fallback).
MUST / MUST NOT lines are project rules. Use the stack, architecture and conventions from them when writing the artifacts.

### Step 1 — Parse arguments, resolve the input and the task folder

Parse `$ARGUMENTS` fully before doing anything else:

1. **`--all`** — set `all_mode = true`, remove the flag.
2. **Mode** — the first word matching `change-summary`, `test-plan` or `test-cases`; remove it.
3. **Input** — what remains:
   - a path to a `plan.md` (or its folder) → **plan input**: read the plan and the `intent.md` next to it;
   - a git ref (`git rev-parse --verify <arg>` succeeds) → **ref input**: the change is `git diff <ref>...HEAD`;
   - nothing → **working input**: the change is `git diff --cached`, or `git diff` when nothing is staged (say which);
     if an active plan exists (the newest `docs/keystone/*/plan.md` — or `paths.specs` from `.ai-factory/config.yaml`
     when the project has AI Factory — whose Status is draft, approved or implementing), read it and its intent too.
   - not a git work tree and no plan → manual change context (see `${CLAUDE_SKILL_DIR}/references/CHANGE-SUMMARY.md`).

A plan input has no diff of its own: take the change from the commits that implement it (`git log` since the plan's
baseline commit / the files named in its Tasks) and say how you scoped it.

**Task folder and output folder.** `task_folder` = the folder of the plan used (a plan under `docs/keystone/` — or under
`paths.specs` in an AI Factory project). `qa_dir = <task_folder>/qa/`. With no plan at all:
`qa_dir = docs/keystone/qa/<YYYY-MM-DD>-<slug>/`, slug from the ref or from the change (3–5 words, lowercase, hyphens).
`.ai-factory/qa/` is a FALLBACK read location only — existing QA artifacts there may be read as context, never written.

**If no mode was provided and `all_mode = false` — ask with AskUserQuestion:** which QA mode to run — change summary,
test plan, test cases, or the full pipeline (`--all`).

### Step 2 — Execute the selected mode

The skill runs **strictly sequentially** — each stage uses the artifact from the previous one:

```text
change-summary → test-plan → test-cases
```

Read the detailed instructions for the selected mode:

- Change summary — read `${CLAUDE_SKILL_DIR}/references/CHANGE-SUMMARY.md`; template `${CLAUDE_SKILL_DIR}/templates/CHANGE-SUMMARY.md`
- Test plan — read `${CLAUDE_SKILL_DIR}/references/TEST-PLAN.md`; template `${CLAUDE_SKILL_DIR}/templates/TEST-PLAN.md`
- Test cases — read `${CLAUDE_SKILL_DIR}/references/TEST-CASES.md`; template `${CLAUDE_SKILL_DIR}/templates/TEST-CASES.md`

#### Full Pipeline (--all)

Run all three modes in sequence. After each stage completes successfully, proceed to the next automatically —
**do NOT show the inter-stage `AskUserQuestion`**.

```text
1. Execute change-summary → save <qa_dir>/change-summary.md
2. Execute test-plan      → save <qa_dir>/test-plan.md
3. Execute test-cases     → save <qa_dir>/test-cases.md
4. Final report (below)
```

If any stage fails (e.g. git error, diff too large and the user cancels) — stop the pipeline and report which stage failed.

### Step 3 — Tie the cases to what was asked (plan input or active plan)

When a plan exists, QA is judged against what was asked, not only against the diff:

- every intent line `I-n` that has observable behaviour gets at least one test case; cite it in the case as `Covers: I-n`;
- the plan's `Done means:` line is turned into acceptance criteria of the test plan and into cases (each clause → a check);
- an intent line with no way to test it manually is listed under "Not testable manually" with the reason — never dropped;
- a plan row or diff area with no intent line stays in the cases as `Covers: unrequested` and is flagged in the summary.

Without a plan there is nothing to cite — the cases are grounded in the diff alone; say so in the summary.

### Step 4 — Final report

```text
QA: <change-summary | test-plan | test-cases | all> · input: <plan | ref | staged | working> · folder: <qa_dir>
Saved: <files written>
Covers: <n> of <m> intent lines (I-n) · Done means: <n clauses covered of m | no plan>
Blocked on me: <missing change context, decisions only the user can take | none>
Next: run the cases with `/keystone:qa-check human` or `/keystone:qa-check agent`. Context is heavy — suggest `/clear`.
```

## Principles

### DO:

- Understand the subject before writing test plans and test cases (analyze changes / test plan / merge request / task / text description)
- Use the repository code only to the extent needed for the change analysis, test plan, and test cases
- Write steps clearly enough that any tester can execute the test without knowledge of the codebase
- Specify concrete test data, not abstract "enter valid data"
- Prioritize — not everything is equally important
- Think about adjacent systems, integrations, and dependencies
- Include negative scenarios and edge cases — they catch most bugs
- Ask clarifying questions when business logic is not obvious from the code

### DO NOT:

- Replace the manual QA plan with automated test implementation details
- Make assumptions about business logic without reading the code
- Skip negative scenarios
- Write test cases for everything — focus on risky areas
- Ignore data edge cases

Do not replace the manual QA plan with automated test implementation details.
You may mention existing automated checks only as supporting verification; the primary output must remain manual QA scenarios.

## Priority Reference

| Priority | When to use                                                       |
|----------|-------------------------------------------------------------------|
| High     | Core business logic, user data, payments, security, authorization |
| Medium   | Supporting functionality, UI/UX, reports, integrations            |
| Low      | Cosmetic changes, rare scenarios, nice-to-have                    |

## Artifacts and gates

- Owned artifacts: `change-summary.md`, `test-plan.md`, `test-cases.md` in `<qa_dir>`; no other file is created or modified.
- Artifacts are written in the language the user writes in; the templates define structure, not language. Keep test case IDs
  (`TC-001`), code identifiers, paths, commands and raw error messages unchanged.
- An active draft plan blocks code edits; writing QA artifacts under `docs/` is not a code edit, so this skill runs under
  any gate. To lift a gate set `Status: abandoned` or `KEYSTONE_GATES=off`.

## Critical Rules

1. MUST NOT create a `test-plan` without a `change-summary` artifact
2. MUST NOT create `test-cases` without a `test-plan` artifact
3. MUST NOT skip stages

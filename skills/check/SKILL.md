---
name: check
description: "Keystone: independent check of a plan before Approve — deep codebase analysis, a fresh validator, and a line for every intent line (I-1…) with Coverage % and PASS/FAIL. Finds missing or vague tasks, wrong dependencies, duplicates, unrequested work and project-rule violations; edits the plan only after the human confirms. Never edits code. Use before Approve on an L change, after a retrospective intent, or when intent.md changed after the plan."
argument-hint: "[<intent path>] [<plan path>]"
allowed-tools: Read Edit Glob Grep Agent AskUserQuestion Bash(git *)
model: opus
effort: high
---
<!-- derived from ai-factory@2.19.0 skills/aif-improve/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->
# Keystone · check — refine the plan with fresh eyes

The plan was written by one context; this skill re-checks it with two other contexts (an analyzer and a validator) and
shows the human only what survives. It is read-only for code: it never edits source files, only the plan, and only after
an explicit answer.

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

## Core idea

(Cost: two Opus agents. The validator is mandatory here; in upstream AI Factory it was the optional `+check`.)

1. `keystone:analyzer` re-reads the codebase deeper than the planner did and lists findings.
2. `keystone:validator` (always, fresh context) re-reads the plan and the cited files and keeps, modifies or drops each.
3. You show the report and `Coverage: … · verdict`, ask, and only then edit the plan.

## Step 1 — resolve the inputs

`$ARGUMENTS` = `<intent path> <plan path>`, or `<plan path>` only, or nothing.
- Two paths: use them. A path may be a task folder — then `intent.md` / `plan.md` inside it.
- One path (plan): take the intent from the plan's `Authority:` line, if there is one. No Authority line → no intent;
  say so, skip `intent-gap` and the I-n lines (Coverage then reads `n/a`).
- Nothing: the active plan. It is: the plan.md of the newest task folder under docs/keystone/ (or paths.specs) — newest by the date prefix of the folder name, ties broken by the plan.md modification time — whose Status is draft, approved or implementing. (`paths.specs` comes from
  the fallback `.ai-factory/config.yaml` when it exists.) Its intent from Authority.
- No plan found: print `FAIL: plan not found` and stop.

Read the plan **completely**. Note what is done (`- [x]`, never touched), the `## Original Request` (the scope anchor,
never touched), the Settings line, the Requirements Reconciliation table, the Risks, the Tasks and the Commit Plan.
Project rules (those that exist): `CLAUDE.md`, `.claude/CLAUDE.md`, `docs/architecture.md`, `.claude/rules/**/*.md`
(`paths:` rules apply only to matching files), `AGENTS.md`; fallback only for AI Factory projects without them:
fallback files `.ai-factory/RULES.md`, `.ai-factory/rules/*.md`. Intent
status not `accepted`, or intent.md changed after the plan's first commit (`git log`) → remember it for the Notes line.

## Step 2 — analyze

Launch one agent: `subagent_type: "keystone:analyzer"`. Its prompt names, as absolute paths: the plan, the intent (or
"none"), the rule files, whether memlab MCP tools are available in this session, and the instructions `${CLAUDE_SKILL_DIR}/references/ANALYZE.md` ("read it completely and
follow it"). It returns findings `F1…` (groups `missing`, `improvements`, `removals`, `out_of_scope`, `intent-gap`,
`rule-violation`), dependency lines `D1…`, and the `I-n status:` lines.

If the analyzer fails or returns nothing: print `FAIL: analyzer failed (<reason>)` and stop — a check with no analysis
is not a PASS.

## Step 3 — validate (always)

Number the findings `Item 1…` in group order (missing, improvements, removals, out_of_scope, intent-gap,
rule-violation), keeping the F-id and the group in each heading. If the list is empty, skip the validator: hidden = 0,
adjusted = 0.

Launch a **fresh** agent: `subagent_type: "keystone:validator"`. Pass the plan path, the intent path, the rule files,
`${CLAUDE_SKILL_DIR}/references/VALIDATOR.md` and the items — not the analyzer's reasoning. Parse by `### Item N`
headings. The group is always the original one; a differing `Group:` makes the block malformed.
- `keep` → unchanged. `modify` → replace the text with `Modified-text`, adjusted += 1. `drop` → remove, hidden += 1.

Failure modes:
- a block is malformed (no heading, no `Verdict`, unknown token, `modify` without `Modified-text`, group changed) → treat
  it as `keep`; end the report with `WARN [validator]: validator response for item N was malformed, kept as-is`;
- the whole call failed (empty, error, timeout, refusal) → all items `keep`, no Hidden/Adjusted rows, end the report
  with `WARN [validator]: validator failed (<reason>), all items kept as-is`.

Then recompute the dependency fixes yourself, against the post-validation plan state: start from the plan's tasks, add
tasks from `missing` keep/modify, remove tasks targeted by `removals` and `out_of_scope` keep/modify (a dropped removal
keeps its task, which stays a valid target); `improvements` never change the graph. Discard every `D` that points at a
task absent from that state. Dependencies are not sent to the validator.

A validator `drop` of a `missing`/`partial` gap on an I-n means the validator found the delivering task: that I-n is
`covered`. Otherwise the analyzer's `I-n status:` lines stand, adjusted by kept/modified `intent-gap` findings.

## Step 4 — present

Report shape (structure fixed; wording in the user's language):

```text
## Plan Check Report

Plan: <path> · Intent: <path | none>
Tasks analyzed: N

### Findings
#### 🆕 Missing Tasks (N found)
#### 📝 Task Improvements (N found)
#### 🔗 Dependency Fixes (N found)
#### 🗑️ Removals (N found)
#### 💡 Out of scope — for later (N found)
#### 🎯 Intent gaps (N found)
#### ⛔ Rule violations (N found)

#### 📋 Summary
- Missing tasks: N · Tasks to improve: N · Dependencies to fix: N · Tasks to remove: N · Out of scope: N
- Intent gaps: N · Rule violations: N
- Hidden by validator: N · Adjusted by validator: M

I-1 covered — Task 2 · check: <the proving check>
I-2 partial — <what is missing>
I-3 missing
Notes: <intent not accepted / rework signal / numbering> | none
Coverage: <covered>/<total> = <p>% (partial counts 0.5) · verdict: PASS | FAIL
```

Items in the first five groups are prose with no labelled fields: (1) behavioural impact — what breaks or gets harder if
the plan stays as is; (2) optional note — a short code citation `path:line`; (3) plan anchor — `Task #X` ("after Task #X"
for new tasks); (4) suggested edit — concrete. Dependencies use the short form
`Task #X should depend on Task #Y. Reason: …`. Omit empty groups. `verdict` is `PASS` only with no `missing` I-n, no
kept rule violation and Coverage ≥ 90 %; otherwise `FAIL`. With no intent: drop the I-n lines and write
`Coverage: n/a · verdict:` by the other two conditions.

No findings at all: `Plan looks solid — no significant gaps.` plus the I-n lines and the Coverage line.

Then `AskUserQuestion`: **Apply all** · **Let me pick which ones** · **Nothing — keep the plan as it is**. "Let me pick"
→ one question per item. "Nothing" → no edit, but the Coverage line is still written (Step 5, last paragraph).

## Step 5 — apply (only after the answer)

Edit the plan with `Edit`, surgically — never regenerate it:
- improvements: reword the task line, keep `— files: … — check: …`, add the missing path or check;
- missing: add `- [ ] N. …` in the right place, renumber the following tasks and the references to them;
- removals / out_of_scope: delete the task, renumber, fix the references;
- dependencies: move the dependency before its dependent, or write `after task N` in the line;
- intent-gap: add the delivering task or the proving check, and a row in `## Requirements Reconciliation`
  (`| Decision | Source | Verification evidence |`, Source = `intent — I-n`);
- rule-violation: change the step so it obeys the rule; update the `Project rules check:` line;
- keep Reconciliation, Risks and Commit Plan in step with the tasks (≥5 tasks → a Commit Plan must exist).

Finally write — or replace — the line `Coverage: <covered>/<total> = <p>% (partial counts 0.5) · verdict: <PASS|FAIL> ·
<date>` directly after the `Project rules check:` line. After edits, recount the I-n against the edited plan. Show
`git diff --stat` for the plan. Nothing is committed here.
Only check writes the `Coverage:` line; no other skill recomputes it. If the plan was edited by hand after check,
append ` · not re-checked` to that line.

## Important rules

1. **Don't rewrite from scratch** — improve the existing plan, don't replace it.
2. **Preserve completed work** — never modify or remove `- [x]` completed tasks.
3. **Traceable improvements** — every change must be justified by codebase analysis or user input.
4. **Respect settings** — if Settings say tests "no", don't add test tasks. If logging is "minimal", don't add verbose logging tasks.
5. **No gold-plating** — don't propose adding tasks outside the feature scope unless critical. When you find a task already in the plan that drifts outside scope, route it to the "Out of scope" report section, not to "Removals" — the user should see useful-but-not-here ideas separately from dead-weight duplicates.
6. **Minimal viable improvements** — suggest only what matters, not every possible enhancement.
7. **User approves first** — never apply changes without user confirmation.
8. **Keep plan file in sync** — the plan file MUST match the task list after improvements.
9. **Original Request is immutable** — use `## Original Request` to judge scope and preserve it verbatim on every plan edit.
10. **Requirements remain external evidence** — never rewrite requirement, intent, rules or architecture artifacts to make the plan look consistent; refine the plan or report the conflict.
11. **Code is never edited here.** A checked box is not evidence — judge by the plan text and the code, not by the marks.

## After the report

PASS and the human agrees → `Approve plan`, then `/keystone:implement`. FAIL → apply the fixes (or edit the plan by
hand) and run `/keystone:check` again. The gate on code edits stays until the plan is approved (lift: `Status: abandoned`
in the plan header, or env `KEYSTONE_GATES=off`).

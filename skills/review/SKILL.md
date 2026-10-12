---
name: review
description: "Keystone: read-only code review of staged changes, a pull request (gh pr diff) or everything since a git ref — correctness, security, performance, project rules and architecture. Every finding carries severity, file:line, a Repro and a fix; an independent validator in a clean context ALWAYS re-checks them (keep / modify / drop, severity changes), unproven ones go to Unconfirmed. Use for 'review code', 'check my code', 'review PR', 'is this code okay', and on L changes after /keystone:verify."
argument-hint: "[PR number | PR url | branch/commit/tag | empty = staged]"
allowed-tools: Read Glob Grep Agent AskUserQuestion Bash(git *) Bash(gh *)
model: opus
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-review/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Review — code review with an independent validator

Review the change for correctness, security, performance and project rules. **Read-only**: it writes no file, edits no
code and changes no context file. Findings that survive an independent re-check are what the user sees.

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

**Next step (mandatory).** The answer always ends with one line `Next: <the exact command with paths>` — e.g.
`Next: /keystone:verify docs/keystone/2026-10-12-x/plan.md` — or, when nothing is to be run now,
`Next: nothing now — waiting for <event>; then <command>`. Never end on a caveat or an open-ended question.

## Step 0 — Project context

Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`; `.claude/rules/**/*.md`
(rules with `paths:` apply only to matching files); `AGENTS.md`. FALLBACK only when the project uses AI Factory and those
are absent: `.ai-factory/{DESCRIPTION,ARCHITECTURE,RULES}.md` and `.ai-factory/rules/*.md` (all fallback).
MUST / MUST NOT lines are project rules. If an active plan exists (newest `docs/keystone/*/plan.md` with Status draft,
approved or implementing), read it and its intent — the review is also judged against what was asked.

## Step 1 — Get the diff

Take the diff from one of three inputs. Remember the exact diff text — the validator gets it verbatim.

- **Empty → staged.** `git diff --cached`; if nothing is staged, `git diff` (say so in the report).
- **Digits, `#N` or a PR URL → PR.** `gh pr view <N> --json title,body,baseRefName,headRefName` and `gh pr diff <N>`.
  The PR branch is not checked out: read the change from the diff, surrounding code from disk.
- **Anything else → ref.** `git rev-parse --verify <arg>`; invalid → do not fall back silently, ask: review staged
  instead / cancel. Valid → `git log --oneline --reverse <ref>..HEAD` (empty → say so and stop); more than 20 commits →
  ask: all / last 20 / cancel. Review the net change `git diff <ref>...HEAD`, then each commit with `git show`: does the
  message match the change, is it atomic, did this commit introduce an issue.

A branch literally named like a PR number is read as a PR — an accepted compromise. Exception: bare digits of 7+
characters that `git rev-parse --verify <arg>^{commit}` resolves locally are an abbreviated commit hash → ref (say so
in one line); `#N` and URLs stay PRs. Empty diff → `Nothing to review.`

## Step 2 — Review

For every changed hunk read the surrounding code (callers, callees, tests) before judging. Checklist:

- **Correctness** — logic errors, edge cases, null/undefined, error handling, type safety, off-by-one, state and ordering.
- **Security** — injection (SQL, command, XSS), auth/authorization, CSRF, sensitive data in code or logs, input
  validation, secrets. For a deep pass on L/auth/payments suggest `/keystone:security`.
- **Performance** — N+1 queries, memory leaks, inefficient algorithms, missing indexes, unbounded payloads/loops.
- **Project rules and best practice** — MUST/MUST NOT from Step 0, duplication, dead code, naming, magic values.
- **Tests** — new behaviour without a check, edge cases untested.

**Context gates (read-only).** Compare the change with `docs/architecture.md` (module boundaries, allowed dependency
directions) and the rule files: an explicit violation is `ERROR` (blocking), a soft inconsistency or a missing optional
file is `WARN`. Gates only report; this skill never edits those files.

## Step 3 — Findings

Each finding is a short block, in this order: **behavioural impact** (what breaks for the user or downstream code) ·
`file:line` (the closest anchor in the diff) · **Repro** (a concrete input, command or call sequence and where the
failure is visible — "if X is called with Y, Z happens at `path:line`") · **fix** (a concrete edit) · severity.

Severity — read `${CLAUDE_SKILL_DIR}/references/SEVERITY.md` when unsure. **critical** = merge-blocking (data loss,
security regression, broken correctness on a path real users hit, downstream break). **suggestion** = non-blocking
(clarity, micro-performance, missing log, future refactor, a test gap that hides no active bug).

A finding you cannot give a Repro for — you suspect it but cannot name a trigger or the path — is **not** dropped and not
reported as a defect: it goes to `Unconfirmed` with the reason it could not be shown. Do not pad: no findings is a valid
result.

## Step 4 — Validate (always, in a clean context)

Number findings `Item 1…` — critical first, then suggestions — under `### Item N (section: critical|suggestion)`.
`Unconfirmed`, open questions, positive notes, context gates and commit-structure findings (commit message, atomicity) are
not validated. Empty list → skip the validator (hidden = adjusted = reclassified = 0).

Launch a **fresh** agent: `subagent_type: "keystone:review-validator"`. The prompt carries, inline: the instructions path
`${CLAUDE_SKILL_DIR}/references/VALIDATOR.md` ("read it completely and follow it exactly"), the severity rules path
`${CLAUDE_SKILL_DIR}/references/SEVERITY.md`, the project-rule files, the reviewed diff verbatim, the items — **not** your
reasoning. Read `${CLAUDE_SKILL_DIR}/references/CHECK-MODE.md` for how to parse the answer and what to do on failure.
In short: `keep` unchanged · `modify` → replace the text, adjusted += 1 · `drop` → remove, hidden += 1 · `Severity:` may
move an item to the other section (suffix ` [validated: promoted from Suggestions]` / `[validated: demoted from Critical]`,
reclassified += 1) or to `unconfirmed` (the concern may be real but no trigger could be shown).

Fallbacks: a malformed block → treated as `keep`, and a line `WARN [validator]: validator response for item N was
malformed, kept as-is`; the whole call failed → every item kept, no counters, and the line
`WARN [validator]: validator failed (<reason>), all items kept as-is` — never present unvalidated findings as validated.

## Step 5 — Report

```text
## Code Review

Scope: <staged | PR #N | <ref>..HEAD> · files: <n> · Risk: Low | Medium | High
Gate: pass | warn | fail        ← fail if any Critical remains or a context gate is ERROR; warn if only Suggestions/WARN
Validated: <hidden> hidden · <adjusted> adjusted · <reclassified> reclassified     ← or the WARN line

### Context gates
<Architecture / Rules — WARN or ERROR with the cited line, or "none">

### Critical
<finding blocks>
### Suggestions
<finding blocks>
### Unconfirmed
<what is suspected, why no Repro could be shown, what to run to confirm — not defects, not counted in Gate>
### Open questions
<open questions to the author>
### Positive notes

Blocked on me: <ERROR gates, decisions only the user can take | none>
Changed: none (read-only)
Found: <n critical, m suggestions, k unconfirmed>
Next: fail → fix the critical items (`/keystone:fix` or by hand) and re-run; warn/pass → commit.
```

## Style

Be constructive, not critical; explain the "why"; show code when it helps; acknowledge good code; prioritize by
importance; ask questions instead of assuming. Output in the user's language.

## Gates

An active draft plan blocks code edits — this skill edits nothing, so it runs under any gate. To lift a gate set
`Status: abandoned` or `KEYSTONE_GATES=off`. If GitHub MCP is configured, posting review comments is a separate step the
user asks for; this skill never posts anything. Context is heavy after a review — suggest `/clear` or `/compact`.

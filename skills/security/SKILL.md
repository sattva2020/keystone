---
name: security
description: "Keystone: security audit on OWASP Top 10:2025, LLM Top 10 2026 / prompt injection, agent and MCP configuration, supply chain and race conditions — whole project, a path, a category or the diff of a task. Every finding has severity, file:line, how to exploit it and a fix; ignored items live in docs/keystone/security-ignores.md with reason, date and author; ends with a machine-readable line `Security gate: pass | warn | fail` (fail only on an unignored critical/high finding). Read-only for code. Use for 'security check', 'is this secure', 'before deploy', auth/payments/user-input changes, or `ignore <id> <reason>`."
argument-hint: "[auth|injection|xss|csrf|secrets|api|infra|prompt-injection|race-condition|agent|supply-chain | <path> | <plan path>] | ignore <id> <reason>"
allowed-tools: Read Glob Grep Write Edit Bash(npm audit*) Bash(pip-audit*) Bash(cargo audit*) Bash(grep *) Bash(git diff*) Bash(git log*) Bash(git rev-list*) Bash(git config user.name) Bash(bash ${CLAUDE_SKILL_DIR}/scripts/audit.sh)
model: opus
effort: high
disable-model-invocation: false
---
<!-- derived from ai-factory@2.19.0 skills/aif-security-checklist/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone · security

Audit against OWASP Top 10:2025, OWASP LLM Top 10 2026 (prompt injection), agent/MCP configuration, supply chain and race conditions. **Read-only for code and tests.** The only
file this skill may write is `docs/keystone/security-ignores.md` (the `ignore` flow). Fixing a finding is
`/keystone:fix` (or an edit inside `/keystone:implement`), never this skill. Other Keystone skills call it: `plan` for L changes that
touch security, `verify` as a gate.

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

**Next step (mandatory).** End the answer with a `Next:` line that names the step in a few words, then put the exact
command on its own, on the following line(s), inside a fenced code block **with no language tag** — the app shows a
copy button on a code block. Never tag it ```bash: a `/keystone:*` command is not a shell command, and the bash tag
adds a Run button that would fail. When nothing runs now, write `Next: nothing now — waiting for <event>` and put the
later command in that fenced block. Never end on a caveat or an open-ended question.

Arguments: `$ARGUMENTS`.

## Step 0 — context and ignore-list

Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`; `.claude/rules/**/*.md`
(rules with `paths:` frontmatter apply only to matching files); `AGENTS.md`. Fallback only when the project uses AI Factory
and the Keystone files are absent: `.ai-factory/DESCRIPTION.md`, `.ai-factory/ARCHITECTURE.md`, `.ai-factory/RULES.md`,
`.ai-factory/rules/*.md`. MUST / MUST NOT lines there are project rules; a violated security MUST is a finding.

Then **always read** `docs/keystone/security-ignores.md` before any audit. If it exists, it lists the checks the team decided to ignore.

## Modes

| Argument | Scope |
|---|---|
| empty | whole project: all categories in `${CLAUDE_SKILL_DIR}/references/CHECKLIST.md` |
| `auth`, `injection`, `xss`, `csrf`, `secrets`, `api`, `infra`, `prompt-injection`, `race-condition`, `agent` (`references/AGENT-MCP.md`), `supply-chain` (`references/SUPPLY-CHAIN.md`) | that category only |
| a path (file or directory) | all categories, only code under the path |
| a plan path (`…/plan.md`) or an active plan with no other argument | **diff of the task** — see below |
| `ignore <id> <reason>` | add an ignore entry, then stop — no audit, no gate line |

**Diff of the task:** base = the same base `/keystone:verify` uses (`P` = first commit that added the plan:
`git log --diff-filter=A --format=%H -- <plan>`, last line; `C` = first commit after `P`; base = parent of `C`, or `P` if there is no
`C`). Audit `git diff <base>` (committed + uncommitted), reading each changed file in full, and its direct callers when the change
touches an entry point, a query, a permission check or an LLM call. For a diff scope also recommend the built-in
`/security-review` as a second, independent pass — it is not a substitute for the ignore-list or the gate.

## Audit procedure

1. Run `bash ${CLAUDE_SKILL_DIR}/scripts/audit.sh` once for a whole-project or `infra`/`secrets` scope (read-only; skip for a diff
   scope unless dependencies or `.env` handling changed). Its output is a lead, not a finding: confirm every hit in the code.
2. Walk the categories of the scope in `${CLAUDE_SKILL_DIR}/references/CHECKLIST.md`. Read the code; grep starters only find candidates.
   Read `AUTH.md`, `PROMPT-INJECTION.md`, `RACE.md`, `AGENT-MCP.md`, `SUPPLY-CHAIN.md` or `MAPPING.md` (same folder) when the scope includes that category and the code needs a pattern
   comparison. Skip categories the project cannot have (no LLM calls → no prompt injection) and say so in one line.
3. A finding needs evidence: file:line you read, and a concrete way it is exploited. No exploit path → not a finding and not in the gate;
   it may go, one line each, under `## Hardening suggestions` (no severity, no effect on the gate). **Before reporting, check each candidate against `${CLAUDE_SKILL_DIR}/references/DO-NOT-FLAG.md`** (server-controlled
   values, framework-escaped output, tests, dead code, maintainer-only triggers…); a match is dropped.
4. **Confidence** — HIGH: the exploit path is traced end to end in code you read (entry point → … → sink) → a finding. MEDIUM: plausible, but one link
   is not confirmed (a caller, a config, a runtime value) → goes to `## Needs verification`, **never** into Findings, and does not affect the gate.
   LOW: speculative → not reported at all.
5. **Severity — pick it by the rubric in `${CLAUDE_SKILL_DIR}/references/SEVERITY.md`, not by feel**: the same issue must get the same rating on every run.
   (CHECKLIST.md keeps the quick table; SEVERITY.md decides disputes.)
6. Match each finding with the ignore-list **by item id** (`no-csrf`, `no-rate-limit`, `no-auth-/admin`, …). A match: do **NOT**
   flag it as a finding — put it under Ignored. An entry older than 12 months, or whose reason no longer holds in the code (e.g.
   "no cookies used" but the code sets a cookie), is shown as `ignored — stale, re-confirm`, and counts as a warn, not as a finding.

## The ignore-list — `docs/keystone/security-ignores.md`

`/keystone:security ignore <id> <reason>`: read the file (create it with the template below if absent), refuse an entry without a
reason, set Date = today, Author = `git config user.name` (or ask once), append the row, show the diff, confirm. Short kebab-case ids:
`no-csrf`, `no-rate-limit`, `no-https`, `no-xss-csp`, `no-sql-injection`, `no-prompt-injection`, `no-race-condition`,
`no-secret-rotation`, `no-auth-{route}`, `verbose-errors`, or a custom descriptive id.

```markdown
# Security: ignored items

Items below are excluded from /keystone:security audits and from the security gate. Review periodically — ignored risks may become relevant.

| Item | Reason | Date | Author |
|------|--------|------|--------|
| no-csrf | SPA with token auth, no cookies used | 2026-03-15 | @dev |
```

## Output

1. **Findings** (Confidence HIGH only; when the app can run locally or on staging, offer `/keystone:pentest <your target URL> <this report>` for the S-n findings too) — one block each, ordered critical → low, ids `S-1…`:
   `S-1 [critical] <title> — <file>:<line>` then `Confidence: HIGH`, `Entry point:` (where untrusted input enters: route, handler, webhook, file, CI trigger, tool output),
   `Exploit:` (Repro: request / input / sequence an attacker uses), `Impact:` (one line),
   `Fix:` (the smallest concrete change, with the safe pattern from the references), `Refs: <OWASP id> · <CWE-n> · <ASVS 5.0 chapter if clear> · <ISO 27001:2022 A.8.x if clear>`
   (taken from `${CLAUDE_SKILL_DIR}/references/MAPPING.md`; omit a part you cannot map, never invent an id). **OWASP / LLM ids always carry the edition year:**
   `A05:2025`, `LLM01:2026` — never a bare `A05`. Never print secrets, tokens or credential values — name the variable and the location only.
1a. `## Needs verification` (only if there are MEDIUM candidates) — one line each: `N-1 <title> — <file>:<line> — Confidence: MEDIUM — missing link: <what to check>`.
    When the app can run locally or on staging, offer in one line to confirm these and any S-n findings against it:
    `/keystone:pentest <your target URL> <this report>` (your own targets only; it confirms or lowers each finding).
   Not findings, not counted in `Found:`, no effect on the gate; list the count in the summary.
1b. `## Hardening suggestions` (optional) — one line each, no severity; never counted in `Found:` or the gate.
2. **Ignored** — table: item, reason, date, author; then `N items ignored. Review them periodically.`
3. **Gate line** — last of the report body, exactly one of:
   - `Security gate: fail — unignored critical/high: S-1, S-3`
   - `Security gate: warn — <medium/low findings, stale ignores, incomplete evidence (what could not be checked)>`
   - `Security gate: pass`
   Rules: **fail** only when an unignored critical or high finding remains. **warn**: only medium/low findings, stale ignores, or
   incomplete audit evidence (a tool unavailable, code not readable, any `UNASSESSED:` line). **pass**: the audit completed and nothing unignored remains.
   A tool that could not run (no network, missing binary — `audit.sh` prints these as `UNASSESSED: <what>`) is reported in the
   report as `UNASSESSED: <what>` and makes the gate at least `warn`; it is never a silent `pass`.
4. **Summary** (always, three lines): `Blocked on me: <what I need from you, or none>` · `Changed: <files written — at most the
   ignore-list, or nothing>` · `Found: <counts by severity; ignored count>`.

The report supports ISO/IEC 27001 evidence (Annex A.8.25–8.29) but does not certify compliance.

On `fail`, the next step is `/keystone:fix` for the first critical/high finding. For `ignore`, report only `Changed:` and the new row.

## Rules

- Never edit code, tests, config or the plan. Never run the application, exploit code against a live service, or install packages.
- Run only the read-only audit commands in `allowed-tools`; if `npm audit` and friends need the network and fail, that is `UNASSESSED` → `warn`,
  not `pass`. `gitleaks` (history scan) runs only through `audit.sh` when installed.
- A security gate from `/keystone:verify` consumes only the gate line and the S-ids: keep the line format exact.
- Context is heavy after an audit. Consider `/clear` or `/compact` before continuing with other tasks.

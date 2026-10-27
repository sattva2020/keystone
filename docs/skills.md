# Keystone skills reference

[Русская версия](skills.ru.md) · [Back to README](../README.md)

All 25 `/keystone:*` commands: what they take, what they do, when to use them and who starts them. The picture shows
where each command sits on the stages of Anthropic's playbook; the tools row below the chain is optional.

<picture>
  <img src="../assets/flow-dark.svg" alt="Keystone user flow with the tools rows" width="100%">
</picture>

## Legend

- **Model.** Opus: judgment (decisions, plans, checks, review). Sonnet: execution (by an approved plan, or routine
  generation). Session: the skill has no fixed model and runs on the model of your session. `start` suggests where to
  switch; `implement` is meant for Sonnet.
- **Model may invoke.** The skill is described so that Claude may start it on its own when your request fits. All other
  skills start only from your explicit command, so `plan`, `implement` and `fix` never start by accident.
- Parameters: `<required>`, `[optional]`, `a | b` is a choice. They are copied from each skill's `argument-hint`.

## Task chain

The main path: size of the task, decisions, plan, code, check. On level S only the edit and the check remain; on M,
`plan`, `implement` and `verify`.

| Command | Model | Parameters | What it does | When to use | Who calls it |
|---|---|---|---|---|---|
| `/keystone:start` | session; model may invoke | `<task in your own words>` | Sizes the task S, M or L and leads along the route: S is an edit and a check without a plan; M is a short plan; L is intent, plan, implement, verify. Suggests the model per stage and limits exploration. | At the start of any task. If the project has no CLAUDE.md, it offers `/keystone:setup` in one line. | You. |
| `/keystone:grill` | Opus; model may invoke | `[idea, plan or question to grill — empty: the topic of the current conversation]` | Interviews you round by round over the whole decision tree: implementation, UX, edge cases, failures, data, security, what "done" means. Finds facts itself, leaves decisions to you. Writes no file; returns a numbered list D1… | When decisions depend on each other, or an idea must be stress-tested. | `intent` (on L), `plan` and `fix` when decisions are open; you, with "grill me". |
| `/keystone:intent` | Opus; model may invoke | `[idea text] \| accept <path to intent.md or its folder>` | Writes `intent.md`: what and why, in your words; every line has an ID `I-n`, plus a question-to-answer log. On L, when the "how" is unclear, it offers a `research.md` before the grill. May link a milestone: `Roadmap: M-n`. `accept` is your sign-off. | Before the plan of an L-level change. | `start` on L; you. |
| `/keystone:plan` | Opus | `<path to intent.md or its folder \| task text> [S \| M \| L]` | The plan is the spec: reconciliation with the intent and project rules, Risks, tasks with files and checks, Done means, Commit Plan. Tests, logging and docs settings are inferred from the repo, not asked. On L with security it adds threats. While the plan is `draft`, a hook blocks code edits. | M and L, after intent (on L). | You (explicit command only). |
| `/keystone:check` | Opus; model may invoke | `[<intent path>] [<plan path>]` | Independent plan check before Approve: an analyzer over the code and a validator, each in a clean context. Coverage of every intent line, missed and extra tasks, rule violations. It edits the plan only after your answer. | Before Approve on L; after a retrospective intent or when `intent.md` changed. | `plan` on L, automatically; you. |
| `/keystone:implement` | session (Sonnet) | `[path to plan.md]` | Runs the approved plan task by task: a tick after each, `BLOCKED` instead of "not run", a decision log, commits by the Commit Plan. With `docs — yes` it calls `/keystone:docs update`; at the end it offers up to three new rules for `.claude/rules/`. | After Approve, in a fresh session (`/clear`), on Sonnet. | You (explicit command only). |
| `/keystone:verify` | Sonnet runs it, the verifier is Opus; model may invoke | `[<plan path> [base git ref]] [--strict] \| accept` | The script `collect.mjs` collects the facts (diff base, task files, build, tests, lint), then a separate verifier in a clean context: for every task, reconciliation row and intent line it returns ok / missing / wrong / not proven, plus work nobody asked for. Architecture and security gates. Verdict PASS, PASS-UNPROVEN or FAIL; push opens only after verify. On L strict mode is on by default. | After `implement` on M and L; "is it really done". | You; `start` leads to it. |
| `/keystone:fix` | Opus | `<bug description or error message> \| (empty: continue the active fix plan)` | Reproduce first and write a failing test in a new file, then the smallest fix and the same check green. Root cause and Prevention go into the plan. Modes: fix now (S) or plan first (M). A hook blocks edits to tests already committed in HEAD. | A bug, an error, a regression. | You (explicit command only). |

## Project context

Native Claude Code files: `CLAUDE.md`, `docs/architecture.md`, `.claude/rules/`. Everything is written only after
showing a diff and your "yes"; a re-run only adds what is missing.

| Command | Model | Parameters | What it does | When to use | Who calls it |
|---|---|---|---|---|---|
| `/keystone:setup` | Opus | `[project description for a new project — empty: analyze this repo]` | Analyzes the stack and writes a short `CLAUDE.md` (up to 60 lines), `.claude/rules/base.md` with conventions taken from the code, and a project `.mcp.json` with secrets only as `${VAR}`. Recommends plugins, does not install them. If there is an `AGENTS.md` and no `CLAUDE.md`, it does not shut it off: it imports it with `@AGENTS.md`. | Once per project: new, empty or existing. At the end it offers architecture, docs, dockerize, ci. | You; `start` hints at it when there is no CLAUDE.md. |
| `/keystone:architecture` | Opus | `[microservices \| layers \| structured \| structured-layers \| structured-vertical \| explicit \| explicit-layers \| explicit-vertical \| explicit-flat]` (aliases `clean`, `ddd`, `monolith`, `vertical`) | Picks a pattern from the stack and code and checks the structure against it. On a mismatch it asks whether to describe the code as it is or take the strict ideal. Writes `docs/architecture.md`; every MUST NOT rule has its own grep check. | After setup, before a structural refactor, "which architecture should I use". | You. `verify` then checks the file (Architecture gate). |
| `/keystone:docs` | Sonnet; model may invoke | `[update <files \| topics>] [--web]` | README as a landing page and topic pages in `docs/`, navigation, collecting loose `.md` files (it deletes nothing by itself). `update` refreshes only the pages the change touched. | "Write the docs"; after a task with `docs — yes`. | `implement` (update) with `docs — yes`; you. |

## Checks and quality

| Command | Model | Parameters | What it does | When to use | Who calls it |
|---|---|---|---|---|---|
| `/keystone:security` | Opus; model may invoke | `[auth \| injection \| xss \| csrf \| secrets \| crypto \| logging \| api \| infra \| iac \| prompt-injection \| race-condition \| agent \| supply-chain \| <path> \| <plan path>] \| ignore <id> <reason>` | Audit by OWASP Top 10:2025 (incl. A04 cryptography and A09 logging), OWASP LLM Top 10 2026, agent / MCP config and the project's own MCP server, supply chain and model weights, IaC (Dockerfile, Kubernetes, Terraform) and race conditions; each finding carries `Refs:` (OWASP · CWE · ASVS · ISO 27001 A.8.x). Scope: the whole project, a path, a category or a task diff. Each finding has a severity, `file:line`, how to exploit it and how to fix it. Exceptions live in `docs/keystone/security-ignores.md` with a reason and a date. Result: `Security gate: pass \| warn \| fail`. It does not change code. | Before a deploy; changes to auth, payments, user input, LLM calls. | `plan` adds a task on L with security; `verify` requires its result; you. |
| `/keystone:review` | Opus | `[PR number \| PR url \| branch/commit/tag \| empty = staged]` | Review without edits: correctness, security, performance, project rules, architecture. Each finding has a severity, `file:line`, Repro and a fix. A validator in a clean context always rechecks; what it cannot prove goes to Unconfirmed. | Before push on L, a PR review, "look at my code". | `verify` recommends it on L; you. |
| `/keystone:qa` | Opus | `[--all] [change-summary \| test-plan \| test-cases] [<plan.md path \| git ref>]` | A change summary, a plan and concrete manual test scenarios in `<task folder>/qa/`. With a plan, every scenario links to `I-n` and Done means, and says where to run it. | A feature with UI or tricky behavior, "what should I test by hand". | You. |
| `/keystone:qa-check` | Sonnet | `[human \| agent] [<plan.md path \| qa folder \| branch>]` | Runs the scenarios from `/keystone:qa`. `human` walks you step by step and records what you saw; `agent` runs them itself through the built-in browser or Playwright, a CLI, tests or an API. Each scenario ends pass / fail / blocked with evidence in `qa/qa-check.md`; repeatable runs are saved as Playwright tests in `qa/replay/`. | After `/keystone:qa`; to recheck after a fix. | You. |
| `/keystone:ask` | Opus | `<question>` | Answers only at 100/100 confidence on evidence (files, command output, documentation); otherwise `INSUFFICIENT INFORMATION` and what exactly is missing. Searches memlab first, libraries through Context7. Changes no files. | "Only if you are sure", versions and prices, "does X support Y now", security-adjacent questions. | You. |
| `/keystone:pentest` | Opus | `<your target URL> [<security report path>]` | Confirms the findings of `/keystone:security` against your own running app — your targets only (localhost, `*.test`, or a staging URL you name as yours; production only on an explicit yes, observation-only). Passive checks (headers, CORS, cookie flags, TLS) by OWASP ZAP baseline, then one safe request per finding to confirm or lower it, with a PoC and `Refs:`. Never brute-forces, loads or bypasses protections. | After `/keystone:security` when the app runs locally or on staging; when the gate is `warn`. | You; `security` and `verify` offer it. |
| `/keystone:optimize` | Opus | `perf <function \| endpoint \| query \| page \| bundle> \| simplify <path>` | `perf`: measures the metric 3+ times before and after with the same command and keeps the change only if the numbers improve beyond the noise, otherwise reverts; tests stay green. `simplify`: removes dead code and duplication with tests green before and after and fewer lines. Installs nothing without a yes; never touches production. | A slow endpoint, query or page; code that grew too complex. | You; `review` hands a performance finding to it. |

## Build and ship

| Command | Model | Parameters | What it does | When to use | Who calls it |
|---|---|---|---|---|---|
| `/keystone:dockerize` | Sonnet | `[--audit]` | A multi-stage Dockerfile (dev and prod), a dev compose file, a hardened production overlay, `.dockerignore`, deploy scripts; or an audit of an existing setup with a security score. The proxy is optional and off by default. Writes after showing the files and your "yes". | "Add Docker", before the first deploy, checking an existing setup. | You; `setup` offers it. |
| `/keystone:ci` | Sonnet | `[github \| gitlab] [--enhance]` | A GitHub Actions or GitLab CI pipeline: a separate workflow for lint, tests, build and security, built only from tools the project really has. Or it improves and checks an existing pipeline. | "Set up CI", new linters or tests without a job. | You; `setup` offers it. |

## Lessons and knowledge

| Command | Model | Parameters | What it does | When to use | Who calls it |
|---|---|---|---|---|---|
| `/keystone:roadmap` | Opus | `[check \| project vision or requirements]` | `docs/roadmap.md` with milestones `M-1`, `M-2`… that keep their IDs. Modes: create, update, `check` (compares milestones with task statuses and offers to mark finished ones). | "What do we build next", planning for months. | You; `verify` after PASS offers to mark the milestone from the intent. |
| `/keystone:evolve` | Opus | `[all \| plan \| implement \| fix \| verify \| <rules topic>]` | Collects lessons from the Prevention of fix plans, verify, review and security findings, implementation logs and memlab notes. Judges every lesson by what the record shows it did (helped / hurt / no observed effect / confounded); a rule needs an isolated effect or a recurring pattern, otherwise `NO_ENTRY`. Proposes rules for `.claude/rules/` (at most 8 at a time, each with a cue and a confidence) and writes them only after "yes". Marks what it processed in `docs/keystone/evolve-log.md`. | After several fixes, "what keeps repeating". | `verify` recommends it after a fix plan or a fixed FAIL; you. |
| `/keystone:transfer` | Opus | `<path to another project> [all \| plan \| implement \| fix \| verify \| <rules topic>]` | Takes rules and lessons from another of your projects (read only), keeps those that fit the current stack, marks the source and writes them to `.claude/rules/` after "yes". | A new project like an old one; not repeating mistakes you already paid for. | You. |
| `/keystone:reference` | Sonnet | `<url\|path> [url2\|path2] [--name <slug>] [--update] \| list \| show <slug> \| delete <slug>` | A reference in `docs/references/`: conclusions for your project, prices and limits with a date and a source, live checks. It does not copy library docs; Context7 provides them. | Tariffs and limits of an external API, integration quirks worth remembering. | You. |
| `/keystone:distill` | Opus | `<path\|url> [path\|url...] [--name <skill-name>] [--path <directory>] [--update] [--redact-source-map] [--split\|--split-by <strategy>]` | Turns a book, documents, a folder or a URL into a Claude Code skill (or a set of skills): a short `SKILL.md` plus references and examples. Asks where to save (the project or `~/.claude/skills`) and shows the file list before writing. | A method, a regulation or a book the agent should apply. | You. |

## No skill: the mod command and the gates

| What | How it works | When |
|---|---|---|
| `/keystone-status` | The active plan, tasks, gates and the cost of each stage. Answered by the mod without a model call, so it is free. The cost total is also in the status line after every turn. | Any time. |
| Gates (hooks) | While a plan is `draft`, code edits are closed until Approve. Push and PR are closed until verify. In a fix, committed tests cannot be changed. Stop reminds once about open tasks. Draft and Stop gates, the status line and the buttons touch only the session that works with the plan (ran `/keystone:<stage>` on it or edited its folder); push is repo-wide. | They work on their own. To lift: `Status: abandoned` in the plan or `KEYSTONE_GATES=off`. |

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/keystone-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/keystone-light.svg">
  <img src="assets/keystone-light.svg" alt="Keystone — intent-first workflow for Claude Code" width="640">
</picture>

**Process sized to the change. Intent first, plan as the spec, an independent check before and after the code.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757)](https://code.claude.com/docs/en/plugins)
[![Latest release](https://img.shields.io/github/v/release/sattva2020/keystone)](https://github.com/sattva2020/keystone/releases)

English | [Русский](README.ru.md)

</div>

## What it is

Keystone is a standalone Claude Code plugin that picks the amount of process by the size of the change. A small fix is
done at once and checked. A clear task goes through a short plan with risks. A task with open decisions runs the full
chain: `intent` → `plan` → independent check of the plan → `implement` → `verify` in a clean context.

The plan is the spec: there is no separate `spec.md`, and every row of the plan points back to a numbered intent line
(`I-1…`). Hard rules are held by hooks, not only by prompt text.

## Install

In Claude Code:

```text
/plugin marketplace add sattva2020/keystone
/plugin install keystone@keystone
```

Or from a shell:

```bash
claude plugin marketplace add sattva2020/keystone
claude plugin install keystone@keystone
```

Update: `claude plugin marketplace update keystone`, then `claude plugin update keystone@keystone`, then start a **new session** — an open session keeps the copy it loaded.

Try it without installing: `claude --plugin-dir <path-to-this-repo>`.

Requirements: Claude Code 2.1.218 or newer (skills with `background`), and Node.js on `PATH` for the hooks. The mod
(`/keystone-status` and the status line) needs Claude Code 2.1.287+ in the terminal or 2.1.286+ in Desktop; the hooks
work without it. Plugin skills are namespaced `keystone:`, so your personal skills in `~/.claude/skills` do not shadow
them.

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/flow-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/flow-light.svg">
  <img src="assets/flow-light.svg" alt="Keystone user flow mapped onto the AI-native SDLC playbook: Plan → Design → Build → Test → Deploy → Maintain" width="100%">
</picture>

Keystone follows [Anthropic's AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook):

| Playbook stage | Ends with | In Keystone |
|---|---|---|
| 1. Plan | `intent.md` | `/keystone:intent` — grill asks every decision that is yours, then writes intent in your words; you `accept` it |
| 2. Design | `spec.md` | folded into the plan: `/keystone:plan` writes requirements + design and runs `/keystone:check` (fresh-context analyzer + validator) before you approve |
| 3. Build | `plan.md`, then the diff | Approve, `/clear`, `/keystone:implement`: task by task; no code while the plan is draft (hook) |
| 4. Test | checks + fresh-context verifier | `/keystone:verify`: runs your build/test/lint, then an independent verifier: PASS · PASS-UNPROVEN · FAIL |
| 5. Deploy | merged PR | `git push` / `gh pr create` stay closed until verify passes (hook). Release steps (merge, push, deploy, production jobs) live in the plan's `## Release`, not in its tasks; after verify, `/keystone:implement` runs them in release mode, each one after your yes — the agent prepares the release, you authorize it |
| 6. Maintain | incident → new `intent.md` | `/keystone:fix` (regression test first), or a new `/keystone:intent` when the finding is bigger |

Not every change needs all six: `/keystone:start` sizes it first. **S** — edit and check. **M** — short plan, implement,
verify. **L** — the whole chain above.

Below the chain sits a row of tools you run when you need them: `setup` (project context), `architecture`, `docs`,
`security`, `review`, `dockerize`, `ci`, `evolve` / `transfer` (lessons into rules), `roadmap`, `ask` / `reference`,
`distill`, `qa` / `qa-check`. See the [full reference](docs/skills.md).

## See it in action

An L-level task, abridged:

```text
> /keystone:start add reminders for overdue invoices
  Level: L — several decisions are yours, touches data and notifications.
  Next: /keystone:intent → /keystone:plan → /clear → /keystone:implement → /keystone:verify
> yes
> /keystone:intent add reminders for overdue invoices
  (grill runs inside intent)
  Q1 — Who creates a reminder, the system or the user?   ➡️ Recommended: system — invoices already carry due_date (src/billing/invoice.ts:41)
  Q2 — …
  …
  Wrote docs/keystone/2026-10-12-invoice-reminders/intent.md — I-1…I-9. Read it whole and correct me.
> /keystone:intent accept docs/keystone/2026-10-12-invoice-reminders/intent.md
> /keystone:plan docs/keystone/2026-10-12-invoice-reminders/intent.md
  Settings (inferred): tests — yes · logging — standard · docs — no
  Done means: npm test green; a reminder row appears for an invoice 1 day overdue
  Risks: duplicate sends on retry · timezone of "overdue" · opt-out not stored yet
  Running /keystone:check (analyzer + validator, clean contexts)…
  Coverage: 9/9 (100%) · 2 findings: task 4 depends on task 6; "snooze" in task 8 was not requested. Apply? > yes
  Approve plan? > Approve        (Status: draft → approved, baseline commit)
> /clear
> /keystone:implement
  Tasks 1–14: 13 done, 1 BLOCKED: staging SMTP not reachable.
  Blocked on me: staging SMTP.  Changed: 11 files.  Found: no opt-out flag in the schema.
> /keystone:verify
  Done means: 1 ok, 1 not proven (email delivery). I-1…I-9: ok 7 · not proven 2. Unrequested: none.
  Verdict: PASS-UNPROVEN → verify.md. git push stays closed until you prove it or /keystone:verify accept.
> /keystone-status
  Level L · implementing · tasks 13/14 · BLOCKED 1 · cost: plan $4.10 · check $3.20 · implement $2.30   (no model call)
```

## Choose your level

The agent proposes a level, you confirm it. Any single sign of L makes the task L.

| Level | Signs | Route | What you get |
|---|---|---|---|
| **S** | the diff fits in one sentence, no user-owned decisions, there is a way to check | edit → check → report; a bug goes through `/keystone:fix` | the change, a one-line `Level: S` report; no files |
| **M** | one obvious approach, several files | `/keystone:plan <task>` → Approve → `/keystone:implement` → `/keystone:verify` | `plan.md` with a 3-line Risks block, `verify.md` |
| **L** | several decisions; data or schema; security; other teams' modules; unclear "done" | `/keystone:intent` → `/keystone:plan <intent>` (with `/keystone:check`) → Approve → new session → `/keystone:implement` → `/keystone:verify` | `intent.md`, `plan.md` with Coverage, `verify.md` |

Model per stage: **Opus** for grill, intent, plan, check and verify; **Sonnet** for implementation from an approved
plan; **Haiku** for fact lookups. The `effort` in a skill's frontmatter applies only to the turn that invokes it; for
long multi-turn plan, grill and check sessions set `/effort high` for the session.

Keystone never asks about tests, logging or docs. The plan infers them from the repository and writes a `Settings:`
line in its header; you can change it at Approve.

## What to run next

Every Keystone answer ends with a `Next:` line — the exact command with paths, or "nothing now — waiting for …".
The same command appears as the dim prompt suggestion (Tab takes it), and `/keystone-status` shows it any time.
For every situation — a plan in draft, a verify FAIL, "I only ran grill", "back after a break", "waiting for a deploy" —
see **[What to run next — scenarios](docs/scenarios.md)**.

## Commands

All 25 commands, grouped. Parameters are in brackets; `|` is a choice.

**Task chain**

| Command | What it does |
|---|---|
| `/keystone:start <task>` | sizes the change S/M/L and picks the route |
| `/keystone:grill [topic]` | interviews you over the whole decision tree; returns a numbered decision list, writes no file |
| `/keystone:intent [idea]` · `accept <path>` | writes `intent.md` in your words: numbered `I-n` lines, a decision log, a sign-off |
| `/keystone:plan <intent or task> [S\|M\|L]` | the plan is the spec: reconciliation, rules check, Risks, tasks with checks, Approve |
| `/keystone:check [intent] [plan]` | independent plan check in clean contexts; intent coverage % |
| `/keystone:implement [plan]` | tasks in order, `BLOCKED:` instead of "not run", a decision log, resumable after `/clear` |
| `/keystone:verify [plan [base]] [--strict]` · `accept` | build, tests, lint, then a verifier in a clean context; architecture and security gates; PASS / PASS-UNPROVEN / FAIL |
| `/keystone:fix <bug>` | regression first: a failing test in a new file, then the smallest fix. `/keystone:fix verify` fixes every finding of the last FAIL `verify.md` in one pass |

**Project context**

| Command | What it does |
|---|---|
| `/keystone:setup [description]` | writes a short `CLAUDE.md`, `.claude/rules/base.md` and a project `.mcp.json` after a diff and a "yes"; imports an existing `AGENTS.md` |
| `/keystone:architecture [pattern]` | picks an architecture pattern and writes `docs/architecture.md` with a grep check per rule |
| `/keystone:docs [update <files\|topics>] [--web]` | README as a landing page and topic pages in `docs/` |

**Checks and quality**

| Command | What it does |
|---|---|
| `/keystone:security [category\|agent\|supply-chain\|path\|plan] \| ignore <id> <reason>` | OWASP Top 10:2025 + LLM Top 10 2026, agent/MCP and supply-chain audit, findings mapped to CWE/ASVS/ISO; `Security gate: pass\|warn\|fail` |
| `/keystone:review [PR\|ref\|empty = staged]` | review without edits; a clean-context validator rechecks every finding |
| `/keystone:qa [--all] [change-summary\|test-plan\|test-cases] [plan\|ref]` | change summary, test plan and manual scenarios linked to `I-n` |
| `/keystone:qa-check [human\|agent] [plan\|qa folder\|branch]` | runs the `qa` scenarios; pass / fail / blocked with evidence |
| `/keystone:ask <question>` | answers only on evidence, otherwise `INSUFFICIENT INFORMATION` |
| `/keystone:pentest <your target URL> [report]` | confirms the security findings against your own running app (localhost / staging, or a URL you name as yours); one safe request per finding, raises or lowers it |
| `/keystone:optimize perf <target> \| simplify <path>` | makes code faster or simpler on measurement: same command before and after, a change kept only if the numbers improve |

**Build and ship**

| Command | What it does |
|---|---|
| `/keystone:dockerize [--audit]` | Dockerfile, compose, hardened production overlay; or an audit |
| `/keystone:ci [github\|gitlab] [--enhance]` | CI pipeline from the tools the project really has |

**Lessons and knowledge**

| Command | What it does |
|---|---|
| `/keystone:roadmap [check\|vision]` | `docs/roadmap.md` with milestones `M-n` |
| `/keystone:evolve [all\|stage\|topic]` | turns repeated lessons into `.claude/rules/` after a "yes" |
| `/keystone:transfer <project path> [all\|stage\|topic]` | brings rules and lessons from another of your projects |
| `/keystone:reference <url\|path>… [--name] [--update]` · `list\|show\|delete` | project reference: conclusions, prices, limits with a source |
| `/keystone:distill <path\|url>… [--name] [--path] [--update] [--split]` | turns a book or documents into a Claude Code skill |

Full reference with models, "when to use" and who calls each command: [`docs/skills.md`](docs/skills.md).

## Gates (hooks)

Gates apply only while there is an **active plan**: the `plan.md` in the newest task folder whose status is `draft`,
`approved` or `implementing`. With no active plan, an S-level change is never blocked.

| When | What is denied |
|---|---|
| plan is `draft` | code edits outside the task folder until the plan is approved |
| fix is `implementing` | edits to test files already committed in `HEAD` (a new regression test file is fine) |
| plan is `implementing` and `## Tasks` has `[ ]` without `BLOCKED:` | ending the turn: one reminder, it never blocks a question to you |
| any active plan | `git push` and `gh pr create` until `/keystone:verify` returns PASS, or `/keystone:verify accept` |

**Release after verify.** Because push opens only on a verified plan, release steps never sit in `## Tasks` — the plan
keeps them in `## Release` (`R1`, `R2`, …). Verify does not count them as open work; on PASS its `Next:` points to
`/keystone:implement <plan>`, which in **release mode** runs only those steps, asks for your yes before each merge, push
or deploy, and keeps the plan `verified`. This follows the playbook's rule: *"The agent does everything up to the
production gate and nothing past it."*

To lift a gate, set `Status: abandoned` in the plan header, or run with `KEYSTONE_GATES=off`. The hooks are plain Node
scripts (`hooks/gate.mjs`) and read only the hook payload and the plan files.

## Files

Task files live in `docs/keystone/<YYYY-MM-DD>-<slug>/` — `intent.md`, `plan.md`, `verify.md` — or in `paths.specs`
when the project uses AI Factory. The plan header is `Level · Mode · Status` (plus `Settings:` and `Done means:`), and
Status moves `draft → approved → implementing → verified`, or `abandoned` at any point; the `## Release` steps run while the
plan is `verified`. Each stage ends in a committed
file and the next stage starts by reading it, not by replaying the chat.

## Benchmarks

Measured on a real-world Next.js + NestJS + Supabase monorepo, in fresh isolated clones:

- plan check: 6 real findings and 0 false against 2 real and 1 false for AI Factory `improve +check`, same two plans,
  comparable cost;
- gates held live: a draft-plan code edit and a `git push` were both denied;
- S level cost about $1 on Sonnet; `verify` returns `PASS-UNPROVEN` instead of claiming what it did not prove;
- the grill benchmark is inconclusive (the user simulator leaked decisions).

Method, tables and limits: [`docs/benchmarks.md`](docs/benchmarks.md).

## Status and cost (mod)

Keystone ships a small TypeScript [mod](https://code.claude.com/docs/en/plugins/mods) next to its hooks:

- **`/keystone-status`** — the active plan, its level, status, tasks done, `BLOCKED` count, `Done means`, which gates are
  on, and the cost of each stage. Answered locally, without a model call.
- **Status line** — `Keystone · L · implementing · 13/14 · $9.60` under the prompt.
- **Cost meter** — after every turn the session's cost delta is added to the stage you ran (`/keystone:plan`,
  `check`, `implement`, …) for the active plan; `implement` and `verify` receive the measured numbers for their
  `cost:` line.
- **Next command** — after a Keystone turn the empty prompt box shows the next step with the plan path filled in
  (`/keystone:implement docs/keystone/…/plan.md`, then `/keystone:verify …`); press Tab or → to take it.
- **Next buttons** — above the prompt, from the plan status, without a model call: the plan's next command and
  `/keystone-status`, plus `/keystone:check` for an L draft with an intent or `/keystone:review` before verify on L.
  A click puts the command into the prompt box; you press Enter.
- **File links** — file paths in answers are clickable relative to the session folder (`` `hooks/keystone.ts:86` ``
  becomes a link); only the rendering changes, the message stays as it is.
- **Handoff** — when the context grows, `/keystone-handoff` or the Hand off button (at 350k / 600k / 800k tokens;
  100k / 150k / 170k for a short window) has the agent update `plan.md`; after `/clear` the next command is already
  in the prompt box. `/clear` runs only after `KEYSTONE HANDOFF READY` and only if the plan really changed.

Mods need Claude Code 2.1.287+ (terminal) or 2.1.286+ (Desktop). In `claude -p` the hooks run but nothing is drawn.

## Integrations

- **[memlab](https://github.com/sattva2020/memlab) (optional, a separate plugin).** Project memory: code and
  decision search over a symbol graph. Install it next to Keystone:

  ```text
  /plugin marketplace add sattva2020/memlab
  /plugin install memlab@memlab
  ```

  Keystone does not install or configure it. When memlab's tools are present in a session, `grill`, `intent`, `plan`,
  `check` and `fix` use `search_decisions` / `search_code` for prior decisions and code locations, and `fix` records the
  lesson with `add_note`. Without memlab everything works as before.

- **[Dokploy MCP](https://github.com/sattva2020/dokploy-mcp) (optional, `@sattva/dokploy-mcp`).** The whole Dokploy API
  through 4 gateway tools (~1% of the context): deploy, logs, domains, databases, backups. When the project deploys on
  Dokploy, `/keystone:setup` proposes it for the project `.mcp.json` (`${DOKPLOY_URL}`, `${DOKPLOY_API_KEY}`), and
  `/keystone:dockerize` mentions it in its summary.

## Built on

- [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) (Anthropic): each stage ends in a
  committed file, the next stage starts by reading it, and review happens in a fresh context so the verdict is not
  shaped by the assumptions that produced the code.
- [Claude Code best practices](https://code.claude.com/docs/en/best-practices): skip the plan when the diff fits in a
  sentence, give Claude a way to verify its work, use hooks for hard rules, research in subagents, implement in a new
  session, review in a clean context.

Adapted: the playbook has a `spec.md` between intent and plan; Keystone drops it, **the plan is the spec**. The S/M/L
levels are new here.

Credits: 21 skills are ported from [AI Factory](https://github.com/lee-to/ai-factory) 2.19.0 (MIT) and reworked, 5 of
its skills are replaced by Claude Code mechanisms and 6 are skipped; what was taken and why is in
[`docs/ai-factory.md`](docs/ai-factory.md). Attribution: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Keystone is not affiliated with KeystoneJS or keystone-engine.

## Known limitations

- Hooks were tested on Windows (PowerShell and Git Bash). macOS and Linux are untested; the CI matrix runs the unit
  tests on both, but live runs are not covered.
- The headless test harness needs your own project and your own scenarios; none ship with the repo.
- The grill benchmark is inconclusive, so "better than a general grilling skill" is not claimed.
- Results come from one corpus with one run per scenario.

## Contributing, feedback, security

- Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a PR; start with an issue or a Discussion.
- Share how it went for you via the *Feedback* issue form or [Discussions](https://github.com/sattva2020/keystone/discussions).
- Report vulnerabilities privately, see [`SECURITY.md`](SECURITY.md). Community rules: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- Version history: [`CHANGELOG.md`](CHANGELOG.md).
## License

MIT, see [`LICENSE`](LICENSE). Parts derived from AI Factory 2.19.0 are MIT as well; see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

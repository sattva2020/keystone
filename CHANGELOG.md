# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.17] — 2026-10-17

### Changed
- **Keystone no longer reads or writes AI Factory's `.ai-factory/` folder.** Plans and intents live only in
  `docs/keystone/<date>-<slug>/`; skills, agents and hooks drop every `.ai-factory/*` fallback (`paths.specs`,
  `config.yaml`, `DESCRIPTION.md`, `RULES.md`, `rules/`, `plans/`, `patches/`, `qa/`, `references/`, `ROADMAP.md`).
  Project rules come from `CLAUDE.md`, `.claude/rules`, `docs/architecture.md` and `AGENTS.md`. An older plan outside
  `docs/keystone` still works when its path is given explicitly; the gates and the status band see only
  `docs/keystone`.

### Fixed
- **Every file link is checked.** The mod resolves each link and file path in an answer: an existing file inside the
  session folder becomes a working relative link, a stray leading `../` is repaired when the file exists without it,
  and a link or a code path to a missing or outside file never stays a link — it is shown as plain text (Desktop turns
  a path in inline code into a link by itself, so code is not enough). The File links rule in every skill says the
  same and asks to link only a file that was checked to exist.

## [0.9.16] — 2026-10-17

### Changed
- **The active plan belongs to the session that works with it.** A plan is a session's once it ran
  `/keystone:<stage>` naming the plan's folder (`implement` / `verify` with no argument take the newest plan) or edited
  a file in that folder; the gates read this from the session transcript, the mod keeps it in its session state. Any
  other session in the repo gets no Stop reminder, no draft lock on code edits, no status line, buttons or handoff
  offer, and its turns are not billed to the plan; `/keystone-status` there names the repo's plan and the command that
  takes it over. The push gate stays repo-wide. Keystone stages run before the session had a plan (start, intent,
  plan before plan.md exists) are billed to it once it has one.
- **Plan choice is the same in the gates and the mod:** the newest task folder whose plan.md is in view (active, or
  verified with open `## Release` steps). A newer folder with only an intent no longer hides an implementing plan.
- **Band above the prompt:** a plan progress bar and a context bar (real bars on Desktop, block glyphs in the
  terminal); the handoff buttons sit on the context bar; commands show as short chips, the full command with its plan
  path fills the box.

### Fixed
- After a plain prompt the stage resets: no buttons after unrelated turns, and their cost is no longer billed to the
  last Keystone stage.
- The plan's next command now really replaces the engine's suggestion (a shadowed variable kept it from ever doing so).
- On L with a `Threats:` block, the band offers `/keystone:security` before `/keystone:verify`, as verify's Security
  gate needs.

## [0.9.15] — 2026-10-17

### Fixed
- **Dead links to files outside the session folder.** The Desktop file pane opens only files inside the session's
  working directory, so a link to Claude's memory (`~/.claude/projects/.../memory`), another repository or a temp
  folder showed "file not found" although the file existed. The mod now draws such a link as the path in code
  (copyable), keeping a label that says more than the path; the File links rule in every skill says the same: a file
  outside the working directory is never a link, only its absolute path in code.

## [0.9.14] — 2026-10-16

### Added
- **evolve add:** `/keystone:evolve add <rule text>` writes one rule you dictate, the missing half of AI Factory's
  `/aif-rules`: English imperative wording (always / never → `MUST` / `MUST NOT`, so `review rules` and the verifier
  check it), dedupe against every loaded rule (covered → nothing written, partial → a diff, conflict → you choose), an
  existing or new `.claude/rules/<topic>.md`, `paths:` globs checked to match files, written only after the diff and a
  "yes", logged in `docs/keystone/evolve-log.md`.

## [0.9.13] — 2026-10-15

### Fixed
- **Push gate:** a redirection after the push (`2>&1`, `> log`) was read as a ref, `git log` failed on it and the gate
  stayed closed; redirections are cut before the refs are read. 0.9.12 was never published — 0.9.13 ships it.

## [0.9.12] — 2026-10-15

### Added
- **verify:** the verifier lists every test the diff loosened (deleted or skipped asserts, exceptions added to a
  pattern, looser matchers, text that meets a test's wording but not its meaning) as `Weakened test:` — a green run says
  nothing about a loosened test, so an untied one keeps the verdict at PASS-UNPROVEN until you accept it. It also greps
  accepted intents of earlier tasks and `docs/notes` for decisions the change contradicts; a `Decision:` line is a FAIL
  unless this task's plan supersedes that decision. Both come from 0.9.10, which loosened a test and broke an accepted
  decision with every test green.

### Fixed
- **Push gate:** it closed every push while the newest plan of the repo was active, so another session's unfinished
  plan blocked unrelated releases (0.9.10 and 0.9.11 had to be pushed by hand). Now a push is closed only when a commit
  it ships, not yet on any remote, touches the active plan's task folder — implement commits the plan with every task,
  so the plan's own work stays gated. The refs come from the command (`git push <remote> <src>[:<dst>]`, `--all`,
  `-C <dir>`); an unknown ref keeps the gate closed.
- The gate hint no longer says "run with KEYSTONE_GATES=off" as if a command prefix worked: the hook reads Claude
  Code's own environment, so it has to be set before Claude Code starts.

## [0.9.11] — 2026-10-15

### Removed
- **0.9.10 was a mistake in direction, reverted here:** plan, implement, fix, verify, review and check (with the
  verifier and the analyzer) read AI Factory's per-skill files `.ai-factory/skill-context/*/SKILL.md` on every run, and
  security and verify's Security gate read `.ai-factory/SECURITY.md`. That made Keystone's stages depend on another
  tool's internal files. Stages again read only Keystone's own files (`.claude/rules`, `docs/keystone/security-ignores.md`).

### Changed
- Tests are strict again: no `/aif-` anywhere in skills, and no skill or agent mentions `skill-context` or
  `.ai-factory/SECURITY.md`.

### Kept from 0.9.10
- **Commit scope:** implement, intent, plan, fix, verify and setup pick a scope allowed by a commitlint `scope-enum`.

## [0.9.10] — 2026-10-15

### Added
- **AI Factory lessons:** plan, implement, fix, verify (and the verifier's Rules gate), review and check (and the
  analyzer) read `.ai-factory/skill-context/aif-<stage>/SKILL.md` when it exists — plan → aif-plan, implement →
  aif-implement, fix → aif-fix, verify → aif-verify, review → aif-review, check → aif-improve. Not a fallback: it is
  read next to `.claude/rules`, and its MUST / MUST NOT lines are project rules.
- **security:** the ignore-list of an AI Factory project, `.ai-factory/SECURITY.md`, is read together with
  `docs/keystone/security-ignores.md` (by the audit and by verify's Security gate); `ignore` writes where the project
  already keeps its ignores.
- **Commit scope:** implement, intent, plan, fix, verify and setup read a commitlint `scope-enum`
  (`.commitlintrc*`, `commitlint.config.*`, `commitlint` in `package.json`) and pick an allowed scope instead of
  `docs(verify)` and the like.

### Changed
- The I-15 leftovers test allows `/aif-` only inside the path `skill-context/aif-…`.

## [0.9.9] — 2026-10-15

### Added
- **implement:** a live task list (TaskCreate / TaskUpdate) mirroring the plan's open checkboxes — `in_progress` when a
  task starts, `completed` right after its box is ticked. The checkboxes stay the only state; the list is rebuilt from
  the plan on resume.
- **review rules:** `/keystone:review rules [ref]` checks only the MUST / MUST NOT rules over the diff, without a plan
  (S changes): one line per rule with every violating `file:line`, as in the verifier's Rules gate, plus
  `Suggested rule updates` that `/keystone:evolve` takes from the same session.
- **fix:** past lessons before any code change — memlab `search_decisions` on the area, the matching `.claude/rules`
  from evolve, or the 10 newest fix plans' Root cause / Prevention; a `Lessons:` line in task 1's evidence.
- **check:** a free-text request after the paths (`/keystone:check <plan> <request>`), routed into the usual finding
  groups and marked `(from request)`; the run ends with `Plan refined: N added / M changed / K removed`.
- **verify:** a context-drift question when the diff makes `docs/architecture.md`, `CLAUDE.md` or `.claude/rules`
  stale, offering the owning command (architecture / setup / evolve); `Context drift:` line in the final report.

### Changed
- The I-15 leftovers test allows `TaskCreate` / `TaskUpdate` in implement only (TaskList / TaskGet stay out: the
  list is never read back as state).

## [0.9.8] — 2026-10-15

### Added
- **A menu at the end of every stage, as in AI Factory.** Every skill ends with an AskUserQuestion menu when more than
  one next step makes sense (recommended first, `Stop here` last), and the picked option is carried out in the same
  session; a step that needs `/clear`, a push or production becomes the `Next:` command instead.
- **verify:** `Fix directly here` and `Fix critical only` on FAIL (the fix skill's rules apply, then verify runs again);
  review / security / push on a plain PASS. **fix:** `verify critical`; a Yes/Skip menu for the extra regression test.
  **implement:** a menu at the end (verify in a clean session / now / continue) and when there is no plan.
- **Status colors** in chat reports: ✅ ⚠️ ❌ ⏸️ 🔄 ⏳ for rows and tasks, 🟢 🟡 🔴 ⚪ for verdicts and gates,
  🔴 🟠 🟡 🟢 for severity and risk (security, review, roadmap check, implement progress, fix summary).

### Fixed
- **check:** the validator's `Group:` field allowed four of the seven groups, and `goal-drift` was missing from the
  numbering order, so `intent-gap`, `rule-violation` and `goal-drift` replies could be read as malformed.

## [0.9.7] — 2026-10-15

### Changed
- **Verify ends with a choice, as AI Factory's verify does.** After a FAIL, PASS-UNPROVEN or PASS with release steps,
  verify opens an AskUserQuestion menu with the recommended option first, instead of a single `Next:` command. For
  PASS-UNPROVEN a `Prove now: <check>` option comes before accept; a read-only check runs in the same turn, and
  choosing accept is the accept confirmation.

### Fixed
- **Accept offered before a security check.** With open rows about RLS, grants, auth or permissions, accept is never
  the recommended option.
- **Security gate `n/a` on RLS changes.** A diff that changes RLS policies, grants, auth or permission checks is a
  security change even when the plan has no `Threats:` block; without a `/keystone:security` run the gate is
  `not proven`.

## [0.9.6] — 2026-10-15

### Fixed
- **verify → fix → verify loop.** The verifier's Rules gate reported a single `rule, file:line`, so each verify run
  surfaced one violation (a different one each time on the same code) and each cost another fix and verify round. The
  Rules gate now gives one `rule …` line per project MUST / MUST NOT rule with every violating `file:line`.
  `/keystone:fix verify` reads the FAIL `verify.md` and fixes every finding in one pass; a FAIL and a re-run of verify
  on unchanged code both point to it instead of another verify.
- **Plan not found after `/clear`.** A session that worked in another repository (after `cd`) wrote the plan there but
  gave `Next:` with a path relative to that repository; the fresh session starts in its own working directory and found
  nothing. Every skill now gives a path in the `Next:` command that opens from the session's working directory — the
  absolute path for a file outside it.

## [0.9.4] — 2026-10-13

### Fixed
- **Dollar amounts in skill text.** Claude Code reads `$<digit>` in a skill as an argument placeholder, so the cost
  references in `start` (`$3.9`, `$6`, `$30`) and the price lesson in `grill` (`$49`) were replaced by words of the
  user's request. Amounts are now written as `USD 3.9`; a test keeps `$<digit>` out of every skill.

## [0.9.3] — 2026-10-13

### Added
- **Goal substitution guard.** `intent.md` keeps the user's first request verbatim in `## Original goal` and a
  `Goal check:` line; narrowing or replacing the goal needs the user's confirmed words. `grill` asks how the job is done
  today, treats an agent limit (password, login, CAPTCHA) as a design problem rather than a reason to drop the goal, and
  re-asks decisions borrowed from earlier tasks. `check` reports `goal-drift`; `verify` starts with
  `Original goal: met | partially | not met`.
- **Release mode in the status line.** A `verified` plan with open `## Release` steps stays in view in
  `/keystone-status`, and the suggested next command is `/keystone:implement <plan>`.

### Fixed
- **File links that did not open.** Every skill writes its files inside the session's working directory (in a worktree,
  the worktree) and links them relative to it; a file outside gets an absolute path.
- **Release ticks.** Release mode commits the ticks before a push step so the push carries them, instead of asking for
  a separate push.

## [0.9.2] — 2026-10-13

### Fixed
- **Release gap.** A release step (merge into main, push, deploy, a production job) written as a plan task could never
  run: the push gate opens only on `Status: verified`, and `/keystone:implement` refused a verified plan. Now `plan`
  writes release steps into a separate `## Release` section (`R1`, `R2`, …), `verify` does not count them as open work
  and on PASS points to `/keystone:implement <plan>` in **release mode**, which runs only those steps — each merge,
  push or deploy after your explicit yes — and keeps the plan `verified`. See the new rows in
  [`docs/scenarios.md`](docs/scenarios.md).

## [0.9.1] — 2026-10-12

### Changed
- Every skill prints its final `Next:` command in a fenced code block, so the app shows a copy button on it; the
  command is never tagged as shell, which would offer to run it.

## [0.9.0] — 2026-10-12

### Added
- **`/keystone:pentest`** — confirms the findings of `/keystone:security` against your own running app (your targets
  only: localhost, `*.test`, or a staging URL you name as yours; production only on an explicit yes, observation-only).
  Passive checks by the OWASP ZAP baseline, then one safe request per finding to raise or lower it, with a PoC and
  `Refs:`. It never brute-forces, loads or bypasses protections. `security` and `verify` offer it.
- **`/keystone:optimize`** — makes code faster or simpler on measurement. `perf`: the same command 3+ times before and
  after, a change kept only if the numbers beat the noise, else reverted, tests green. `simplify`: dead code and
  duplication removed with tests green before and after and fewer lines. Installs nothing without a yes; never touches
  production. `review` hands it a performance finding.
- 25 skills in total; the user-flow image now shows the two new tools.

### Changed
- **`/keystone:security` (P1)** — a `Confidence` and `Entry point` on every finding; MEDIUM goes to a separate
  "Needs verification" list that does not move the gate, LOW is not reported, hardening without an exploit path is a
  suggestion, not a finding. A severity rubric (`references/SEVERITY.md`, criteria decide over examples) and a
  "Do Not Flag" list (`references/DO-NOT-FLAG.md`) keep ratings stable between runs. `Refs:` ids carry the edition year
  (`A05:2025`, `LLM01:2026`). A "what you build → LLM risks" table and a CI prompt-injection check were added.

## [0.8.2] — 2026-10-12

### Added
- **What to run next**: every skill ends its answer with `Next: <exact command with paths>` (or `Next: nothing now —
  waiting for <event>; then <command>`); `/keystone-status` prints the same `Next:` line; new page
  [`docs/scenarios.md`](docs/scenarios.md) (and `.ru`) — plan status → next command, and 14 everyday scenarios.
- `grill` run directly says its decisions are not saved yet and routes them to `/keystone:intent` or `/keystone:start`.

### Fixed
- `security` `audit.sh` (found by `/keystone:verify`): secret names matched case-insensitively (`BRAVE_API_KEY` in
  `.mcp.json`), `sk-` keys after a hyphen (`${VAR:-sk-…}`) and `sk-proj-` / `sk-svcacct-` keys with `_` or `-`,
  real npm vulnerabilities are no longer reported as UNASSESSED; an executable test runs the script on temp folders.

## [0.8.1] — 2026-10-12

### Fixed
- `check` finds a plan under `.ai-factory/plans/` (current branch first) in AI Factory projects; a grill decision
  list (`D1…`) in the plan stands in for a missing `intent.md`, with an advisory verdict; an approved plan is changed
  only after the user's answer.
- `start` keeps decisions already closed in a grill, production, secrets and other people's access at level L.
- Release note: Claude Code runs a plugin from a versioned cache — start a **new session** after
  `claude plugin update keystone@keystone`; an already open session may keep the older copy.

## [0.8.0] — 2026-10-12

### Added
- **Dokploy MCP** ([`@sattva/dokploy-mcp`](https://github.com/sattva2020/dokploy-mcp)): `setup` proposes it when the project deploys on Dokploy.
- **Next-command suggestion (mod)**: after a Keystone turn the prompt box offers the next command with the plan path; Tab takes it.
- **15 new skills**, 23 in total (see [`docs/skills.md`](docs/skills.md)):
  - project context: `setup`, `architecture`, `docs`;
  - checks and quality: `security`, `review`, `qa`, `qa-check`, `ask`;
  - build and ship: `dockerize`, `ci`;
  - lessons and knowledge: `roadmap`, `evolve`, `transfer`, `reference`, `distill`.
- **`review-validator` agent**: a read-only second opinion in a clean context for every `review` finding.
- **Native project context**: `CLAUDE.md`, `docs/architecture.md` and `.claude/rules/` are read first; the
  `.ai-factory/*` files are a fallback when they are absent.
- **`setup` and `AGENTS.md`**: with an `AGENTS.md` and no `CLAUDE.md`, the new `CLAUDE.md` imports it with `@AGENTS.md`
  instead of shutting it off.
- **Architecture and security gates in `verify`**: the grep checks from `docs/architecture.md` and the result of
  `Security gate`.
- **Research mode in `intent`**: on L, when the "how" is unclear, a `research.md` is written before the grill.
- **Rules proposals in `implement`**: up to three new rules for `.claude/rules/` at the end, written only after a "yes".
- **Roadmap link**: an intent may carry `Roadmap: M-n`; `verify` after PASS offers to mark the milestone.
- User-flow image with the tools rows, a skills reference ([`docs/skills.md`](docs/skills.md)) and a page on what was
  taken from AI Factory ([`docs/ai-factory.md`](docs/ai-factory.md)), both with Russian versions.

### Changed
- `security`: OWASP Top 10:2025 (new A03 Software Supply Chain Failures, A10 Mishandling of Exceptional Conditions), OWASP GenAI LLM Top 10 2026, new categories `agent` (MCP, hooks, permissions) and `supply-chain` (GitHub Actions, lockfiles); every finding carries `Refs:` (OWASP · CWE · ASVS 5.0 · ISO 27001:2022 A.8.x, see `references/MAPPING.md`); `audit.sh` detects provider keys and reports `UNASSESSED` instead of a silent pass.
- Reports and summaries render as Markdown (tables, bold labels, lists) instead of code blocks; the grill decision list is a `# | Decision | Answer` table.
- `docs`, `dockerize`, `ci`, `qa-check` and `reference` run on Sonnet.

### Fixed
- `setup` writes `CLAUDE.md` last and links only files that were written; it warns that Claude Code asks its own permission for `.claude/` and `.mcp.json`. `review` reads a digit-only abbreviated commit hash as a ref, not a PR number.
- AI Factory bugs that were not ported: a repeated setup overwrote existing files (now it only adds, after a "yes");
  `audit.sh` was called by a wrong path and its `((ISSUES++))` stopped the script under `set -e`; the `.git` grep filter
  dropped any path containing "git".

## [0.7.0] — 2026-10-12

### Added
- **Dokploy MCP** ([`@sattva/dokploy-mcp`](https://github.com/sattva2020/dokploy-mcp)): `setup` proposes it when the project deploys on Dokploy.
- **Next-command suggestion (mod)**: after a Keystone turn the prompt box offers the next command with the plan path; Tab takes it.
- **Mod** (TypeScript, `hooks/keystone.ts`): `/keystone-status` answered without a model call; a status line
  `Keystone · L · implementing · 13/14 · $9.60`; a cost meter that adds each turn's cost to the stage you ran and hands
  `implement` / `verify` the measured numbers for their `cost:` line. Tests: `claude plugin test .`.
- **Implementation notes**: an append-only `## Implementation notes` section in `plan.md` — `implement` writes one line
  per decision the plan did not spell out (what, why, evidence); `verify` lists unexplained deviations.
- **User flow** diagram mapped onto Anthropic's AI-native SDLC playbook (`assets/flow-*.svg`) and a stage-by-stage table in the README.

### Changed
- README: memlab is a separate plugin with its own install commands; the "See it in action" example now shows grill
  inside intent, `accept` as a full command and `check` run by `plan`.

### Removed
- The AI Factory adapter is no longer part of the public repository.

## [0.6.0]

Keystone is now a standalone Claude Code plugin.

### Added
- **Dokploy MCP** ([`@sattva/dokploy-mcp`](https://github.com/sattva2020/dokploy-mcp)): `setup` proposes it when the project deploys on Dokploy.
- **Next-command suggestion (mod)**: after a Keystone turn the prompt box offers the next command with the plan path; Tab takes it.
- Eight skills: `start`, `grill`, `intent`, `plan`, `check`, `implement`, `fix`, `verify`.
- Hook gates (`hooks/gate.mjs`): no code edits while the active plan is `draft`; no edits to committed tests during a
  fix; a Stop reminder while plan tasks are open; no `git push` / `gh pr create` before `/keystone:verify`.
  Off switch: `KEYSTONE_GATES=off`.
- `analyzer`, `validator` and `verifier` agents that run in clean contexts.
- `Done means:` in the plan header, with verifiable outcomes checked first by `verify`.
- A three-part summary ("Blocked on me / Changed / Found") and a "keep going / stop" rule for `implement`.
- `Repro:` for every `wrong` row and an `Unconfirmed` section in `verify.md`.
- Per-stage `effort: high` in skill frontmatter.
- Optional memlab MCP integration (`search_decisions`, `search_code`, `add_note`) when the server is present.

### Changed
- `security`: OWASP Top 10:2025 (new A03 Software Supply Chain Failures, A10 Mishandling of Exceptional Conditions), OWASP GenAI LLM Top 10 2026, new categories `agent` (MCP, hooks, permissions) and `supply-chain` (GitHub Actions, lockfiles); every finding carries `Refs:` (OWASP · CWE · ASVS 5.0 · ISO 27001:2022 A.8.x, see `references/MAPPING.md`); `audit.sh` detects provider keys and reports `UNASSESSED` instead of a silent pass.
- `plan`, `check`, `implement`, `fix` and `verify` are ported from AI Factory 2.19.0 (MIT) and reworked; see
  `THIRD_PARTY_NOTICES.md`.
- `verify` no longer edits intent or plan; `accept` refuses when either changed after `verify.md`.
- `fix` writes its plan to `paths.specs`; unverified tasks stay `[ ]` with `BLOCKED:`.
- `grill` requires a coverage table before the final summary.

## [0.5.0]

### Added
- **Dokploy MCP** ([`@sattva/dokploy-mcp`](https://github.com/sattva2020/dokploy-mcp)): `setup` proposes it when the project deploys on Dokploy.
- **Next-command suggestion (mod)**: after a Keystone turn the prompt box offers the next command with the plan path; Tab takes it.
- Claude Code plugin form of the extension, plus an AI Factory adapter (`adapters/ai-factory`).
- S / M / L levels that size the process to the change.

## [0.4.x]

### History
- Keystone began as the AI Factory extension `aif-ext-intent-chain`: the chain `intent → plan → implement → verify`
  injected into the AI Factory skills. `spec.md` was removed in 0.4.0 (the plan is the spec).

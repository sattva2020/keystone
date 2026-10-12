# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

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
- Reports and summaries render as Markdown (tables, bold labels, lists) instead of code blocks; the grill decision list is a `# | Decision | Answer` table.
- `docs`, `dockerize`, `ci`, `qa-check` and `reference` run on Sonnet.

### Fixed
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

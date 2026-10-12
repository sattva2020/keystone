# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.7.0] — 2026-10-12

### Added
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
- Claude Code plugin form of the extension, plus an AI Factory adapter (`adapters/ai-factory`).
- S / M / L levels that size the process to the change.

## [0.4.x]

### History
- Keystone began as the AI Factory extension `aif-ext-intent-chain`: the chain `intent → plan → implement → verify`
  injected into the AI Factory skills. `spec.md` was removed in 0.4.0 (the plan is the spec).

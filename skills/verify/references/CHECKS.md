<!-- derived from ai-factory@2.19.0 skills/aif-verify/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone verify — build / test / lint / imports

These tables are implemented by `scripts/collect.mjs`: the verify skill runs it once and passes its lines to the
verifier, so no model reads this file during a run. Change a table here and in the script together. Never install
dependencies. A tool that is missing, or a command that cannot run here, is recorded as `not run (<reason>)`, never as a pass.

## Build & compile check

Detect the build system and verify the project compiles:

| Detection | Command |
|-----------|---------|
| `go.mod` | `go build ./...` |
| `tsconfig.json` | `npx tsc --noEmit` |
| `package.json` with `build` script | `npm run build` (or pnpm/yarn/bun) |
| `pyproject.toml` | `python -m py_compile` on changed files |
| `Cargo.toml` | `cargo check` |
| `composer.json` | `composer validate` |

If build fails → report errors with file:line references.

## Test check

If the project has tests and they were part of the plan (plan header `tests — yes`):

| Detection | Command |
|-----------|---------|
| `jest.config.*` or `vitest` | `npm test` |
| `pytest` | `pytest` |
| `go test` | `go test ./...` |
| `phpunit.xml*` | `./vendor/bin/phpunit` |
| `Cargo.toml` | `cargo test` |

If tests fail → report which tests failed and whether they relate to the implemented tasks.

If no tests exist or the plan header says `tests — no` → note it but don't fail; the rows then rest on static
inspection plus the plan's runnable/manual evidence (presence only, so `not proven` for behaviour).

## Lint check

If linters are configured:

| Detection | Command |
|-----------|---------|
| `eslint.config.*` / `.eslintrc*` | `npx eslint [changed files]` |
| `.golangci.yml` | `golangci-lint run ./...` |
| `ruff` in pyproject.toml | `ruff check [changed files]` |
| `.php-cs-fixer*` | `./vendor/bin/php-cs-fixer fix --dry-run --diff` |

Only lint the changed files to keep output focused.

## Import & dependency check

- Verify no unused imports were left behind
- Check that new dependencies mentioned in tasks were actually added (`package.json`, `go.mod`, `requirements.txt`, `composer.json`)
- Check for missing dependencies (imports that reference packages not in dependency files)

## Output handed to the verifier

One line per check: `build: <command> → pass | pass (reused: …) | fail (<first error file:line>) | not run (<reason>, a timeout too)`, likewise `test`
(with passed/failed counts), `lint`, `imports`. Keep the last ~20 lines of any failing output.

A timeout is `not run`, not a failure (limit: `KEYSTONE_CHECK_TIMEOUT_MS`, default 10 min). `pass (reused: …)` is a pass
measured earlier on the same code: only this task's folder or docs/**/*.md changed since.

## Between runs (lines after the checks)

The last committed `verify.md` of the task folder is the past run. Lines for the verifier:

- `delta: full — <reason>` — every row is judged. Reasons, in this order: `first verify`, `--full`, `history rewritten`
  (a commit listed under `commits:` of the past run is no longer an ancestor of HEAD), `base moved`, `merge since the
  last verify`, `plan changed` (ticks, `Status:`, `BLOCKED:` tails, `Coverage:`, `## Implementation notes` and
  `## Release` do not count), `intent changed`, `checks failed` (build or test `→ fail`).
- `delta: since <sha7> — <k> files changed since the last verify` — only rows in `judge:` and plan rows not carried.
  `<k>` counts every file but `verify.md`, the plan and intent included, so `0` means nothing changed. A rename counts
  as old path + new path; an untracked file older than the last verify commit is not counted (still carried as changed).
- `judge: <ids> | none` — past rows to judge again: not `ok`, or their evidence names a changed file (path or a suffix
  at `/` or `.`), or a `Task <n>` whose `files:` changed (a path, a folder above the file, its short name, or a glob such as `skills/*/SKILL.md`, `old/**`), or
  test-backed evidence while build / test is `not run`, or evidence that cites a row already in `judge:` (`see Row 13`).
- `rules scope: all task files[ — rule files changed: <list>] | files changed since <sha7> + files on the last run's
  failing rule lines: <files> | none`.
- `carried ids: <ids> | none`.

Then `--- record only (not for the verifier) ---`, and under it, for the record only:

- `carried: <id> — ok — carried from verify <sha7> — <evidence>` — the sha and evidence of the run that judged the row.
- `history: <n> runs · FAIL <f>` and `run <i> · <date> · <verdict> · open <o> · new <n> · closed <c> · cycle cost
  <$x.xx | n/a>` — findings are `wrong` / `missing` ids, each `file:line` of a failing `rule` line, `Decision:` and
  `Unrequested:` lines; `Advisory:` and `Minor:` are not findings.
- `trend menu: on this FAIL` — two or more FAIL runs already; a FAIL now gets the menu of `LOOP.md`.

`cost: verify+fix $x.xx | n/a` is not printed by the script: verify adds it to `## Checks` from the mod's cost line.

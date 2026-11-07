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

The last committed `verify.md` of the task folder that judged its rows is the past run (a run stopped on a failed
build or test judged nothing and is skipped). Lines for the verifier:

- `verifier: not called — <build | test | build, test> failed` — the first `build:` or `test:` line is `→ fail`: the
  run stops here; no `delta:` / `judge:` lines, only the marker and `history:` follow. `not run` (a timeout too) and a
  failing lint do not stop it.
- `delta: full — <reason>` — every row is judged. Reasons, in this order: `first verify`, `--full`, `history rewritten`
  (a commit listed under `commits:` of the past run is no longer an ancestor of HEAD), `base moved`, `merge since the
  last verify`, `plan header changed` (the `Level:`, `Settings:` or `Authority:` line differs; `Status:` does not count).
- `delta: since <sha7> — <k> files changed since the last verify` — only rows in `judge:` and plan rows not carried.
  `<k>` counts every file but `verify.md`, the plan and intent included, so `0` means nothing changed. A rename counts
  as old path + new path; an untracked file older than the last verify commit is not counted (still carried as changed).
- Plan and intent edits since the past run send to judge only what they touched: a rewritten or new task `N.` (with
  its indented sub-items) → `Task N`; a Reconciliation data row whose text differs at the same number → `Row n` (a row
  deleted in the middle shifts the rest, which are judged); a changed `Done means:` line → every past `Done means …`
  row; a changed or new `I-n` line of the intent → `I-n` and every task / row whose `Source` names it as its own (a
  `Source` segment `<path> — I-3` cites another file's intent and does not count). Ticks, `Status:`, `BLOCKED:` tails,
  `Coverage:`, `## Implementation notes`, `## Release` and `## Debt` are never edits; other plan text (Design, Risks,
  Commit Plan) and intent text (Problem, Decisions log) judge nothing.
- `judge: <ids> | none` — past rows to judge again: not `ok`, or their evidence names a changed file (path or a suffix
  at `/` or `.`), or a `Task <n>` whose `files:` changed (a path, a folder above the file, its short name, or a glob such as `skills/*/SKILL.md`, `old/**`), or
  test-backed evidence while build / test is `not run`, or evidence that cites a row already in `judge:` (`see Row 13`),
  or a plan / intent edit above, or (I-13) an `ok` row whose evidence or `Task` `files:` names a task file of a past
  `wrong` row (a file its evidence names or its Task owns), even if that file did not change.
- `left the plan: <ids> | none` — a struck intent line (`~~I-n …~~`) and every Reconciliation row whose own `I-n` are
  all struck: never judged, carried or printed. Worked out from the current intent and plan on every run, the first too.
- `rules scope: all task files[ — rule files changed: <list>] | files changed since <sha7> + files on the last run's
  failing rule lines: <files> | none`.
- `release refs: <Row n (I-n) → R<k> open | done | no step | no check; …> | none` — every `proved by R<k>` in a
  Reconciliation evidence cell (`Row <n>` counts the table's data rows from 1) against step `R<k>` of `## Release`:
  `open` = unticked with a `check:`, `done` = ticked, `no step` = no such step, `no check` = the step has no `check:`.
- `carried ids: <ids> | none`.

Then `--- record only (not for the verifier) ---`, and under it, for the record only:

- `edited: <id> (task text | row text | Done means line | intent line | cites I-n), … | none` — what plan / intent
  edits sent to judge.
- `late watch: <ids> | none` — past `ok` rows (`## Report` or `## Carried`) whose files did not change, not sent by an
  edit, that are judged again all the same (full run, I-13, a `see Row n` chain). `none` on the first verify.
- `carried: <id> — ok — carried from verify <sha7> — <evidence>` — the sha and evidence of the run that judged the row.
- `accepted violations: rule <source> — <file:line>; …; rule … | none` — every `Accepted violation by …` line of every
  commit of `verify.md`. Not printed on a stop run.
- `history: <n> runs · FAIL <f>` and `run <i> · <date> · <verdict> · open <o> · new <n> · closed <c> · cycle cost
  <$x.xx | n/a>[ · late <l>]` — findings are `wrong` / `missing` ids, each `file:line` of a failing `rule` line (only
  the places before ` — sites to cover:` / ` — Class:`; an accepted place is not one), `Decision:` and `Unrequested:`
  lines; `Advisory:` and `Minor:` are not findings. A stop run (`## Report` = `not judged — …`) has a `check: <kind>
  failed` key per failed `build:` / `test:` line plus every finding of the run before it. `late <l>` = ids of the run's
  `late watch:` it gave `wrong` / `missing`, shown only when `l > 0`. `Accepted unproven by` / `Accepted violation by`
  lines are not a run.
- `trend menu: on this FAIL` — the third FAIL: Step 1 prints it after two past FAIL runs, `--history` (this run
  committed) after three FAIL runs, and not with `rules menu:`; a FAIL now gets the menu of `LOOP.md`.
- `rules menu: on this FAIL` — `--history` only: the last two runs are FAIL with only unaccepted `rule` findings (no
  `wrong` / `missing` / `Decision:` / `Unrequested:` / `check:`, no `Settings: violated`, `Architecture gate: fail`,
  `Security gate: fail`); printed before `trend:`.

`cost: verify+fix $x.xx | n/a` is not printed by the script: verify adds it to `## Checks` from the mod's cost line.

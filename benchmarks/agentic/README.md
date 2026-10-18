# Agentic benchmark for `/keystone:verify`

Does Keystone's verify catch work that only *looks* done? This benchmark measures that instead of claiming it. It
follows [Ponytail's agentic benchmark](https://github.com/DietrichGebert/ponytail/tree/main/benchmarks/agentic): every
cell is a real headless Claude Code session on a seeded repository, scored by hidden deterministic checks, and every
instrument is proven by `--selftest` before any API call.

## What a cell is

A fresh temp folder outside any git checkout holds a tiny Python repo with its own history: a `base` commit with an
approved Keystone plan and an `impl` commit that checks every box. The session is asked to check the work. The cell is
**right** when:

- on a task with a gap: the verdict is `FAIL` **and** the reply (or `verify.md`) names the gap's evidence;
- on `clean`: the verdict is `PASS` or `PASS-UNPROVEN`. A `FAIL` there is a false alarm.

`clean` is there so that an arm which always answers `FAIL` does not win.

## Tasks

| task | the plan says | what the `impl` commit really did | evidence the reply must name |
|---|---|---|---|
| `missing-task` | `slugify`, `truncate`, tests for both | `truncate` never written, its box checked | `truncate` |
| `weak-test` | round `total()` to cents, regression test | no fix; the new test only asserts `IsNotNone` | the weakened test: `test_total_rounds` or `assertIsNotNone` |
| `rule-break` | `summarize()` that warns on an empty list | warns with `print()`, which `CLAUDE.md` forbids in `src/` | `print` |
| `clean` | `slugify`, `truncate`, tests | all of it, honestly | — (expects PASS) |

In every gap task `python -m unittest` still passes: the gap is invisible to the test suite, and `--selftest` checks
that.

## Arms

Every arm gets the same appended system prompt: *Change no code. End your final reply with exactly one line:
`VERDICT: PASS`, `VERDICT: PASS-UNPROVEN` or `VERDICT: FAIL`, and name every gap you found.*

| arm | prompt | plugin |
|---|---|---|
| `baseline` | `Check whether the work in <plan> is really done.` | none |
| `control` | the same, plus one line: `Do not trust checked boxes: check every plan task against the code, run the tests, and look for weakened tests and broken CLAUDE.md rules.` | none |
| `keystone` | `/keystone:verify <plan>` | this checkout via `--plugin-dir` |
| `keystone-base` | `/keystone:verify <plan>` | another Keystone checkout via `--base-plugin-dir <path>` — the plugin before a change, for a before/after run |

`control` is the honest rival: if one sentence of prompt matches Keystone, the benchmark should show it.

## Isolation

- The cell's folder is created by `tempfile.mkdtemp()` outside any repository and moved to `runs/<stamp>/` (gitignored)
  afterwards, so the model never sees Keystone's own commit history.
- `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`: neither your global `CLAUDE.md` nor
  your memory loads. The seeded repo's `CLAUDE.md` is still there to be read.
- `--setting-sources project,local --strict-mcp-config`: none of your globally enabled plugins or MCP servers; the
  keystone arm loads exactly one plugin with `--plugin-dir`.
- `--permission-mode bypassPermissions`, Bash allowed (checking work means running the tests), `--max-budget-usd 5`
  per cell, 900 s timeout with a process-tree kill.

## Metrics

From the `claude -p` JSON: `total_cost_usd`, `duration_ms`, `num_turns`, and `out` — output tokens summed over every
model in `modelUsage`, so a subagent counts too. Per task and arm: right verdicts and the median of cost, time, turns
and `out`. Per arm: the share of right verdicts over all cells, and for cost, time, turns and `out` the geometric mean
over tasks of `median(arm) / median(ref)`, where `ref` is `baseline` unless `--ref <arm>` names another. Both come with a bootstrap 95% interval (10 000
resamples of each task's cells, tasks fixed): it shows run-to-run noise, not how the result would move on other
tasks. Ratios are printed only over all tasks, never for a single task.

## Reproduce

Needs Python 3, git and an authenticated `claude` CLI.

```bash
python run.py --selftest
```

```bash
python run.py --task all --arms baseline,control,keystone --runs 5 --model opus
```

```bash
python run.py --rescore runs/<stamp>
```

Before/after a change to the plugin: check out the old commit as a git worktree, run both Keystone arms in one run,
then take the ratios against the old one.

```bash
python run.py --task all --arms baseline,keystone-base,keystone --runs 5 --base-plugin-dir <old checkout>
```

```bash
python run.py --rescore runs/<stamp> --ref keystone-base
```

`--dry-run` prints the command of each cell without calling the API. Use the same model for every arm:
`/keystone:verify` pins its own `model:` (Sonnet since 0.9.19, Opus before) and its verifier agent pins Opus, so the
keystone arms do not follow `--model`; it sets only the baseline and control arms.

## What it can and cannot show

- It **can** show, with variance, whether `/keystone:verify` catches a checked box with no code, a weakened test and a
  broken project rule better than the same model asked plainly or with a one-line hint, and at what cost and time.
- It **cannot** generalize from four tiny repositories, and the arms differ in their prompt as well as the plugin:
  the keystone arm is invoked the way people use it, by its command. A regex for the evidence is a floor: a reply can
  name the right word for a wrong reason.
- If the arms converge, the results say so.

## Results

[2026-10-17](../results/2026-10-17-agentic.md) — the first run.

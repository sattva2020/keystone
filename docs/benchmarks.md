# Benchmarks

Keystone was exercised on a real-world Next.js + NestJS + Supabase monorepo. This page summarizes what was measured,
how, and what it does not show. All numbers come from a single corpus with one run per scenario (n=1), so treat them as
signals, not statistics.

## Method

- **Fresh isolated clones.** Every scenario ran on its own clean clone, with no remote, git hooks disabled, secrets
  stripped from the environment, and `git push`, network and package-manager commands denied (see
  [`test/harness/README.md`](../test/harness/README.md)).
- **Executor:** Opus, headless `claude -p`, with the plugin under test loaded via `--plugin-dir` and any installed copy
  switched off. Session transcripts were checked to confirm the intended skill text was the one loaded.
- **User simulator:** Sonnet, isolated (no tools, no MCP, no slash commands, no settings), answering from a hidden
  scenario of decisions.
- **Graders:** Opus subagents, scoring against the contract checklist. The driver itself judges nothing.
- **Blind check comparison:** the same plans were checked by Keystone `check` and by AI Factory `improve +check` in
  separate clean clones; the grader saw findings with tool names replaced and labels shuffled, and verified each finding
  against the code and the intent.

## Results

| Scenario | Result | Cost |
|---|---|---|
| `check` vs AI Factory `improve +check`, two plans (blind) | Keystone 6 real, 0 false; AI Factory 2 real, 1 false | $10.43 vs $9.96 |
| `grill` vs a general grilling skill, 15 hidden decisions | missed in first summary 0 vs 3; coverage 15/15 vs 12/15; closed by a question 5 vs 8. **Inconclusive** | $8.00 vs $8.34 |
| Gate: edit while plan is `draft` | PASS: edit denied by the hook, file untouched | $0.92 |
| Gate: `git push` while plan is `implementing` | PASS: denied; the local bare remote received nothing | $0.44 |
| Level S (one-line change) on Sonnet | PASS: no plan files, no questions about settings, one edit, local commit | $1.01 |
| Level M: plan, implement, verify | PASS: no questions about tests or docs, `Settings:` inferred, honest `PASS-UNPROVEN` | $11.50 |
| Level L: plan with check, two-session implement, verify | PASS with findings, fixed afterwards (verify edited intent; `accept` on a stale report; the all-`BLOCKED` resume case) | $45.18 |
| Fix on a planted bug | PASS in substance: root cause found, regression test in a new file; plan-folder and checkbox defects fixed afterwards | $2.03 |
| Verify re-run on an earlier implementation | PASS: `PASS-UNPROVEN`, 0 false "unrequested", the adversarial pass found a new risk | $2.26 |

### Plan check

Both checkers received the same two plans at approval time. Keystone `check` found a React hook placed after an early
`return`, a decision that violated an intent line without being recorded, a task-order dependency, and a typed call that
broke the project's convention. AI Factory `improve +check` found two of the real issues and raised one false one.
Neither found that a UI chip inside a truncating container would clip a list (an intent line), so recall is not
complete.

### Grill

On a fresh pair of clones, `/keystone:grill` missed none of 15 hidden decisions in its first summary and covered all 15
before it, against 3 missed and 12 covered for the general skill. But on the first round the simulator volunteered 10 of
the 15 decisions unprompted, so the "closed by a question" column is not a fair comparison and no winner is claimed.
Both tools sometimes recommended scope expansions (extra notification channels, a snooze feature); the grill skill was
tightened afterwards. A rerun with a stricter simulator is still open.

### Verify honesty

`verify` returned `PASS-UNPROVEN` rather than `PASS` whenever a row had no runnable evidence, listed `Unconfirmed` items,
attached a `Repro:` to each `wrong`, and returned an honest `FAIL` when a logging rule was broken.

## Limits

- One corpus (a single monorepo) and one run per scenario; no variance estimate.
- Stage models and simulators are themselves LLMs; graders are Opus, so a shared bias is possible.
- A first grill run was discarded because a clone was not reset between runs; the numbers above are from the clean
  rerun.
- Costs are for the full scenario including simulator and graders, in US dollars at the time of the run.
- Hooks were exercised on Windows only. `KEYSTONE_GATES=off` is covered by unit tests, not by a live run.

<!-- original Sattva file (MIT) -->

# Sattva verify — the verify → fix loop

Read by `/sattva:verify` when the last verdict was FAIL and nothing changed since, when Step 1 printed
`verifier: not called` (failed checks, `ceiling: …`, `nothing to judge …`), when a `late watch:` id came back `wrong` /
`missing`, and on every FAIL for the menus below.

## Build or tests failed — `verifier: not called`

Step 1 printed `verifier: not called — <build | test | build, test> failed` → do not call the verifier: nothing is
judged on code that does not build or pass its tests. Write `verify.md` in the Step 5 layout: `## Checks` = the Step-1
lines and `cost:`; `## Carried` = `none`; `## Report` = `not judged — <build | test> failed (verifier not called)`;
`## Verdict` = `FAIL — <build | test> failed`, `Late: none`. Commit it alone (`docs(verify): <slug>`). The final
report names the failed check with the tail of its output from `## Checks`; `Next: /sattva:fix verify` — the failed
check is its finding. No menu: no ceiling, no rules menu. A `not run` check (a timeout too) and a failing lint never lead
here: the verifier is called as usual. For the history this run is a FAIL whose findings are `check: <kind> failed`
plus every finding of the run before it; the next run's delta counts from the last run that was judged.

**The cause is not this change.** The script cannot tell; you may. Never edit its lines and never call the verifier:
the run stays a FAIL stop. Add one line to `## Checks`, under the failed check: `cause: environment — <output line>`
(missing dependencies, a tool or network error; no installing) or `cause: red in base — <test>` (the same test fails
on a checkout of the base; not checked → no such line). An environment error may be collected again once. `Next:` is
then the step that repairs the environment, or the human's decision about the tests red in base — not `/sattva:fix
verify`. A plan's second command does not replace the failed check and does not lift the stop.

## Late findings

A row in Step 1's `late watch:` was `ok` in the last run and its files have not changed since, yet it is judged again
(full run, a file of a past `wrong` row, a `see Row n` chain). If the report now gives it `wrong` or `missing`, it is a
late finding; its id goes on the `Late:` line of `## Verdict` (`Late: none` otherwise):
- `late rule: on` (a judged PASS / PASS-UNPROVEN came before, I-3): the line ends with `Impact: non-critical` →
  `Late: <id> (advisory)` — outside the verdict, not a finding, `/sattva:fix verify` does not take it; the chat gets
  only the counter `Late advisory: <k>` of the final report (I-9). `Impact: critical`, or no `Impact:` tail →
  `<id> (critical)` and the verdict is FAIL. The advisory row is then parked: Step 1 carries it as
  `carried: <id> — advisory — …` without the verifier until its files, its plan text or a cited row change, and a parked
  row that goes back to the verifier on unchanged code stays under `late watch:`.
- `late rule: off` (no PASS yet, or `--full`) → as before: `Late: <id> (critical)`, FAIL.

The history adds ` · late <l>` to such a run; the trend table shows it in a `Late` column (no tail → 0).

## Nothing to judge — `verifier: not called — nothing to judge`

Step 1 printed `verifier: not called — nothing to judge since <sha7>; waiting for you: <ids | none>` (I-5): no row to
judge and nothing changed; the open rows are `BLOCKED` rows that wait for the human (`carried: … — BLOCKED — waiting
for you …`). Do not call the verifier; do not rewrite or commit `verify.md`. Show `Waiting for you: <ids>`, each with its
`BLOCKED:` reason, and `Next:` — `/sattva:verify accept <plan>` (accept them as unproven) or the check that lifts the
block (then the cell or the task's `BLOCKED:` tail changes, and that row is judged again). `open findings:` other than
`none` (findings of the last judged run that are not rows, failed gates, its `## Sweep` included) → `Next: /sattva:fix
verify` instead: they wait for a fix, and after the code fix the sweep goes with the next judged run by itself. Only
with `open findings: none` and `sweep: due — not done yet (…)` (a sweep that failed on unchanged code) →
`Next: /sattva:verify <plan> --full`: the sweep runs again together with the judge.

## Code unchanged since the last FAIL

Step 1 printed `delta: since <sha7> — 0 files changed` (nothing but `verify.md` changed since that verify — no code,
plan or intent edit, committed or not) and the verdict of run `<sha7>` — the last judged run, a later `not judged` stop
run does not count — was FAIL → do not call the verifier: say so, keep `verify.md`, and make the Next command
`/sattva:fix verify` — the open findings need a fix, not another verify. A second run is justified only after the code
or the evidence changed; never re-run the verifier hoping for a milder verdict.
A verifier that broke off without an answer gave no verdict: resume it, or start it again with the same prompt.

## The ceiling — `ceiling: reached`

From the third judged FAIL run the loop stops instead of another verify → fix round (I-7). A run stopped on a failed
build or test and an `accept` / decide commit are not runs and are not counted.

1. After the Step 5 commit run `node ${CLAUDE_SKILL_DIR}/scripts/collect.mjs <plan path> --history`. It prints
   `history: <n> runs · FAIL <f>`, one `run <i> · <date> · <verdict> · open <o> · new <n> · closed <c> · cycle cost
   <$x.xx | n/a>` line per committed `verify.md` run (this run included; an accept commit is not a run), and `trend: converging | not converging`. The
   script counts; you copy.
2. Show the trend as a table — Run · Date · Verdict · Open · New · Closed · Late · cycle cost — the past runs and this one.
   `cycle cost` of run i is the cost of the cycle before it (verify i-1 plus the fix after it): the difference of the
   `cost: verify+fix` lines of two runs; `n/a` where either has none.
3. Under the table, the total: `trend: converging` when this run's open is below the last run's and new = 0 (the script's
   `trend: converging`), otherwise `trend: not converging`; and the money so far: `≥ $<sum of the cycle costs> (this
   run not included)` — the cost line arrives at the start of a run, so this run is not in it. Print these lines in
   the user's language.
4. `--history` printed `ceiling: reached — <f> judged FAIL runs` → one AskUserQuestion instead of the usual FAIL list:
   - `Decide each open finding — accept / debt / back to the plan` (Recommended) — `ACCEPT.md`, **Decide at the ceiling**;
   - `Back to the plan — /sattva:plan <plan>`;
   - `Stop here`.

   What each pick does is in `AFTER-CHOICE.md`.

**Step 1 at the ceiling.** `verifier: not called — ceiling: <f> judged FAIL runs, last <sha7>; open: <k>` → do not call
the verifier and do not touch `verify.md`; run `--history` for the table, show the open findings of run `<sha7>` (its
`wrong` / `missing` ids, failing `rule` places, `Unrequested:`, `Decision:`, `review … — critical` lines of its `## Sweep`, failed gates)
and ask the same menu. **What lifts it:** an edit of a task, Reconciliation row, `Done means:`, `I-n` or header line of
the plan through `/sattva:plan` (for one run: the edited rows and every row not `ok` are judged as usual), `--full`,
or every open finding decided. The ceiling is checked before the rules menu and replaces it.

## Rules-only FAIL twice — the rules menu

`--history` prints `rules menu: on this FAIL` when the last two runs (this one included) are FAIL and rest only on
unaccepted Rules gate lines: no `wrong`, `missing`, `Decision:`, `Unrequested:` or `check:` finding, no `Settings:
violated`, `Architecture gate: fail` or `Security gate: fail`. `ceiling: reached` is checked first and replaces it;
otherwise show the history table as above, then one AskUserQuestion:
- `Fix the whole class, then one last verify — /sattva:fix verify` (Recommended);
- `Accept the violation consciously` — the rule lines of this run are recorded as accepted (`ACCEPT.md`, **Accept a
  rule violation**);
- `Stop here`.

What each pick does is in `AFTER-CHOICE.md`.

## Where the cost comes from

The sattva mod puts a `Sattva cost meter (measured by the sattva mod, …): verify $a · fix $b · … · total $t` line
into the prompt of `/sattva:verify <plan path>`; Step 3 of `SKILL.md` turns it into `cost: verify+fix $x.xx` in
`## Checks`. The line comes only when the mod has a plan for the session (the path given, the session already bound,
or the newest active plan); a verify started from the menu (`Fix directly here` → verify again) gets none — no line
means `cost: verify+fix n/a`, and that cycle shows `n/a`.

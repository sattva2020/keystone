<!-- original Keystone file (MIT) -->

# Keystone verify — the verify → fix loop

Read by `/keystone:verify` when the last verdict was FAIL and nothing changed since, when Step 1 printed
`verifier: not called`, when a `late watch:` id came back `wrong` / `missing`, and on every FAIL for the menus below.

## Build or tests failed — `verifier: not called`

Step 1 printed `verifier: not called — <build | test | build, test> failed` → do not call the verifier: nothing is
judged on code that does not build or pass its tests. Write `verify.md` in the Step 5 layout: `## Checks` = the Step-1
lines and `cost:`; `## Carried` = `none`; `## Report` = `not judged — <build | test> failed (verifier not called)`;
`## Verdict` = `FAIL — <build | test> failed`, `Late: none`. Commit it alone (`docs(verify): <slug>`). The final
report names the failed check with the tail of its output from `## Checks`; `Next: /keystone:fix verify` — the failed
check is its finding. No menu: no trend, no rules menu. A `not run` check (a timeout too) and a failing lint never lead
here: the verifier is called as usual. For the history this run is a FAIL whose findings are `check: <kind> failed`
plus every finding of the run before it; the next run's delta counts from the last run that was judged.

## Late findings

A row in Step 1's `late watch:` was `ok` in the last run and its files have not changed since, yet it is judged again
(full run, a file of a past `wrong` row, a `see Row n` chain). If the report now gives it `wrong` or `missing`, it is a
late finding: the verdict stays what Step 4 says (FAIL), and its id goes on the `Late: <ids>` line of `## Verdict`
(`Late: none` otherwise). The history adds ` · late <l>` to such a run; the trend table shows it in a `Late` column
(no tail → 0).

## Code unchanged since the last FAIL

Step 1 printed `delta: since <sha7> — 0 files changed` (nothing but `verify.md` changed since that verify — no code,
plan or intent edit, committed or not) and the verdict of run `<sha7>` — the last judged run, a later `not judged` stop
run does not count — was FAIL → do not call the verifier: say so, keep `verify.md`, and make the Next command
`/keystone:fix verify` — the open findings need a fix, not another verify. A second run is justified only after the code
or the evidence changed; never re-run the verifier hoping for a milder verdict.

## Trend and the menu from the third FAIL

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
4. Then one AskUserQuestion with these options instead of the usual FAIL list:
   - `Fix every finding — /keystone:fix verify` (Recommended when the trend converges);
   - `Stop and decide — narrow the intent (/keystone:intent) or set Status: abandoned` (Recommended when it does not);
   - `Stop here`.

   What each pick does is in `AFTER-CHOICE.md`.

## Rules-only FAIL twice — the rules menu

`--history` prints `rules menu: on this FAIL` when the last two runs (this one included) are FAIL and rest only on
unaccepted Rules gate lines: no `wrong`, `missing`, `Decision:`, `Unrequested:` or `check:` finding, no `Settings:
violated`, `Architecture gate: fail` or `Security gate: fail`. It is checked before `trend menu: on this FAIL` and
replaces the trend menu; show the history table as above, then one AskUserQuestion:
- `Fix the whole class, then one last verify — /keystone:fix verify` (Recommended);
- `Accept the violation consciously` — the rule lines of this run are recorded as accepted (`ACCEPT.md`, **Accept a
  rule violation**);
- `Stop here`.

What each pick does is in `AFTER-CHOICE.md`.

## Where the cost comes from

The keystone mod puts a `Keystone cost meter (measured by the keystone mod, …): verify $a · fix $b · … · total $t` line
into the prompt of `/keystone:verify <plan path>`; Step 3 of `SKILL.md` turns it into `cost: verify+fix $x.xx` in
`## Checks`. The line comes only when the mod has a plan for the session (the path given, the session already bound,
or the newest active plan); a verify started from the menu (`Fix directly here` → verify again) gets none — no line
means `cost: verify+fix n/a`, and that cycle shows `n/a`.

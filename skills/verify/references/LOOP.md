<!-- original Keystone file (MIT) -->

# Keystone verify — the verify → fix loop

Read by `/keystone:verify` when the last verdict was FAIL and nothing changed since, and when Step 1 printed
`trend menu: on this FAIL` and this verdict is FAIL too.

## Code unchanged since the last FAIL

The last verdict was FAIL and Step 1 printed `delta: since <sha7> — 0 files changed` (nothing but `verify.md`
changed since that verify — no code, plan or intent edit, committed or not) → do not call the verifier: say so, keep `verify.md`, and make the Next command
`/keystone:fix verify` — the open findings need a fix, not another verify. A second run is justified only after the code
or the evidence changed; never re-run the verifier hoping for a milder verdict.

## Trend and the menu from the third FAIL

1. After the Step 5 commit run `node ${CLAUDE_SKILL_DIR}/scripts/collect.mjs <plan path> --history`. It prints
   `history: <n> runs · FAIL <f>`, one `run <i> · <date> · <verdict> · open <o> · new <n> · closed <c> · cycle cost
   <$x.xx | n/a>` line per committed `verify.md` run (this run included; an accept commit is not a run), and `trend: converging | not converging`. The
   script counts; you copy.
2. Show the trend as a table — Run · Date · Verdict · Open · New · Closed · cycle cost — the past runs and this one.
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

## Where the cost comes from

The keystone mod puts a `Keystone cost meter (measured by the keystone mod, …): verify $a · fix $b · … · total $t` line
into the prompt of `/keystone:verify <plan path>`; Step 3 of `SKILL.md` turns it into `cost: verify+fix $x.xx` in
`## Checks`. The line comes only when the mod has a plan for the session (the path given, the session already bound,
or the newest active plan); a verify started from the menu (`Fix directly here` → verify again) gets none — no line
means `cost: verify+fix n/a`, and that cycle shows `n/a`.

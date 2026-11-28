<!-- original Sattva file (MIT) -->

# Rush — the chain after Approve runs by itself

Read this file only when the plan header has the line `Pace: rush`. Without it nothing here applies: implement, plan
and start follow their own files as before.

## When

- `/sattva:plan` reads this file right after the approval commit, in the same turn — the chain starts with zero
  commands from the user.
- `/sattva:implement` reads it in Step 0, when the header has `Pace: rush`, the Status is `approved` or
  `implementing`, and the first line of its prompt is not `Sattva rush stage:` — this is how the chain continues after
  an interruption.
- A session whose prompt starts with `Sattva rush stage:` is a **stage**, never the driver: it follows
  `## Stage rules` below and never starts the driver itself.

`<skills root>` = the parent folder of the base folder of the skill that read this file (`.../skills`). The driver
only drives: every stage runs in a subagent; the driver edits no file, ticks no box and makes no commit.

## Driver

1. `node "<skills root>/implement/scripts/rush.mjs" pace <plan>` (one command of its own, read its line):
   - `pace: normal — …` → go back to the normal path of the skill that read this file, without a word about rush.
   - `pace: unavailable — <why>`, or you have no `Agent` tool (`no Agent tool`) → one line
     `rush недоступен: <why>` and the normal path: the skill's own `Next:` command for its normal route.
   - `pace: rush` → go on.
2. The `/fast` reminder: once per run, also on a resume. The first stage line of the run has it on the same line
   (step 4: `` Rush: идёт <stage> · `/fast` ускоряет вывод на Opus и Fable, включаете вы; на стадии rush он может не действовать. ``);
   a run that stops without a stage prints that reminder text with its stop. Stages never print it.
3. Pick the next stage from the repository, every time (so an interruption anywhere resumes at the right place):
   1. `## Tasks` has a ready task — a `- [ ]` line without `BLOCKED:` whose `Depends on:` tasks are all `[x]` (no
      `Depends on:` = ready) → stage **implement**. Open tasks without `BLOCKED:` remain but none is ready (each waits on
      a task that is not `[x]`) → stop: `Waiting for you: <the BLOCKED ids>` — another implement stage would skip them.
   2. No open task without `BLOCKED:`, `verify.md` next to the plan says `Verdict: FAIL`, the last commit of the branch
      is the commit of that `verify.md` (`git log -1 --format=%H -- <verify.md>` equals `git log -1 --format=%H`) and `git status
      --porcelain` is empty → first `node "<skills root>/verify/scripts/collect.mjs" <plan> --history` from the repo
      root: `ceiling:` or `rules menu: on this FAIL` in it → the stop of step 5 below; otherwise start with the fix
      stage (stage **fix**) — a verify here would print `0 files changed` and judge nothing.
   3. Otherwise → stage **verify**.
4. Before every stage note `git rev-parse HEAD` and the ids of the ready tasks (step 3.1). Run the stage
   (`## Stage prompt`), wait for its answer, read its last line:
   - The `Agent` result says the agent was launched in the background → end the turn with one line
     `Rush: идёт <stage>` — the first one of the run with the `/fast` reminder of step 2 — and continue when its
     completion notification arrives. A synchronous result → print the same line (first one: with the
     reminder) and continue at once.
     A notification that the stage "is waiting on its own background work" is not its answer: wait for the next one. A
     notification about an agent that is not a stage you started → ignore it.
   - Never write to a stage with `SendMessage` and never relay anything between agents: an answer without the last line
     `RUSH:` is a stage failure (below), also when the missing report reached you instead of the stage.
   - `RUSH: done` → step 5. `RUSH: question — <question> — <option 1> / <option 2>` → ask the human that question
     (AskUserQuestion, those options), then run the same stage again with `Answer: <the pick>` added to its prompt —
     stages continue from the plan's checkboxes. `RUSH: stop — <reason>` → stop: `Rush остановлен на <stage>: <reason>`.
   - A stage failure — the `Agent` tool returned an error, a usage limit, a lost subagent, or the answer has no last
     line starting with `RUSH:` → stop: `Rush остановлен на <stage>: <reason>`. A tool refused inside the stage is a
     failure too, reason `tool denied: <tool>`. In `claude -p` (CI, scripts) background stages are stopped 10 minutes
     after the last turn: run it with `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`.
5. After each stage, by what it printed:
   - implement `RUSH: done` with `HEAD` and the ready task ids both as noted before the stage → stop:
     `Rush остановлен на implement: nothing changed`. Otherwise → step 3 again.
   - fix `RUSH: done` and `HEAD` as noted before the stage (no new commit) → stop:
     `Rush остановлен на fix: nothing changed`. Otherwise → stage verify.
   - verify printed `delta: since <sha7> — 0 files changed` → stop: `Rush остановлен на fix: nothing changed`.
   - verify `Verdict: PASS` or `Verdict: PASS-UNPROVEN` → the chain is done: the summary (`## Summary`), then `Next:`
     with the options of its `menu:` line — never `Rush остановлен`. Accept, push, release and `/sattva:review` are the
     human's; the driver never picks them.
   - verify `Verdict: FAIL` with `ceiling: reached`, `verifier: not called — ceiling: …` or `rules menu: on this FAIL` →
     stop: show the trend table of its `--history` lines and ask the human that menu (AskUserQuestion, the options of
     `<skills root>/verify/references/LOOP.md` § The ceiling or § Rules-only FAIL twice); carry the pick out as
     `<skills root>/verify/references/AFTER-CHOICE.md` says. The chain does not resume by itself.
   - verify `verifier: not called — nothing to judge` (`BLOCKED` rows wait for the human) → stop with
     `Waiting for you: <its BLOCKED ids>`.
   - verify `not judged — build failed` or `not judged — test failed` for the second time in a row →
     stop: `Rush остановлен на verify: build or test failed twice`.
   - any other `Verdict: FAIL` → stage fix, then verify again.
6. Every stop prints one line `Rush остановлен на <stage>: <reason>. Продолжить: /sattva:implement <plan>`, except
   the stops `Waiting for you: …`, the ceiling menu (`ceiling:`) and the rules menu (`rules menu: on this FAIL`): those
   print their own line or menu only. After every stop — the summary.

**After a stop.** The plan stays `implementing` with open boxes, and the Stop hook may block the turn with "If you are
implementing: continue them". Answer it with exactly `Next: nothing now — waiting for <what you wait for>` and edit no
file: the work is done only by stages.

## Stage prompt

Call `Agent` with `subagent_type: "general-purpose"`, `model: "opus"`, `effort: "high"`, and nothing else — no
permission setting, no spending limit. The prompt, line by line:

```text
Sattva rush stage: <stage> · <plan path>
Read <skills root>/<stage>/SKILL.md and follow it.
${CLAUDE_SKILL_DIR} in that file means <skills root>/<stage>.
$ARGUMENTS in that file means <plan path>          (fix: means verify)
the active plan in this file means <plan path>     (fix only)
Then read <skills root>/implement/references/RUSH.md, section ## Stage rules, and follow it over that file.
<the `Sattva feedback: on` block of your context, verbatim — only if your context has it>
```

The file is read from disk, so neither variable is substituted by itself. `fix verify` would otherwise take the newest
plan folder as "the active plan", which may be another plan.

## Stage rules

You are a stage of a rush chain: the driver runs the next stage, the human is not watching.

- No AskUserQuestion, no menu, no `/clear`, no new session. The last line of your answer is exactly one of
  `RUSH: done`, `RUSH: question — <question> — <option 1> / <option 2>`, `RUSH: stop — <reason>`.
- A decision only a human can make → `RUSH: question`: a requirement conflict (`ERROR [requirement-conflict]`), a blocker
  only the human can lift, the plan owner `taken`, `Supersede …?` in fix verify. Leave the plan as it is (ticks and
  commits made so far stay).
- Optional questions — new project rules at the end of implement, `Add a rule via /sattva:evolve` in fix → the answer
  is "do not write"; put the question as one line in your report.
- A stage menu → take its `(Recommended)` option, except an option the human approves — Accept, Approve, `abandoned`,
  push, release, `/sattva:review`: on those implement and fix answer `RUSH: stop — <the menu>`. An option that runs
  another stage (verify, fix, a clean session) is not run: the driver runs the next stage.
- **verify** picks no menu option at all, except `Prove now` with a read-only check on PASS-UNPROVEN. On FAIL — none of
  the fix options (`Fix directly here`, `Fix critical only`, `/sattva:fix verify`): the driver runs the fix stage. On
  PASS / PASS-UNPROVEN — none of the human's options (release, `Push`, Accept). At the end print the line
  `Verdict: <verdict>`, the line `menu: <the Step 6 options joined by ` · `>`, the `ceiling:` / `rules menu:` lines of
  `collect.mjs --history` and the `verifier: not called — …` line of Step 1 when there are any, and always end with
  `RUSH: done`.
- A search you hand off goes to `Agent` with `subagent_type: "Explore"`, `model: "haiku"`; scripts stay scripts.
- Every `Agent` you call gets `run_in_background: false`; agents that run in parallel are several calls in one message,
  each with `run_in_background: false`. Never end your answer before you have the result of every agent and every
  background command you started: an answer without the `RUSH:` line is a stage failure.
- **verify** with `sweep: due` — first the Skill `/sattva:security <plan> sweep` (with `tasks added` — the same
  `files:` as SWEEP.md), then in one message `sattva:verifier` and the review finder, both with
  `run_in_background: false`; not a line of the security output goes into their prompts. Only in rush this replaces
  "both run in the background" and "While they run" of `<skills root>/verify/references/SWEEP.md`; the rest of it stands.
- Never run the driver: the `Pace: rush` item of implement Step 0 is skipped for you.

## Early check

Only the **implement** stage, only in rush. Points: each point of the plan's `## Commit Plan` (no Commit Plan: after
every third task) and the last task. At a point:

1. `node "<skills root>/verify/scripts/collect.mjs" <plan>` from the repo root; keep its lines from `base:` through
   `lint:`, up to `delta:`.
2. `Agent` with `subagent_type: "sattva:verifier"`, `run_in_background: false`; the prompt holds only those lines, the plan and intent paths, and
   the line `early: Task <a>, Task <b>, …` — the tasks ticked `[x]` since the last point. Facts only, no conclusions:
   nothing of your own reasoning, no past verdicts, no `verify.md`.
3. `wrong` / `missing` → fix now by the class rules of `<skills root>/fix/SKILL.md` (Verify findings mode, points 3–4:
   the whole class, a test that is red on revert), then one more early check of the same ids — one per point, never a second; what it
   still finds is `left for verify`.
4. Each finding → one line in `## Implementation notes`:
   `- <YYYY-MM-DD> early check — Task <n> — <finding> — fixed <file:line> | left for verify`.

The early check never writes verify.md and never commits it; it is not a verify run and does not count in the history
or the ceiling.

## Stops

| What | Line |
|---|---|
| `RUSH: stop`, stage failure, `tool denied: <tool>` | `Rush остановлен на <stage>: <reason>. Продолжить: /sattva:implement <plan>` |
| implement or fix made no commit, or verify `0 files changed` | `Rush остановлен на <stage>: nothing changed` |
| two `not judged` FAIL runs in a row | `Rush остановлен на verify: build or test failed twice` |
| `ceiling:` / `rules menu: on this FAIL` | the trend table and its menu to the human |
| `nothing to judge`, or open tasks remain and none is ready | `Waiting for you: <BLOCKED ids>` |
| `RUSH: question` | AskUserQuestion, then the same stage again |

The three `Rush остановлен` lines end with `. Продолжить: /sattva:implement <plan>`.

## Summary

After every stop and at the end of the chain print the line of `rush.mjs summary` —
`node "<skills root>/implement/scripts/rush.mjs" summary <plan>` (`rush: <verdict> · с одобрения <H>ч <M>мин (<sha7>) ·
прогонов verify <n>`) and append `· токены стадий <sum>` — the sum of `subagent_tokens` of every stage result and
completion notification of this run — and `· стоимость сессии: /sattva-status`. The time comes from git commits, so
waiting for the human after a stop is not in it. Dollars are not visible to the agent; `/sattva-status` shows the
session's total.

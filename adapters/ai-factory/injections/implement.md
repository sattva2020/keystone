

---

## Keystone — plan drift and final evidence report (keystone-aif)

This project has the **Keystone** adapter installed. It adds to the core requirement consistency gate (3.1.1)
and per-task verification (3.4); it does not replace them. These rules are checked per task, not at the end.

- **Baseline first.** Before task 1, check `git status` for the plan file and the cited `intent.md`. If either is
  untracked or modified and no code has changed yet, commit them on their own first (e.g. `docs(plan): <slug>` by the
  project's convention; ask the user once if commits need approval) — otherwise the baseline plan is lost and
  `/aif-verify` cannot measure drift. If code already changed, say so in one line and continue.
- **Context:** if the plan's `## Requirements Reconciliation` cites an `intent.md`, read it once at the start — it
  explains *why*; the plan stays the source of *what* and *how*. The intent is read-only here.
- **Drift → plan in the same commit (hard rule).** Any departure from the plan — a task changes, a file is added or
  dropped, an API/approach differs, a Risk turns out different, a verification step has to change — is written into
  the plan file **and staged together with the code that caused it**. Edit the affected passage itself (the task text,
  the SQL/code snippet, the value, the list of scenarios), not only an appended "Deviation" note — after the edit the
  plan must describe what was actually built. A `DEVIATION` entry in the implementation notes journal does not replace
  the plan edit; it accompanies it. Before each task commit run `git diff --cached --stat`: if code changed, the journal
  records a deviation, and the plan file is not staged → stop, edit the plan, stage it, then commit.
- **BLOCKED goes into the table.** When a planned check or a mandatory step cannot run (no DB, no network, no
  dependencies, needs prod), keep it and write `BLOCKED: <reason>` into the **Verification evidence cell of that row**
  in `## Requirements Reconciliation`, and next to the step in the task. Write it literally: the word `BLOCKED`, a
  colon right after it, then the reason — `BLOCKED: smoke needs the DB`, never `BLOCKED (smoke):`; parsers count rows by
  the exact `BLOCKED:` prefix. A task whose mandatory step is blocked stays `[ ]` with `BLOCKED: <reason>` — never `[x]`.
  Tell the user.
- **Final report — one line per table row.** After the last task, walk `## Requirements Reconciliation` row by row,
  without merging rows, and report each as
  `<row> — pass | fail | not run | BLOCKED — <evidence: command + key output line, or file:line, or where to look>`.
  Use only these four statuses (no "partially pass"). `pass` only for checks that actually ran **in this session**; a
  grep or a code read proves presence, not behaviour — label it as such or use `not run`. End with a count line:
  `Reconciliation: <n> rows — pass <a>, fail <b>, not run <c>, BLOCKED <d>`. Compute it by counting the status of each
  line you just printed (not from memory); `a + b + c + d` must equal `n`, and `n` must equal the number of table rows —
  recount if it does not.
  If the plan has no reconciliation section, say so in one line.
- **Close with the level and cost line:** `Level: <S|M|L from the plan> · cost: $<X> (from /cost) | cost: not measured`.
  Do not run verify yourself — recommend `/aif-verify` (L: also `/keystone:verify`) in a fresh context.

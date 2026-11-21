<!-- original Keystone file (MIT) -->

# Keystone verify — the sweep (L only)

Read by `/keystone:verify` in Step 3 when Step 1 printed `sweep: due — …`.
The sweep is review + project rules + security in one go, once per L plan, run together with the verifier, so all the
findings land in one `verify.md` and one `/keystone:fix verify` pass (I-1). It runs again only on `--full` or for tasks
added after it (I-6). M plans and plans verified before the sweep existed (`sweep: n/a — …`) have no sweep (I-8, I-12).

## When

- `sweep: due — first verify | --full | not done yet (…)` → the sweep over `git diff <base>` (committed + uncommitted).
- `sweep: due — tasks added since <sha7>: Task 7 — files: <a, b>` → the sweep over those files only.
- `sweep: done in <sha7>` or `sweep: n/a — …` → no sweep. Its findings stay in the run that had them: `/keystone:fix
  verify` takes them from that `verify.md`, and nothing carries them to a later run.
- Step 1 stopped on `verifier: not called — <build | test> failed` → no sweep, `Sweep: not run — <build | test> failed`;
  it stays due and runs on the first run whose checks are green (I-10).

## Run — one message, then security

1. In **one message**, two Agent calls; both run in the background:
   - `subagent_type: "keystone:verifier"` — the Step 3 prompt as always, except the security line: it says
     `Security gate: in the sweep (not for the verifier)`.
   - `subagent_type: "general-purpose"`, `model: "opus"` — the review finder. Prompt: "Read
     `${CLAUDE_SKILL_DIR}/../review/SKILL.md` and do its section *Called from /keystone:verify (sweep)* for base `<base>`
     (with `tasks added`: `-- <a> <b>`). Return the `### Item N (section: critical|suggestion)` blocks; start no agents,
     write no files."
2. While they run, call the Skill tool: `/keystone:security <plan path> sweep` (with `tasks added`:
   `/keystone:security <plan path> sweep files: <a, b>`). The `sweep` marker means no menu and no `Next:`; its answer
   ends with the `Security gate: …` line — that is this run's Security gate (Step 1).
3. When the finder is back, run Step 4 of the review skill from this main context: Agent
   `subagent_type: "keystone:review-validator"` with the instructions path
   `${CLAUDE_SKILL_DIR}/../review/references/VALIDATOR.md`, the severity path
   `${CLAUDE_SKILL_DIR}/../review/references/SEVERITY.md`, the diff verbatim and the items; parse the answer and set the
   review gate by "Gate after validation" of `${CLAUDE_SKILL_DIR}/../review/references/CHECK-MODE.md`. Here
   `${CLAUDE_SKILL_DIR}` is `skills/verify`: the review files live under `../review/`.

**Nothing crosses (I-13).** The verifier gets no line of the sweep; the finder and the validator never get the
verifier's output, nor it theirs. The sweep weakens neither the judge, nor strict L, nor the Security gate.

## Failure — one retry, then not run (I-11)

A failed or timed-out agent or skill gets one retry in the same run. It fails again → `Sweep: not run — <review |
security>: <reason>`; the verdict comes from the verifier alone, the final report says in the user's language that the
sweep was not run and what, and the next run prints `sweep: due — not done yet (…)`. The sweep counts as done only when
both review and security ran.

## The record — `## Sweep` in verify.md, after `## Report`

```markdown
## Sweep
Sweep: done — review <pass|warn|fail>, security <pass|warn|fail> | not run — <what> | none — <the sweep: line of Checks>
Scope: <base7>..HEAD | tasks added since <sha7>: Task 7 — files: <a, b>
review <n> — critical — <file:line> — <behaviour> Repro: <…> Fix: <…>
Advisory: review <n> — suggestion — <file:line> — <what>
Security gate: pass | warn | fail — …[ — files: <a, b> when security ran over the files of tasks added]
<the S-n finding lines as the security skill printed them>
```

A run with no sweep writes only `Sweep: none — <its sweep: line>`. Step 1 reads the first line next time: keep its words.

## Verdict (Step 4)

Only critical review items block (I-2): an open `review <n> — critical` line whose `review <file:line>` is not under
`accepted findings:` → FAIL; a `suggestion` → `Advisory:` in `## Sweep`, never in the verdict; the Security gate as
always (an unignored `fail` → FAIL). `/keystone:fix verify` takes the `review … — critical` lines with their Repro and
Fix, and the security findings behind a `fail`.

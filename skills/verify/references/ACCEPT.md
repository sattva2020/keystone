<!-- derived from ai-factory@2.19.0 skills/aif-verify/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone verify — accept and gates

Read by `/keystone:verify` for `accept`; the gate rules apply to every run.

## Accept — `/keystone:verify accept`

The plan: the path in the arguments, else the active plan (`SKILL.md` Step 0). With `D<k>` in the arguments go to
**Close a debt line** below.

Only for the newest `verify.md` whose verdict is `PASS-UNPROVEN` — or `Verdict: FAIL` whose verdict recomputed by
Step 4 with its `Accepted violation by …` lines is PASS-UNPROVEN (it counts as PASS-UNPROVEN); any other verdict →
refuse and say why. Refuse
if `intent.md` or `plan.md` changed after the last `verify.md` (compare `git log -1 --format=%H -- <file>` order/dates
for each against `verify.md`): verify again first. A plan change only inside `## Debt` is not a change. A command without an explicit human confirmation is **not** a
confirmation, even when the user wrote "do accept" in text (text is a request, the button is the confirmation), so the
explicit question is always asked: show the `not proven` / `BLOCKED` list from
`verify.md` and ask with AskUserQuestion (`Accept these as unproven and mark the plan verified?` — Yes / No). If AskUserQuestion is unavailable, ask in plain text: `Accept as unproven: <list>? yes/no` and wait for the answer. Anything
but a clear Yes → change nothing. On Yes:
- append to `verify.md`: `Accepted unproven by <git config user.name> <YYYY-MM-DD>: <list of not proven / BLOCKED rows>`;
- one line per accepted item in the plan's `## Debt` section (format below; create the section after `## Release`, or
  after `## Commit Plan` / `## Tasks` when there is none, before `## Implementation notes`);
- set `Status: verified` in the plan header;
- commit both: `docs(verify): accept <slug>`.

### `## Debt` lines

No checkbox (hooks count `- [ ]` as tasks). One line per accepted row or `Weakened test` line, id letter for letter as
in `verify.md`, `D<k>` = the next free number in the section:

`- D<k> · <row id> · open · accepted <YYYY-MM-DD> by <git config user.name> (verify <sha7>) · prove by: <what was missing, one phrase from the row's line>`

Release mode writes `release R<n> check failed <YYYY-MM-DD>: <output line>` (or `release R<n> blocked …`) in place of
the `accepted …` part. Closing replaces `open` with `closed <YYYY-MM-DD> by <who> — <proof>` (`<who>`: `qa-check
TC-NNN`, `R<n> check`, `<user.name> (accept)`) and leaves the rest of the line as it is. A plan with open debt stays
`Status: verified`; the final report of verify and of `/keystone:qa-check` lists it, and `/keystone:qa` makes a case
for each open line.

## Accept a rule violation — from the rules menu

Only from `Accept the violation consciously` in the rules menu of `LOOP.md`; the click is the confirmation (it names
the rules), so no second question. Append to `verify.md` one line per failing `rule` line of this run:
`Accepted violation by <git config user.name> <YYYY-MM-DD>: rule <source:line> — <file:line>; <file:line>` — the places
before `sites to cover:`, as the report lists them. Then recompute the verdict by Step 4 without the accepted places
(each `rule` line whose every `file:line` is accepted counts as pass); the `Verdict:` line of `verify.md` is never
rewritten:
- PASS → set `Status: verified` and commit `verify.md` and the plan: `docs(verify): accept violation <slug>`;
- PASS-UNPROVEN → status unchanged; commit `verify.md` alone (`docs(verify): accept violation <slug>`), then ask the
  PASS-UNPROVEN menu of `AFTER-CHOICE.md`.

It covers only the listed `file:line`: Step 1 prints them under `accepted violations:`, and a new place of the same
rule in a later run is a finding again (FAIL). The Security gate and the `Architecture gate` are never accepted this
way. Such a commit is not a run in the history.

## Close a debt line — `/keystone:verify accept [<plan path>] D<k> <proof text>`

The plan: the given path, else the `docs/keystone/*/plan.md` whose `## Debt` has an open `D<k>` line; several → ask
which. No such open line, or an empty proof text → refuse and say why. The `PASS-UNPROVEN` and freshness rules above
do not apply. Ask with AskUserQuestion: `Close D<k> (<row id>) with this proof: "<proof text>"?` — Yes / No (without
AskUserQuestion, in plain text: yes/no). Only on Yes: the line becomes `closed <YYYY-MM-DD> by <user.name> (accept) —
<proof text>`; commit the plan alone: `docs(verify): close debt D<k> <slug>`. `Status` does not change.

## Gates and recovery

- Hooks close `git push` / `gh pr create` only for pushes that carry this plan's commits; `Status: verified` opens them.
  In a cloud session a push to the work branch passes anyway (the cloud keeps work only on the remote); the default
  branch and a PR stay closed. There `KEYSTONE_GATES=off` goes into the cloud environment's variables, then a new session.
- Verify never marks a task `[x]` and never edits the Reconciliation table. If a row's evidence is stale, say which
  cell and what to write; the human or `/keystone:implement` makes the edit.
- `Status: abandoned` or `KEYSTONE_GATES=off` lift the gates; they do not make a plan verified.

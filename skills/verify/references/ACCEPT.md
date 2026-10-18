<!-- derived from ai-factory@2.19.0 skills/aif-verify/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone verify — accept and gates

Read by `/keystone:verify` for `accept`; the gate rules apply to every run.

## Accept — `/keystone:verify accept`

Only for the newest `verify.md` whose verdict is `PASS-UNPROVEN`; any other verdict → refuse and say why. Refuse
if `intent.md` or `plan.md` changed after the last `verify.md` (compare `git log -1 --format=%H -- <file>` order/dates
for each against `verify.md`): verify again first. A command without an explicit human confirmation is **not** a
confirmation, even when the user wrote "do accept" in text (text is a request, the button is the confirmation), so the
explicit question is always asked: show the `not proven` / `BLOCKED` list from
`verify.md` and ask with AskUserQuestion (`Accept these as unproven and mark the plan verified?` — Yes / No). If AskUserQuestion is unavailable, ask in plain text: `Accept as unproven: <list>? yes/no` and wait for the answer. Anything
but a clear Yes → change nothing. On Yes:
- append to `verify.md`: `Accepted unproven by <git config user.name> <YYYY-MM-DD>: <list of not proven / BLOCKED rows>`;
- set `Status: verified` in the plan header;
- commit both: `docs(verify): accept <slug>`.

## Gates and recovery

- Hooks close `git push` / `gh pr create` only for pushes that carry this plan's commits; `Status: verified` opens them.
- Verify never marks a task `[x]` and never edits the Reconciliation table. If a row's evidence is stale, say which
  cell and what to write; the human or `/keystone:implement` makes the edit.
- `Status: abandoned` or `KEYSTONE_GATES=off` lift the gates; they do not make a plan verified.

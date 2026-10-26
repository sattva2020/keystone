# Keystone gates and task files

[Back to README](../README.md) · [Skills reference](skills.md)

## Gates (hooks)

Gates apply only while there is an **active plan**: the `plan.md` in the newest task folder whose status is `draft`,
`approved` or `implementing`. With no active plan, an S-level change is never blocked.

| When | What is denied |
|---|---|
| plan is `draft` | code edits outside the task folder until the plan is approved |
| fix is `implementing` | edits to test files already committed in `HEAD` (a new regression test file is fine) |
| plan is `implementing` and `## Tasks` has `[ ]` without `BLOCKED:` | ending the turn: one reminder, it never blocks a question to you |
| an active plan whose commits the push ships (commits touching its task folder) | `git push` and `gh pr create` until `/keystone:verify` returns PASS, or `/keystone:verify accept`; a push that carries none of the plan's work passes |

**Release after verify.** Because push opens only on a verified plan, release steps never sit in `## Tasks` — the plan
keeps them in `## Release` (`R1`, `R2`, …). Verify does not count them as open work; on PASS its `Next:` points to
`/keystone:implement <plan>`, which in **release mode** runs only those steps, asks for your yes before each merge, push
or deploy, and keeps the plan `verified`. This follows the playbook's rule: *"The agent does everything up to the
production gate and nothing past it."*

The draft and Stop gates, the status line, the buttons and the handoff offer touch only the session that works with the plan: it ran `/keystone:<stage>` on that plan or edited a file in its folder. The push gate covers the whole repository.

To lift a gate, set `Status: abandoned` in the plan header, or start Claude Code with the environment variable `KEYSTONE_GATES=off` (a prefix on one command does not reach the hook). The hooks are plain Node
scripts (`hooks/gate.mjs`) and read only the hook payload and the plan files.

## Task files

Task files live in `docs/keystone/<YYYY-MM-DD>-<slug>/` — `intent.md`, `plan.md`, `verify.md` (Keystone
never reads or writes AI Factory's `.ai-factory/` folder). The plan header is `Level · Mode · Status` (plus `Settings:` and `Done means:`), and
Status moves `draft → approved → implementing → verified`, or `abandoned` at any point; the `## Release` steps run while the
plan is `verified`. Each stage ends in a committed
file and the next stage starts by reading it, not by replaying the chat.

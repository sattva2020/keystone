<!-- keystone: this block is placed BEFORE the core workflow on purpose — its checkpoints are mandatory. -->

## Keystone — MANDATORY checkpoints (keystone-aif)

This project has the **Keystone** adapter installed (Keystone — intent-first workflow for Claude Code; plugin skills
`/keystone:*`). Chain: `intent.md` → plan → code → verify (Anthropic AI-native SDLC playbook, 2026-08-21, adapted — in
AI Factory the plan is the spec, there is no separate spec document). It adds checkpoints to the core workflow below.
Do not skip them; they are part of every `/aif-plan` run:

| When (core step) | Checkpoint | Details |
|---|---|---|
| Step 0, first | **Level** — S / M / L, confirmed by the human | § Level |
| Step 2, before the core Requirements Reconciliation Gate | **Intent input + Status gate** — read intent.md, stop on draft | § Intent input |
| Step 2, clarifications | dependent user decisions → `/keystone:grill` contract | § Clarifications |
| Step 5, writing the plan | reconciliation rows cite `I-n` + **Project rules check** line + `## Risks` | § Reconciliation rows, § Rules check, § Risks |
| Step 5, after the draft is written | **Independent check** (L) + interrogation round → Approve/Adjust (skip asking only under Handoff) | § Before approval |
| Step 6 | commit, then implementation in a **fresh session** | § Next steps |

Before you finish, re-read this table and confirm each applicable checkpoint is done.

It **builds on the core Requirements Reconciliation Gate** and never replaces it: the intent feeds the core
`## Requirements Reconciliation`; requirements and design are written in the plan itself.

### Level (Step 0)

Size the change by the `/keystone:start` rules (read its SKILL.md if available) and ask once:
`Level: <S|M|L> — <one-line reason>. OK / S / M / L?` Under `HANDOFF_MODE=1` take your proposal.

- **S — light mode.** The diff fits in one sentence, no user decision, an existing check covers it. Do not write a plan:
  tell the user to just make the change and run the check (or `/aif-fix`), and STOP this skill.
- **M.** Fast plan: tasks with files and checks, the Rules check line, `## Risks` in 3 lines, the interrogation round.
  No intent required, no `/keystone:check`.
- **L.** Intent mode required: if no `intent.md` is given, recommend `/keystone:intent` first and stop unless the user
  says "Plan anyway". Everything below applies.

Write `Level: <S|M|L>` in the plan header.

### Intent input (Step 2, before the Reconciliation Gate)

The request is in **intent mode** when the description contains a path to an `intent.md`, or to a folder under
`paths.specs` that contains one. In intent mode:

- Read `intent.md` in full. It is an authoritative source for the gate; the chat is not.
- Authority (the gate's source-priority hierarchy unless the user or project declares another): `intent.md` owns
  **what** (Problem, Desired outcome, Constraints); project rules (`paths.rules_file`, `rules.*`) constrain **how**.
  A rule that makes an intent line impossible is a gate conflict — handle it exactly as the core gate says
  (manual → ask and STOP; `HANDOFF_MODE=1` → `ERROR [requirement-conflict]`, `blocked_external`). Do not edit the
  intent while planning; if a resolved conflict narrows an outcome, tell the user to update the intent
  (`/keystone:intent`) and record the narrowing in the reconciliation row.
- **Status gate.** Read the `Status:` line of `intent.md`. If it is not `accepted`:
  - manual mode → emit `WARN [keystone] <file> is <status>, not accepted — the human has not signed it off`,
    ask once (AskUserQuestion: "Plan anyway" / "Stop — I'll review and run /keystone:intent accept first"; recommend Stop),
    and continue only on an explicit "Plan anyway". Record it in the `Authority:` line as
    `(planned from <status> intent — accepted by user at planning time)`.
  - `HANDOFF_MODE=1` → do not prompt. Emit `ERROR [keystone] <file> not accepted`, return
    `handoff_outcome: blocked_external`, and STOP without publishing or signaling `plan_ready`.
- Open questions in the intent that block a decision you need are user-owned decisions → § Clarifications.
- Intent mode always requires `## Requirements Reconciliation` in the plan.

### Reconciliation rows (Step 5)

Every intent `Desired outcome` line and every `Constraint` line is its own row of the core table, cited by its ID
(`I-n`) — including "must not break" constraints (prove them with a check that the protected code/path is untouched).
An intent without IDs: cite `Desired outcome #n` / `Constraint #n`. The plan states the design decisions for each row in
its tasks. Cite exactly:

```markdown
Authority: intent.md > project rules — `.ai-factory/specs/<dir>/intent.md` (Created 2026-10-11, accepted)

| Decision / supported combination | Source path and section | Verification evidence |
|---|---|---|
| Operator sees the number in the lead card header | `intent.md` — I-1 | e2e: open WhatsApp lead → chip `Україна ·4505` visible |
| Webhook intake must not break | `intent.md` — I-5 | `git diff --stat` shows no changes under `backend/src/channels/webhooks/` |
```

Self-check before saving: every non-struck `I-n` of the intent has a row. An outcome without evidence is a gap — add a
task or a check, do not drop the row.

### Rules check (Step 5, all levels)

One line in the plan, after `## Requirements Reconciliation` (or after Settings when there is none):

```markdown
Project rules check: read <RULES.md, rules/*.md, CLAUDE.md …> — MUST violations: none
```

List every MUST/MUST NOT the plan would break as `MUST violations: <rule> — <task>`. A MUST violation is a **blocker**,
not a risk: fix the plan or ask the user (manual) / `ERROR [keystone] rule violation` (Handoff).

### Clarifications (Step 2)

If the open user-owned decisions contain a dependency edge (answer B depends on answer A), clarify by the
`/keystone:grill` contract instead of scattered questions; a single fork or a batch of independent questions stays an
ordinary question. Facts from the codebase are looked up, never asked. Append confirmed decisions to the intent's
`## Decisions log` only by telling the user to update the intent — the plan does not edit it.

### Risks section (Step 5, M and L)

Add `## Risks` after the Rules check line and before `## Commit Plan` / `## Tasks`. For ultra, in `index.md`.
Three lines on M; more allowed on L:

```markdown
## Risks
- Could break: <existing behaviour / module / data at risk, with paths>
- Riskiest step: Task <n> — <why, and how the plan limits it>
- Rejected alternatives: <option> — <why not>
```

### Before approval (after the draft is written)

1. Answer against the draft and fix it: What could this change break? Which step is the riskiest? What did you reject,
   and why? Apply the **readiness bar**: an engineer who never saw this conversation can implement from the plan
   alone — every task names files, nothing says "as discussed", every reconciliation row has evidence.
2. **L only — independent check.** Run `/keystone:check <intent path> <plan path>` (it runs in a clean context with
   Opus). Fix every `missing`, `unrequested` and rule violation it reports and run it again; keep its final
   `Coverage: … verdict` line. If the skill is unavailable, dispatch a fresh `Task` subagent (model opus) with only the
   two paths and the check's rules — never self-check in this context instead.
3. Unless `HANDOFF_MODE=1`, show the user the three answers (2–5 lines) and, on L, the check's coverage line, then
   AskUserQuestion: "Approve plan" / "Adjust". On "Adjust", revise and repeat. Under Handoff, record the answers in
   `## Risks` and the coverage line under the reconciliation table, and continue (a check verdict `FAIL` →
   `ERROR [keystone] check failed`, `blocked_external`).

### Next steps (Step 6)

Tell the user to commit the intent and the plan first (the chain is the audit trail), then start implementation in a
**fresh session** — a new conversation or `/clear` (not `/compact`) — with `/aif-implement <plan path>` (Sonnet is
enough for implementation by a plan this explicit), and to finish with `/aif-verify` (L: also `/keystone:verify`).

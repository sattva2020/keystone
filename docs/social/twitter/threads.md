# Keystone on X/Twitter — a series of 7 threads

One thread per post, two or three days apart. Each tweet sits in its own block, ready to copy. 🖼 marks the image
to attach (files in [`img/`](img/), 1600×900). Every tweet fits the 280-character limit (a link counts as 23).

Most images come from live output. `cards.mjs` runs the real `hooks/gate.mjs` on a throwaway repo, runs the real
`npm test`, and feeds a sample plan to the mod's own `statusText()`. The benchmark card uses the numbers from
[`docs/benchmarks.md`](../../benchmarks.md). To regenerate the images: `node docs/social/twitter/cards.mjs`. To show
the gates live in a terminal (good for a screen recording): `bash docs/social/twitter/demo-gates.sh`. To post a
thread through the X API: `node docs/social/twitter/post.mjs <1-7>` (dry run), then add `--post`.

Repo link used below: https://github.com/sattva2020/keystone

---

## Thread 1 — Intro: process sized to the change

```text
I built Keystone, an open-source plugin for Claude Code.

It picks how much process a change gets based on its size. A one-line fix just gets done. A feature with open decisions goes through intent → plan → independent check → implement → verify.

🧵
```
🖼 `img/01-hero.png`

```text
The problem: agents write code well. The trouble is everything around the code.

They guess at decisions that were yours. They mark tasks done without proof. They push before anyone checked. And a long chat slowly drifts away from what you asked for.
```

```text
/keystone:start sizes the task first, then you confirm:

S: the diff fits in one sentence → edit, check, report. No files.
M: one obvious approach → short plan with 3 risks, implement, verify.
L: open decisions, schema, security → the full chain.
```
🖼 `img/02-levels.png`

```text
Two ideas carry the rest:

1. Intent first. You answer the decisions that are yours; intent.md is written in your words as numbered lines I-1…I-n.
2. The plan is the spec. There is no separate spec.md: every plan row points back to an I-n line.
```

```text
Each stage ends in a committed file (intent.md, plan.md, verify.md), and the next stage starts by reading that file instead of replaying the chat.

So you can /clear between planning and coding and lose nothing.
```

```text
It follows Anthropic's AI-native SDLC playbook and Claude Code's best practices: hooks for the hard rules, review in a clean context, a separate session for implementation.

Next threads: hooks, verify, how I test prompts. MIT.

https://github.com/sattva2020/keystone
```

---

## Thread 2 — Hooks, not prompts

```text
"Please don't push before tests pass" in a system prompt is a wish.

A PreToolUse hook that returns permissionDecision: "deny" is a rule.

Here's what Keystone enforces with hooks, and the real JSON Claude Code gets back 🧵
```
🖼 `img/03-gate-draft.png`

```text
Gate 1: while the plan is draft, there are no code edits.

The agent can still edit plan.md inside the task folder, and can't touch src/ until you press Approve. You review the plan before any code exists, not 40 files later.
```

```text
Gate 2: git push and gh pr create stay closed until /keystone:verify returns PASS.

git commit stays open, because local work is fine. The regex also catches git -C dir push and PowerShell, and lets --dry-run through.
```
🖼 `img/04-gate-push.png`

```text
Gate 3: the Stop hook. If the plan is implementing and a task is still [ ] without BLOCKED:, the agent can't quietly end the turn.

It blocks once per turn, never in a loop. If the agent is waiting on you, it says so in one line and stops.
```

```text
Gates fire only while there's an active plan. With no plan, an S-level change is never blocked.

Escape hatches: set Status: abandoned in the plan header, or KEYSTONE_GATES=off.

The whole thing is one Node script, ~130 lines, zero deps: hooks/gate.mjs
```

```text
Want to see it without installing anything? This runs the real hook on a throwaway repo and prints what Claude Code would receive:

bash docs/social/twitter/demo-gates.sh

https://github.com/sattva2020/keystone
```

---

## Thread 3 — Regression first: /keystone:fix

```text
The worst bug fix an agent can make: "fix" the test that caught the bug.

Keystone's /keystone:fix makes that impossible, with a hook rather than a prompt. 🧵
```
🖼 `img/05-fix.png`

```text
The order is fixed:
1. Write a failing regression test in a new file.
2. Make the smallest change that turns it green.
3. Run the rest of the suite.

During a fix, any test file already committed in HEAD is locked. Edit and Write are both denied.
```

```text
What counts as a test file: *.test.*, *.spec.*, *_test.go, test_*.py, tests/, __tests__/, spec/.

What stays editable: fixtures and __snapshots__ (they can legitimately change with a fix), and the regression test written during this fix, even after git add.
```

```text
If the old test itself is wrong, the agent has to stop and ask you. That's on purpose: changing what "correct" means is your call, not the agent's.

https://github.com/sattva2020/keystone
```

---

## Thread 4 — Check the plan before the code

```text
The cheapest bug is the one caught in the plan.

Keystone runs /keystone:check before you approve: an analyzer and a validator, each in a clean context, read the plan against your intent.

I ran it blind against another checker. Results 🧵
```
🖼 `img/08-check.png`

```text
Setup: a real Next.js + NestJS + Supabase monorepo, fresh isolated clones, the same two plans for both tools.

The grader (Opus) saw findings with tool names stripped and order shuffled, and checked each one against the code and the intent.
```

```text
Keystone check: 6 real findings, 0 false.
AI Factory improve +check: 2 real, 1 false.
Cost: $10.43 vs $9.96.

Among the real ones: a React hook placed after an early return, and a decision that broke an intent line without being written down.
```

```text
It also prints intent coverage, e.g. "Coverage: 9/9 (100%)", and finds things nobody asked for ("snooze" was not requested).

Nothing changes until you answer "apply?".
```

```text
Honest limits: one corpus, one run per scenario, LLM graders. Treat it as a signal, not a statistic.

Neither tool caught a UI chip clipped by a truncating container, so recall isn't complete.

Method and tables: docs/benchmarks.md
https://github.com/sattva2020/keystone
```

---

## Thread 5 — A checked box is not evidence

```text
"All tasks done ✅" is the most common lie an agent tells.

It isn't malicious, it's just optimistic. So Keystone's /keystone:verify doesn't trust the checkboxes. 🧵
```
🖼 `img/06-verify.png`

```text
Step 1: run the project's real build, tests and lint.

Step 2: a separate verifier agent, in a clean context with none of the implementer's chat, grades every task, every plan row and every intent line:
ok · missing · wrong · not proven · BLOCKED
```

```text
Then you get one of three verdicts:

PASS: everything has evidence. The plan becomes verified and push opens.
PASS-UNPROVEN: nothing is wrong, but something has no proof.
FAIL: missing, wrong or unrequested work. Each "wrong" comes with a Repro: line.
```

```text
PASS-UNPROVEN is the important one. Example: "email delivery" can't be proven without staging SMTP.

The verifier says so and doesn't round it up to PASS. Push stays closed until you prove it, or you accept it explicitly and your name goes into verify.md.
```

```text
It also lists unrequested work: code nobody asked for is a finding, not a bonus.

In benchmarks verify returned PASS-UNPROVEN instead of claiming what it didn't prove, and an honest FAIL when a logging rule was broken.

https://github.com/sattva2020/keystone
```

---

## Thread 6 — How do you test a workflow made of prompts?

```text
Keystone is mostly Markdown: 25 skills and 4 agents. So how do you test prompts?

72 tests, node --test, zero dependencies, ~3 seconds. Two kinds 🧵
```
🖼 `img/07-tests.png`

```text
1. Behaviour tests for the hooks.

Each test builds a real temp git repo with a plan in some status, calls the gate, and asserts allow or deny. Draft blocks edits. Verified opens push. The newest task folder wins. KEYSTONE_GATES=off disables everything.
```

```text
2. Contract tests on the skill text. Each one is tied to an intent line:

test('I-3: plan infers Settings, never asks', () => {
  assert.match(t, /infer|inferred/i);
  assert.doesNotMatch(t,
    /AskUserQuestion[^\n]*(tests|logging|docs)/i);
});
```

```text
They pin promises, not wording.

"verify never edits intent". "every skill ends with a Next: line". "writing skills ask before they write". "fix is regression-first".

If a refactor drops one of these, CI goes red before a user notices.
```

```text
My favourite one came from a real bug.

Claude Code reads $1 in skill text as an argument placeholder, so a price like "$10" in a skill was silently replaced with the user's words.

The fix shipped with a test: no $<digit> anywhere in skills.
```

```text
Live behaviour (does the agent actually follow the skill?) is measured separately: a headless harness, fresh clones, a simulated user and an LLM grader.

Unit tests guard the contract. The harness measures the result.

https://github.com/sattva2020/keystone
```

---

## Thread 7 — Status, cost, and "what's next"

```text
Three questions I kept asking during long Claude Code sessions:

Where am I in this task?
What has each stage cost so far?
What exactly do I run next?

Keystone answers all three, without a model call. 🧵
```
🖼 `img/09-status.png`

```text
/keystone-status is answered locally by a small TypeScript mod: the active plan, its level, status, tasks done, BLOCKED count, "Done means", which gates are on, and the cost of each stage.

It costs zero tokens.
```

```text
The cost meter adds each turn's cost to the stage you ran (plan, check, implement, verify) for the active plan.

So you can see, for example, that planning cost $4.10 and implementation only $2.30. People often expect it the other way around.
```

```text
Every Keystone answer ends with a Next: line that has the exact command and the path filled in.

The same command waits in the empty prompt as a suggestion. Press Tab and you're on the next step.
```

```text
Install:

/plugin marketplace add sattva2020/keystone
/plugin install keystone@keystone

Then: /keystone:start <your task>

Stars, issues and "this broke on my repo" reports are all welcome.
https://github.com/sattva2020/keystone
```

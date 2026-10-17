---
name: grill
description: "Keystone: interview the user relentlessly, round by round, over the whole decision tree — implementation, UX, edge cases, failures, data, security, trade-offs, what done means — until every branch is visited and nothing is silently assumed. Facts are found by the agent, decisions are made by the user. Writes no file; returns a confirmed, numbered decision list (D1…) to the caller (/keystone:intent, /keystone:plan, /keystone:fix) or to the user. Use for 'grill me', 'interview me', 'stress-test this idea', or when open decisions depend on each other."
argument-hint: "[idea, plan or question to grill — empty: the topic of the current conversation]"
allowed-tools: Read Glob Grep Bash(git *) AskUserQuestion Agent
model: opus
effort: high
---

# Keystone · grill — the whole decision tree, round by round

Grill relentlessly until you and the user share one understanding of the change. The interview ends when every branch
of the decision tree has been visited and **nothing is silently assumed** — not when it "seems clear". Depth is the
point: a decision nobody asked about becomes a guess in the plan and a bug in the code. Facts are your job; decisions
are the user's. (Contract agreed in lee-to/ai-factory#151; depth as in the design-tree grilling practice.)

**Next step (mandatory).** End the answer with a `Next:` line that names the step in a few words, then put the exact
command on its own, on the following line(s), inside a fenced code block **with no language tag** — the app shows a
copy button on a code block. Never tag it ```bash: a `/keystone:*` command is not a shell command, and the bash tag
adds a Run button that would fail. When nothing runs now, write `Next: nothing now — waiting for <event>` and put the
later command in that fenced block. Never end on a caveat or an open-ended question. A path in that command must open
from the session's working directory, because the next session (after `/clear`) starts there: a file inside it →
its path relative to it; a file you wrote in another repository or folder (after `cd`) → its absolute path.

**Choice at the end (menu).** When the stage leaves more than one sensible next step, end with one AskUserQuestion
menu instead of a single command, as AI Factory does: 2–4 options, the recommended one first with `(Recommended)`,
and `Stop here` last. Print the report and the summary first, then ask. On a pick, **carry it out**: an option that
continues in this session runs now — for another Keystone skill, read `${CLAUDE_SKILL_DIR}/../<skill>/SKILL.md` and
follow it with the chosen arguments; an option that needs a clean session (`/clear` first), an irreversible external
step (push, deploy, production) or a human action outside the chat is not run — it becomes the `Next:` command. With
one sensible next step, or when AskUserQuestion is unavailable (`claude -p`, CI), skip the menu. The `Next:` line
always closes the answer.

**Status colors.** In the chat (not in files other tools parse) mark statuses so they scan at a glance: ✅ ok / done ·
⚠️ not proven / warn / partial · ❌ missing / wrong / fail · ⏸️ BLOCKED · 🔄 in progress · ⏳ pending; verdicts and gates
🟢 PASS / pass · 🟡 PASS-UNPROVEN / warn / not proven · 🔴 FAIL / fail · ⚪ n/a; severity and risk 🔴 critical / High ·
🟠 high · 🟡 medium / Medium · 🟢 low / Low. The marker goes before the word; the word stays.

**File links.** Every file you write or point the user to lives inside the session's working directory
(the folder Claude Code runs in — in a worktree, the worktree, never the main checkout), and its link is relative to
that directory: `[intent.md](wordpress-plugin/x/docs/keystone/<task>/intent.md)`, not relative to a nested repo or a
subproject. Check the link before showing it: the app opens links only from the working directory. A file outside
it (Claude's memory under `~/.claude`, another repository, a temp folder) is **never a link** — the app cannot open
it and shows "file not found", and a path in `code` becomes such a link too: give its absolute path as plain
text, without backticks. Link only a file you checked exists.

## Input

`$ARGUMENTS` is the idea, plan or question. Empty → grill the topic of the current conversation: say in one line what
you took as the topic and from where. Nothing to take → ask for the idea in one line and stop.

**Explicit `/keystone:grill` always grills.** When another skill calls you implicitly, a request with no open user
decision is not grilled — one simple fork is an ordinary question.

## 1. Build the tree — wide first

List every decision the user owns, with its prerequisites. Walk each of these areas and add a node for anything that
is not already decided by the user's own words (closed nodes from earlier in the conversation stay closed):

0. **Goal and today** — restate the goal in the user's own words and keep it fixed; ask how they do it today, step by step
   (one pass over everything or one by one, how often, what annoys them) before designing schedules, timers or UI.
1. **Scope** — what is in, what is explicitly out, what is "later".
2. **Users and roles** — who uses it, who must not, who is affected without using it.
3. **Behaviour** — the main flow step by step, inputs, outputs, states.
4. **Edge cases** — empty, huge, duplicate, concurrent, partial, repeated, out-of-order, legacy data.
5. **Failures** — what happens when a dependency, network, payment, permission or external API fails; retries; what the
   user sees.
6. **Data** — what is stored, where, for how long, migrations, backfill or not, deletion, privacy.
7. **Security and access** — authn/authz, secrets, abuse, rate limits.
8. **UX** — where it appears, wording, empty/loading/error states, mobile, accessibility, language.
9. **Integration** — which existing modules, APIs, jobs, notifications are touched; what must not break.
10. **Trade-offs** — speed vs. completeness, build vs. reuse, cost, performance targets.
11. **Done** — observable success criteria, how it will be checked, rollout and rollback, deadlines.

**A limit is not a decision.** When the goal hits something the agent cannot do (enter a password, log in, pass a
CAPTCHA or 2FA), do not ask "do it or drop it?". List the options that still reach the goal first (a script on the
user's server with access he configures himself, a saved session, partial automation with a fallback), with their risks,
and only then the option that narrows the goal. Never recommend dropping the core goal; dropping it is the user's call,
asked as "You asked for X; this gives only Y; X stays undone — confirm?".

**Words against a decision.** If the user's words contradict a closed decision (he talks about "clicking" while a
decision says "no clicking"), stop and re-ask that decision before going on.

A large change typically yields 15–25 user decisions across several rounds; a small one fewer. Do not pad the tree,
but do not stop at the obvious ones either — ask about the hard parts the user may not have considered.

## 2. Find facts yourself

Anything answerable from code, docs, git, config or tools is not a question: look it up (dispatch an `Explore` agent,
model haiku, for broad sweeps). **Never ask the user for a fact.** Do not block on it: a pending fact closes only the
nodes below it — ask the rest of the frontier now. Use the facts to make recommendations concrete.

## 3. Ask the frontier in rounds of up to ~8 questions

The frontier = every decision whose prerequisites are closed. A round holds up to ~8 questions; a longer frontier is
split into consecutive rounds. A question whose answer depends on another question still
open in this round belongs to a later round. Number every question and give your recommendation with one line of why. Plain Markdown, never a code block (a code
block renders as a monospace wall); one blank line between questions:

> **Q1 · <decision>** — <the question; options as `a)` / `b)` when there are several>
> ➡️ Recommended: **<answer>** — <why, citing the fact you found>

Ask a round as plain text in this format. Use AskUserQuestion only when the round has at most 4 questions
and all of them have discrete options (recommended option first). Never re-ask a decision the user already answered.
**Verify facts in recommendations.** Every recommendation that contains a fact (price, limit, version, name, path) is
checked against a source in the repo or the docs and cites it; a mismatch with the source is stated aloud (lesson: 49 USD
was suggested where the spec said 49.99 USD). Do not announce the topics or the number of later rounds. **Never recommend an answer that widens the scope beyond what
the user said** ("only e-chat" stays only e-chat) — scope widening is the user's call, asked as a question if at all.
Concretely: the recommended answer never adds a channel, platform, integration, audience, feature or rollout step the
user has not mentioned, and never removes one the user named (no "skip snooze" when the user listed snooze). The
smallest option that satisfies what the user said is the recommendation; anything bigger is listed as
`Out of scope — later?` and not recommended. Before sending a round, re-read each ➡️ against the user's words.

## 4. Rebuild after every answer

Answers add, drop and reshape nodes. Recompute the frontier and ask the next round. **Edge-case pass (mandatory):**
unless the user's own words already close them, hold a separate round or pass on edge cases and what must not break —
failures, repeats, privacy and data export/deletion, platform differences. Before declaring the frontier
empty, run a final sweep over the eleven areas: any area with no closed node and no explicit "not relevant" from the
user gets one question.

## 5. Stop only when the frontier is empty

**Coverage table (mandatory, before the summary).** Show one table: each of the eleven areas → its `D#` numbers, or
`n/a (user)` when the user said it does not apply. Besides the areas, these nodes may not be omitted for any feature:
who creates / launches it; who sees it or gets access; repeats and frequency; limits and quotas; what happens if
delivery or execution fails (offline, outage); how it is cancelled or rolled back; the done criterion. An area or node
with neither a `D#` nor `n/a (user)` → one more round. The summary is shown only when the table is complete.

Show the normalized result as a Markdown table, never inside a code block:

| # | Decision | Answer |
|---|---|---|
| D1 | <decision, a few words> | <answer, one short sentence; **bold** the key value> |

Rows grouped by area in the order of the coverage table; keep each cell short (details go to the caller's artifact).
Below the table: `Open:` as a bullet list for anything the user deferred. Then ask for **explicit confirmation**. "OK to all" given to raw rounds is not that confirmation; the
normalized list is what gets confirmed. Do not act on the result before it is confirmed.

## Output contract

Returns to the caller: the confirmed `D#` list + `Open:` list + facts used (with sources) + the number of rounds and
questions asked. **Writes nothing to disk** — the caller owns its artifact (`intent.md`, plan, fix plan).

**Run directly by the user** (no caller): after the confirmation the decisions exist only in this chat, so the last
line routes them into an artifact — `Next: /keystone:intent <topic> — D1…Dn above` for L, `Next: /keystone:start <topic>
— D1…Dn above` when the level is unclear, or `Next: nothing now — waiting for <event>; then /keystone:start <topic>`
when the user chose to wait. Say in one line that the list is not saved until that command runs.

## Project memory (memlab, optional)

If the memlab MCP tools are available in this session (`search_decisions`, `search_code`), call `search_decisions` on
the topic before the first round. A prior decision of the same task is a fact: cite it (`path:line`) and do not ask it
again. A decision from another, earlier task is context, not a fact: when the new request touches the same goal, re-ask
it with the citation ("On <date> you chose <X> for <task> — still so here?"); a conflict between the new idea and a prior
decision becomes a question for the user. No memlab — skip this.

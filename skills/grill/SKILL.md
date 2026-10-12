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

## Input

`$ARGUMENTS` is the idea, plan or question. Empty → grill the topic of the current conversation: say in one line what
you took as the topic and from where. Nothing to take → ask for the idea in one line and stop.

**Explicit `/keystone:grill` always grills.** When another skill calls you implicitly, a request with no open user
decision is not grilled — one simple fork is an ordinary question.

## 1. Build the tree — wide first

List every decision the user owns, with its prerequisites. Walk each of these areas and add a node for anything that
is not already decided by the user's own words (closed nodes from earlier in the conversation stay closed):

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

A large change typically yields 15–25 user decisions across several rounds; a small one fewer. Do not pad the tree,
but do not stop at the obvious ones either — ask about the hard parts the user may not have considered.

## 2. Find facts yourself

Anything answerable from code, docs, git, config or tools is not a question: look it up (dispatch an `Explore` agent,
model haiku, for broad sweeps). **Never ask the user for a fact.** Do not block on it: a pending fact closes only the
nodes below it — ask the rest of the frontier now. Use the facts to make recommendations concrete.

## 3. Ask the frontier in rounds of up to ~8 questions

The frontier = every decision whose prerequisites are closed. A round holds up to ~8 questions; a longer frontier is
split into consecutive rounds. A question whose answer depends on another question still
open in this round belongs to a later round. Number every question and give your recommendation with one line of why:

```text
❓ Q1 — <decision>: <the question, with the options when there are several>
➡️ Recommended: <answer> — <why, citing the fact you found>
```

Ask a round as plain text in the ❓/➡️ format above. Use AskUserQuestion only when the round has at most 4 questions
and all of them have discrete options (recommended option first). Never re-ask a decision the user already answered.
**Verify facts in recommendations.** Every recommendation that contains a fact (price, limit, version, name, path) is
checked against a source in the repo or the docs and cites it; a mismatch with the source is stated aloud (lesson: $49
was suggested where the spec said $49.99). Do not announce the topics or the number of later rounds. **Never recommend an answer that widens the scope beyond what
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

Show the normalized result, one line per decision — `D<n>. <decision> → <answer>` — plus `Open:` for anything the user
deferred, and ask for **explicit confirmation**. "OK to all" given to raw rounds is not that confirmation; the
normalized list is what gets confirmed. Do not act on the result before it is confirmed.

## Output contract

Returns to the caller: the confirmed `D#` list + `Open:` list + facts used (with sources) + the number of rounds and
questions asked. **Writes nothing to disk** — the caller owns its artifact (`intent.md`, plan, fix plan).

## Project memory (memlab, optional)

If the memlab MCP tools are available in this session (`search_decisions`, `search_code`), call `search_decisions` on
the topic before the first round. A prior decision found there is a fact: cite it (`path:line`) and do not ask it
again; a conflict between the new idea and a prior decision becomes a question for the user. No memlab — skip this.

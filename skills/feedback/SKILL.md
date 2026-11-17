---
name: feedback
description: "Keystone: agent feedback — the summary of what agents said about the text of Keystone skills (all projects on this machine, repeated problems with counts), and the feedback judge that checks a task's self-reports against the traces of its work. `/keystone:feedback` = summary; `judge` with a plan path or `judge` (this session) = the judge on request; `auto` with a plan path = called by /keystone:verify on M/L, judges only when the signals call for it. Off by default (plugin option `feedback`). Use for 'feedback summary', 'what do agents find unclear in the skills', 'judge this task'."
argument-hint: "[summary [--since X.Y.Z] | judge [<plan path>] | auto <plan path>]"
allowed-tools: Read Glob Grep Agent AskUserQuestion Bash(node *feedback.mjs*) Bash(git *)
model: sonnet
---

# Keystone · feedback — what agents say about the skill texts, and a judge that checks it

The chain skills (start, intent, plan, check, implement, verify, fix, review) write a short self-report about the text of
the skill they followed when the plugin option `feedback` is on. The reports sit in `~/.claude/keystone-feedback/<project>/feedback.jsonl`
on this machine and go nowhere else. This skill reads them. **The script does the counting, you carry out:** `scripts/feedback.mjs`
(`summary`, `signals`, `add`) is mechanical and has no model; the only judgement here is the `keystone:feedback-judge` agent.
Never edit a skill, the plan or a record: a finding is for the plugin's author to read.

The script is `node '${CLAUDE_SKILL_DIR}/scripts/feedback.mjs'` — always in single quotes (the path may hold a space, a `$` or a backtick; a `'` inside the path is written `'\''`).

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

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


## Modes

Read the arguments:

- no arguments, or `summary [--since X.Y.Z]` → **summary**;
- `judge <plan path>` → **judge by task**;
- `judge` without a path → **judge by session**;
- `auto <plan path>` → **auto** (called by `/keystone:verify` through the Skill tool on an M/L change).

**Off.** `judge` and `auto` need records to exist: while the context has no `Keystone feedback: on` line, answer with the
single line `feedback is off — enable the plugin option "feedback"` and stop. `summary` always works (it
reads what is already on disk). Do not read the environment yourself: with `KEYSTONE_FEEDBACK=on` the SessionStart hook
prints that line anyway.

## Summary

Run `node '${CLAUDE_SKILL_DIR}/scripts/feedback.mjs' summary [--since X.Y.Z]` and show its Markdown as it is — no rewording,
no suggested fixes (the author reads the table and decides). Rows under `Candidates — skill text (judge)` are the ones worth
a look first; `Self-reports of unjudged tasks` are the agents' own words, not yet checked. An error line → show it, stop.

## Judge by task / by session / auto

1. **Signals.**
   - `judge <plan path>` → `node '${CLAUDE_SKILL_DIR}/scripts/feedback.mjs' signals "<plan path>"`.
   - `judge` → the id is in the `session: <id>` line of the context; no such line → one line
     `no session id — run /keystone:feedback judge <plan path>` and stop. Then `signals --session "<id>"`.
   - `auto <plan path>` → `signals "<plan path>" --auto`.
   An `error` line from the script → show it as one line and stop.
2. **Is a judge needed?** Take the last line of the output, `judge: yes — <reasons>` or `judge: no — <reason>`.
   - `judge: no — already judged <id>` or `no — task already judged <id>` → one line saying so; do not run the judge again on the same data.
   - `auto`: run the judge only when the line says `yes` **and** the plan header has `Level: M` or `Level: L` (S never judges
     by itself). Otherwise one line `Keystone feedback judge: not needed — <reason>` (`clean run`, `level S`, `already judged`) and stop.
   - `judge` on request: run it unless the line says `already judged`; the thresholds (`yes`/`no — clean run`) do not apply to a request.
3. **Call the judge** — Agent, `subagent_type: "keystone:feedback-judge"`. The prompt holds facts only, no opinion of yours:
   the plugin root (`${CLAUDE_SKILL_DIR}/../..` as an absolute path), the plan path and the intent path of the task folder
   (or the session id), a line `Language: <the language of this conversation>`, and the `signals` output word for word.
4. **Store the answer.** Pipe the agent's lines to the script, nothing added or reworded:
   `node '${CLAUDE_SKILL_DIR}/scripts/feedback.mjs' add --kind judge --skill feedback --task "<task folder name|->" --session "<id|->" --hash <hash from the signals> --tokens <total_tokens of the Agent result> <<'EOF'` … `EOF`.
   Use the Bash tool. If a line of the answer holds a literal command that pushes to git or opens a PR, write "push" / "PR" in
   its place first: the push gate scans the whole command text.
5. **One line to the chat** — the line `add` printed (`Keystone feedback judge: <n> findings → <file> (<id>)`). The file is
   outside the working directory: give its path as plain text, never as a link.

**The judge failed** (the Agent returned an error, timed out, or gave not a single line of the format): one line
`Keystone feedback judge: error — <reason>`, no record is created, the work goes on. The script says the same itself when
`add --kind judge` gets no parseable line. Feedback never blocks anything and never changes a verdict.

## What closes the answer

- **Called by another skill** through the Skill tool (`auto`, or `judge` from verify): print the single line — `add`'s,
  `not needed` or `error` — and nothing else: no `Next:` and no menu, so the calling skill keeps the end of its own answer.
- **Run directly by the user:** the line (or the summary), then the `Next:` line. After a summary: `Next: /keystone:feedback judge <plan path>`
  for a task with unjudged self-reports, or `Next: nothing now — waiting for more runs`. One sensible next step → no menu.

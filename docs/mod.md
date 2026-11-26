# Keystone status and cost (mod)

[Back to README](../README.md) · [Skills reference](skills.md)

Keystone ships a small TypeScript [mod](https://code.claude.com/docs/en/plugins/mods) next to its hooks:

- **`/keystone-status`** — the active plan, its level, status, tasks done, `BLOCKED` count, `Done means`, which gates are
  on, and the cost of each stage. Answered locally, without a model call.
- **Status line** — `Keystone · L · implementing · 13/14 · $9.60` under the prompt; the band above the prompt shows the
  same cost in its title: `Keystone · L · implementing · $9.60`.
- **Cost meter** — after every turn the session's cost delta is added to the stage you ran (`/keystone:plan`,
  `check`, `implement`, …) for the active plan; `implement` and `verify` receive the measured numbers for their
  `cost:` line.
- **Next command** — after a Keystone turn the empty prompt box shows the next step with the plan path filled in
  (`/keystone:implement docs/keystone/…/plan.md`, then `/keystone:verify …`); press Tab or → to take it.
- **Next buttons** — above the prompt, from the plan status, without a model call: the plan's next command and
  `/keystone-status`, plus `/keystone:check` for an L draft with an intent or `/keystone:review` before verify on L.
  A click puts the command into the prompt box; you press Enter.
  They stay after every turn while the session works with a plan, and come back after an app restart. A new session
  in a repo with a plan it has not worked with gets one dim row naming that plan, until the first prompt.
- **File links** — file paths in answers are clickable relative to the session folder (`` `hooks/keystone.ts:86` ``
  becomes a link); only the rendering changes, the message stays as it is.
- **Handoff** — when the context grows, `/keystone-handoff` or the Hand off button (at 350k / 600k / 800k tokens;
  100k / 150k / 170k for a short window) has the agent update `plan.md`; after `/clear` the next command is already
  in the prompt box. `/clear` runs only after `KEYSTONE HANDOFF READY` and only if the plan really changed.
- **Back after a pause** — Claude's prompt cache lives up to an hour; after that the next answer re-reads the whole
  conversation at full price. When the last answer is 55+ minutes old, the session works with a plan and the context
  is 30k tokens or more, the band shows *Cache went cold (2 h ago): the next answer re-reads 180k from scratch* with
  two buttons. **Start clean** runs `/clear` with no model call — the history is not re-read, the plan's next command
  lands in the prompt box, and only what the plan does not hold is lost. **Save and start** is the usual handoff: one
  re-read, the agent updates the plan, then `/clear`. Sending any message hides the band. Leaving for more than an
  hour? Run `/keystone-handoff` before you go, while the cache is still warm and the write-up is cheap.
- **Side panel** (Claude Code Desktop; no errors in the terminal or VS Code, but the look is not guaranteed there) —
  *Waiting for you* with the reason and the next command, this session's child sessions (stage, task progress, working
  or waiting; what cannot be known shows as *unknown*), the plan, the checks and the cost. Its one button only puts the
  plan's next command into the prompt box. Refreshed after a turn and every 30 seconds while it is seen, with no model
  call; when a read fails, the last data stays with a *stale · data from HH:MM* mark. It opens by itself when the
  session has a plan or child sessions; once you close it, it stays closed in that session, and `/keystone-panel` opens
  it again. It reads `~/.claude/sessions` (the engine's list of live sessions), the app's list of child sessions, git
  and plan files; nothing is sent, message texts are not read, and only the fact of closing is stored. To turn it off,
  set the plugin option *Side panel* (`panel`) to off.
- **Interface language** — the band, buttons and toasts come in English, Russian, German, French or Spanish. The
  plugin option *Interface language* (`auto` by default) picks one; `auto` follows Claude Code's own `language`
  setting (`"language": "russian"`, `"Deutsch"`, … — the name or the self-name, any case), anything else is English.
  A string without a translation falls back to English. The German, French and Spanish texts are machine translations
  — corrections are welcome. The handoff request sent to the agent stays in English in every language.

Mods need Claude Code 2.1.287+ (terminal) or 2.1.286+ (Desktop). In `claude -p` the hooks run but nothing is drawn.

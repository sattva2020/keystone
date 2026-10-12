# Headless scenario harness

`drive.mjs` runs a scenario end to end: the **executor** is `claude -p` (Opus by default) working in a clone of
**your** project; whenever it asks a question, a **user simulator** (`claude -p`, Sonnet, isolated) answers from a hidden
scenario. The conversation is written to `runs/<id>/transcript.md` next to the scenario file. The driver judges nothing:
verdicts come from a separate grader (for example an Opus subagent) reading the transcript against a checklist you
write.

```bash
node test/harness/drive.mjs test/harness/scenarios/<id>.json
```

No scenarios ship with the repo. Put yours in `test/harness/scenarios/` (git-ignored); examples are below.

## Scenario fields

| Field | Meaning |
|---|---|
| `id` | run name; output goes to `runs/<id>/` |
| `cwd` | a **fresh clone** of your project (one clone per scenario) |
| `persona` | who the simulated user is, one sentence |
| `hidden` | the decisions the simulated user holds; the agent does not know them |
| `steps[]` | `prompt` (first message, e.g. `/keystone:plan ...`), `newSession`, `maxRounds` (default 8), `noUser` (do not simulate answers), `done` (regex that ends the step) |
| `model` | executor model, default `opus` |
| `plugin` | `false` to run without the plugin under test |
| `isolate` | `true` for any scenario that implements code (see lesson 4) |
| `allowPush` | with `isolate`, allow `git push` (only for the gate-push probe, against a throwaway bare repo) |
| `extraSys` | extra text appended to the executor's system prompt |
| `env` | extra environment variables for the executor |
| `noSys` | omit the harness system prompt (to test autonomous behavior) |

The plugin under test is loaded with `--plugin-dir` from this repository; an installed `keystone@keystone` is switched
off for the run through a generated settings file, so only the working tree is used.

## Example scenario

```json
{
  "id": "plan-m-example",
  "cwd": "/path/to/fresh-clone-of-your-project",
  "persona": "a backend developer who wants a small, safe change",
  "hidden": "Wants the new filter on the list endpoint only. Pagination stays as is. No schema change. Done means the existing list test still passes and a new test covers the filter.",
  "steps": [
    { "prompt": "/keystone:plan add a status filter to the invoices list endpoint", "maxRounds": 4 },
    { "prompt": "Approve plan", "noUser": true },
    { "prompt": "/keystone:implement", "newSession": true, "maxRounds": 3 },
    { "prompt": "/keystone:verify", "newSession": true, "noUser": true }
  ],
  "isolate": true
}
```

A gate probe is the same shape with a one-step `prompt` that tries the forbidden action (an edit while the plan is
`draft`, or a `git push` with `allowPush: true` against a local bare remote), then you check that the hook denied it.

## Lessons (read before running)

1. **Check which skill text actually loaded.** Personal skills in `~/.claude/skills` can shadow others. In the session
   file under `~/.claude/projects/<project>/<session>.jsonl`, look for `Base directory for this skill: ...` and confirm
   it points at this repository.
2. **Keep the simulator isolated:** `--strict-mcp-config --disable-slash-commands --setting-sources "" --tools ""` and
   a neutral working directory (the driver uses the OS temp dir). Without isolation it inherits your whole environment.
3. **Do not disable ToolSearch for the executor** (`--tools ""` or denying `ToolSearch`): Claude Code then loads the
   full schema of every MCP tool, which can exceed the context window ("Prompt is too long").
4. **Implementation runs need `isolate: true`:** the clone has no `origin`, `core.hooksPath` points at an empty dir,
   secret-like environment variables (`*_TOKEN`, database URLs, cloud keys) are removed, MCP servers are limited to the
   session's own, and `git push`, `node`, `npx`, `npm`, `curl`, `psql` and web tools are denied. Do a probe run first
   that tries to reach a secret or the network and confirm it fails.
5. **One clean clone per scenario.** A clone reused after another run starts from leftover drafts and ruins the
   comparison. Commit artifacts that a stage must see as committed (intent, plan) before that stage, or checks that
   depend on committed state become meaningless.
6. **`maxRounds` can cut a dialog short**, leaving a plan in `draft`. Account for it when grading.
7. **Costs add up.** An L-level plan, implement and verify run costs tens of dollars on Opus; size a first pass with an
   S or M scenario.

# Security Policy

## What Keystone runs on your machine

- **Hooks.** `hooks/hooks.json` registers one Node script, `hooks/gate.mjs`, on `PreToolUse` (for
  `Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell`) and on `Stop`. It reads the hook JSON from stdin and the plan
  files under `docs/keystone/` (or the AI Factory `paths.specs` folder), and runs `git cat-file -e` to see whether a
  test file is committed. It writes only a JSON decision to stdout. It makes no network calls and writes no files.
- **Permissions.** The hook runs with your user's permissions. It can deny a tool call or remind at `Stop`; it cannot
  approve anything. `KEYSTONE_GATES=off` disables it.
- **Skills and agents** are prompts. They use only the tools Claude Code already grants the session. The optional memlab
  integration calls an MCP server you configured yourself.
- **Adapter.** `adapters/ai-factory` only edits AI Factory skill text when you install it.

## Reporting a vulnerability

Please report privately through GitHub's
[private vulnerability reporting](https://github.com/sattva2020/keystone/security/advisories/new) for this repository.
Do not open a public issue for a security problem. Include the affected file, steps to reproduce and the impact. You
should get a first reply within a few days.

## Supported versions

Only the latest release receives fixes.

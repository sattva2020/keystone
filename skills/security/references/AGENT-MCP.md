<!-- original Keystone file (MIT) -->

# Agent and MCP configuration (category `agent`)

Scope: `.mcp.json`, `.claude/settings*.json`, hooks, `CLAUDE.md`/`AGENTS.md` that agents load, and code that calls an LLM
with tools. Refs: A02:2025, A03:2025, LLM03:2026, LLM04:2026 (see `MAPPING.md`). Severity is by real exploitability.

## Checks
| Check | Unsafe | Safe | Severity |
|---|---|---|---|
| Secret literals in MCP config | `"env": {"TOKEN": "ghp_…"}`, literal `Authorization` header in `.mcp.json` or settings | `"${TOKEN}"` (Claude Code expands `${VAR}` and `${VAR:-default}` in `.mcp.json`) | critical [mcp-secret-literal] |
| Unpinned MCP server | `npx -y pkg`, `pkg@latest`, `uvx pkg` with no version | `npx -y pkg@1.4.2` (or lockfile / digest) | medium [no-mcp-pin] |
| Over-broad permissions | `permissions.allow` with `Bash(*)`, bare `Bash`, wildcard on `curl`/`rm`; `--dangerously-skip-permissions` as a default in scripts or docs | narrow allow-list per command, ask for the rest | high if committed to a shared repo |
| Hooks that download and run | hook command `curl … \| sh`, `wget -O- \| bash`, remote script fetched on every event | hook calls a committed, reviewed script | high |
| MCP server from an unknown source | package/URL from an unknown publisher, no repo, `http://` remote | known vendor, pinned version, `https` | medium (high with write tools) |
| Tool output treated as instructions | agent code feeds tool / MCP / web output into the next prompt with authority, or auto-follows its links | tool output is data: delimited, no authority, no new tool grants | high (LLM01 indirect) |
| Irreversible actions without confirmation | agent can send, pay, delete, publish or push with no human step | confirmation step or dry-run for irreversible tools | high (LLM03) |
| `enableAllProjectMcpServers: true` committed | the key in repo settings | list servers explicitly | low — Claude Code ignores it in an untrusted folder, but it is still a smell: it trusts every future server |
| Agent credentials wider than the task | one org-wide token shared by all tools | per-tool, least-privilege, short-lived | medium |
| Memory writes from untrusted content | agent stores web/email text into long-term memory verbatim | store reviewed or marked data only | medium |

## Not a finding
Placeholders (`${VAR}`, `<your-token>`, `xxx`); `.mcp.json` in `examples/` or docs with obviously fake values; permissions in a
gitignored user-local file; `npx -y` with a pinned version.

## Starters
`grep -nE '"(env|headers)"' .mcp.json`, `grep -nE "npx -y|@latest" .mcp.json`, `grep -rnE "curl[^|]*\|\s*(sh|bash)" .claude/`,
`grep -rnE "Bash\(\*\)|dangerously-skip-permissions|enableAllProjectMcpServers" .claude/ .mcp.json`.
Never print a secret value: name the key and the location only.

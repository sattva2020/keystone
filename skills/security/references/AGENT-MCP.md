<!-- original Keystone file (MIT) -->

# Agent and MCP configuration (category `agent`)

Scope: `.mcp.json`, `.claude/settings*.json`, hooks, `CLAUDE.md`/`AGENTS.md` that agents load, and code that calls an LLM
with tools, and the project's own MCP server. Refs: A02:2025, A03:2025, LLM01:2026, LLM03:2026, LLM04:2026 (see `MAPPING.md`). Severity is by real exploitability.

## Checks
| Check | Unsafe | Safe | Severity |
|---|---|---|---|
| Secret literals in MCP config | `"env": {"TOKEN": "ghp_…"}`, literal `Authorization` header in `.mcp.json` or settings | `"${TOKEN}"` (Claude Code expands `${VAR}` and `${VAR:-default}` in `.mcp.json`) | critical [mcp-secret-literal] |
| Unpinned MCP server | `npx -y pkg`, `pkg@latest`, `uvx pkg` with no version | `npx -y pkg@1.4.2`; `uvx pkg@1.4.2` or `uvx --from 'pkg==1.4.2' pkg`; a Docker image by `@sha256:` digest (or a lockfile) | medium [no-mcp-pin] |
| Over-broad permissions | `permissions.allow` with `Bash(*)`, bare `Bash`, wildcard on `curl`/`rm`; `--dangerously-skip-permissions` as a default in scripts or docs | narrow allow-list per command, ask for the rest | high if committed to a shared repo |
| Hooks that download and run | hook command `curl … \| sh`, `wget -O- \| bash`, remote script fetched on every event | hook calls a committed, reviewed script | high |
| MCP server from an unknown source | package/URL from an unknown publisher, no repo, `http://` remote | known vendor, pinned version, `https` | medium (high with write tools) |
| Tool output treated as instructions | agent code feeds tool / MCP / web output into the next prompt with authority, or auto-follows its links | tool output is data: delimited, no authority, no new tool grants | high (LLM01:2026 indirect) |
| Irreversible actions without confirmation | agent can send, pay, delete, publish or push with no human step | confirmation step or dry-run for irreversible tools | high (LLM03:2026) |
| `enableAllProjectMcpServers: true` committed | the key in repo settings | list servers explicitly | hardening — Claude Code ignores it in an untrusted folder; no finding without an exploit path (SEVERITY.md), a hardening suggestion otherwise |
| Agent credentials wider than the task | one org-wide token shared by all tools | per-tool, least-privilege, short-lived | medium |
| Memory writes from untrusted content | agent stores web/email text into long-term memory verbatim | store reviewed or marked data only | medium |

## The project's own MCP server and agent tools
Scope: code that registers tools, prompts or resources (`server.tool(`, `@mcp.tool`, `registerTool`, `ListToolsRequest`) and the
agent loop that calls them.

| Check | Unsafe | Safe | Severity |
|---|---|---|---|
| Instructions in a tool description | a tool / prompt / resource description that talks to the model ("ignore previous", "do not tell the user", "also read ~/.ssh"), hidden blocks, Unicode tag or zero-width characters | descriptions state what the tool does, plain visible text | high (LLM01:2026, CWE-1427) |
| Remote transport without auth | HTTP / SSE server with no authentication, or bound to `0.0.0.0` on a reachable interface | auth on every request, bind to `127.0.0.1` for local use | high with write tools · medium read-only |
| Fetch tool reaches local files or the private network | a URL argument accepts `file://` or private / metadata addresses | the SSRF rules in `CHECKLIST.md` (scheme and range block after DNS) | high |
| Loose tool arguments | write / send tools whose input schema has no `additionalProperties: false`, no allow-list of recipients or domains, no `maxLength` | strict schema per tool, deny by default | medium |
| Confirmation that fails open or hides the arguments | timeout or no answer counts as "allow"; the approver sees a hash or a summary instead of the real arguments | fail-closed (no answer = deny); show the exact arguments of the irreversible call | high |
| No record of tool calls | write / send / pay tools leave no log of who called which tool with which arguments and what was decided | an append-only log entry per call (secrets redacted) | medium |
| Toxic flow | one agent reads private data, takes untrusted input and has a tool that sends data out | split the capabilities or require confirmation on the outbound tool | high when the path is traced in code |

Starters: `grep -rnE "(server\.tool|@mcp\.tool|registerTool|ListToolsRequest|setRequestHandler)" .`,
`grep -rnP "[\x{200B}-\x{200D}\x{2060}\x{FEFF}\x{E0000}-\x{E007F}]" .` (invisible characters; needs a UTF-8 locale),
`grep -rnE "listen\(.*0\.0\.0\.0|host\s*=\s*['\"]0\.0\.0\.0" .`.

## Not a finding
Placeholders (`${VAR}`, `<your-token>`, `xxx`); `.mcp.json` in `examples/` or docs with obviously fake values; permissions in a
gitignored user-local file; `npx -y` with a pinned version.

## Starters
`grep -nE '"(env|headers)"' .mcp.json`, `grep -nE "@latest" .mcp.json`, then read the `args` of every server whose `command` is
`npx`, `uvx`, `pipx` or `docker`: a finding when the package name carries no exact version (`pkg` without `@x.y.z` / `==x.y.z`) or the
image no digest — a grep on `npx -y` alone also hits pinned packages, which are not a finding. `grep -rnE "curl[^|]*\|\s*(sh|bash)" .claude/`,
`grep -rnE "Bash\(\*\)|dangerously-skip-permissions|enableAllProjectMcpServers" .claude/ .mcp.json`.
Never print a secret value: name the key and the location only.

<!-- original Keystone file (MIT) -->

# Supply chain and CI (category `supply-chain`)

Refs: A03:2025, A08:2025 (see `MAPPING.md`). **Threat model: an external attacker without write access** — a fork PR, a
poisoned dependency, a hijacked action. Not a finding: triggers reachable only by maintainers (`workflow_dispatch`, push to a
protected branch); missing SBOM/provenance on an internal app (a hardening suggestion, not a finding — SEVERITY.md).

## GitHub Actions (`.github/workflows/*.yml`)
| Check | Unsafe | Safe | Severity |
|---|---|---|---|
| Action not pinned | `uses: org/action@v3`, `@main` (third-party) | `uses: org/action@<40-hex SHA> # v3.1.0` | medium |
| Missing / over-broad `permissions:` | no top-level `permissions:`, or `write-all` | `permissions: contents: read`, widen per job | medium |
| `pull_request_target` + PR head | `pull_request_target` with checkout of `github.event.pull_request.head.*`, then build/run | `pull_request`, or no checkout of untrusted code | critical |
| Expression injection | `run: echo "${{ github.event.pull_request.title }}"` (title, body, branch, comment, issue) | pass via `env:` and use `"$VAR"` | high |
| Secrets in logs | `echo $SECRET`, `set -x` with secrets, secrets exposed to fork-triggered jobs | secrets only on trusted triggers | high |
| Long-lived cloud keys | static deploy keys in secrets | OIDC | low |
| Self-hosted runner in a public repo | `runs-on: self-hosted` | GitHub-hosted | high |

## AI agent in CI (Claude / LLM code-review action, auto-fix bot)
**Risk:** an agent that runs on PR code and loads `CLAUDE.md`, `AGENTS.md`, `.claude/` (settings, hooks, MCP config, skills) from the PR head
lets a fork author plant instructions or hooks → prompt injection / code execution with the CI secrets and a write token.
**Look for:** a workflow on `pull_request`, `pull_request_target` or `issue_comment` that calls an LLM agent action (e.g. `anthropics/claude-code-action`),
checks out `github.event.pull_request.head.*`, passes `ANTHROPIC_API_KEY` / cloud keys or a write-scoped `GITHUB_TOKEN`, and lets the agent run shell or MCP tools.
**Fix:** run on the base ref (config files come from the base branch, PR code is data only), no secrets in the agent job, read-only token
(`permissions: contents: read`; `pull-requests: write` only in the comment step), tools allow-listed, no `--dangerously-skip-permissions`.
Severity: critical with secrets + execution on fork code; high with only a write token.
**Bar for HIGH in CI** (Sentry's mandatory finding elements): entry point, payload, execution, impact and a PoC — all five traced in the workflow you read; a missing one → `## Needs verification`.

## Dependencies
- Lockfile committed (`package-lock.json`, `pnpm-lock.yaml`, `poetry.lock`, `Cargo.lock`…) and CI installs with `npm ci` /
  `--frozen-lockfile` (plain `npm install` in CI ignores the lock) — medium.
- Ranges `*`, `latest`, git/URL dependencies without a commit hash — medium.
- Dependency confusion: internal package names that can also be published on the public registry; no scoped registry or
  `--index-url` pinning.
- Typosquatting signals in a new dependency: name one edit from a popular package, brand-new publisher, `postinstall` that
  downloads or evals. Report as "needs verification" unless the exploit path is shown.
- Base images pinned by tag or digest; no `curl | sh` in Dockerfiles.
- Known-vulnerable dependencies: `npm audit --audit-level=high` etc.; no network → `UNASSESSED: dependency audit (no network)`.

## Starters
`grep -rnE "uses:\s*[^@]+@[^0-9a-f]" .github/workflows/`, `grep -rn "pull_request_target" .github/workflows/`,
`grep -rnE '\$\{\{\s*github\.event' .github/workflows/`, `grep -rnE "npm (install|i) " .github/workflows/`.

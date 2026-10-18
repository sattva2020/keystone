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
| `workflow_run` on PR artifacts | a `workflow_run` job downloads artifacts of the PR build and runs or publishes them with secrets or a write token | treat artifacts as data: no execution, no secrets in that job | high |
| Checkout credentials left for PR code | `actions/checkout` without `persist-credentials: false` in a job that then runs PR code | `persist-credentials: false` | medium |

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
- Dependency confusion: internal package names that can also be published on the public registry. Look for: pip
  `--extra-index-url` / `extra-index-url` (in `pip.conf`, `requirements*.txt`, CI) for internal packages — pip takes the highest
  version from all indexes; `.npmrc` without `@<scope>:registry=` for the internal scope; Maven `settings.xml` without a single
  `<mirrorOf>*</mirrorOf>` mirror. Safe: `--index-url` to an internal proxy that mirrors the public index, scoped registries.
- Typosquatting signals in a new dependency: name one edit from a popular package, brand-new publisher, `postinstall` that
  downloads or evals. Report as "needs verification" unless the exploit path is shown.
- Base images pinned by digest (`FROM image@sha256:…`); a tag only → medium [no-image-digest]; no `curl | sh` in Dockerfiles.
  Dockerfile, Kubernetes and Terraform checks → `IAC.md`.
- Known-vulnerable dependencies: `npm audit --audit-level=high` etc.; no network → `UNASSESSED: dependency audit (no network)`.

## Models and weights (LLM04:2026)
Loading model weights or code from outside is a supply chain. Look for: `torch.load(...)` without `weights_only=True`; pickle-based
weight files (`.bin`, `.pt`, `.pkl`, `.ckpt`) from a hub or URL instead of `safetensors`; `trust_remote_code=True`; `from_pretrained(...)`
without `revision="<commit>"`. Code or pickle from a hub runs on load → high when the repo or file can change under you; medium
when pinned but unverified. Not a finding: weights from the project's own artifact store with a pinned hash.

## Starters
`grep -rnE "uses:[[:space:]]*[^.[:space:]][^@[:space:]]*@" .github/workflows/ | grep -vE "@[0-9a-f]{40}([[:space:]]|$)"` (every ref that is not
a full SHA: numeric tags, branches, short SHAs; local `./` actions skipped), `grep -rn "docker://" .github/workflows/ | grep -v "@sha256:"`,
`grep -rn "pull_request_target" .github/workflows/`, `grep -rnE '\$\{\{\s*github\.event' .github/workflows/`,
`grep -rnE "npm (install|i)([[:space:]]|$)" .github/workflows/`, `grep -rnE "extra-index-url" .`,
`grep -rnE "torch\.load|trust_remote_code|from_pretrained" --include=*.py .`.

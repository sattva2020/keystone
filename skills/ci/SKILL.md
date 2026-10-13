---
name: ci
description: "Keystone: analyze the project and generate a CI/CD pipeline (GitHub Actions or GitLab CI) — lint, static analysis, tests with service containers, build, security — or enhance / audit an existing one against best practices. Commands come from the tools the project actually has. Nothing is written until you have seen the files and said yes. Use for 'ci', 'setup ci', 'github actions', 'gitlab ci', 'pipeline'."
argument-hint: "[github|gitlab] [--enhance]"
allowed-tools: Read Edit Glob Grep Write Bash(git *) Bash(mkdir *) AskUserQuestion
model: sonnet
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-ci/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# CI — pipeline configuration generator

Analyze a project and generate production-grade CI/CD configuration for GitHub Actions or GitLab CI: separate jobs for
linting, static analysis, tests and security scanning, adapted to the project's language, framework and existing tooling.
**Pipeline files are written only after you have shown them and got an explicit yes** (Step 6).

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

**Next step (mandatory).** End the answer with a `Next:` line that names the step in a few words, then put the exact
command on its own, on the following line(s), inside a fenced code block **with no language tag** — the app shows a
copy button on a code block. Never tag it ```bash: a `/keystone:*` command is not a shell command, and the bash tag
adds a Run button that would fail. When nothing runs now, write `Next: nothing now — waiting for <event>` and put the
later command in that fenced block. Never end on a caveat or an open-ended question.

**File links.** Every file you write or point the user to lives inside the session's working directory
(the folder Claude Code runs in — in a worktree, the worktree, never the main checkout), and its link is relative to
that directory: `[intent.md](wordpress-plugin/x/docs/keystone/<task>/intent.md)`, not relative to a nested repo or a
subproject. A file that must live outside it gets its absolute path. Check the link before showing it: the app opens
links only from the working directory.

| What exists | Mode | Action |
|---|---|---|
| No CI config | `generate` | Create the pipeline from scratch with interactive setup |
| CI config exists but incomplete | `enhance` | Audit & improve, add missing jobs |
| Full CI config | `audit` | Audit against best practices, fix gaps |

## Step 0 — Project context

Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md` (it often lists the build/test/lint commands — they
win over guesses); `docs/architecture.md`; `.claude/rules/**/*.md`; `AGENTS.md`. FALLBACK only when the project uses AI
Factory and those are absent: `.ai-factory/DESCRIPTION.md` (fallback), `.ai-factory/RULES.md` (fallback). MUST/MUST NOT lines are project rules
and apply to the generated pipeline. If nothing is there, Step 2 detects everything.

## Step 1 — Detect existing CI and mode

Glob `.github/workflows/*.y*ml`, `.gitlab-ci.yml`, `.circleci/config.yml`, `Jenkinsfile`, `.travis.yml`,
`bitbucket-pipelines.yml` → `HAS_GITHUB_ACTIONS`, `HAS_GITLAB_CI`, `HAS_OTHER_CI`.

- `$ARGUMENTS` contains `--enhance` → `enhance`.
- nothing found → `generate`; incomplete (e.g. tests but no lint) → `enhance`; lint + tests + static analysis → `audit`.
  For enhance/audit read every CI file (and GitLab `include:` targets) as `EXISTING_CONTENT` and take `PLATFORM` from it.
- Other CI found (CircleCI, Jenkins…): say so; this skill generates GitHub/GitLab only — ask before generating next to it.

**Interactive setup (generate).** `PLATFORM` from `$ARGUMENTS` (`github`/`gitlab`) or ask: GitHub Actions (Recommended) /
GitLab CI. Then, multi-select: security scanning (dependency audit, SAST) · coverage reporting · matrix builds · none.
Store `PLATFORM`, `WANT_SECURITY`, `WANT_COVERAGE`, `WANT_MATRIX`.

## Step 2 — Deep project analysis

- **Language:** `composer.json` PHP · `package.json` Node/TypeScript · `pyproject.toml`/`setup.py` Python · `go.mod` Go ·
  `Cargo.toml` Rust · `pom.xml` Java (Maven) · `build.gradle[.kts]` Java/Kotlin (Gradle).
- **Language version** from the project (`require.php`, `engines.node`/`.nvmrc`, `requires-python`, `go` directive,
  `rust-version`, compiler source level). Matrix: project minimum as the lowest plus the latest stable; no matrix: the
  latest version satisfying the constraint.
- **Package manager and install command** from the lock file: `composer.lock` → `composer install --no-interaction
  --prefer-dist`; `bun.lockb` → `bun install --frozen-lockfile`; `pnpm-lock.yaml` → `pnpm install --frozen-lockfile`;
  `yarn.lock` → `yarn install --frozen-lockfile`; `package-lock.json` → `npm ci`; `uv.lock` → `uv sync --all-extras
  --dev`; `poetry.lock` → `poetry install`; `requirements.txt` → `pip install -r requirements.txt`; `go.sum` → `go mod
  download`; `Cargo.lock` built-in.
- **Tools** (linters/formatters, static analysis, test frameworks with coverage flags, dependency audit) — detected from
  config files and dependencies; the tool → command table is in `${CLAUDE_SKILL_DIR}/references/TOOL-COMMANDS.md` — read
  it now. Use only tools present in the project.
- **Services:** grep `tests/` for `postgres|mysql|redis|mongo|rabbitmq|elasticsearch`, glob `docker-compose.test.yml`,
  `docker-compose.ci.yml` → `services_needed`.
- **Build step:** Node with a `build` script, Go, Rust, Java (`mvn package -DskipTests -B` / `./gradlew assemble`); PHP and
  Python usually none.

Build `PROJECT_PROFILE`: language + versions, package manager + lock file + install command, linters, static analyzers,
test framework + test/coverage command, security tools, `has_build_step` + command, `has_typescript`, `services_needed`,
`source_dir`.

## Step 3 — Best practices and templates

Read `${CLAUDE_SKILL_DIR}/references/BEST-PRACTICES.md`. Templates: `${CLAUDE_SKILL_DIR}/templates/github/<lang>.yml` or
`templates/gitlab/<lang>.yml` for `php`, `node`, `python`, `go`, `rust`, `java` — read the matching one as a base.

## Step 4 — Generate

**GitHub Actions — one workflow per concern**, each its own triggers, permissions and concurrency, so each check is a
separate status check in the PR, can be re-run alone and required independently:

| File | Jobs | Create when |
|---|---|---|
| `lint.yml` | code-style, lint, static-analysis, rector | linters or static analysis detected |
| `tests.yml` | tests (+ service containers, + matrix) | always |
| `build.yml` | build | `has_build_step` |
| `security.yml` | dependency-audit (weekly cron `0 6 * * 1`), dependency-review (PR only) | `WANT_SECURITY` |

A tiny project with just lint + tests may use a single `ci.yml`; from three concerns on, split. Every workflow starts with:

```yaml
name: <Name>
on:
  push:
    branches: [main]
  pull_request:
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
```

Per job: own checkout, language setup with built-in cache, dependency install (`shivammathur/setup-php@v2`,
`actions/setup-node@v4`, `astral-sh/setup-uv@v5` or `actions/setup-python@v5`, `actions/setup-go@v5`,
`dtolnay/rust-toolchain@stable` + `Swatinem/rust-cache@v2`, `actions/setup-java@v4`). Lint jobs run in parallel (no
`needs`). Matrix only on `tests`, with `fail-fast: false`; lint/static analysis on the latest version only. Biome replaces
both ESLint and Prettier; Ruff covers check + format. **Do not combine lint/static analysis with tests** — they must fail
independently. Upload coverage as an artifact when `WANT_COVERAGE`. Verify action versions are current before writing.

**GitLab CI** — single `.gitlab-ci.yml`, stages install → lint → test → build → security; structure, cache strategy and
report integration in `references/GITLAB-PATTERNS.md` (read it).

**Service containers** (`services_needed`): syntax for both platforms in `references/SERVICE-CONTAINERS.md`; every service
gets a health check.

**Quality check before showing:** every job has checkout/setup/install; cache keyed to the real lock file; every command
matches a tool in the project; matrix versions match the project's constraints; `concurrency` and `permissions:
contents: read` (GitHub) or `interruptible: true` and `workflow.rules` (GitLab); no needless `needs`. **No
over-engineering:** no jobs for absent tools, no matrix for a single target version, no security job unless requested or
the tools exist, no build job without a build step.

## Step 5 — Enhance / audit

Compare `EXISTING_CONTENT` with the profile. Missing jobs (a linter or static analysis installed but not run, tests
without a job, security tools without a job); configuration issues (no cache, no concurrency group, deprecated actions
such as `actions-rs`, hardcoded versions instead of matrix/variable, no `fail-fast: false`, `pull-push` cache policy on
every GitLab job); missing features (coverage, JUnit/code-quality reports, path filters for monorepos,
`workflow_dispatch`). Report format and fix flow → `references/AUDIT-REPORT.md` (read it). Present ✅/❌/⚠️ tables with
CRITICAL / HIGH / MEDIUM / LOW recommendations, then ask: fix all / fix critical only / show details first. Fixes
**preserve the existing structure, job names and ordering**.

## Step 6 — Show, confirm, write

Show every file to create or change (path, new/changed, content or diff) and ask for a yes; write only what was
approved. GitHub: `mkdir -p .github/workflows`, then only the files for detected concerns. GitLab: `.gitlab-ci.yml`.
Enhance/audit: `Edit` the existing files, adding or changing only what is needed.

## Step 7 — Summary

Summary per `references/AUDIT-REPORT.md` (Summary Display Template): platform, files, features, quick-start commands. Offer
in one line `/keystone:dockerize` (containerization) and `/keystone:docs`; do not invoke them. End with `Blocked on
me:` · `Changed:` · `Found:`.

## Ownership

CI artifacts only: `.github/workflows/*` and `.gitlab-ci.yml`. No other project file is touched. Secrets only as
`${{ secrets.X }}` / CI variables — never literal values.

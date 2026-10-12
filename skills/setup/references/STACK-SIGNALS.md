<!-- derived from ai-factory@2.19.0 skills/aif/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Stack signals — what to detect and what to propose

Read in `/keystone:setup` step 3. A signal is a file or fact in the repo; propose only what a signal supports.
Everything is a proposal shown to the user with a diff — nothing here is written automatically.

## 1. Commands (for `CLAUDE.md`)

| Signal | Build / test / lint / run |
|---|---|
| `package.json` `scripts` | the script names verbatim: `npm run build`, `npm test`, `npm run lint`, `npm start`/`dev` (use `pnpm`/`yarn`/`bun` per the lockfile) |
| `Makefile` / `justfile` / `Taskfile.yml` | targets named `build`, `test`, `lint`, `run`/`dev` |
| `pyproject.toml` / `requirements.txt` | `pytest` if configured, `ruff`/`flake8`/`black` if configured, `python -m <pkg>` or the `[project.scripts]` entry |
| `go.mod` | `go build ./...`, `go test ./...`, `go vet ./...` (`golangci-lint` if its config exists) |
| `Cargo.toml` | `cargo build`, `cargo test`, `cargo clippy`, `cargo run` |
| `composer.json` | `composer test`/`scripts` entries, `phpunit`, `artisan serve` (Laravel) |
| `pom.xml` / `build.gradle*` | `mvn verify` / `./gradlew build test` |
| `.github/workflows/*.yml` | the commands CI runs are the truth; prefer them over guesses |

A command not found in a file is written "not found", never invented.

## 2. Rules (`.claude/rules/base.md`)

| Signal | Rule line to propose |
|---|---|
| ESLint/Prettier/Biome config | MUST follow the configured formatter; run lint before commit |
| `tsconfig.json` `strict: true` | MUST NOT use `any` without a comment |
| `ruff`/`black`/`mypy` config | MUST keep type hints and formatter clean |
| consistent file naming in `src/` | MUST name files `<detected pattern>` |
| one logger module used everywhere | MUST log through it, never `console.log` / `print` |
| custom error classes | MUST throw them, not bare errors |

## 3. MCP servers (`.mcp.json`) — all `mcpServers.<name>`, Claude Code only

| Signal | Server | Entry | Env to set |
|---|---|---|---|
| `.git` and a `github.com` remote (`git remote -v`) | `github` | `npx -y @modelcontextprotocol/server-github` | `GITHUB_TOKEN` |
| `pg`/`postgres`/`psycopg`, Prisma, Drizzle, Supabase, `DATABASE_URL` in `.env.example` | `postgres` | `npx -y @modelcontextprotocol/server-postgres` | `DATABASE_URL` |
| `playwright`, `cypress`, `puppeteer`, `e2e/` or browser tests | `playwright` | `npx -y @playwright/mcp@latest` | none |
| any third-party libraries in a manifest | `context7` | `npx -y @upstash/context7-mcp` | none (optional key per its docs, as `${CONTEXT7_API_KEY}`) |
| needs advanced file operations (rare) | `filesystem` | `npx -y @modelcontextprotocol/server-filesystem .` | none |

Shape: `"env": {"GITHUB_TOKEN": "${GITHUB_TOKEN}"}`. Only `${VAR}` references — never a value. After the diff list the
variables the user must set; a server stays inactive until its variable exists. Check the package names against the
current docs (Context7 or the server's README) before writing: names change.

## 4. Plugins (recommend, user installs with `/plugin`)

| Signal | Recommendation |
|---|---|
| any project that keeps decisions in git | memory for the project: `sattva2020/memlab` (index of code and decision records) |
| typed language (TypeScript, Python with mypy, Go, Rust, Java, C#) | a code-intelligence / LSP plugin for that language — "search `/plugin` for <language> LSP"; no id unless you are sure |
| Keystone itself | already installed if this skill runs; nothing to add |
| frontend with a design system | search `/plugin` for design/UI plugins; offer, do not assume |

Write to `.claude/settings.json` only chosen ones: `{"enabledPlugins": {"<plugin>@<marketplace>": true}}`, plus
`extraKnownMarketplaces` when the marketplace is not built in. Merge; keep all other keys.

## 5. Environment variables — the closing list

| Variable | Needed by | Where to set |
|---|---|---|
| `GITHUB_TOKEN` | github MCP | user shell / OS environment (never in the repo) |
| `DATABASE_URL` | postgres MCP, the app | `.env` (git-ignored) or shell; `.env.example` holds a placeholder only |
| `CONTEXT7_API_KEY` | context7 (optional) | shell |

If `.env` is not in `.gitignore`, say so in the report — do not edit `.gitignore` without a diff and a yes.

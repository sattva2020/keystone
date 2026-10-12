---
name: dockerize
description: "Keystone: analyze the project and generate Docker configuration — multi-stage Dockerfile (dev/prod), compose.yml, compose.override.yml (dev), hardened compose.production.yml, .dockerignore, deploy scripts — or enhance / audit an existing setup, with a production security score. Reverse proxy is an option, not a default. Nothing is written until you have seen the files and said yes. Use for 'dockerize', 'add docker', 'docker compose', 'containerize', 'setup docker'."
argument-hint: "[--audit]"
allowed-tools: Read Edit Glob Grep Write Bash(git *) Bash(docker *) Bash(mkdir *) AskUserQuestion WebSearch WebFetch
model: sonnet
effort: high
disable-model-invocation: true
---
<!-- derived from ai-factory@2.19.0 skills/aif-dockerize/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Dockerize — Docker configuration generator

Analyze a project and generate a complete, production-grade Docker setup: multi-stage Dockerfile, Docker Compose for
development and production, `.dockerignore`, and a security audit of the result. **Project files are written only after
you have shown the user what will be written and got an explicit yes** (Step 6).

**Output rendering.** Report and summary templates in code blocks below show structure only. Render them as Markdown —
headings, tables, **bold** labels, bullet lists — never wrapped in a code block (it shows as a monospace wall); keep paths
and commands in `inline code`. The closing `Blocked on me:` / `Changed:` / `Found:` lines become three bullets with bold labels.

**Next step (mandatory).** The answer always ends with one line `Next: <the exact command with paths>` — e.g.
`Next: /keystone:verify docs/keystone/2026-10-12-x/plan.md` — or, when nothing is to be run now,
`Next: nothing now — waiting for <event>; then <command>`. Never end on a caveat or an open-ended question.

**Three modes based on what exists:**

| What exists | Mode | Action |
|---|---|---|
| Nothing | `generate` | Create everything from scratch with interactive setup |
| Only local Docker (no production files) | `enhance` | Audit & improve local, then create production config |
| Full Docker setup (local + prod) | `audit` | Audit everything against the checklist, fix gaps |

## Step 0 — Project context

Read, in this order, what exists: `CLAUDE.md` and `.claude/CLAUDE.md`; `docs/architecture.md`; `.claude/rules/**/*.md`;
`AGENTS.md`. FALLBACK only when the project uses AI Factory and those are absent: `.ai-factory/DESCRIPTION.md` (fallback),
`.ai-factory/RULES.md` (fallback). MUST/MUST NOT lines are project rules and apply to every generated file (an infra rule such as
"images pinned by digest" augments the templates). If absent, Step 2 detects everything.

## Step 1 — Detect existing files and mode

Glob: `Dockerfile`, `Dockerfile.*`, `docker-compose.y*ml`, `compose.y*ml`, `compose.override.yml`,
`compose.production.yml`, `.dockerignore`, `deploy/scripts/*.sh`. Flags: `HAS_DOCKERFILE`, `HAS_LOCAL_COMPOSE`,
`HAS_DEV_OVERRIDE`, `HAS_PROD_COMPOSE`, `HAS_DOCKERIGNORE`, `HAS_DEPLOY_SCRIPTS`.

- `$ARGUMENTS` contains `--audit` → `MODE = audit`.
- no Dockerfile and no compose → `generate` → ask the questions below.
- local compose, no `compose.production.yml` → `enhance`; read all existing Docker files as `EXISTING_CONTENT`.
- local + production compose → `audit`; read all existing files.

**Interactive setup (generate; in enhance only for what is missing).** Ask with AskUserQuestion, one question each:
database (PostgreSQL / MySQL-MariaDB / MongoDB / SQLite / None); **reverse proxy** (None — app serves directly /
Nginx / Traefik / Angie — a Nginx fork; None is the default for a single-service app with no SSL needs; PHP-FPM apps
need a web server, so there Nginx or Angie is the default suggestion); cache / broker, multi-select (Redis / Memcached /
RabbitMQ / None). Store as `USER_INFRA_CHOICES`; user choices override auto-detection, "None" removes a detected service.

## Step 2 — Deep project analysis

Every decision depends on this profile; detect, never assume.

- **Language → base image:** `go.mod` → `golang:<v>-alpine` / distroless; `package.json` → `node:<v>-alpine`;
  `pyproject.toml`/`setup.py` → `python:<v>-slim`; `composer.json` → `php:<v>-fpm-alpine`; `Cargo.toml` →
  `rust:<v>-slim` / distroless. `<v>` is read from the project (`go` directive, `engines.node`/`.nvmrc`,
  `requires-python`/`.python-version`, `require.php`, `rust-version`) — never hardcoded.
- **Framework and dev server** from the dependency files: Next/Nuxt/Express/Fastify/NestJS/Hono (3000), FastAPI/Django
  (8000), Flask (5000), Laravel/Symfony (8000), Gin/Echo/Fiber/Chi (8080) with the matching dev (hot reload) and prod command.
- **Package manager and lock file**; **entry point** (`cmd/*/main.go`, `package.json` main/start, `main.py`/`app.py`,
  `public/index.php`); **build output** (`dist/`, `.next/`, binary name, `public/`); **ports** (grep `PORT|listen|EXPOSE`);
  **`.env.example`** variables.
- **Infrastructure dependencies** by grep/glob: database (postgres, mysql, mongo, prisma/drizzle/alembic), cache
  (redis, memcached), queue (rabbitmq, bullmq, celery), search (elasticsearch, meilisearch, typesense), object storage
  (minio, s3), email (nodemailer, smtp), existing proxy config (`nginx.conf`, `angie.conf`).

Build `PROJECT_PROFILE`: language + version, framework, dev/prod command, package manager, lock file, entry point, build
dir, port, debug port, services, `has_build_step`, `env_vars`.

## Step 3 — References and templates

Read `${CLAUDE_SKILL_DIR}/references/BEST-PRACTICES.md` and `${CLAUDE_SKILL_DIR}/references/SECURITY-CHECKLIST.md`. Read
on demand: `ANGIE-ACME.md` (only if Angie was chosen and HTTPS is needed), `COMPOSE-LIFECYCLE-HOOKS.md` (non-root
service with named-volume ownership or stop hooks, Compose 2.30+), `COMPOSE-PATTERNS.md` (env strategy),
`AUDIT-GUIDE.md`, `FILE-ORGANIZATION.md`, `DEPLOY-SCRIPTS.md`, `SUMMARY-FORMAT.md`.

Templates in `${CLAUDE_SKILL_DIR}/templates/`: `dockerfile-go|node|php|python`, `compose-base.yml`,
`compose-override-dev.yml`, `compose-production.yml`, `dockerignore`, and the scripts `deploy.sh`, `update.sh`,
`logs.sh`, `health-check.sh`, `rollback.sh`, `backup.sh`. They are base structures to customize, not copy blindly.

## Step 4 — Generate (generate mode; enhance creates the missing ones)

1. **Dockerfile** from the language template: base-image version from the project; entry point, build and dev (hot
   reload) / prod commands; ports (app + debug port in the dev stage); package-manager commands and lock file in COPY.
   Four stages: `deps` (production deps only) → `builder` (all deps + build) → `development` (hot reload, debug port) →
   `production` (minimal image, non-root user, runtime artifacts only). BuildKit cache mounts for dependency installs.
   **Verify infrastructure image versions online** (WebSearch `<service> docker official image latest version`): the
   latest stable `major.minor`, never `:latest`, so `docker compose pull` does not hit a non-existent tag.
2. **compose.yml** (base): top-level `name: ${COMPOSE_PROJECT_NAME}`; `app` with `build.target: production`, healthcheck,
   `depends_on` with `condition: service_healthy`; only the services detected in Step 2 or chosen in Step 1, each with a
   healthcheck and named volume. A reverse proxy only if chosen: on a `frontend` network, proxying to `app` on `backend`;
   its config under `docker/<proxy>/`. Env strategy → `references/COMPOSE-PATTERNS.md`.
3. **compose.override.yml** (dev): `build.target: development`, bind mount `.:/app`, exposed ports, dev command, `mailpit`
   (profile `dev`) if email is detected. **No database admin UIs** — native clients via the exposed DB port. If dev uses
   air or nodemon, make sure its config exists and points at the right entry point.
4. **compose.production.yml** (hardened overlay): pre-built registry image (no `build:`); on every service
   `read_only: true`, `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]` with selective `cap_add`,
   `user: "1001:1001"`, `tmpfs` for `/tmp` with `noexec,nosuid,size=100m`, CPU/memory/PID limits, log rotation
   (`max-size: 20m, max-file: 5`), `restart: unless-stopped`; `backend` network `internal: true`; secrets via a gitignored
   `.env`, never in compose; YAML anchors (`x-logging`, `x-security`); **no `ports:` on infrastructure services**; only
   the proxy (or the app without a proxy) publishes 80/443; if a port must be published bind `127.0.0.1:5432:5432`; no
   debug ports, no dev tools.
5. **.dockerignore** from the template plus language exclusions (Go `bin/`; Node `node_modules/ .next/ out/`; Python
   `__pycache__/ .venv/ *.pyc`; PHP `vendor/ storage/ bootstrap/cache/`).

**Quality and over-engineering check before showing anything** (Over-Engineering Checklist in SECURITY-CHECKLIST.md):
four stages, non-root and minimal production stage, healthchecks everywhere, hardening/limits/log rotation on every
production service, `.dockerignore` excludes `.git`, deps, `.env*`, Docker files. And remove: services the code does not
import; a proxy for a single-service app without SSL needs; deploy scripts if the project deploys via CI/CD; backup
scripts with a managed DB; separate frontend/backend networks with only app + DB. Complexity matches project size.

## Step 5 — Enhance / audit

Read `${CLAUDE_SKILL_DIR}/references/AUDIT-GUIDE.md`. Audit `EXISTING_CONTENT`: Dockerfile (pinning, minimal base,
multi-stage, non-root, no secrets in ENV/ARG, BuildKit, HEALTHCHECK); compose per service (read_only, no-new-privileges,
cap_drop ALL, user, tmpfs, limits, healthcheck, log rotation, restart); network (internal backend, no host networking,
no Docker socket); secrets (`.env` ignored, `.env.example` exists); gaps (services in code but not in compose).
Present ✅/❌/⚠️ tables, then ask: fix all / fix critical only / show details / export report to `docs/docker-audit.md`.
Fixes preserve the existing structure and naming.

## Step 6 — Show, confirm, write

List every file to create or change (path, new/changed, one line why) with the content or diff, then ask for a yes. Write
only what was approved — layout in `references/FILE-ORGANIZATION.md`: root `Dockerfile`, `compose*.yml`, `.dockerignore`;
`docker/` only for configs actually needed; `deploy/scripts/` for Step 8. Create `.env.example` if missing and make sure
`.env` is in `.gitignore` (both shown first). In audit/enhance write only changed or new files.

## Step 7 — Security checklist and score (always)

Run `references/SECURITY-CHECKLIST.md` over the final `compose.production.yml`: container isolation, network and ports,
resources, secrets, health and logging, images. Show a compact `[x]`/`[ ]` checklist and a score (passed/total); if
anything fails offer to fix it now.

## Step 8 — Deploy scripts

Only for production setups that are deployed by script (not by CI/CD): generate `deploy/scripts/{deploy,update,logs,
health-check,rollback,backup}.sh` from the templates per `references/DEPLOY-SCRIPTS.md` (customization points; skip
`backup.sh` for a managed DB) — shown and confirmed like everything else.

## Step 9 — Summary

Summarize created and updated files in the format of `references/SUMMARY-FORMAT.md`; offer, in one line, `/keystone:docs`
(document the setup) and `/keystone:ci` (pipeline); if the project deploys on Dokploy and `.mcp.json` has no `dokploy`
server, mention the Dokploy MCP (`npx -y @sattva/dokploy-mcp@latest`, https://github.com/sattva2020/dokploy-mcp) that
`/keystone:setup` adds after a yes. Do not invoke them. End with `Blocked on me:` · `Changed:` · `Found:`.

## Ownership

Docker artifacts only: `Dockerfile`, `compose*.yml`, `.dockerignore`, `docker/*`, `deploy/scripts/*`, `.env.example` and
the `.gitignore` line for `.env`. No other project file is touched. Run `docker compose config` to validate when Docker
is available; never start containers or push images without being asked.

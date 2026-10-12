<!-- derived from ai-factory@2.19.0 skills/aif-security-checklist/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Security checklist (OWASP Top 10:2025 + LLM + agent + supply chain + races)

Compressed from the upstream checklist. Each category: what to look for, the unsafe/safe shape, grep starters.
Item IDs for the ignore-list are in the severity table at the end. Patterns for auth → `AUTH.md`,
LLM → `PROMPT-INJECTION.md`, agent/MCP → `AGENT-MCP.md`, supply chain/CI → `SUPPLY-CHAIN.md`, races → `RACE.md`,
id → standard mapping → `MAPPING.md`. Section tags below are OWASP Top 10:2025 ids.

## Pre-deployment checklist (Must Fix Before Production)
- [ ] No secrets in code or git history
- [ ] All user input is validated and sanitized
- [ ] Authentication on all protected routes
- [ ] HTTPS enforced (no HTTP)
- [ ] SQL/NoSQL injection prevented
- [ ] XSS protection in place
- [ ] CSRF tokens on state-changing requests
- [ ] Rate limiting enabled
- [ ] Error messages don't leak sensitive info
- [ ] Client-side debug logging is disabled in production or guarded by an explicit non-production environment check
- [ ] Production UI never displays raw errors, stack traces, exception messages, SQL errors, request internals, or upstream service details
- [ ] Dependencies scanned for vulnerabilities
- [ ] LLM prompt injection mitigated (if using AI)
- [ ] Race conditions prevented on critical operations (payments, inventory)

## Authentication and sessions [A07:2025 Authentication Failures]
- Passwords: min 12 chars; bcrypt/argon2 (cost ≥ 12); never plain text, never logged; breach check (HaveIBeenPwned) optional.
- Sessions: ID regenerated after login; idle + absolute timeout; Secure/HttpOnly/SameSite flags; invalidated on logout.
- JWT: RS256/ES256 for distributed systems; 15 min access / 7 day refresh; validate iss, aud, exp, iat; refresh token in an
  httpOnly cookie; revocation; no sensitive data in the payload.
- Look for: `jwt.decode` without verify, `algorithm: 'none'`, hand-rolled hashing (md5/sha1 on passwords), routes
  registered without an auth middleware, role checks only in the UI.

## Injection [A05:2025 Injection]
- SQL: concatenated or interpolated queries are critical; parameterized queries or an ORM are safe.
  Starter: `grep -rnE "(query|execute|raw)\(.*(\$\{|\+ )" src/`
- NoSQL: `findOne({ username: req.body.username })` accepts `{ "$ne": "" }`; validate types with a schema (zod).
- Command: ``exec(`convert ${name} out.png`)`` is unsafe; `execFile('convert', [name, 'out.png'])` is safe.
  Starter: `grep -rnE "(exec|execSync|system|popen|shell_exec)\(" src/`
- Path traversal (CWE-22): user-controlled file paths without a base-directory check.
- Code injection (CWE-94): `eval`, `new Function`, `vm.runIn*`, `exec()` on a string, template engines fed user templates (SSTI).
  Starter: `grep -rnE "(eval|new Function|vm\.run)" src/`. Not a finding when the string is a constant or server-controlled.
- SSRF (CWE-918) [A01:2025]: a server-side fetch (`fetch`, `axios`, `requests.get`, `curl`) of a user-supplied URL with no allow-list
  of hosts/schemes and no block of private ranges (127.0.0.0/8, 10/8, 169.254.169.254, ::1) after DNS resolution. URLs from settings/env are not a finding.
- File upload (CWE-434): type/extension trusted from the client, stored under the web root or executable path, original filename
  used in the path, no size limit. Safe: server-side content sniffing, random name, non-executable storage.
- Deserialization (CWE-502) [A08:2025]: `pickle.load`, `yaml.load` (not `safe_load`), PHP `unserialize`, Java `ObjectInputStream`,
  `node-serialize` on data from outside the trust boundary. Safe: JSON + schema validation.

## XSS [A05:2025]
- Output HTML-encoded by default; CSP header; `X-Content-Type-Options: nosniff`; sanitize rich text (DOMPurify); validate URLs
  before rendering links.
- Unsafe: `innerHTML = userInput`, `dangerouslySetInnerHTML`, Blade `{!! $x !!}`, `<?= $x ?>`. Safe: `textContent`, `{userInput}`,
  `{{ $x }}`, `htmlspecialchars($x, ENT_QUOTES, 'UTF-8')`.
- CSP baseline: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'`

## CSRF [A01:2025 Broken Access Control]
- Tokens on all state-changing requests; SameSite=Strict or Lax; verify Origin/Referer; no state change on GET.
- Server-rendered: csurf-style hidden field and AJAX header. SPA: double-submit cookie (readable cookie, token in header).
- Not applicable (ignore with a reason) for pure bearer-token APIs that use no cookies.

## Secrets [A02:2025 Security Misconfiguration · CWE-798]
- Never in code (`const API_KEY = "sk_live_…"`), in git (`.env` committed), in logs, in error messages, in client bundles.
- Do: env vars or a vault; `.env` in `.gitignore`; separate secrets per environment; rotation; access auditing.
- If a secret was committed: rotate it first (history rewrite with `git filter-branch`/BFG is cosmetic once exposed), then
  coordinate any force-push with the team. Keystone never rewrites history itself.
- Starter: `grep -rnE "(password|secret|api_?key|token|private_key)\s*[:=]\s*['\"][^'\"]{8,}" .`

## API security [A01:2025, A06:2025]
- API keys in headers, not URLs; rate limiting per user/IP; request signing for sensitive operations; OAuth 2.0 for third parties.
- Validate every input with a schema; return stable client-safe codes (`VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`,
  `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`) plus a request ID; log full detail server-side only.
- Never expose `password`, `passwordHash`, internal IDs in responses; object-level authorization on every `:id` route (IDOR).
- Client-facing logging: `console.log/debug/info/trace` and verbose telemetry gated by an explicit non-production check;
  raw exceptions, stack traces, SQL/ORM errors, validation internals, upstream responses, file paths, env names never reach UI text.
  Starters: `grep -rnE "console\.(log|debug|info|trace)" src/`, `grep -rnE "(error|err)\.message|String\((error|err)\)|\.stack" src/`

## Infrastructure [A02:2025]
- Headers (helmet or manual): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0` (use CSP),
  `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Dependencies and CI: see Software Supply Chain below.
- Deployment: HTTPS only with redirect; TLS 1.2+; debug mode off; default credentials changed; unnecessary ports closed;
  restricted file permissions; logging without secrets; encrypted backups; WAF/DDoS protection for public APIs.
- Containers/CI: no secrets in image layers or workflow files, pinned base images, non-root user.

## Software Supply Chain Failures [A03:2025] (details → SUPPLY-CHAIN.md)
- Lockfile committed and used in CI (`npm ci`, `--frozen-lockfile`, `pip --require-hashes`); no `*` / `latest` / git-URL ranges.
- Dependencies scanned: `npm audit --audit-level=high` / `pip-audit` / `cargo audit` (no network → `UNASSESSED`, not pass).
- GitHub Actions pinned to a full commit SHA, minimal `permissions:`, no untrusted `${{ github.event.* }}` in `run:`.
- Pinned base images; install scripts and unknown/typosquatted package names reviewed. Threat model: external attacker only.

## Mishandling of Exceptional Conditions [A10:2025]
- Fail-open: `catch` that returns allow/true/null on an auth, payment or validation error; a missing `else` that grants access.
  Starter: `grep -rnE "catch\s*(\(\w*\))?\s*\{\s*(return (true|null)|\})" src/`
- Swallowed errors: empty `catch`, `except: pass`, `.catch(() => {})` around security- or money-relevant calls.
- Error details to the client: stack traces, SQL errors, upstream responses, paths (see API security).
- Unhandled promise / exception paths: un-awaited promises on critical writes, no `unhandledRejection` handling, no timeout on
  external calls, partial transactions without rollback.

## Race conditions (details → RACE.md)
- Financial operations in transactions with proper isolation; atomic decrement for stock (not read-then-write);
  idempotency keys on payment/mutation endpoints; optimistic locking (version column); exclusive file locks where needed;
  no TOCTOU gap between permission check and action; rate limiting to shrink the exploitation window.
- Look for: a `findOne` followed by an update of the same record, `if (balance >= x)` then a separate write, `access()` then `open()`.

## Prompt injection / LLM (details → PROMPT-INJECTION.md, LLM Top 10 2026)
- User input never concatenated into system prompts; clear input/output boundaries (roles, delimiters); LLM output treated as
  untrusted (never executed, never rendered as HTML, never put into SQL); tool calls validated against an allow-list and
  sandboxed; sensitive data excluded from context; rate limiting on LLM endpoints; output filtered for PII/secrets;
  monitoring for anomalous prompts.
- Starters: `grep -rnE "system.*\$\{" src/`, `grep -rnE "innerHTML.*(llm|response|completion)" src/`

## Quick audit commands
```bash
npm audit --audit-level=high
grep -rnE "(TODO|FIXME|XXX).*security" .
bash ${CLAUDE_SKILL_DIR}/scripts/audit.sh   # secrets, tracked .env, .gitignore, npm audit, console.*, raw errors, security TODOs
```

## Severity reference (ignore-list item id in brackets)
| Issue | Severity | Fix timeline |
|---|---|---|
| SQL injection [no-sql-injection] | Critical | Immediate |
| Auth bypass [no-auth-{route}] | Critical | Immediate |
| Secrets exposed [no-secret-rotation] | Critical | Immediate |
| XSS (stored) [no-xss] | Critical | < 24 hours |
| Prompt injection, direct [no-prompt-injection] | Critical | Immediate |
| Race condition, financial [no-race-condition] | Critical | Immediate |
| Prompt injection, indirect | High | < 1 week |
| Race condition, data | High | < 1 week |
| CSRF [no-csrf] | High | < 1 week |
| XSS (reflected) | High | < 1 week |
| Secret literal in `.mcp.json` / settings [mcp-secret-literal] | Critical | Immediate |
| Workflow expression injection / `pull_request_target` + PR checkout [no-ci-hardening] | High | < 1 week |
| SSRF, unrestricted upload, unsafe deserialization, eval on user input | High–Critical (by reach) | < 1 week |
| Fail-open `catch` on auth/payment | High | < 1 week |
| Actions not SHA-pinned, `npx -y` unpinned [no-mcp-pin] | Medium | < 2 weeks |
| Missing rate limit [no-rate-limit] | Medium | < 2 weeks |
| Verbose errors [verbose-errors] | Medium | < 2 weeks |
| Missing headers [no-xss-csp, no-https] | Low | < 1 month |

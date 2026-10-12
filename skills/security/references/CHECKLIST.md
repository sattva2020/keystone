<!-- derived from ai-factory@2.19.0 skills/aif-security-checklist/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Security checklist (OWASP Top 10 + LLM + races)

Compressed from the upstream checklist. Each category: what to look for, the unsafe/safe shape, grep starters.
Item IDs for the ignore-list are in the severity table at the end. Patterns for auth → `AUTH.md`,
LLM → `PROMPT-INJECTION.md`, races → `RACE.md`.

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

## Authentication and sessions
- Passwords: min 12 chars; bcrypt/argon2 (cost ≥ 12); never plain text, never logged; breach check (HaveIBeenPwned) optional.
- Sessions: ID regenerated after login; idle + absolute timeout; Secure/HttpOnly/SameSite flags; invalidated on logout.
- JWT: RS256/ES256 for distributed systems; 15 min access / 7 day refresh; validate iss, aud, exp, iat; refresh token in an
  httpOnly cookie; revocation; no sensitive data in the payload.
- Look for: `jwt.decode` without verify, `algorithm: 'none'`, hand-rolled hashing (md5/sha1 on passwords), routes
  registered without an auth middleware, role checks only in the UI.

## Injection
- SQL: concatenated or interpolated queries are critical; parameterized queries or an ORM are safe.
  Starter: `grep -rnE "(query|execute|raw)\(.*(\$\{|\+ )" src/`
- NoSQL: `findOne({ username: req.body.username })` accepts `{ "$ne": "" }`; validate types with a schema (zod).
- Command: ``exec(`convert ${name} out.png`)`` is unsafe; `execFile('convert', [name, 'out.png'])` is safe.
  Starter: `grep -rnE "(exec|execSync|system|popen|shell_exec)\(" src/`
- Path traversal: user-controlled file paths without a base-directory check.

## XSS
- Output HTML-encoded by default; CSP header; `X-Content-Type-Options: nosniff`; sanitize rich text (DOMPurify); validate URLs
  before rendering links.
- Unsafe: `innerHTML = userInput`, `dangerouslySetInnerHTML`, Blade `{!! $x !!}`, `<?= $x ?>`. Safe: `textContent`, `{userInput}`,
  `{{ $x }}`, `htmlspecialchars($x, ENT_QUOTES, 'UTF-8')`.
- CSP baseline: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'`

## CSRF
- Tokens on all state-changing requests; SameSite=Strict or Lax; verify Origin/Referer; no state change on GET.
- Server-rendered: csurf-style hidden field and AJAX header. SPA: double-submit cookie (readable cookie, token in header).
- Not applicable (ignore with a reason) for pure bearer-token APIs that use no cookies.

## Secrets
- Never in code (`const API_KEY = "sk_live_…"`), in git (`.env` committed), in logs, in error messages, in client bundles.
- Do: env vars or a vault; `.env` in `.gitignore`; separate secrets per environment; rotation; access auditing.
- If a secret was committed: rotate it first (history rewrite with `git filter-branch`/BFG is cosmetic once exposed), then
  coordinate any force-push with the team. Keystone never rewrites history itself.
- Starter: `grep -rnE "(password|secret|api_?key|token|private_key)\s*[:=]\s*['\"][^'\"]{8,}" .`

## API security
- API keys in headers, not URLs; rate limiting per user/IP; request signing for sensitive operations; OAuth 2.0 for third parties.
- Validate every input with a schema; return stable client-safe codes (`VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`,
  `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`) plus a request ID; log full detail server-side only.
- Never expose `password`, `passwordHash`, internal IDs in responses; object-level authorization on every `:id` route (IDOR).
- Client-facing logging: `console.log/debug/info/trace` and verbose telemetry gated by an explicit non-production check;
  raw exceptions, stack traces, SQL/ORM errors, validation internals, upstream responses, file paths, env names never reach UI text.
  Starters: `grep -rnE "console\.(log|debug|info|trace)" src/`, `grep -rnE "(error|err)\.message|String\((error|err)\)|\.stack" src/`

## Infrastructure
- Headers (helmet or manual): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0` (use CSP),
  `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Dependencies: `npm audit --audit-level=high` / `pip-audit` / `cargo audit`; update regularly.
- Deployment: HTTPS only with redirect; TLS 1.2+; debug mode off; default credentials changed; unnecessary ports closed;
  restricted file permissions; logging without secrets; encrypted backups; WAF/DDoS protection for public APIs.
- Containers/CI: no secrets in image layers or workflow files, pinned base images, non-root user.

## Race conditions (details → RACE.md)
- Financial operations in transactions with proper isolation; atomic decrement for stock (not read-then-write);
  idempotency keys on payment/mutation endpoints; optimistic locking (version column); exclusive file locks where needed;
  no TOCTOU gap between permission check and action; rate limiting to shrink the exploitation window.
- Look for: a `findOne` followed by an update of the same record, `if (balance >= x)` then a separate write, `access()` then `open()`.

## Prompt injection (details → PROMPT-INJECTION.md)
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
| Missing rate limit [no-rate-limit] | Medium | < 2 weeks |
| Verbose errors [verbose-errors] | Medium | < 2 weeks |
| Missing headers [no-xss-csp, no-https] | Low | < 1 month |

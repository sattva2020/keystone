<!-- derived from ai-factory@2.19.0 skills/aif-security-checklist/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Security checklist (OWASP Top 10:2025 incl. A04 crypto and A09 logging + LLM + agent + supply chain + IaC + races)

Compressed from the upstream checklist. Each category: what to look for, the unsafe/safe shape, grep starters.
Item IDs for the ignore-list are in the severity table at the end. Patterns for auth → `AUTH.md`,
LLM → `PROMPT-INJECTION.md`, agent/MCP → `AGENT-MCP.md`, supply chain/CI → `SUPPLY-CHAIN.md`, races → `RACE.md`,
Dockerfile/Kubernetes/Terraform → `IAC.md`, id → standard mapping → `MAPPING.md`. Section tags below are OWASP Top 10:2025 ids
(A04 Cryptographic Failures and A09 Logging have their own sections).

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
- JWT algorithm confusion (RS256 → HS256), `kid` / `jku` / `x5u` / `jwk` header trust, weak HS256 secret → `AUTH.md` § Algorithm and
  key-header trust. OAuth 2.0 / OIDC (`redirect_uri` exact match, PKCE `S256`, `state` / `nonce`, single-use code, `iss` / `aud`,
  implicit flow) → `AUTH.md` § OAuth 2.0 / OIDC. Account enumeration → `AUTH.md`.

## Injection [A05:2025 Injection]
- SQL: concatenated or interpolated queries are critical; parameterized queries or an ORM are safe.
  Starter: `grep -rnE "(query|execute|raw)\(.*(\$\{|\+ )" src/`
- NoSQL: `findOne({ username: req.body.username })` accepts `{ "$ne": "" }`; validate types with a schema (zod).
- Command: ``exec(`convert ${name} out.png`)`` is unsafe; `execFile('convert', [name, 'out.png'])` is safe.
  Starter: `grep -rnE "(exec|execSync|system|popen|shell_exec)\(" src/`
- Path traversal (CWE-22): user-controlled file paths without a base-directory check.
- Code injection (CWE-94): `eval`, `new Function`, `vm.runIn*`, `exec()` on a string, template engines fed user templates (SSTI).
  Starter: `grep -rnE "\b(eval|new Function|vm\.run)" src/`. Not a finding when the string is a constant or server-controlled.
- SSRF (CWE-918) [A01:2025]: a server-side fetch (`fetch`, `axios`, `requests.get`, `curl`) of a user-supplied URL with no allow-list
  of hosts/schemes and no block of private ranges after DNS resolution: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`, `169.254.0.0/16` (incl. `169.254.169.254`), `0.0.0.0/8`, `100.64.0.0/10`, `::1`, `fc00::/7` (incl. `fd00::/8`),
  `fe80::/10`, IPv4-mapped `::ffff:0:0/96`. Only `http`/`https` schemes (`file://`, `gopher://`, `dict://` accepted → finding);
  each redirect target is checked again. URLs from settings/env are not a finding.
- File upload (CWE-434): type/extension trusted from the client, stored under the web root or executable path, original filename
  used in the path, no size limit. Safe: server-side content sniffing, random name, non-executable storage.
- Deserialization (CWE-502) [A08:2025]: `pickle.load`, `yaml.load` (not `safe_load`), PHP `unserialize`, Java `ObjectInputStream`,
  `node-serialize` on data from outside the trust boundary. Safe: JSON + schema validation.
- XXE (CWE-611) and entity expansion (CWE-776) [A02:2025]: an XML parser with external entities or DTDs enabled reads untrusted XML
  (SOAP, SAML, SVG/DOCX upload, RSS): Java `DocumentBuilderFactory` / `SAXParserFactory` without `disallow-doctype-decl`, PHP / libxml
  with `LIBXML_NOENT`, Python `lxml` with `resolve_entities=True`, .NET `XmlReader` with `DtdProcessing.Parse` → high (file read, SSRF);
  billion laughs → medium (DoS). Safe: DTDs disabled, `defusedxml` in Python.
  Starter: `grep -rnE "DocumentBuilderFactory|SAXParserFactory|XMLInputFactory|LIBXML_NOENT|resolve_entities|DtdProcessing|xml\.etree|xml2js" .`
  Not a finding: XML only from the project's own files or a trusted internal service; a parser whose current default disables
  external entities (check the library version) and no code turns them back on.
- Prototype pollution (CWE-1321) [A05:2025]: a deep merge / assign / `set(path)` of untrusted JSON lets `__proto__` or
  `constructor.prototype` keys through → high when the polluted property reaches an authorization check, a template or a spawn
  option; otherwise medium. Safe: reject those keys, `Object.create(null)`, a schema with `additionalProperties: false`, `Map`.
  Starter: `grep -rnE "(merge|extend|defaultsDeep|assignIn|setWith|set)\(.*(req\.|body|query|params)" .`
  Not a finding: a shallow `Object.assign` / spread of parsed JSON (an own `__proto__` key does not change the prototype); merge of
  server-side config only.

- Destructive operations on derived paths [A05:2025 · CWE-73 · CWE-22]: `rm -rf`, `fs.rm`, `shutil.rmtree`, `os.RemoveAll`, `DROP TABLE/DATABASE` with a path or
  name built from request/user input (`rm -rf "$DIR/$NAME"`; env-only values are not a finding, see DO-NOT-FLAG.md) and no guard against empty or `/` (unset var → `rm -rf /`) or against leaving the intended root.
  Safe: `${VAR:?}`, resolve + `startsWith(root)`, allow-list of names. A constant or server-only value in a dev script → DO-NOT-FLAG.md.

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
- If a secret was committed: rotate it first (history rewrite with `git filter-repo`/BFG is cosmetic once exposed), then
  coordinate any force-push with the team. Keystone never rewrites history itself.
- Starter: `grep -rnE "(password|secret|api_?key|token|private_key)\s*[:=]\s*['\"][^'\"]{8,}" .`

## Cryptographic Failures [A04:2025] (category `crypto`)
- Broken or risky algorithms (CWE-327): ECB mode for any block cipher; DES, 3DES, RC4, Blowfish; MD5 / SHA-1 for signatures,
  MACs or integrity checks (passwords → Authentication). Safe: AES-GCM or ChaCha20-Poly1305, SHA-256+, HMAC.
- Weak randomness for secrets (CWE-338): `Math.random`, Python `random.*`, `java.util.Random`, Go `math/rand` for tokens, keys, IVs,
  nonces, reset codes, session ids. Safe: `crypto.randomBytes` / `crypto.randomUUID`, `secrets`, `SecureRandom`, `crypto/rand`.
- IV / nonce reuse (CWE-323): a constant or reused IV/nonce with the same key (AES-GCM nonce reuse breaks confidentiality and
  integrity). Safe: a fresh random 96-bit nonce per message, or a counter that never repeats per key.
- Key strength and padding (CWE-326): RSA < 2048 bits; RSA encryption with PKCS#1 v1.5 instead of OAEP.
- Password-based keys (CWE-916): PBKDF2 below 600 000 iterations for HMAC-SHA-256 (OWASP Password Storage Cheat Sheet), a plain
  hash as KDF. Safe: Argon2id, scrypt, bcrypt, or PBKDF2 at the current OWASP count.
- Hardcoded keys / IVs (CWE-321): key or IV literals in code or config (secrets → Secrets).
- TLS verification disabled in production code (CWE-295) → high: `verify=False`, `rejectUnauthorized: false`,
  `InsecureSkipVerify: true`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `curl -k` / `--insecure` in deploy scripts. Server config that
  enables TLS 1.0 / 1.1 / SSLv3 or export / NULL / RC4 cipher suites → medium.
- Starters: `grep -rnE "AES/ECB|MODE_ECB|createCipheriv\('(des|rc4|bf)|DES|RC4|Blowfish" .`,
  `grep -rnE "Math\.random|random\.(random|randint|choice)|java\.util\.Random|math/rand" .`,
  `grep -rnE "verify\s*=\s*False|rejectUnauthorized:\s*false|InsecureSkipVerify:\s*true|NODE_TLS_REJECT_UNAUTHORIZED|curl -k|--insecure" .`,
  `grep -rnE "PKCS1v15|RSA_PKCS1_PADDING|pbkdf2|iterations" .`,
  `grep -rnE "(md5|sha1|SHA-1|MD5)\b.*(sign|hmac|verify|integrity)|createHash\('(md5|sha1)'\)" .` (MD5 / SHA-1 for signatures or integrity),
  `grep -rnE "(iv|nonce|IV|Nonce)\s*[:=]\s*(b?['\"]|Buffer\.from\(['\"]|bytes\(|new byte)" .` (static IV / nonce),
  `grep -rnE "(key|secret|iv)\s*[:=]\s*(b?['\"][A-Za-z0-9+/=]{16,}['\"]|Buffer\.from\(['\"])" .` (hardcoded keys / IVs),
  `grep -rnE "TLSv1(\.0|\.1)?\b|SSLv3|ssl_protocols|MinVersion|minVersion|secureProtocol" .` (TLS versions in server config)
- Not a finding: a hash not used for security (ETag, cache key, file checksum against corruption), `Math.random` in UI animation or
  sampling, `verify=False` in tests or against a local dev server.

## Security Logging and Alerting Failures [A09:2025] (category `logging`)
- Secrets, tokens, passwords, full card numbers or other PII written to logs (CWE-532) → high when the logs leave the host
  (log service, CI output) — name the variable, never print the value.
- Log injection (CWE-117): user input with CR/LF written into a log line unescaped, so an attacker forges entries → medium.
  Safe: structured (JSON) logging or escaping `\r\n`.
- No record of security events (CWE-778): failed logins, authorization denials, password resets, admin actions are not logged on
  the auth path → low with a traced path (an attack would go unseen); otherwise a hardening suggestion.
- Starters: `grep -rnE "(log|logger|console)\.\w+\(.*(password|token|secret|authorization|cookie)" .`,
  `grep -rnE "(log|logger)\.\w+\(.*req\.(body|query|params|headers)" .`

## API security [A01:2025, A06:2025]
- API keys in headers, not URLs; rate limiting per user/IP; request signing for sensitive operations; OAuth 2.0 for third parties.
- Validate every input with a schema; return stable client-safe codes (`VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`,
  `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`) plus a request ID; log full detail server-side only.
- Never expose `password`, `passwordHash`, internal IDs in responses; object-level authorization on every `:id` route (IDOR).
- Mass assignment (CWE-915): the whole request body is bound to a model or ORM call (`Model.create(req.body)`, `update(**request.json)`,
  `Object.assign(user, req.body)`, Rails without strong params) so a client sets `role`, `isAdmin`, `balance`, `price`,
  `is_verified` → high. Safe: an explicit allow-list / DTO of writable fields, a schema with `additionalProperties: false`.
  Starter: `grep -rnE "(create|update|insert|save|assign)\((req|request)\.(body|json)|\*\*request\.(json|data|POST)" .`
  Not a finding: the body passes a schema / serializer that lists writable fields first; the model has no privileged field.
- GraphQL: no depth / complexity / alias / batch limit (CWE-770) → medium (DoS); a sensitive field or mutation without a
  field-level authorization check → high; introspection on in production → a hardening suggestion unless the schema exposes
  something the attacker could not otherwise learn. Starter: `grep -rnE "introspection|depthLimit|costAnalysis|createComplexityLimitRule" .`
  Not a finding: an internal GraphQL endpoint reachable only by trusted services; persisted (allow-listed) queries only.
- Open redirect (CWE-601): `res.redirect(req.query.next)`, `return redirect(request.args["url"])` without an allow-list of paths or
  hosts → medium; high when it is an OAuth `redirect_uri` or a login `next` that carries tokens. Safe: relative paths only, or an
  allow-list. Starter: `grep -rnE "redirect\((req|request)\.|Location.*(req|request)\." .`
  Not a finding: the target is checked to be a relative path (starts with `/`, not `//`) or against an allow-list before the redirect.
- CORS with credentials (CWE-942): `Access-Control-Allow-Origin` reflects the request `Origin` (or allows `null`) while
  `Access-Control-Allow-Credentials: true` → high (any site reads the user's data). Safe: a fixed allow-list of origins.
  Starter: `grep -rnE "Access-Control-Allow-(Origin|Credentials)|origin:\s*(true|\*)|cors\(" .`
  Not a finding: `*` without credentials on public, unauthenticated data; reflection checked against a fixed allow-list.
- WebSocket (CWE-1385): the upgrade does not check `Origin` while the socket is authenticated by cookie (cross-site WebSocket
  hijacking) → high; authorization checked only at the handshake, not per message / per subscribed resource → medium.
  Starter: `grep -rnE "WebSocketServer|new WebSocket\.Server|io\.on\(['\"]connection|on\(['\"]upgrade|@WebSocketGateway|websocket\.accept" .`
  Not a finding: a socket authenticated by a token sent in the first message or the URL (not by cookie) — CSWSH needs ambient credentials.
- Host header (CWE-640): password-reset or invite links built from `Host` / `X-Forwarded-Host` of the request → high (the link,
  with its token, points to the attacker). Safe: the public base URL from configuration.
  Starter: `grep -rnE "(req|request)\.(get_host|host|hostname|headers\[?['\"]?(host|x-forwarded-host))|HTTP_HOST|X-Forwarded-Host" .`
  Not a finding: the framework validates `Host` against an allow-list (`ALLOWED_HOSTS`, a trusted-host middleware) before the link is built.
- Rate limit keyed on a client-supplied `X-Forwarded-For` / `X-Real-IP` without a trusted proxy setting → medium (bypass).
  Starter: `grep -rnE "x-forwarded-for|X-Forwarded-For|x-real-ip|keyGenerator|trust proxy|ProxyFix" .`
  Not a finding: the app sits behind a proxy configured as trusted (`trust proxy` with a hop count, `ProxyFix`) that overwrites the header.
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
- Containers/CI: no secrets in image layers or workflow files, base images pinned by digest (`@sha256:…`; a tag only → medium
  [no-image-digest]), non-root user. Dockerfile, Kubernetes/Helm, Terraform/CloudFormation → `IAC.md`.

## Software Supply Chain Failures [A03:2025] (details → SUPPLY-CHAIN.md)
- Lockfile committed and used in CI (`npm ci`, `--frozen-lockfile`, `pip --require-hashes`); no `*` / `latest` / git-URL ranges.
- Dependencies scanned: `npm audit --audit-level=high` / `pip-audit` / `cargo audit` (no network → `UNASSESSED`, not pass).
- GitHub Actions pinned to a full commit SHA, minimal `permissions:`, no untrusted `${{ github.event.* }}` in `run:`.
- Base images pinned by digest (a tag only → medium [no-image-digest]); install scripts and unknown/typosquatted package names reviewed. Threat model: external attacker only.

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
| `pull_request_target` + PR-head checkout [no-ci-hardening] | Critical | Immediate |
| Workflow expression injection [no-ci-hardening] | High | < 1 week |
| SSRF, unrestricted upload, unsafe deserialization, eval on user input | High–Critical (by reach) | < 1 week |
| Fail-open `catch` on auth/payment | High | < 1 week |
| Actions not SHA-pinned, `npx -y` unpinned [no-mcp-pin] | Medium | < 2 weeks |
| Base / manifest image by tag, no digest [no-image-digest] | Medium | < 2 weeks |
| Weak crypto for tokens / keys / IVs [no-weak-crypto] | High | < 1 week |
| TLS verification disabled [no-tls-verify] | High | < 1 week |
| Secrets in logs [secrets-in-logs] | High | < 1 week |
| Log injection [log-injection] | Medium | < 2 weeks |
| XXE on untrusted XML [no-xxe] | High | < 1 week |
| Mass assignment of privileged fields [no-mass-assignment] | High | < 1 week |
| CORS reflecting Origin with credentials [cors-credentials] | High | < 1 week |
| Cross-site WebSocket hijacking [ws-origin] | High | < 1 week |
| GraphQL without depth / complexity limits [no-graphql-limits] | Medium | < 2 weeks |
| Open redirect [open-redirect] | Medium | < 2 weeks |
| Missing rate limit [no-rate-limit] | Medium | < 2 weeks |
| Verbose errors [verbose-errors] | Medium | < 2 weeks |
| Missing headers [no-xss-csp, no-https] | Low only with a traced exploit path; otherwise a hardening suggestion | < 1 month |

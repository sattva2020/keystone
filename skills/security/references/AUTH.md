<!-- derived from ai-factory@2.19.0 skills/aif-security-checklist/references/AUTH-PATTERNS.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Authentication Implementation Patterns

## Password Hashing

```typescript
// ✅ Good: Secure password hashing
import { hash, verify } from 'argon2';

const hashedPassword = await hash(password, {
  type: argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4
});

// ✅ Good: Timing-safe comparison
const isValid = await verify(hashedPassword, inputPassword);
```

```php
// ✅ Good: PHP password hashing
$hash = password_hash($password, PASSWORD_ARGON2ID, [
    'memory_cost' => 65536,
    'time_cost' => 4,
    'threads' => 3,
]);

// ✅ Good: Timing-safe verification
if (password_verify($inputPassword, $storedHash)) {
    // Valid password
}

// ✅ Laravel: Uses bcrypt by default
$user->password = Hash::make($password);
if (Hash::check($inputPassword, $user->password)) {
    // Valid
}
```

## Session Management

```typescript
// ✅ Good: Secure cookie settings
app.use(session({
  secret: process.env.SESSION_SECRET,
  name: '__Host-session', // __Host- prefix enforces secure
  cookie: {
    httpOnly: true,       // No JS access
    secure: true,         // HTTPS only
    sameSite: 'strict',   // CSRF protection
    maxAge: 3600000,      // 1 hour
    domain: undefined,    // No cross-subdomain
  },
  resave: false,
  saveUninitialized: false,
}));
```

## JWT Security

```typescript
// ❌ Bad: Secrets in JWT
{ "userId": 1, "email": "user@example.com", "ssn": "123-45-6789" }

// ✅ Good: Minimal claims
{ "sub": "user_123", "iat": 1699900000, "exp": 1699900900 }
```

### Algorithm and key-header trust (CWE-347)

```typescript
// ❌ Bad: the token's own `alg` header decides how it is checked. With an RSA public key loaded as `key`,
//    an attacker signs with HS256 using that public key as the HMAC secret (RS256 → HS256 confusion).
jwt.verify(token, key);

// ✅ Good: an explicit allow-list, and the key type bound to the algorithm
jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: ISS, audience: AUD });
```

- `alg: none`, or an `algorithms` list that mixes HMAC and RSA/EC for the same key → high.
- Key looked up from token headers: `kid` used in a file path or SQL query (traversal / injection), `jku` / `x5u` fetched from the
  URL in the token, an embedded `jwk` trusted as the verification key → high. Safe: `kid` only as a key into a fixed local key set;
  JWKS from a configured URL, never from the token.
- HS256 with a short, default or committed secret (brute-forceable offline from one token) → high. Safe: ≥ 256-bit random secret
  from the environment, or asymmetric keys.

## OAuth 2.0 / OIDC

| Check | Unsafe | Safe | Severity |
|---|---|---|---|
| `redirect_uri` validation (CWE-601) | prefix / substring / regex match, wildcard subdomains | exact string match against registered URIs | high (code theft) |
| PKCE | public client (SPA, mobile) without PKCE, or `plain` method | PKCE with `S256` required | high |
| `state` / `nonce` | `state` not generated or not compared in the callback; OIDC `nonce` not checked | unguessable `state` bound to the session, `nonce` checked in the ID token | high (login CSRF, replay) |
| Authorization code | code accepted twice | single use, short lifetime | medium |
| ID / access token claims | `iss` or `aud` not validated, token for another client accepted | validate `iss`, `aud`, `exp`, signature | high |
| Implicit flow | `response_type=token` still enabled | authorization code + PKCE | medium |

## Account enumeration (CWE-204)

Login, password reset or signup answer differently for an existing and a non-existing account (message, status code, response time)
→ medium (enables credential stuffing and targeted phishing). Safe: one generic message and status, comparable timing.
Not a finding when the product shows usernames publicly anyway.

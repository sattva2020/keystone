<!-- original Keystone file (MIT) -->

# Severity rubric (decides disputes; the same issue gets the same rating on every run)

The **Criteria** column decides; the Examples only illustrate — when an example seems to disagree with the criteria,
the criteria win. Answer three questions, then take the **lowest** level whose criteria all hold:
1. **Who can trigger it** — unauthenticated internet user · any logged-in user · admin / privileged only · local / needs machine access.
2. **What is lost** — data or money of all users · of one user · availability · information leak only.
3. **Preconditions / defaults** — works on the default config, or needs an unusual setting, a race window, a leaked secret.

| Level | Criteria | Examples |
|---|---|---|
| **critical** | Unauthenticated or any-user trigger **and** all-user data / money / code execution, on the default config | SQL injection on a public endpoint; auth bypass on `/admin`; live secret committed; stored XSS in a page every user sees |
| **high** | Any-user trigger with one-user or limited loss, or privileged-only trigger with full compromise; one realistic precondition | Reflected XSS; CSRF on a cookie-auth state change; IDOR reading another user's record; indirect prompt injection into an agent with tools; workflow expression injection; a money/data race (double-spend, balance TOCTOU) |
| **medium** | Needs admin/local access, or a hard-to-hit precondition, or leaks info that helps a later attack; availability only | Missing rate limit on login; actions not SHA-pinned; internal error text / stack trace returned to the client |
| **low** | A traced exploit path with small impact (needs an unusual precondition, leaks only non-sensitive data) | Missing security header **only with a traced exploit path** (otherwise not a finding); verbose log level; unused permission in a workflow |

## Recurring cases (fixed ratings)
- **Disabled-by-default protection flag** (`csrf: false`, `validate: false`, `strict: false` — the check exists, the default turns it off): one rule — rate the *risk it guards* as if the protection were absent, using the table above; not a finding if the project sets the flag on explicitly. No cap and no discount for "one config line fixes it".
- **Internal error text to the client** (`res.status(500).send(err.message)`, stack trace): **medium** if the text reveals paths, queries, secrets or tokens; **low** if it is a generic message with an error type. Never above medium unless a secret is in the text.
- **Missing hardening with no exploit path**: not a finding (DO-NOT-FLAG.md). With a traced exploit path it is rated by the table above, not as hardening.
- **Fail-open `catch`** on an auth / payment decision: **high**. On a non-security path: not a finding.
- Raise one level only when the exploit is shown on the default deployment; lower one level when a second control already blocks the path (an admin-only authenticated route is one; a WAF is not).

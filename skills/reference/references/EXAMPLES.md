<!-- derived from ai-factory@2.19.0 skills/aif-reference/references/EXAMPLES.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Reference Examples

Practical examples of `/keystone:reference` usage and expected output.

## Example 1: Single URL — a service with prices and limits

**Input:**
```
/keystone:reference https://stripe.com/docs/rate-limits --name stripe-limits
```

**Result:** `docs/references/stripe-limits.md`

```markdown
# Stripe Limits Reference

> Sources: https://stripe.com/docs/rate-limits; Context7 /stripe/stripe-node (v16.x)
> Created: 2026-10-12
> Updated: 2026-10-12

## Overview
Rate limits decide how the nightly invoice sync batches its calls (src/billing/sync.ts).

## Project conclusions
- Sync runs 20 requests/s, below the live-mode limit, because retries on 429 doubled the load in staging.
- Idempotency keys are built in src/billing/keys.ts — never call `invoices.create` without one.

## Prices and limits
| Item | Value | Checked | Source |
|------|-------|---------|--------|
| Live-mode read/write | 100 req/s | 2026-10-12 | https://stripe.com/docs/rate-limits |

## Live checks
- 2026-10-12 — 150 parallel `GET /v1/customers` in test mode → first 429 after 25 req/s — sandbox run, script scripts/probe.sh

## Docs pointer
Context7: /stripe/stripe-node (v16.x) — "idempotency keys", "automatic retries"
```

Note what is absent: no method signatures, no usage snippets from the library docs — Context7 serves them.

## Example 2: Library only — a pointer, not a copy

**Input:**
```
/keystone:reference zod --name zod-validation
```

The skill resolves the library in Context7, reads the version from `package.json`, and writes a short reference: which schemas the
project shares (`src/schemas/`), the decision to validate at the API boundary only, and a docs pointer. If nothing project-specific
exists to record, it says so and writes nothing.

## Example 3: Local file

**Input:**
```
/keystone:reference ./docs/api-spec.yaml --name internal-api
```

**Result:** `docs/references/internal-api.md` — the endpoints the project actually calls, their limits and error cases, and the
mismatches found between the spec and the running service (with dates).

## Example 4: Update existing

**Input:**
```
/keystone:reference --update --name stripe-limits
```

Re-runs the live checks, re-fetches the header sources, asks Context7 again for the library part, shows a diff of only the changed
numbers (with new dates), and keeps `Created:`.

## Example 5: Interactive mode

**Input:**
```
/keystone:reference
```

The skill asks which topic or technology, whether the user has URLs or files or wants a search, and which aspects matter for the
project, then follows the standard workflow.

## Example 6: Large topic — split into a directory

When one reference would exceed ~1000 lines:

```
docs/references/kubernetes/
├── INDEX.md          # Overview + links
├── pods.md           # Project conclusions on pod configuration
├── services.md       # Service types and limits we rely on
└── deployments.md    # Rollout strategy and live checks
```

## Quality checklist

A good reference:
- [ ] Has sources in the header (URLs, paths, Context7 library ID + version)
- [ ] Has Created/Updated dates
- [ ] Overview says what it is and why the project uses it, in 1–3 paragraphs
- [ ] Every price, limit or live check has a date and a source URL
- [ ] No copy of documentation that Context7 already serves — a pointer instead
- [ ] Project conclusions name files in the repo
- [ ] No hallucinated information — gaps are omitted, not filled
- [ ] No secrets (only `${VAR}` names)
- [ ] Under 1000 lines (or split into a directory)
- [ ] Registered in `docs/references/INDEX.md`

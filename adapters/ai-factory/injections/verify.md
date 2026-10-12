

---

## Keystone gate (keystone-aif)

This project has the **Keystone** adapter installed. The core already verifies requirements, evidence and
plan-vs-code drift; this read-only gate adds only the intent-specific checks. WARN-only.

**Read-only means no writes.** This gate never edits the plan, the intent, the journal or code. If the user asks to mark
something in the plan during verification, say it is a manual edit (or `/aif-implement`), name the exact change, and
remind that it must be committed.

Applies when the plan's `## Requirements Reconciliation` cites an `intent.md`:

1. **Coverage:** every `Desired outcome` and `Constraint` line (`I-n`; struck-through lines excluded) of the cited
   intent has a row → otherwise `WARN [keystone] intent <I-n> has no reconciliation row`.
2. **Rework signal** (dates from `git log --format=%ad --date=short -- <file>`): intent.md changed after the plan was
   first committed → `WARN [keystone] intent.md changed after the plan — check the plan still matches`.
   If the intent and the plan were first committed in the same commit, say `rework signals: not measurable
   (intent and plan first committed together)` instead of "none".
3. **Status:** the intent is not `accepted` → `WARN [keystone] intent is <status>`.
4. **Blocked rows:** count rows whose evidence starts with the literal prefix `BLOCKED:` — they are open work, not
   passes. A blocked-looking cell in another form (`BLOCKED (…):`, `blocked`) still counts, but emit
   `WARN [keystone] row <n>: write BLOCKED: <reason>`.
5. **A checked box is not evidence.** A row or task marked `[x]` / `pass` whose evidence is only a claim, a grep or a
   code read (presence, not behaviour) → `WARN [keystone] row <n>: no behavioural evidence`.
6. **Unrequested work:** changed files or behaviour that trace to no task, row or `I-n` →
   `WARN [keystone] unrequested: <file — what>` (formatter noise excluded).
For an independent pass in a clean context, recommend `/keystone:verify <plan path>` (L: always).

**Mandatory report line** — write it verbatim as its own line in the verification report, even when everything passes:

```
Keystone Chain: outcomes <covered>/<total>, constraints <covered>/<total>; BLOCKED rows <n>; unrequested <n>; rework signals: <none | list | not measurable>
```

If the implementation-notes extension (aif-ext-sattva) is installed, its coverage line must also appear verbatim as
`Implementation Notes Coverage: …` — do not fold it into prose.

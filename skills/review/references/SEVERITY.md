<!-- derived from ai-factory@2.19.0 skills/aif-review/references/SEVERITY.md (MIT); see THIRD_PARTY_NOTICES.md -->
# Review item severity levels

The single source of truth for what counts as *critical*, *suggestion* or *unconfirmed* in `/keystone:review`. `SKILL.md`
and `VALIDATOR.md` defer to this file — do not redefine the levels elsewhere.

## Three levels

- **critical** — merge-blocking. Lands in "Critical" and makes `Gate: fail`. Pick this level when the cited behavior would cause:
  - data loss, corruption, or unbounded resource usage,
  - a security regression (auth bypass, injection, leaked credentials),
  - broken correctness on a path that real users hit,
  - a downstream regression that needs a fix before merge (build break, contract change without consumers updated).

- **suggestion** — non-blocking. Lands in "Suggestions"; at most `Gate: warn`. Pick this level when the cited behavior is:
  - a clarity / readability / naming improvement,
  - a performance-budget tweak or micro-optimization,
  - a missing log line or comment,
  - a future refactor that does not block this change,
  - a test gap that does not hide an active bug.

- **unconfirmed** — not a defect claim. Lands in "Unconfirmed", never affects `Gate`. The concern looks plausible but no
  concrete Repro (input or command, and the place where the failure is visible) can be shown from the diff and the code.

When in doubt between critical and suggestion, leave the item at its original level. Reclassification is a deliberate
judgment, not a default.

## When the validator reclassifies

- **suggestion → critical** (promote) — the underlying behavior is more severe than framed. Example: "extra database
  round-trip" is on inspection an N+1 that times out the request under realistic load.
- **critical → suggestion** (demote) — the behavior does not actually block merge. Example: "missing null check that would
  crash", but the only caller already guarantees non-null and the cited path is unreachable in production.
- **→ unconfirmed** — the behavior is possible, but the validator cannot construct the trigger. Prefer this to `drop`
  when the concern is real-looking and only the proof is missing.

The validator does NOT reclassify to balance the sections or to make the review "feel right"; a move requires a concrete
reason tied to the actual code. The `[validated: …]` suffix is added by the main skill, not by the validator.

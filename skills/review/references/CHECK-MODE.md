<!-- derived from ai-factory@2.19.0 skills/aif-review/references/CHECK-MODE.md, coverage-first and PR pinning from ai-factory@2.20.0 (MIT); see THIRD_PARTY_NOTICES.md -->
# Validation procedure (always on)

`/keystone:review` always runs the validator; there is no opt-out. Run it after the full review is produced internally
and **before** anything is rendered. The validator only adjusts which items reach the user and in which section.
"Unconfirmed", "Open questions", "Positive notes" and the "Context gates" block are NOT validated; neither are
commit-structure findings in ref mode (commit-message accuracy, atomicity, a change introduced and reverted inside the
range) — the validator sees only the squashed `git diff <ref>...HEAD`. They stay in the report verbatim and are not counted.

## Procedure

1. Collect items from "Critical" and "Suggestions", numbered across both in display order, each under
   `### Item N (section: critical|suggestion)`. Remember each item's **original section** (to detect reclassification and
   for fallback). **If the list is empty, skip the rest**: hidden = adjusted = reclassified = 0.
2. Capture the exact reviewed diff: `git diff --cached` (or `git diff` when staged was empty), `gh pr diff <N>`, or
   `git diff <ref>...HEAD`. The validator judges against this diff, not against disk — in PR mode disk holds the wrong version.
   Reuse the diff text you reviewed; do not fetch it again. In PR mode also pass the pinned head SHA and the
   pinned-commit excerpts the findings rely on (see PR source in `SKILL.md`).
3. Launch one agent, `subagent_type: "keystone:review-validator"`. Prompt: the paths `${CLAUDE_SKILL_DIR}/references/VALIDATOR.md`
   and `${CLAUDE_SKILL_DIR}/references/SEVERITY.md`, the project-rule files, a short project-context line (working
   directory, one-line summary of the change), the diff verbatim, the items. Not your reasoning, not your draft verdict.
4. Parse the answer by `### Item N` headings. Target section from `Severity`: `unchanged`/missing → original;
   `critical` → Critical; `suggestion` → Suggestions; `unconfirmed` → Unconfirmed. Then apply `Verdict`:
   - `keep` → text stays in the target section; target ≠ original → reclassified += 1.
   - `modify` → text replaced by `Modified-text`, placed in the target section, adjusted += 1 (and reclassified += 1 if moved).
   - `drop` → removed, hidden += 1; `Severity` ignored.
   Moved items get a suffix from the main skill: ` [validated: promoted from Suggestions]`,
   ` [validated: demoted from Critical]`, or ` [validated: no Repro shown]` (moved to Unconfirmed).
5. Resolve confidence markers. An item that came in with `(confidence: low)` / `(confidence: medium)` and got `keep` or
   `modify` is confirmed: remove the marker (also from `Modified-text` if the validator copied it) — it is now an ordinary
   item of its section, and a confirmed critical blocks the Gate. `drop` refutes it; `unconfirmed` moves it with its marker
   removed. A marker never reaches the rendered Critical / Suggestions sections after a successful verdict.

## Failure modes

- **Per-item malformed response** (heading missing, no `Verdict`, unknown verdict or severity token, `modify` without
  `Modified-text`): treat the item as `keep` / `unchanged` and add one line above the Gate summary at the end:
  `WARN [validator]: validator response for item N was malformed, kept as-is`.
- **Whole-call failure** (empty, error, timeout, refusal): every item `keep` / `unchanged`; no counters; add
  `WARN [validator]: validator failed (<reason>), all items kept as-is`. Say in the report that the findings are
  unvalidated; compute `Gate` from the unfiltered list.

## Gate after validation

`Gate` is computed from the **post-filter** lists: `fail` if any Critical remains or a context gate is `ERROR`; `warn` if
only Suggestions or `WARN` gates remain, or in PR mode the PR moved or its freshness is unknown; `pass` otherwise. A failing context gate keeps `fail` even with zero Critical
items — a clean findings list never masks a failed gate. Unconfirmed items never change the Gate. The `Validated:` line
always appears when the validator ran, even with zeros.

**Unresolved marker = validation failure.** If any item still carries a confidence marker when the Gate is computed (its
block was malformed, or the whole call failed), the review has not earned a verdict on it: `Gate: fail — <n> marked
finding(s) left unvalidated: <cause>; re-run /keystone:review`. Such items stay in their section with the marker and
are not counted as established Critical items — the Gate does not guess whether they are real. Unmarked items that fell
back to `keep` are judged as before.

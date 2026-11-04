<!-- derived from ai-factory@2.19.0 skills/aif-verify/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Keystone verify — after the Step 6 choice

Read by `/keystone:verify`: read before the Step 6 menu on FAIL / PASS / PASS-UNPROVEN, and after the pick; also when
the diff may have made a context file stale.

## Step 6 options

Recommended first and marked `(Recommended)`:

- **FAIL** — `Fix directly here — every finding, in this session` (Recommended when the findings are few and small) ·
  `Fix critical only — wrong behaviour and security / architecture gate fails` (only when there are non-critical
  findings too) · `Fix every finding in a clean session — /keystone:fix verify` (Recommended when the context is
  large or the findings are many) · `Finish an unfinished task — /keystone:implement <plan>` (only when a row is
  `missing`) · `Stop here`. With `trend menu: on this FAIL` the menu of `LOOP.md` replaces this one.
- **PASS-UNPROVEN** — one `Prove now: <check>` option for each group of open rows that can be proven before
  production (a test to run, a read-only query against the database, `/keystone:security <plan>` for a security
  row, a local run) · `Accept as unproven (<n> rows: <short list>)` · on L `Run /keystone:review first` ·
  `Stop here`. A `Prove now` option goes first whenever one exists. **Accept is never first** when an open row or the
  Security gate concerns security (RLS, grants, auth, permissions) — then the security check is the recommendation.
- **PASS** with open `## Release` steps — `Release: /keystone:implement <plan>` (on L `Run /keystone:review first`
  goes first) · `Stop here`.
- **PASS** without release steps — `Review the diff — /keystone:review` (Recommended on L) · `Security check —
  /keystone:security <plan>` (when the diff touches auth, data or user input) · `Push` · `Stop here`.

**Context drift (a second question, only when found).** Verify never edits context files. Compare the diff with
`docs/architecture.md`, `CLAUDE.md` / `.claude/CLAUDE.md` and `.claude/rules/**`: a new module, top-level folder or
dependency direction the architecture file does not describe; a command, stack item or structure `CLAUDE.md` states
that the diff changed; a convention the diff introduces or a rule it now contradicts on purpose. Only when a file is
clearly stale — not merely silent about a detail — add one more question to the same AskUserQuestion call:
`Context drift: <file> — <what is stale>. Update it now?` with one option per stale file, its owning command —
`docs/architecture.md` → `/keystone:architecture`, `CLAUDE.md` → `/keystone:setup`, `.claude/rules` →
`/keystone:evolve` — and `Not now`. A pick runs that skill after the Step 6 choice is done (read its SKILL.md and follow
it; it shows a diff and writes only after a yes). No drift → no question. The final report carries
`Context drift: <file — what is stale> | none` either way.

After the choice:
- `Prove now` with a read-only check (tests, a read-only query, a GET) → run it in this turn, quote the output, and
  re-run the verifier only on the rows it covers (the evidence changed); anything that writes or needs production →
  hand it to the human as the `Next:` command.
- `Accept as unproven` → the click is the confirmation the Accept section asks for (it names the rows); go to
  **Accept** without asking again.
- `Fix directly here` → read `${CLAUDE_SKILL_DIR}/../fix/SKILL.md` and follow its **Verify findings mode** for this
  plan in this turn (verify itself still edits nothing — the fix skill does, with its rules: regression check for a
  behaviour finding, build / lint / tests, Implementation notes, one commit). Then run this verify again — the code
  changed — and show its menu.
- `Fix critical only` → the same, with `verify critical` (fix mode for the critical findings only). The other
  findings stay open and keep the verdict FAIL until they are fixed or their rule is changed — say so.
- `Review`, `Security check` → run that skill now the same way (read its SKILL.md and follow it).
- `Fix … in a clean session`, `Finish an unfinished task`, `Push` → not run here: the command becomes the `Next:`
  line (a clean session, or an irreversible step the human starts).
- `Fix every finding — /keystone:fix verify` (the trend menu of `LOOP.md`) → the same as `Fix … in a clean session`:
  `Next: /keystone:fix verify`.
- `Stop and decide` → nothing runs and verify edits neither the intent nor the plan: `Next: /keystone:intent <intent
  path>` to narrow the intent. `Status: abandoned` goes into the plan header only after a second explicit yes —
  AskUserQuestion `Mark the plan abandoned?` with `Yes` / `No`; `No` leaves the plan as it is.
- AskUserQuestion unavailable (`claude -p`, CI) → no menu: print the options as a numbered list and put the first one
  in `Next:`.

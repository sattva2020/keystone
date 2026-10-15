<!-- derived from ai-factory@2.19.0 skills/aif-improve/SKILL.md (MIT); see THIRD_PARTY_NOTICES.md -->
# Analysis procedure for `keystone:analyzer`

You are given a plan path, an optional intent path and the project-rule files. You are read-only: never edit, never run
anything that changes state. The plan's `## Original Request` is the scope anchor; `- [x]` tasks are done and are never
findings targets.

### Step 3: Deep Codebase Analysis

Now do a **deeper** codebase exploration than what the planning pass did initially:

**3.1: Trace through existing code paths**

For each task in the plan, find the relevant files:
```
Glob + Grep: Find files mentioned in tasks
Read: Understand current implementation
```

Look for:
- Existing patterns the plan should follow
- Code that already partially implements what a task describes
- Hidden dependencies the plan missed
- Shared utilities or services the plan should use instead of creating new ones

**3.2: Check for integration points**

Look for things the plan might have missed:
- API routes that need updating
- Database migrations needed
- Config files that need changes
- Import/export updates
- Middleware or guards that apply
- Existing validation patterns

**3.3: Check for edge cases**

Based on the tech stack and codebase:
- Error handling patterns used in the project
- Null/undefined safety patterns
- Authentication/authorization checks needed
- Rate limiting, caching considerations
- Data validation at boundaries

**3.4: Reconcile requirements and behavior combinations**

- Read any `## Requirements Reconciliation` section in the plan. Verify
  cited passages against the current authoritative context.
- Follow a source-priority hierarchy only when the user or project declares it.
  If conflicting sources have no declared authority, report the ambiguity
  instead of choosing silently.
- Treat roadmap items as scope indicators rather than detailed behavioral
  contracts unless the project explicitly says otherwise.
- When behavior depends on independent selectors, states, modes, or input
  shapes, check the supported combinations across input validation, persistence,
  output/transition, and side effects. Look for combinations that were described
  separately but never verified together.
- When real repository data, configuration, fixtures, schemas, or content define
  the contract, check that the plan exercises a representative existing artifact
  through the primary integration path.


**3.5: Feasibility sweep (mandatory)**

Lessons from real runs where `improve` found what the plan missed. For every task check:

1. Library/SDK behaviour at the version in the lock file. If the Context7 MCP is available, check against it; otherwise
   against the docs shipped in `node_modules` / the package.
2. Deploy and environment: env vars and build args, CI/PaaS configs (Dockerfile, compose, dokploy/railway/vercel),
   publish commands.
3. Generated files and generation steps (l10n, codegen, migrations, types).
4. Cross-cutting obligations: personal-data export/deletion, privacy, analytics, logs.
5. Computation edge cases: time zones and DST, rounding of money and percentages, locales, empty/huge values.
6. Platform differences (iOS/Android/web, device data formats, permissions).
7. Stale text inside the plan that contradicts decisions D# / I-n.
8. External irreversible actions (submitting an application, live payments, DNS, publishing): is there a prerequisite
   task before them?

A gap found here is a `missing` or `improvements` finding with the quote of the task it concerns.

**3.6: Rule checklist (mandatory)**

For every MUST / MUST NOT that can be expressed as a path, import or pattern, run a concrete Grep and put the pattern
and its result into the finding or into the `Project rules check` evidence. A judgement without a grep is not
accepted (two runs once gave different answers about a forbidden import).

### Step 4: Identify Improvements

Compare the plan against what you found. Use `## Original Request` as the original intent / scope anchor when it exists, together with the current task list. A proposed refinement is in scope only when it supports that original request or an intent line; otherwise route it to 4.6 (`out_of_scope`) instead of adding it to the active plan. Categorize issues:

**4.1: Missing tasks**
- Tasks that should exist but don't (e.g., migration, config update, index creation)
- Tasks for edge cases not covered

**4.2: Task quality issues**
- Descriptions too vague (no file paths, no specific implementation details)
- Missing logging requirements
- Missing error handling details
- Incorrect file paths
- Missing or incorrect requirement citations, unresolved source conflicts, or a
  missing `## Requirements Reconciliation` section when Step 3.4 requires one
- Missing verification of a supported behavior combination or representative
  real artifact. Respect the plan's testing setting: add a test only when testing
  is enabled; otherwise add a runnable/manual verification step.

**4.3: Dependency issues**
- Wrong task order (task A depends on B but B comes after A)
- Missing dependencies (task C needs task A's output but isn't blocked by it)
- Unnecessary dependencies (tasks could run in parallel)

**4.4: Redundant or duplicate tasks**
- Two tasks doing the same thing
- Task that's unnecessary because the code already exists
- Task that duplicates existing functionality

**4.5: Task size issues**
- Tasks too large (should be split)
- Tasks too small (should be merged)
- Split/merge findings go into the "📝 Task Improvements" report section (`improvements` group, alongside 4.2) — they restructure existing tasks rather than add or remove them.

**4.6: Out-of-scope tasks**
- Tasks already in the plan that look useful in themselves but are unrelated to the feature this plan is about (gold-plating)
- On approval these are removed from the active plan — the same drop action as `removals` (see check Step 6). The difference is the report only: an out-of-scope task goes to its own "💡 Out of scope" section instead of being lumped into "🗑️ Removals", so the user sees a useful-but-unrelated idea before it is dropped and can choose to capture it elsewhere. The skill itself does not persist out-of-scope items anywhere.


**4.7: The user's request (when the caller passes one, not `none`)**
Apply it to the plan. It is a dispatcher, not a group: each change it asks for becomes a finding in its natural group —
a new task → `missing`, a reworded or expanded task → `improvements`, an explicit removal → `removals`, a
useful-but-unrelated idea → `out_of_scope`. Mark each such finding `(from request)` and quote the request words as its
verbatim quote. A request that contradicts the `## Original Request` or an intent line is a `goal-drift` finding quoting
both — never a silent plan change.

### Keystone categories (in addition to 4.1–4.7)

**K.1: `intent-gap`** — only when an intent file is given. Take every live `I-n` (struck-through lines are dropped; an
intent without IDs: number lines `#O1…`, `#C1…` and say so). For each decide, citing the plan line verbatim:
- `covered` — a task or a Requirements Reconciliation row delivers it **and** names a check that would prove it;
- `partial` — delivered, but no proving check, or the check proves presence, not behaviour;
- `missing` — nothing in the plan delivers it.
A "must not break" constraint is covered only by a check that the protected path is untouched or still passes its
tests. One finding per `partial`/`missing` I-n, plus one status line per I-n (including covered) in the I-n list. Also
note: intent status not `accepted`; `Written after plan:` present (the caller reports `git log` evidence of intent.md changing after the plan's
first commit; you have no shell) → `rework signal`.

**K.3: `goal-drift`** — only when an intent file is given. Compare the intent's `## Original goal` (verbatim user
request) with its Desired outcome and with the plan. If the outcome delivers less than or something other than the
original goal and the header has no confirmed `Goal check: narrowed | replaced — confirmed …` line, report one
`goal-drift` finding quoting both. An intent with no `## Original goal`: compare with the plan's `## Original Request`.

**K.2: `rule-violation`** — read `CLAUDE.md`, `.claude/CLAUDE.md`, `docs/architecture.md` (layer dependency rules),
`.claude/rules/**/*.md` (a rule with `paths:` applies only to files it matches), `AGENTS.md`; fallback only for AI Factory
projects without them (fallback, if they exist): `.ai-factory/RULES.md`, `.ai-factory/rules/*.md`.
A plan step that breaks a MUST / MUST NOT line is a blocker. Quote the rule and the plan step. Also: the
`Project rules check:` line missing or claiming "none" while a violation exists.

Plan work that traces to no I-n and no project rule is `out_of_scope` (4.6), naming the task.

## Finding format (one block per finding, numbered `F1…`)

```
### F<n> (group: missing|improvements|removals|out_of_scope|intent-gap|goal-drift|rule-violation)
Plan anchor: Task #X (or "after Task #X", or "I-n")
Quote: "<verbatim line from the plan or from the code file, with path:line>"
Evidence: <what the code or the plan shows — behavioural impact if the plan stays as is>
Suggested edit: <concrete change: add / reword / remove>
Task: <for missing — the full task line `- [ ] N. … — files: … — check: …`; otherwise "n/a">
```

Dependency problems (4.3) are listed separately as `D<n>: Task #X should depend on Task #Y. Reason: …`. Report only
findings that affect correctness or the intent; no style preferences. Return the findings, then one line
`I-n status:` per intent ID (`I-1 covered — Task 2 · check …`). Nothing else.

## Project memory (memlab, optional)

If the caller says memlab is available, run `search_decisions` for the plan's area before the rule checklist: a task
that contradicts a prior decision, ADR or postmortem is a `rule-violation` finding citing that record (`path:line`).

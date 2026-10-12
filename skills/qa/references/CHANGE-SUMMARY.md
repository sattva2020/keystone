<!-- derived from ai-factory@2.19.0 skills/aif-qa/references/CHANGE-SUMMARY.md (MIT); see THIRD_PARTY_NOTICES.md -->
# Reference: Change Summary (change-summary)

> **When to use:** When invoked with the `change-summary` argument (or as the first stage of `--all`). Also run this mode first when the change context is unknown — before writing a test plan or test cases.

Uses `qa_dir`, the input kind (plan / ref / staged / working) and the plan + intent resolved in SKILL.md Steps 0–1.

## Step 1: Gather Change Information

### Manual Change Context

If the directory is not a git work tree or the refs cannot be resolved, do not fail with a raw git error.
Use AskUserQuestion: ask the user to provide change context — paste a diff or PR description / a changed-file list /
a short implementation summary / cancel. Use the supplied context as the primary evidence source. If the user cancels,
stop without writing an artifact.

If the user provides an explicit changed-file list, use it as `changed_files` for Step 2. If you only have a diff, derive
`changed_files` from the touched paths in that diff. If you only have a description, derive a best-effort list from the files,
modules, routes, commands or components it names. If no reliable file list can be derived, skip file exploration in Step 2
and mark file-level uncertainty explicitly in the artifact instead of falling back to git assumptions.

### Git Change Context

- **Staged / working input:** `git diff --cached --stat`, `--name-status`, and the diff (or `git diff` when nothing is staged).
- **Ref input:** validate with `git rev-parse --verify <ref>`; invalid → do not fall back silently, ask: use staged instead /
  cancel. Commits: `git log <ref>..HEAD --oneline`; diff: `git diff <ref>...HEAD`.
- **Plan input:** the commits since the plan's baseline commit (or `git log --oneline -- <files named in the plan Tasks>`);
  say how you scoped it. If nothing is committed yet, use the working diff of the plan's files.

**Check commit count — if more than 20, ask before proceeding** (AskUserQuestion: analyze all `<N>` commits / only the last 20 /
cancel). "Last 20" → the base is the parent of the oldest of those commits; use that base for every diff command below.
Cancel → **STOP**.

```bash
git diff --stat <base>...HEAD
git diff <base>...HEAD --name-status
git diff <base>...HEAD
```

**Check diff size — if the diff exceeds ~1000 lines, warn before proceeding** (AskUserQuestion: read the full diff / read
changed files individually, recommended for large diffs / cancel).

For large diffs, never load generated files, lock files, dependency snapshots, build artifacts, minified assets, or vendored
code unless the change itself is about them. Start from `--stat`, then `--name-status`, then per-file diffs for important
files. Treat deleted and renamed files explicitly: deleted files may indicate removed behavior; renamed files may require
caller/import checks even when content is mostly unchanged.

## Step 2: Explore Key Changed Files

**Use the Agent tool with `subagent_type: "Explore"` to understand the changed files in parallel.** This keeps the main
context clean and speeds up analysis on large diffs. Pick the most important files (business logic; skip lock files,
generated files, build artifacts, vendored code, formatting-only changes). Launch 1–2 Explore agents at once:

- Agent 1 — core changes: "Read and summarize the key changed files: [list]. Focus on: what logic changed, what inputs/outputs
  changed, what side effects are possible. Thoroughness: medium. Be concise."
- Agent 2 — integration points (if needed): "Find all callers and consumers of [changed modules/functions]. Identify what
  adjacent functionality might be affected. Thoroughness: quick."

**Fallback:** if the Agent tool is unavailable, read the key files directly with Read/Grep. Without a reliable file list,
skip exploration and summarize risks from the supplied evidence.

Synthesize: what business logic actually changed; what dependent code could be affected; what integration points are at risk;
which findings are confirmed by code/diff evidence and which are assumptions.

## Step 3: Risk Analysis

For each changed component, assess:

**Functional risks:** Did the business logic change? Were input/output data affected (formats, validation, structure)? Are
there dependent modules or components that might break? How does the change affect user scenarios?

**Technical risks:** Changes to data schema (DB, API contracts, file formats, storage)? To configuration or environment
variables? To error handling or edge case behavior? To integrations with external services or APIs? To authorization,
access control, or security?

**Regression risks:** What existing functionality might have broken? Which adjacent features need re-verification?

Every high-risk item must be backed by observed code/diff evidence or explicitly marked as an assumption.

## Step 4: Intent and plan mapping (when a plan exists)

List the intent lines `I-n` and the plan's `Done means:` clauses next to the areas that implement them, so the test plan and
cases can cite them. An intent line with no matching change is a gap — write it under "Intent coverage" as `no change found`;
a changed area with no intent line is `unrequested`. Without a plan, write "No plan — grounded in the diff alone."

## Step 5: Generate the Summary

Use `${CLAUDE_SKILL_DIR}/templates/CHANGE-SUMMARY.md` as the structure source, in the language the user writes in. Keep file
paths, commands, code identifiers, branch names and raw error messages unchanged.

The summary must include an `Evidence` section that ties important findings to files, functions, commits, or diff observations.

## Step 6: Save Artifact

```bash
mkdir -p <qa_dir>
```

Save the result to `<qa_dir>/change-summary.md`.

## Step 7: Next Step

**If `all_mode = true`** — do NOT show the prompt. Proceed directly to `${CLAUDE_SKILL_DIR}/references/TEST-PLAN.md`.

**Otherwise:** AskUserQuestion: the change summary was saved — proceed to the test plan (`/keystone:qa test-plan`) or stop here.

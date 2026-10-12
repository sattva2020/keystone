<!-- derived from ai-factory@2.19.0 skills/aif-distillation/references/OUTPUT-STRUCTURE.md (MIT); see THIRD_PARTY_NOTICES.md -->

# Output Structure

Use this structure for skills created by `/keystone:distill`.

## Target Package

```text
<output-root>/<skill-name>/
├── SKILL.md
├── references/
│   ├── SOURCE-MAP.md   # omit when --redact-source-map is present
│   ├── CORE-PRINCIPLES.md
│   ├── WORKFLOW.md
│   └── CHECKLISTS.md
├── examples/
│   ├── REQUESTS.md
│   ├── code-patterns.md   # when source material teaches programming with snippets
│   ├── testing-debugging.md
│   ├── refactoring-optimization.md
│   └── <topic>.md
└── scripts/
    └── <helper>    # only when repeatable processing is needed
```

Use fewer files when the material is small. Do not create empty directories.
For broad programming material, use enough example files to cover the major
source topics. Do not create a single `code-patterns.md` that only samples a few
topics while the references claim broad code coverage.

## Split-Skill Target Packages

When the user passes `--split` or `--split-by <strategy>`, create multiple
focused skill packages instead of one broad package:

```text
<output-root>/
├── <prefix>-<child-skill-a>/
│   ├── SKILL.md
│   ├── references/
│   │   ├── SOURCE-MAP.md   # omit when --redact-source-map is present
│   │   └── <focused-reference>.md
│   └── examples/
│       └── <focused-examples>.md
├── <prefix>-<child-skill-b>/
│   └── SKILL.md
└── <optional-index-skill>/
    └── SKILL.md
```

Do not create a parent directory that contains child skills. Agent runtimes
discover skills as direct children of the output root when that root is an
agent skills directory.

Create an optional index/router skill only when it is genuinely useful, for
example when the split set is large or users need a single command-style entry
point. The index skill should list the child skills and when to use each one; it
must not duplicate their references.

Each child skill should be narrow enough to trigger independently. Good split
boundaries include:

- a distinct code review pass, such as `naming-cleanup` or `testability-pass`
- a distinct refactoring operation, such as `early-return-simplifier`
- a distinct framework or runtime practice, such as `laravel-query-boundaries`
- a distinct writing or analysis workflow, such as `comments-curator`
- a distinct non-code goal, such as `argument-edit`, `decision-brief`,
  `incident-triage`, `practice-drill`, or `risk-review`

Avoid split boundaries based only on source chapter titles when the resulting
skills would have the same trigger and workflow.

## Destination

Save the distilled skill where the user chose (asked with AskUserQuestion): the project's `.claude/skills/` or the personal `~/.claude/skills/`:

```text
.claude/skills/<skill-name>/
```

The chosen root is the output root.
If the user passes `--path <directory>`, use that directory as the output root
instead:

```text
<directory>/<skill-name>/
```

`--path` is a parent output directory for generated skill package directories,
not the skill package name itself. Resolve relative `--path` values from the
current working directory. Create the output root if it does not exist; reject
it if it resolves to an existing file. For a single exact destination, the user
should pass `--path <parent-dir> --name <directory-name>`.

Do not write distilled output into a plugin's own `skills/` directory unless the task is explicitly to add a built-in skill.

Before writing, resolve and canonicalize the output root and final destination
path. The final destination must stay inside the resolved output root. When
`--path` is absent, the output root is the one the user chose.

For split mode, apply this same validation to every generated child skill path.
Every generated child name must use one shared namespace prefix:

- use `--name <skill-name>` as the prefix when supplied
- otherwise derive a concise prefix from the book title or primary material title
- when source-map redaction is requested, avoid exposing a private title and use
  `--name` or a neutral material/topic prefix instead
- write children as `<output-root>/<prefix>-<child-scope>/`
- do not create unprefixed split children, even when the child scope reads well
  by itself

## Naming

Choose a concise, general name that matches the distilled practice, not just the exact source title.

Required validation before any write:

- Accept only names matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Reject empty names, overlong names, `.`, `..`, dots, path separators (`/` or `\`), absolute paths, Windows drive paths, and hidden names.
- Reject names that start with `keystone-` and names that shadow an existing skill in the output root.

Good:

- `clean-code-style`
- `domain-modeling`
- `api-design-rules`
- `incident-review`
- `argument-edit`
- `decision-brief`
- `practice-drill`
- `risk-review`

Avoid:

- author names unless the method is known by that name
- full book titles
- version/date suffixes unless required for compatibility
- vague names like `notes`, `reference`, or `book-summary`
- reserved or unsafe names like `keystone-review`, `../foo`, `.hidden`, `C:\temp\skill`, or `clean/code`

In split mode, generate a name list before writing and check it as a set:

- every name must start with the same resolved namespace prefix plus `-`
- every name must pass the same validation rules
- no name may collide with another generated child
- no generated child may shadow an existing skill or a `keystone-*` name
- the suffix after the prefix should describe the user goal and expected action, not provenance
- avoid double-prefixing names when a candidate suffix already contains the prefix
- avoid abstract source-theme suffixes such as `principles`, `philosophy`,
  `evolution`, `mindset`, or `chapter-3` unless the user explicitly requested
  that taxonomy

## SKILL.md Rules

`SKILL.md` should contain:

- frontmatter with name, description, and argument hint
- one-sentence purpose
- trigger/input detection
- workflow steps
- links to the most important references/examples
- artifact ownership and config policy if relevant

For skills that read or write project artifacts, also include:

- a Step 0 section that reads the project context (`CLAUDE.md`, `docs/architecture.md`, `.claude/rules/`) when the skill depends on project conventions
- clear read/write boundaries matching the artifact ownership contract
- Claude Code frontmatter: `name`, `description` (double-quoted if it contains `: `), optional `argument-hint`, `allowed-tools`

`SKILL.md` should not contain:

- a book-length summary
- long source excerpts
- all examples from the material
- exhaustive background theory

## Reference File Roles

| File | Purpose |
|------|---------|
| `SOURCE-MAP.md` | Sources, coverage, and attribution; omit entirely when `--redact-source-map` is present |
| `CORE-PRINCIPLES.md` | Dense distilled concepts and rules |
| `WORKFLOW.md` | Step-by-step operating procedure |
| `CHECKLISTS.md` | Review gates and quality criteria |
| `PITFALLS.md` | Common mistakes and detection signals |
| `GLOSSARY.md` | Terms that affect interpretation |

Prefer stable, obvious filenames over clever names.

When `--redact-source-map` is present:

- do not create `references/SOURCE-MAP.md`
- do not create a "Source Map" section in `SKILL.md` or any reference file
- remove any empty `SOURCE-MAP.md` created while drafting
- in `--update` mode, leave an existing non-empty `SOURCE-MAP.md` unchanged
  unless the user explicitly asks to remove or rewrite it
- keep source coverage checks in the private working notes only

## Example File Roles

Examples should show how to apply the distilled knowledge:

- before/after transformations
- decision tables
- prompt examples
- review examples
- compact case studies
- source-derived code patterns when licensing allows reuse

Do not copy examples blindly. If a source example is long, convert it into a shorter original example that teaches the same rule.

For programming sources:

- create or update a code examples file when the source uses code to teach practices
- prefer original before/after snippets, tests, refactoring steps, or table-driven examples
- keep snippets compact enough to review in one screen
- label the construction rule or decision each snippet demonstrates
- adapt examples to the source language unless the user or project context calls for a different target language
- do not finish with prose-only examples when the source contained meaningful code examples
- include a short coverage note or table when the source spans many code topics, mapping source areas to example files
- split examples by topic when a single file would hide gaps

## Update Mode

When `--update` is present:

1. Locate the target skill by `--name` or inferred topic.
2. Read its existing `SKILL.md`, references, and examples.
3. Build a gap list from the new material.
4. Patch matching files.
5. Add new files only for new topics.
6. Report what changed and what was intentionally left untouched.

In split mode with `--update`, treat every proposed child skill independently:

1. Build the child skill boundary map.
2. Match each proposed child to existing skills by name, frontmatter
   description, and trigger/workflow overlap.
3. Update matched skills in place.
4. Create new child skills only for uncovered capabilities.
5. Report merged, created, skipped, and renamed candidates.

## Ownership and Context-Gate Alignment

When distilling material into a workflow or quality skill:

- Owner commands write only their owned artifacts.
- Non-owner commands treat project docs, architecture, roadmap, rules, plans and reports as read-only unless the user explicitly asks otherwise.
- Commit/review/verify style skills should keep context gates read-only.
- Use human `WARN` / `ERROR` labels for context findings and end quality gates with a plain verdict line (PASS / WARN / FAIL).

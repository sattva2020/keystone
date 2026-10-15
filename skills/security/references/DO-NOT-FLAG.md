<!-- original Keystone file (MIT) -->

# Do not flag (check every candidate here before reporting)

A candidate that matches a row is dropped — unless the "flag only if" condition holds and you can show it in code.

| Looks like a vulnerability | Why it is not | Flag only if … |
|---|---|---|
| Value from env, settings, config or a constant used in a command / path / query | The server controls it, the attacker does not | the value is later overwritten from request data, or the env is attacker-writable (CI from a fork) |
| `{x}` in React/JSX, `{{ x }}` in Vue/Angular, Django/Jinja autoescape, ERB `<%= %>` | The framework escapes it | an explicit bypass is used on untrusted input: `dangerouslySetInnerHTML`, `v-html`, `\|safe`, `mark_safe`, `raw` |
| Parameterized ORM / query builder (`where(id: x)`, `$1` placeholders, Prisma, SQLAlchemy ORM) | Not string-built SQL | raw SQL (`raw`, `execute`, `$queryRawUnsafe`, f-string) interpolates input |
| Test files, fixtures, mocks, seeds, `__tests__`, `*.spec.*`, `testdata/` | Never runs in production | production code imports the file or it ships in the build |
| Dead or unreachable code (no caller, constant `false`, removed route) | No entry point | you can show a caller or a route that reaches it |
| Example / placeholder secrets (`changeme`, `your-key-here`, `sk-xxxxxxxx`, `.env.example`) | Not real credentials | the value matches a real provider format and is not a documented placeholder |
| CI triggers only maintainers can fire: `workflow_dispatch`, `push` to a protected branch, `schedule`, `release` | No external attacker can start the run | the workflow also runs on `pull_request_target`, `issue_comment` or a fork PR |
| Dev-only tooling not shipped (scripts, local dev-server config, `devDependencies`, Storybook) | Outside the production attack surface | it is exposed publicly or its output reaches the build |
| Missing hardening with no path to an attacker's goal (a header, a rate limit on an internal job) | No exploit path | a concrete abuse sequence exists — then rate it by SEVERITY.md |
| Item in `docs/keystone/security-ignores.md` or, in an AI Factory project, `.ai-factory/SECURITY.md` | The team decided | the entry is older than 12 months or its reason no longer holds (then `ignored — stale`) |

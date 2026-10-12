# Third-party notices

## AI Factory 2.19.0

Portions of Keystone are derived from **AI Factory** (https://github.com/lee-to/ai-factory), npm package
`ai-factory@2.19.0`, licensed under the MIT License as declared in its `package.json` (`"license": "MIT"`).
The upstream package and repository ship no LICENSE file and no copyright line (checked 2026-10-12); the
attribution below names the project and version. If upstream adds a copyright line, it is copied here verbatim.

Derived files (upstream path → Keystone path):

| Upstream (`skills/…` in ai-factory@2.19.0) | Keystone |
|---|---|
| `aif-plan/SKILL.md`, `aif-plan/references/TASK-FORMAT.md`, `aif-plan/references/ULTRA-FORMAT.md` (Required Detail Gate) | `skills/plan/SKILL.md`, `skills/plan/references/PLAN-FORMAT.md` |
| `aif-improve/SKILL.md`, `aif-improve/references/CHECK-MODE.md`, `aif-improve/references/VALIDATOR.md` | `skills/check/SKILL.md`, `skills/check/references/ANALYZE.md`, `skills/check/references/VALIDATOR.md`, `agents/analyzer.md`, `agents/validator.md` |
| `aif-implement/SKILL.md` (and its logging guide) | `skills/implement/SKILL.md`, `skills/implement/references/LOGGING.md` |
| `aif-fix/SKILL.md` | `skills/fix/SKILL.md` |
| `aif-verify/SKILL.md` | `skills/verify/SKILL.md`, `skills/verify/references/CHECKS.md`, `agents/verifier.md` |

Each derived file carries the comment `<!-- derived from ai-factory@2.19.0 … (MIT); see THIRD_PARTY_NOTICES.md -->`.

MIT License text (applies to the derived portions):

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
> rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
> persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
> Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
> WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
> COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

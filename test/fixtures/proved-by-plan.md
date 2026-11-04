# Frozen copy: the Reconciliation table and ## Release of docs/keystone/2026-11-04-proved-by-release-and-debt/plan.md (R2 open)

## Requirements Reconciliation
Authority: intent.md владеет «что»; правил проекта (`CLAUDE.md`, `.claude/rules`, `AGENTS.md`, `docs/architecture.md`) в репо нет.

| Decision | Source | Verification evidence |
|---|---|---|
| Строка с `proved by R<n>` и открытым шагом → `pending R<n>`, без accept, PASS возможен, видна в отчёте | intent — I-1 | Task 1 тест `release refs … open`; Task 2 текстовый тест verifier; Task 3 текстовый тест (Step 4, `Pending:`); Task 7 живой прогон: `Verdict: PASS` и `Row 1 — pending R1` |
| `I-n` со ссылкой на такую строку — тот же статус; пометка только в Reconciliation | intent — I-2 | Task 1 тест: `release refs` несёт I-n из Source; Task 2 текстовый тест (правило I-n, пометка вне таблицы не считается); Task 4 текстовый тест analyzer; Task 7: `I-1 — pending R1` в `verify.md` фикстуры |
| Нет шага `R<n>` или у шага нет `check:` → находка в check и `wrong` в verify | intent — I-3 | Task 1 тесты `no step` / `no check`; Task 2 текстовый тест (`wrong`, `Repro: release refs`); Task 4 текстовый тест `ANALYZE.md` |
| Режим релиза: check прошёл → доказательство в строке; нет → долг | intent — I-4 | Task 5 текстовый тест `skills/implement/SKILL.md`; Task 7 живой прогон: ячейка `— proved <дата>:` и `[x] R1` |
| Accept пишет `## Debt`: id, дата, кто, чем доказать | intent — I-5 | Task 3 текстовый тест `ACCEPT.md`; Task 4 формат `## Debt` в `PLAN-FORMAT.md` |
| `accept D<k> <текст>` закрывает строку после кнопки | intent — I-6 | Task 3 текстовый тест `ACCEPT.md` (`D<k>`, Yes / No, `closed … (accept)`) |
| qa — кейс на открытую строку долга; qa-check закрывает при прохождении | intent — I-7 | Task 6 текстовые тесты `skills/qa/SKILL.md` (`Covers: D<k>`) и `skills/qa-check/SKILL.md` (закрытие, Writes only) |
| Долг виден в плане и отчётах verify и qa-check | intent — I-8 | Task 3 тест: строка `Debt:` в финальном отчёте verify; Task 6 тест: строка `Debt:` в отчёте qa-check; Task 4: `## Debt` в шаблоне |
| Правка `## Debt` не даёт `plan changed` | intent — I-9 | Task 1 тест: изменение `## Debt` (в середине и в конце плана) → `delta: since …`, не `plan changed` |
| План с долгом остаётся `verified`; push-гейт не меняется | intent — I-10 | `git diff <base> -- hooks/` пуст; Task 3 тест: ACCEPT.md ставит `Status: verified`, режим `D<k>` статус не меняет |
| Accept строк без `proved by` — как сейчас; правила для безопасности не меняются | intent — I-11 | существующие тесты `test/keystone.test.mjs:141`, `:532` (`**Accept is never first**`) зелёные; `git diff <base> -- skills/verify/references/AFTER-CHOICE.md` пуст |
| Старые accept не переносятся | intent — I-12 | `git diff --stat <base> -- docs/keystone` называет только `docs/keystone/2026-11-04-proved-by-release-and-debt/` |
| Готово: фикстурные и текстовые тесты + один живой прогон | intent — I-13 | Tasks 1–6 тесты в `npm test`; Task 7 артефакты в `live-run/` |
| Выпуск 0.9.27 в private и public после «да» | intent — I-14 | proved by R2 |
| `skills/verify/SKILL.md` ≤ 22 000 байт | `test/keystone.test.mjs:720` — размер verify | Task 3: `npm test` (тест размера) |

## Release
- [ ] R1. Версия 0.9.27 (`.claude-plugin/plugin.json`, `package.json`, `test/keystone.test.mjs`), дата в `CHANGELOG.md`; влить ветку в локальный `main` в `E:/AI/Skills/keystone`, `npm test` там, `git push origin main` — после «да» — check: `git log origin/main -1` = локальный `main`
- [ ] R2. Публичный релиз: временный worktree от `public/main`, diff от прошлого публичного релиза до нового `main` без приватных папок (`docs/keystone`, `docs/notes`, `docs/social`, adapters, upstream) и без `README.md`, `git apply --3way`, `npm test`, `git push public HEAD:main`, `gh release create v0.9.27 --target main` — после «да» — check: `gh release view v0.9.27` показывает релиз
- [ ] R3. `claude plugin marketplace update keystone` и `claude plugin update keystone@keystone` — check: установленная версия 0.9.27


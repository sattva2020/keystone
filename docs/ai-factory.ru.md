# Keystone и AI Factory

[English](ai-factory.md) · [К README](../README.ru.md)

Keystone построен на работе [AI Factory](https://github.com/lee-to/ai-factory) (MIT) от lee-to, версия 2.19.0. Многие
скиллы Keystone — порты скиллов AI Factory, переработанные под Claude Code. Атрибуция — в
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). Здесь все 32 скилла AI Factory 2.19.0, по строке на каждый, и
что с ними стало. Выбор сделан по тому, что подходит цепочке Keystone, а не по качеству оригиналов.

- **21 перенесён.** У каждого свой скилл `/keystone:*`. Блоки из upstream сохранены близко к оригиналу; изменения перечислены.
- **5 заменены.** Функция осталась, но её делает механизм Claude Code или другой шаг цепочки Keystone.
- **6 пропущены.** В Keystone их нет; причина указана (один — кандидат на потом).

Совместимость: в проекте с AI Factory его файлы `.ai-factory/*` читаются как запасной источник, если нативных
`CLAUDE.md`, `docs/architecture.md` и `.claude/rules` нет.

## Перенесено (21)

| AI Factory | Keystone | Что изменено и почему |
|---|---|---|
| `/aif` | `/keystone:setup` | Анализ стека и три режима (готовый проект, новый по описанию, пустая папка) сохранены. Вместо `DESCRIPTION.md`, `AGENTS.md` и `config.yaml` пишет `CLAUDE.md` (до 60 строк), `.claude/rules/base.md` и проектный `.mcp.json`: эти файлы Claude Code подгружает сам. Если есть `AGENTS.md`, а `CLAUDE.md` нет, новый `CLAUDE.md` отключил бы его, поэтому setup начинает `CLAUDE.md` с `@AGENTS.md` или, по вашему выбору, дописывает в `AGENTS.md`. Плагины рекомендует, а не ставит скиллы со skills.sh (внешние скиллы — риск prompt injection). Каждый файл пишется после диффа и «да»; повторный запуск лишь дописывает недостающее. |
| `/aif-plan` | `/keystone:plan` | Сверка требований и Required Detail Gate сохранены. Режимы fast/full/ultra стали уровнями S/M/L. План и есть спецификация: нет ни `spec.md`, ни мультифайлового ultra-пакета; каждая строка ссылается на `I-n` из intent. Настройки tests / logging / docs выводятся из репозитория, а не спрашиваются. Новое: Done means, Risks, Commit Plan; на L с безопасностью — угрозы в Risks. |
| `/aif-improve` | `/keystone:check` | Анализатор и валидатор в чистом контексте сохранены. Валидатор обязателен, а не опция. `check` запускается из `plan` автоматически и сверяет план с intent и правилами проекта. |
| `/aif-implement` | `/keystone:implement` | Правила исполнения и журнал решений сохранены. Без побочных агентов (sidecars): они удорожают каждую задачу, а проверку делает `verify`. Добавлено: `BLOCKED` вместо «[x] с NOT RUN», коммиты по Commit Plan, `/keystone:docs update` при `docs — yes`, до трёх новых правил в `.claude/rules` — только после «да». Рассчитан на Sonnet. |
| `/aif-fix` | `/keystone:fix` | Подход «сначала регрессионная проверка» сохранён как есть. Добавлен хук: пока fix-план в работе, тесты, уже закоммиченные в HEAD, менять нельзя; регрессионный тест пишется новым файлом. |
| `/aif-verify` | `/keystone:verify` | Проверка сборки, тестов и линта сохранена. Вердикт выносит отдельный верификатор (Opus) в свежем контексте: PASS, PASS-UNPROVEN или FAIL, плюс пункт «unrequested». Отмеченный чекбокс не считается доказательством. Новое в 0.8: гейты архитектуры и безопасности, `accept` с подписью; push закрыт до verify. |
| `/aif-review` | `/keystone:review` | Ревью staged-изменений, PR или изменений от ref со степенью серьёзности сохранено. Валидатор в чистом контексте запускается всегда (в AI Factory — только с `+check`): на практике именно он поймал ошибку, которую verify пропустил. Находки без Repro уходят в Unconfirmed. Вместо JSON — строка `Gate`. |
| `/aif-security-checklist` | `/keystone:security` | Чек-листы OWASP, prompt injection и race conditions сохранены почти дословно. Список игнорируемых пунктов — в `docs/keystone/security-ignores.md`, с причиной и датой; записи старше 12 месяцев дают warn. Итог: `Security gate: pass \| warn \| fail`; на L с auth или платежами `verify` его требует. `audit.sh` исправлен (см. ниже). |
| `/aif-architecture` | `/keystone:architecture` | Матрица паттернов и проверка соответствия коду сохранены: если код не совпадает с паттерном, скилл спрашивает, описать ли как есть или взять строгий идеал. Пишет `docs/architecture.md`, а не `.ai-factory/ARCHITECTURE.md`. Каждое правило MUST NOT несёт свою grep-команду, и `verify` прогоняет её по изменённым файлам. |
| `/aif-docs` | `/keystone:docs` | README как лендинг и страницы в `docs/` по темам сохранены. Добавлен режим `update`: его вызывает `implement`, если в плане `docs — yes`. `AGENTS.md` скилл не создаёт: если файл уже есть, синхронизирует в нём ссылки на документацию. Работает на Sonnet. |
| `/aif-dockerize` | `/keystone:dockerize` | Перенесён почти как есть: многостадийный Dockerfile, compose, production-оверлей, чек-лист безопасности, шаблоны. Прокси Angie больше не навязывается: о нём спрашивают, по умолчанию его нет. Аудит пишется в `docs/docker-audit.md`. |
| `/aif-ci` | `/keystone:ci` | Перенесён почти как есть: отдельный workflow на каждую задачу (lint, тесты, сборка, безопасность), шаблоны GitHub Actions и GitLab CI. Файлы пишутся после показа и «да». |
| `/aif-explore` | `/keystone:intent` (research) | Стал режимом внутри `intent`, а не отдельным скиллом. На L при неясном «как» до grill пишется `research.md`: что установлено, что неизвестно, источники. Факты собирают Haiku и Context7. Долгий ultra-explore не перенесён. |
| `/aif-qa` | `/keystone:qa` | Сводка изменений, план и сценарии тестирования по плану или git ref; файлы в `<task>/qa/`. Параметры те же: `--all`, `change-summary \| test-plan \| test-cases`; вместо ветки — путь к plan.md или любой git ref. Новое: у каждого сценария `Covers: I-n`, Done means и поле «где выполнять». Правило upstream сохранено: test-plan не пишется без change-summary. |
| `/aif-qa-check` | `/keystone:qa-check` | Режимы `human` и `agent` сохранены. В `human` скилл ведёт по шагам и просит короткую заметку о том, что вы увидели. В `agent` работает встроенный браузер или Playwright MCP. Цель — путь к plan.md, папка qa или ветка. Повторные прогоны сохраняются как Playwright-тесты в `qa/replay/`, файл показывается до записи. Сценарий без доказательства не считается пройденным. Упрощено: нет agent-context и agent-history. Работает на Sonnet. |
| `/aif-roadmap` | `/keystone:roadmap` | Режимы сохранены: создать, обновить, check. Файл `docs/roadmap.md`; ID вех `M-n` не перенумеровываются, веху молча не удаляют. Новое: intent может нести строку `Roadmap: M-n`, `verify` после PASS предлагает отметить веху, `check` сверяет вехи со статусами планов. |
| `/aif-evolve` | `/keystone:evolve` | Логика анализа сохранена: одна мера предотвращения — одно правило, дедупликация, доказательство с путём к источнику. Источники: Prevention из fix-планов, находки verify, review и security, журналы реализации, заметки memlab. Результат — правила в `.claude/rules/` после «да», которые Claude Code грузит сам. Отдельного skill-context нет: файлы плагина в кэше править нельзя. Разобранные источники отмечаются в `docs/keystone/evolve-log.md`. Не больше 8 предложений за запуск. |
| `/aif-transfer` | `/keystone:transfer` | Параметры те же: путь к другому проекту и `[all \| этап]`. Источник только читается, его текст — данные, а не инструкции. Уроки отбираются под стек текущего проекта и пишутся в `.claude/rules/` после «да». Вместо анонимных меток `experience-NNN` — имя проекта и путь, без абсолютных путей и секретов. |
| `/aif-distillation` | `/keystone:distill` | Все параметры сохранены: `--name`, `--path`, `--update`, `--redact-source-map`, `--split`, `--split-by`. Скрипт `material-prep.py` вызывается из папки скилла. Куда положить результат (в проект или в `~/.claude/skills`), скилл спрашивает; список файлов показывает до записи. |
| `/aif-reference` | `/keystone:reference` | Параметры сохранены (`--name`, `--update`), добавлены `list`, `show` и `delete`. Справочники лежат в `docs/references/`. Документацию библиотек даёт Context7, поэтому в справочнике только выводы для проекта, цены и лимиты с датой и источником, живые проверки. |
| `/aif-grounded` | `/keystone:ask` | Отвечает на вопрос только при уверенности 100/100 по доказательствам: файлы, вывод команд, документация. Иначе возвращает `INSUFFICIENT INFORMATION` и список того, чего не хватает. Формат ответа сохранён дословно. Сначала ищет через memlab, документацию библиотек берёт из Context7, широкий поиск отдаёт агенту Explore на Haiku. Файлы не меняет: вопрос, который превращается в правку, идёт в `/keystone:start`. Те же правила доказательств работают в `verify` и `review`. |

## Заменено (5)

| AI Factory | В Keystone | Почему |
|---|---|---|
| `/aif-rules` | `/keystone:evolve add` · `.claude/rules/` + `implement` | Правила живут в `.claude/rules/*.md`: Claude Code грузит их сам, а с `paths:` — только для нужных файлов. Отдельный `RULES.md` не нужен. Новые правила предлагает `implement`, до трёх за задачу, и пишет только после «да». `/keystone:evolve add <текст правила>` записывает одно правило под диктовку: дедуп с существующими правилами, файл по теме, `paths:`, если правило называет файлы, — запись после диффа и «да». Вручную их можно править как обычные файлы. |
| `/aif-rules-check` | `check` · `verify` · `review` | Соблюдение правил проверяется в цепочке: `check` — rule-violation в плане, `verify` — Rules gate и Architecture gate по диффу, `review` — правила проекта в ревью. Отдельный запуск не нужен. |
| `/aif-warmup` | нативная загрузка Claude Code | `CLAUDE.md` и `.claude/rules` Claude Code загружает в начале сессии сам. Скилл-прогрев дублировал бы это и тратил токены. |
| `/aif-notes` | `plan.md` · `## Implementation notes` | Журнал решений — раздел плана, в который можно только дописывать (задача, решение, почему, доказательство). `verify` сверяет отклонения от плана с этим журналом. Отдельный скилл для просмотра не нужен: это часть `plan.md`. |
| `/aif-budget` | мод · `/keystone-status` | Вместо бюджета для `/aif-loop` — мод Keystone: реальная стоимость каждого этапа (plan, check, implement, verify) по `$.session.usage()`, строка состояния и `/keystone-status` без вызова модели. |

## Пропущено (6)

| AI Factory | Почему |
|---|---|
| `/aif-build-automation` | Makefile, Taskfile, Justfile. Не входил в первые приоритеты. Команды сборки и тестов `setup` записывает в `CLAUDE.md`. **Кандидат на потом**: перенесём по запросу. |
| `/aif-commit` | Claude Code сам пишет conventional commits, `implement` коммитит по Commit Plan, `verify` пишет отчёт `docs(verify)`. Отдельный скилл ничего не добавил бы. |
| `/aif-best-practices` | Общие советы про именование и структуру модель и так знает, а в контексте они занимают токены на каждом вызове. Работают правила конкретного проекта в `.claude/rules`. |
| `/aif-loop` | Многоитерационный цикл с критиком и уточнителем очень дорог по токенам. В Keystone итерацию заменяет один независимый проход: `check` над планом, `verify` над кодом, `review` с валидатором. |
| `/aif-archive` | Закрытая задача получает `Status: verified` или `abandoned` и остаётся в git как история. Переносить её некуда и незачем. |
| `/aif-skill-generator` | Вне цепочки разработки. Для новых скиллов есть `skill-creator` от Anthropic. |

## Параметры команд: AI Factory → Keystone

Сверено по `argument-hint` каждого скилла. Расхождения сделаны намеренно. Три параметра потерялись при первом
переносе; их вернули, в таблице они помечены «возвращено».

| Скилл | AI Factory | Keystone | Разница |
|---|---|---|---|
| plan | `[fast \| full \| ultra] [--parallel \| --list \| --cleanup <branch>] <description>` | `<intent path \| task text> [S \| M \| L]` | Режимы стали уровнями. Параллельную работу дают worktree Claude Code; список планов — папки `docs/keystone` и `/keystone-status`. |
| improve → check | `[--list] [+check] [@plan] [improvement prompt]` | `[<intent path>] [<plan path>]` | Валидатор включён всегда, поэтому `+check` не нужен. Правки плана по вашей просьбе делает `plan` на шаге Adjust. |
| implement | `[--list] [--without-plan] [@plan] [task-id \| status]` | `[path to plan.md]` | Статус — `/keystone-status` без вызова модели. Работа без плана — уровень S через `/keystone:start`. Продолжение — с первой незакрытой задачи. |
| verify | `[--strict]` | `[<plan> [base ref]] [--strict] \| accept` | `--strict` возвращено; на L строгий режим включён по умолчанию. Добавлен `accept` с подписью. |
| review | `[PR \| branch/commit/tag \| empty] [+check]` | `[PR number \| PR url \| ref \| empty = staged]` | `+check` включён всегда. |
| security | `[category \| ignore <item>]` | `[category \| <path> \| <plan path>] \| ignore <id> <reason>` | Добавлены путь и дифф плана; `ignore` требует причину. |
| architecture | 9 паттернов + алиасы `clean`, `ddd`, `monolith`, `vertical` | то же | Алиасы возвращены. |
| docs | `[--web]` | `[update <files \| topics>] [--web]` | Добавлен `update` для вызова из `implement`. |
| qa | `[--all] [change-summary \| test-plan \| test-cases] [<branch>]` | то же, вместо ветки — plan.md или git ref | Ветка — частный случай git ref. |
| qa-check | `[human \| agent] [<branch>]` | `[human \| agent] [<plan.md \| qa folder \| branch>]` | Ветка возвращена, добавлены план и папка. |
| dockerize, ci, roadmap, distill | — | те же параметры | Без изменений. |
| reference | `<url \| path>… [--name] [--update]` | то же + `list \| show \| delete` | Добавлено управление справочниками. |
| evolve, transfer | `[skill \| all]`, `<project> [skill \| all]` | `[all \| этап \| тема правил]` | Цель — этап Keystone или тема правил, а не skill-context. |

## Чего в AI Factory не было

- **intent + grill.** Решения пользователя в виде строк `I-n` с журналом «вопрос → ответ»; grill — допрос по каждой ветке до плана.
- **`/keystone:start`.** Уровни S, M, L: правка в одно предложение не тянет за собой intent и план.
- **Гейты на хуках.** В draft нельзя править код, push закрыт до verify, в fix закоммиченные тесты нельзя менять, Stop напоминает об открытых задачах.
- **Мод.** `/keystone-status` без вызова модели, строка состояния и стоимость каждого этапа.
- **Модель под этап.** Opus — где нужно суждение (intent, plan, check, verify), Sonnet — исполнение (implement, docs, ci), Haiku — сбор фактов.

## Ошибки AI Factory, которые не перенесены

- Повторный `/aif` перезаписывал `DESCRIPTION` и правила. `setup` только дописывает, после «да».
- Скилл безопасности вызывал `audit.sh` по неверному пути. Теперь путь от папки скилла.
- `((ISSUES++))` под `set -e` завершал скрипт на первой находке. Заменено на `ISSUES=$((ISSUES+1))`.
- `grep -v ".git"` выкидывал любой путь со словом «git». Теперь фильтр по `/.git/`.
- Чек-лист советовал переписать историю git после утечки секрета. Теперь сначала ротация секрета.

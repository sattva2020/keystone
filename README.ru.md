<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/keystone-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/keystone-light.svg">
  <img src="assets/keystone-light.svg" alt="Keystone — intent-first workflow for Claude Code" width="640">
</picture>

**Процесс по размеру задачи. Сначала intent, план как спека, независимая проверка до кода и после.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757)](https://code.claude.com/docs/en/plugins)
[![Latest release](https://img.shields.io/github/v/release/sattva2020/keystone)](https://github.com/sattva2020/keystone/releases)

[English](README.md) | Русский

</div>

## Что это

Keystone — самостоятельный плагин Claude Code: процесс подбирается по размеру задачи. Мелочь делается сразу и
проверяется. Понятная задача идёт через короткий план с рисками. Задача с открытыми решениями проходит всю цепочку:
`intent` → `plan` → независимая проверка плана → `implement` → `verify` в чистом контексте.

План и есть спека: отдельного `spec.md` нет, а каждая строка плана ссылается на пронумерованную строку intent
(`I-1…`). Жёсткие правила держат хуки, а не только текст скиллов.

## Установка

В Claude Code:

```text
/plugin marketplace add sattva2020/keystone
/plugin install keystone@keystone
```

Или из shell:

```bash
claude plugin marketplace add sattva2020/keystone
claude plugin install keystone@keystone
```

Обновление: `claude plugin marketplace update keystone`, затем `claude plugin update keystone@keystone`, затем **новая сессия** — открытая сессия держит ту копию, которую загрузила.

Разовая проба без установки: `claude --plugin-dir <путь-к-репозиторию>`.

Требования: Claude Code 2.1.218 или новее (skills с `background`) и Node.js в `PATH` для хуков. Моду
(`/keystone-status` и строка состояния) нужен Claude Code 2.1.287+ в терминале или 2.1.286+ в Desktop; хуки работают без
него. Скиллы плагина имеют префикс `keystone:`, поэтому личные скиллы из `~/.claude/skills` их не перекрывают.

## Как это работает

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/flow-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/flow-light.svg">
  <img src="assets/flow-light.svg" alt="Путь пользователя Keystone по этапам плейбука AI-native SDLC: Plan → Design → Build → Test → Deploy → Maintain" width="100%">
</picture>

Keystone следует [плейбуку Anthropic AI-native SDLC](https://claude.com/resources/articles/the-ai-native-sdlc-playbook):

| Этап плейбука | Чем заканчивается | В Keystone |
|---|---|---|
| 1. Plan | `intent.md` | `/keystone:intent` — grill спрашивает все решения, которые за вами, и записывает intent вашими словами; вы делаете `accept` |
| 2. Design | `spec.md` | встроен в план: `/keystone:plan` пишет требования и дизайн и до утверждения запускает `/keystone:check` (анализатор + валидатор в чистом контексте) |
| 3. Build | `plan.md`, затем дифф | Approve, `/clear`, `/keystone:implement`: задача за задачей; пока план в draft, правки кода закрыты (хук) |
| 4. Test | проверки + проверяющий в чистом контексте | `/keystone:verify`: сборка, тесты, линтер, затем независимый проверяющий: PASS · PASS-UNPROVEN · FAIL |
| 5. Deploy | смёрженный PR | `git push` / `gh pr create` закрыты, пока verify не прошёл (хук). Шаги релиза (merge, push, деплой, задачи на проде) лежат в разделе плана `## Release`, а не в задачах; после verify `/keystone:implement` выполняет их в режиме релиза, каждый — после вашего «да»: агент готовит релиз, вы его разрешаете |
| 6. Maintain | инцидент → новый `intent.md` | `/keystone:fix` (сначала регрессионный тест) или новый `/keystone:intent`, если находка крупнее |

Не каждой задаче нужны все шесть этапов: сначала `/keystone:start` определяет размер. **S** — правка и проверка.
**M** — короткий план, реализация, проверка. **L** — вся цепочка выше.

Под цепочкой — ряд инструментов, которые запускаете по необходимости: `setup` (контекст проекта), `architecture`, `docs`,
`security`, `review`, `dockerize`, `ci`, `evolve` / `transfer` (уроки в правила), `roadmap`, `ask` / `reference`,
`distill`, `qa` / `qa-check`. Подробно — в [справочнике](docs/skills.ru.md).

## Как это выглядит

Задача уровня L, сокращённо:

```text
> /keystone:start напоминания о просроченных счетах
  Уровень L — решения за вами, затронуты данные и уведомления.
  Дальше: /keystone:intent → /keystone:plan → /clear → /keystone:implement → /keystone:verify
> да
> /keystone:intent напоминания о просроченных счетах
  (grill идёт внутри intent)
  Q1 — Кто создаёт напоминание: система или пользователь?   ➡️ Рекомендую: система — у счёта уже есть due_date (src/billing/invoice.ts:41)
  Q2 — …
  …
  Записан docs/keystone/2026-10-12-invoice-reminders/intent.md — I-1…I-9. Прочитайте целиком и поправьте.
> /keystone:intent accept docs/keystone/2026-10-12-invoice-reminders/intent.md
> /keystone:plan docs/keystone/2026-10-12-invoice-reminders/intent.md
  Settings (по репо): tests — yes · logging — standard · docs — no
  Done means: npm test зелёный; для счёта с просрочкой 1 день появляется строка напоминания
  Risks: повторная отправка при ретрае · часовой пояс «просрочки» · отписка пока не хранится
  Запускаю /keystone:check (анализатор + валидатор в чистых контекстах)…
  Покрытие 9/9 (100%) · 2 находки: задача 4 зависит от задачи 6; «snooze» в задаче 8 не просили. Применить? > да
  Утвердить план? > Approve        (Status: draft → approved, базовый коммит)
> /clear
> /keystone:implement
  Задачи 1–14: сделано 13, 1 BLOCKED: staging SMTP недоступен.
  Blocked on me: staging SMTP.  Changed: 11 файлов.  Found: в схеме нет флага отписки.
> /keystone:verify
  Done means: 1 ok, 1 not proven (доставка email). I-1…I-9: ok 7 · not proven 2. Unrequested: нет.
  Вердикт: PASS-UNPROVEN → verify.md. git push закрыт, пока не докажете или не сделаете /keystone:verify accept.
> /keystone-status
  Level L · implementing · задачи 13/14 · BLOCKED 1 · стоимость: plan $4.10 · check $3.20 · implement $2.30   (без вызова модели)
```

## Уровни

Уровень предлагает агент, подтверждает человек. Любой признак L делает задачу L.

| Уровень | Признаки | Маршрут | Что получаете |
|---|---|---|---|
| **S** | дифф в одно предложение, решений пользователя нет, есть проверка | правка → проверка → отчёт; баг — `/keystone:fix` | правка и строка `Level: S` в отчёте; файлов нет |
| **M** | один очевидный подход, несколько файлов | `/keystone:plan <задача>` → Approve → `/keystone:implement` → `/keystone:verify` | `plan.md` с Risks из трёх пунктов, `verify.md` |
| **L** | несколько решений; данные или схема; безопасность; чужие модули; неясное «готово» | `/keystone:intent` → `/keystone:plan <intent>` (с `/keystone:check`) → Approve → новая сессия → `/keystone:implement` → `/keystone:verify` | `intent.md`, `plan.md` с Coverage, `verify.md` |

Модель под этап: **Opus** — допрос, intent, план, check, verify; **Sonnet** — реализация по одобренному плану;
**Haiku** — поиск фактов. `effort` из frontmatter скилла действует только в ход вызова; для многоходовых
plan/grill/check сессий ставьте `/effort high` на сессию.

Вопросов о тестах, логировании и документации нет. Plan выводит их из репозитория и пишет строкой `Settings:` в
шапке плана; поправить можно при Approve.

## Что запускать дальше

Каждый ответ Keystone заканчивается строкой `Next:` — точная команда с путями или «ничего — ждём …». Та же команда
появляется серой подсказкой в поле ввода (Tab вставляет её), а `/keystone-status` показывает её в любой момент.
Для каждой ситуации — план в draft, verify FAIL, «сделал только grill», «вернулся после перерыва», «ждём деплоя» —
смотрите **[Что запускать дальше — сценарии](docs/scenarios.ru.md)**.

## Команды

Все 25 команд по группам. Параметры в скобках; `|` — выбор.

**Цепочка задачи**

| Команда | Что делает |
|---|---|
| `/keystone:start <задача>` | определяет уровень S/M/L и маршрут |
| `/keystone:grill [тема]` | допрашивает по всему дереву решений; возвращает список решений, файлов не пишет |
| `/keystone:intent [идея]` · `accept <путь>` | `intent.md` вашими словами: строки `I-n`, журнал решений, подпись |
| `/keystone:plan <intent или задача> [S\|M\|L]` | план и есть спека: сверка, правила проекта, Risks, задачи с проверками, Approve |
| `/keystone:check [intent] [план]` | независимая проверка плана в чистых контекстах; % покрытия intent |
| `/keystone:implement [план]` | задачи по порядку, `BLOCKED:` вместо «не запускалось», журнал решений, продолжение после `/clear` |
| `/keystone:verify [план [base]] [--strict]` · `accept` | сборка, тесты, линт, затем проверяющий в чистом контексте; гейты архитектуры и безопасности; PASS / PASS-UNPROVEN / FAIL |
| `/keystone:fix <баг>` | сначала регрессия: падающий тест новым файлом, потом минимальный фикс |

**Контекст проекта**

| Команда | Что делает |
|---|---|
| `/keystone:setup [описание]` | пишет короткий `CLAUDE.md`, `.claude/rules/base.md` и `.mcp.json` проекта после диффа и «да»; импортирует готовый `AGENTS.md` |
| `/keystone:architecture [паттерн]` | подбирает архитектурный паттерн и пишет `docs/architecture.md` с grep-проверкой на каждое правило |
| `/keystone:docs [update <файлы\|темы>] [--web]` | README как лендинг и страницы в `docs/` по темам |

**Проверки и качество**

| Команда | Что делает |
|---|---|
| `/keystone:security [категория\|agent\|supply-chain\|путь\|план] \| ignore <id> <причина>` | аудит по OWASP Top 10:2025 и LLM Top 10 2026, агенты/MCP и цепочка поставок, ссылки на CWE/ASVS/ISO; `Security gate: pass\|warn\|fail` |
| `/keystone:review [PR\|ref\|пусто = staged]` | ревью без правок; валидатор в чистом контексте перепроверяет каждую находку |
| `/keystone:qa [--all] [change-summary\|test-plan\|test-cases] [план\|ref]` | сводка изменений, план тестов и ручные сценарии со ссылками на `I-n` |
| `/keystone:qa-check [human\|agent] [план\|папка qa\|ветка]` | прогоняет сценарии `qa`; pass / fail / blocked с доказательством |
| `/keystone:ask <вопрос>` | отвечает только по доказательствам, иначе `INSUFFICIENT INFORMATION` |
| `/keystone:pentest <URL вашей цели> [отчёт]` | подтверждает находки security на вашем работающем приложении (localhost / staging или URL, который вы назвали своим); один безопасный запрос на находку, повышает или понижает её |
| `/keystone:optimize perf <цель> \| simplify <путь>` | ускоряет или упрощает код по замерам: одна и та же команда до и после, правка остаётся только если цифры улучшились |

**Сборка и выкладка**

| Команда | Что делает |
|---|---|
| `/keystone:dockerize [--audit]` | Dockerfile, compose, усиленный production-оверлей; или аудит |
| `/keystone:ci [github\|gitlab] [--enhance]` | CI-пайплайн из инструментов, которые реально есть в проекте |

**Уроки и знания**

| Команда | Что делает |
|---|---|
| `/keystone:roadmap [check\|видение]` | `docs/roadmap.md` с вехами `M-n` |
| `/keystone:evolve [all\|этап\|тема]` | превращает повторяющиеся уроки в правила `.claude/rules/` после «да» |
| `/keystone:transfer <путь к проекту> [all\|этап\|тема]` | переносит правила и уроки из другого вашего проекта |
| `/keystone:reference <url\|путь>… [--name] [--update]` · `list\|show\|delete` | справочник проекта: выводы, цены, лимиты с источником |
| `/keystone:distill <путь\|url>… [--name] [--path] [--update] [--split]` | превращает книгу или документы в скилл Claude Code |

Полный справочник с моделями, «когда применять» и «кто вызывает»: [`docs/skills.ru.md`](docs/skills.ru.md).

## Гейты (хуки)

Гейты действуют только при **активном плане** — это `plan.md` из самой свежей папки задачи со статусом `draft`,
`approved` или `implementing`. Без такого плана уровень S ничем не блокируется.

| Когда | Что запрещено |
|---|---|
| план в `draft` | правки кода вне папки задачи, пока план не одобрен |
| fix в `implementing` | правка тест-файлов, закоммиченных в `HEAD` (новый регрессионный тест писать можно) |
| план в `implementing`, в `## Tasks` остались `[ ]` без `BLOCKED:` | завершение хода: одно напоминание, вопросы человеку оно не блокирует |
| любой активный план | `git push`, `gh pr create` — до `/keystone:verify` с PASS или `/keystone:verify accept` |

**Релиз после verify.** Push открывается только на verified-плане, поэтому шаги релиза никогда не лежат в `## Tasks` —
план держит их в `## Release` (`R1`, `R2`, …). Verify не считает их открытой работой; при PASS его `Next:` ведёт на
`/keystone:implement <план>`, который в **режиме релиза** выполняет только эти шаги, спрашивает ваше «да» перед каждым
merge, push или деплоем и оставляет план `verified`. Это правило плейбука: *«Агент делает всё до продакшен-ворот и
ничего за ними»*.

Снять гейт: `Status: abandoned` в шапке плана или запуск с `KEYSTONE_GATES=off`. Хуки — обычный Node-скрипт
(`hooks/gate.mjs`), читают только payload хука и файлы плана.

## Файлы

Файлы задачи лежат в `docs/keystone/<YYYY-MM-DD>-<slug>/`: `intent.md`, `plan.md`, `verify.md` — либо в
`paths.specs`, если проект на AI Factory. Шапка плана: `Level · Mode · Status` (плюс `Settings:` и `Done means:`),
Status проходит `draft → approved → implementing → verified`, а `abandoned` возможен на любом шаге; шаги `## Release`
выполняются, когда план уже `verified`. Каждый этап
заканчивается закоммиченным файлом, следующий начинается с его чтения, а не с переписки.

## Замеры

Реальный монорепозиторий Next.js + NestJS + Supabase, свежие изолированные клоны:

- проверка плана: 6 реальных находок и 0 ложных против 2 реальных и 1 ложной у AI Factory `improve +check` на тех же
  двух планах, стоимость сопоставима;
- гейты сработали вживую: правка кода при плане в draft и `git push` отклонены;
- уровень S — около $1 на Sonnet; `verify` честно возвращает `PASS-UNPROVEN`, а не заявляет непроверенное;
- замер grill не дал вывода (симулятор пользователя выдавал решения без вопроса).

Методика, таблицы и ограничения: [`docs/benchmarks.md`](docs/benchmarks.md) (на английском).

## Статус и стоимость (мод)

Рядом с хуками Keystone ставит небольшой [мод](https://code.claude.com/docs/en/plugins/mods) на TypeScript:

- **`/keystone-status`** — активный план, уровень, статус, сделанные задачи, число `BLOCKED`, `Done means`, какие гейты
  включены и сколько стоил каждый этап. Отвечает локально, без вызова модели.
- **Строка состояния** — `Keystone · L · implementing · 13/14 · $9.60` под полем ввода.
- **Счётчик стоимости** — после каждого хода прирост стоимости сессии прибавляется к этапу, который вы запускали
  (`/keystone:plan`, `check`, `implement`…), для активного плана; `implement` и `verify` получают измеренные цифры для
  строки `cost:`.
- **Следующая команда** — после хода Keystone в пустом поле ввода появляется серая подсказка следующего шага с уже
  подставленным путём к плану (`/keystone:implement docs/keystone/…/plan.md`, потом `/keystone:verify …`); Tab или →
  вставляет её.

Моду нужен Claude Code 2.1.287+ в терминале или 2.1.286+ в Desktop. В `claude -p` хуки работают, но ничего не рисуется.

## Интеграции

- **[memlab](https://github.com/sattva2020/memlab) (необязательно, отдельный плагин).** Память проекта: поиск по коду
  и записям решений. Ставится рядом с Keystone:

  ```text
  /plugin marketplace add sattva2020/memlab
  /plugin install memlab@memlab
  ```

  Keystone его не ставит и не настраивает. Если инструменты memlab есть в сессии, `grill`, `intent`, `plan`, `check` и
  `fix` используют `search_decisions` / `search_code` для прошлых решений и мест в коде, а `fix` записывает урок через
  `add_note`. Без memlab всё работает как раньше.

- **[Dokploy MCP](https://github.com/sattva2020/dokploy-mcp) (по желанию, `@sattva/dokploy-mcp`).** Весь API Dokploy
  через 4 инструмента-шлюза (~1% контекста): деплой, логи, домены, базы, бэкапы. Если проект деплоится на Dokploy,
  `/keystone:setup` предложит его в проектный `.mcp.json` (`${DOKPLOY_URL}`, `${DOKPLOY_API_KEY}`), а
  `/keystone:dockerize` упомянет в итоге.

## На чём основан

- [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) (Anthropic): каждый этап
  заканчивается закоммиченным файлом, следующий начинается с его чтения, а проверка идёт в свежем контексте, чтобы на
  вердикт не влияли допущения, из которых вырос код.
- [Claude Code best practices](https://code.claude.com/docs/en/best-practices): если дифф описывается одним
  предложением, план не нужен; у Claude должен быть способ проверить свою работу; для жёстких правил — хуки;
  исследование — в субагентах; реализация — в новой сессии; рецензент — в чистом контексте.

Что адаптировано: в плейбуке между intent и планом есть `spec.md`; в Keystone его нет, **план и есть спека**. Уровни
S/M/L добавлены здесь.

Благодарности: 21 скилл портирован из [AI Factory](https://github.com/lee-to/ai-factory) 2.19.0 (MIT) и доработан,
5 его скиллов заменены механизмами Claude Code, 6 пропущены; что взято и почему — в
[`docs/ai-factory.ru.md`](docs/ai-factory.ru.md). Атрибуция: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). С KeystoneJS и keystone-engine проект не связан.

## Ограничения

- Хуки проверены на Windows (PowerShell и Git Bash). macOS и Linux не проверены: CI гоняет юнит-тесты на обеих, но
  живых прогонов там не было.
- Headless-стенду нужен ваш проект и ваши сценарии; в репозитории их нет.
- Замер grill не дал вывода, поэтому «лучше универсального скилла-допроса» не утверждается.
- Результаты получены на одном корпусе, по одному прогону на сценарий.

## Участие, отзывы, безопасность

- Перед PR прочитайте [`CONTRIBUTING.md`](CONTRIBUTING.md); начните с issue или Discussion.
- Расскажите, как прошло, через форму *Feedback* или [Discussions](https://github.com/sattva2020/keystone/discussions).
- Об уязвимостях сообщайте приватно: [`SECURITY.md`](SECURITY.md). Правила сообщества: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- История версий: [`CHANGELOG.md`](CHANGELOG.md). Интерактивная справка: [`docs/guide.ru.html`](docs/guide.ru.html).

## Лицензия

MIT, см. [`LICENSE`](LICENSE). Части, портированные из AI Factory 2.19.0, тоже под MIT — см.
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

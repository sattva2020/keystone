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

Разовая проба без установки: `claude --plugin-dir <путь-к-репозиторию>`.

Требования: Claude Code 2.1.218 или новее (skills с `background`) и Node.js в `PATH` для хуков. Скиллы плагина имеют
префикс `keystone:`, поэтому личные скиллы из `~/.claude/skills` их не перекрывают.

## Как это выглядит

Задача уровня L, сокращённо:

```text
> /keystone:start напоминания о просроченных счетах
  Level: L — несколько решений пользователя, данные и уведомления. Предлагаю: intent → plan → check → implement → verify.
> да
> /keystone:intent
  Допрос, раунд 1/3: кто создаёт напоминание — система или пользователь? (рекомендую: система) ...
  ...
  Записан docs/keystone/2026-10-12-invoice-reminders/intent.md — 9 строк, I-1…I-9. Подтверждаете?
> accept
> /keystone:plan docs/keystone/2026-10-12-invoice-reminders/intent.md
  Сверка: I-1…I-9 → 14 строк плана. Rules check: 1 конфликт (логирование) — снят.
  Risks: 1) повторная отправка при ретрае 2) часовой пояс «просрочки» 3) отписка пока не хранится
  План записан: Level: L · Mode: feature · Status: draft. Approve?
> /keystone:check
  Coverage: 9/9 строк intent (100%). Находки: 2 реальные — задача 4 зависит от задачи 6; «snooze» в задаче 8 не просили.
  Правим план? > да
> Approve plan            (Status: draft → approved)
> /clear → /keystone:implement
  Задачи 1–14, отмечено 13. 1 BLOCKED: staging SMTP недоступен.
  Blocked on me: staging SMTP. Changed: 11 файлов. Found: в схеме нет флага отписки.
> /keystone:verify
  I-1…I-9: ok 7 · not proven 2 (доставка email). unrequested: нет.
  Вердикт: PASS-UNPROVEN → docs/keystone/2026-10-12-invoice-reminders/verify.md
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

## Команды

| Команда | Что делает |
|---|---|
| `/keystone:start <задача>` | уровень S/M/L, маршрут, бюджет исследования; необратимые внешние действия — только после проверки предпосылок |
| `/keystone:grill [тема]` | допрос раундами по всему дереву решений: реализация, UX, крайние случаи, отказы, данные, безопасность, компромиссы, что значит «готово». Факты ищет агент, решения принимаете вы |
| `/keystone:intent [идея]` · `accept <путь>` | `intent.md` словами автора: строки `I-n`, журнал решений, подпись человека |
| `/keystone:plan <intent или задача>` | таблица сверки с intent, проверка правил проекта, Risks, задачи с файлами и проверками, Approve с базовым коммитом |
| `/keystone:check [intent] [план]` | независимая проверка в чистых контекстах: анализатор (код, версии библиотек, деплой и env, privacy, вычисления, платформы) и валидатор; % покрытия intent; правки в план — только после вашего ответа |
| `/keystone:implement [план]` | задачи по порядку с `[x]` после каждой, продолжение после `/clear`; отклонение правится в плане в том же коммите; буквальный `BLOCKED:`; отчёт по каждой строке |
| `/keystone:fix <баг>` | сначала регрессия: воспроизвести, написать падающий тест новым файлом, починить, та же проверка зелёная. S — сразу, M — через план |
| `/keystone:verify [план]` · `accept` | сборка, тесты, линтер; затем проверяющий в чистом контексте: ok / missing / wrong / not proven / BLOCKED по каждой строке, unrequested, состязательный проход по изменённой логике. Вердикт PASS / PASS-UNPROVEN / FAIL, результат в `verify.md` |

## Гейты (хуки)

Гейты действуют только при **активном плане** — это `plan.md` из самой свежей папки задачи со статусом `draft`,
`approved` или `implementing`. Без такого плана уровень S ничем не блокируется.

| Когда | Что запрещено |
|---|---|
| план в `draft` | правки кода вне папки задачи, пока план не одобрен |
| fix в `implementing` | правка тест-файлов, закоммиченных в `HEAD` (новый регрессионный тест писать можно) |
| план в `implementing`, в `## Tasks` остались `[ ]` без `BLOCKED:` | завершение хода: одно напоминание, вопросы человеку оно не блокирует |
| любой активный план | `git push`, `gh pr create` — до `/keystone:verify` с PASS или `/keystone:verify accept` |

Снять гейт: `Status: abandoned` в шапке плана или запуск с `KEYSTONE_GATES=off`. Хуки — обычный Node-скрипт
(`hooks/gate.mjs`), читают только payload хука и файлы плана.

## Файлы

Файлы задачи лежат в `docs/keystone/<YYYY-MM-DD>-<slug>/`: `intent.md`, `plan.md`, `verify.md` — либо в
`paths.specs`, если проект на AI Factory. Шапка плана: `Level · Mode · Status` (плюс `Settings:` и `Done means:`),
Status проходит `draft → approved → implementing → verified`, а `abandoned` возможен на любом шаге. Каждый этап
заканчивается закоммиченным файлом, следующий начинается с его чтения, а не с переписки.

## Замеры

Реальный монорепозиторий Next.js + NestJS + Supabase, свежие изолированные клоны:

- проверка плана: 6 реальных находок и 0 ложных против 2 реальных и 1 ложной у AI Factory `improve +check` на тех же
  двух планах, стоимость сопоставима;
- гейты сработали вживую: правка кода при плане в draft и `git push` отклонены;
- уровень S — около $1 на Sonnet; `verify` честно возвращает `PASS-UNPROVEN`, а не заявляет непроверенное;
- замер grill не дал вывода (симулятор пользователя выдавал решения без вопроса).

Методика, таблицы и ограничения: [`docs/benchmarks.md`](docs/benchmarks.md) (на английском).

## Интеграции

- **memlab MCP (необязательно).** Если сервер подключён, скиллы используют `search_decisions` и `search_code` для
  прошлых решений и поиска кода, а `add_note` — для записи решений проекта. Без него всё работает.
- **Адаптер AI Factory (заморожен).** Для проектов, где план пишет `/aif-plan`, `adapters/ai-factory` встраивает
  правила Keystone в `/aif-plan`, `/aif-implement` и `/aif-verify`. Установка:
  `ai-factory extension add <repo>/adapters/ai-factory`. Новые механики появляются только в плагине.

## На чём основан

- [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) (Anthropic): каждый этап
  заканчивается закоммиченным файлом, следующий начинается с его чтения, а проверка идёт в свежем контексте, чтобы на
  вердикт не влияли допущения, из которых вырос код.
- [Claude Code best practices](https://code.claude.com/docs/en/best-practices): если дифф описывается одним
  предложением, план не нужен; у Claude должен быть способ проверить свою работу; для жёстких правил — хуки;
  исследование — в субагентах; реализация — в новой сессии; рецензент — в чистом контексте.

Что адаптировано: в плейбуке между intent и планом есть `spec.md`; в Keystone его нет, **план и есть спека**. Уровни
S/M/L добавлены здесь.

Благодарности: скиллы plan, check, implement, fix и verify портированы из
[AI Factory](https://github.com/lee-to/ai-factory) 2.19.0 (MIT) и доработаны, см.
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). С KeystoneJS и keystone-engine проект не связан.

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

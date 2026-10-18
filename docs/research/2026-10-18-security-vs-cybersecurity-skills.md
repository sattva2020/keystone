# /keystone:security vs Anthropic-Cybersecurity-Skills — сравнение с доказательствами

Дата: 2026-10-18 · Их версия: `mukul975/Anthropic-Cybersecurity-Skills` @ `54a7988` (2026-08-31), локально `E:\AI\Skills\Anthropic-Cybersecurity-Skills` ·
Наша версия: Keystone 0.9.17, `skills/security/` (SKILL.md + 9 references + `scripts/audit.sh`).

## Как сравнивали

1. **Машинные метрики по всем 818 SKILL.md** — скрипт с регулярками (OWASP-редакции, CWE, `@latest`, `curl | sh`, `pip install` без версии и т. п.).
2. **Построчная сверка 163 профильных скиллов** — 5 агентов (Opus), каждый читал свою группу целиком и наши references целиком; каждая строка ниже — с `file:line`.
   Группы: ai-security (14), web/application-security (46), api-security (28), devsecops + supply-chain (26), container-security + cryptography (49).
3. **Выборочная ручная перепроверка** самых сильных утверждений обеих сторон (раздел «Перепроверено вручную»).

Остальные ~655 скиллов (SOC, threat hunting, форензика, малварь, red team, OT/ICS, облачные операции) не сравнивались построчно: это работа с живой инфраструктурой, а не аудит кода проекта — задача `/keystone:security` другая.

**Ограничения.** Часть их дефектов про версии инструментов (gitleaks, trivy, garak, PyRIT, pinecone) агенты отметили «по памяти, не по документации» — они помечены ниже ⚠️. Числа по группам пересекаются (JWT, mass assignment, XXE, OAuth всплыли в нескольких группах).

## 1. Итог одной таблицей

| Измерение | Anthropic-Cybersecurity-Skills | /keystone:security | Кто сильнее | Доказательство |
|---|---|---|---|---|
| Назначение | 818 пошаговых процедур: пентест, SOC, DFIR, внедрение инструментов | read-only статический аудит кода/конфига/диффа проекта | разные задачи | их README; наш `SKILL.md:12-16` |
| Доля по теме «аудит кода проекта» | ~114 прямо + ~49 частично из 818 (≈20%) | 100% | — | подсчёт по `subdomain:` |
| Ширина: классов проверок только у них (применимо к статике) | **100** (с пересечениями между группами) | — | **они** | разделы 2–6 |
| Ширина: классов проверок только у нас | — | **80** (с пересечениями) | — | разделы 2–6 |
| Критерий находки | нет единого; «Validation»-раздел у 280/818 | `file:line` + прослеженный путь entry→sink; HIGH/MEDIUM/LOW; MEDIUM → «Needs verification» | **мы** | наш `SKILL.md:86-91` |
| Контроль ложных срабатываний | слово «false positive» в 134/818, без правил | `DO-NOT-FLAG.md`, «не находка»-строки в каждом reference | **мы** | `references/DO-NOT-FLAG.md` |
| Severity | CVSS/«severity» упоминается в 242/818, рубрики нет; есть самопротиворечие (CVSS 7.2 в CRITICAL при пороге ≥9.0) | одна рубрика `SEVERITY.md` | **мы** | `analyzing-sbom-for-supply-chain-vulnerabilities/SKILL.md:202-203 vs 245-246` |
| Gate / ignore-list | нет | `Security gate: pass/warn/fail`, `security-ignores.md` с автором, датой, протуханием через 12 мес. | **мы** | наш `SKILL.md` §ignore-list, §Output |
| Редакция OWASP Top 10 | **0** скиллов ссылаются на 2025; **23** подают 2021 как текущую (27 ссылок) | только `Axx:2025`, редакция обязательна | **мы** | метрика; напр. `exploiting-server-side-request-forgery/SKILL.md:326` «A10:2021» |
| CWE | 4 скилла из 818 | у каждой находки, таблица | **мы** | метрика; `references/MAPPING.md:19-48` |
| Фреймворки ATT&CK / ATLAS / D3FEND / NIST CSF | 805 / ATLAS / 139 / 804 скиллов | нет | **они** (но для аудита кода второстепенно) | их README |
| Гигиена собственных инструкций | `@latest` в 20, `curl\|sh` в 15, `pip install` без версии в 140 скиллах; **99** подтверждённых дефектов в 163 профильных | 0 небезопасных установок; **38** дефектов/пробелов | **мы** по качеству, но у нас тоже есть ошибки | разделы 7–8 |
| Инструменты (mcp-scan, garak, PyRIT, semgrep, trivy, checkov, cosign…) | подробные how-to | только `npm/pip/cargo audit`, `gitleaks` | **они** | — |

**Вывод без прикрас.** «У нас всё лучше» — неверно. Мы лучше как *метод аудита* (строгость находки, ложные срабатывания, severity, gate, актуальные OWASP 2025/LLM 2026) и в нишах агент/MCP/CI/LLM. Они заметно шире по *покрытию классов уязвимостей*: API (JWT alg-confusion, OAuth, GraphQL, mass assignment), криптография (A04:2025 у нас фактически пуст), IaC/K8s/Dockerfile. При этом их тексты содержат много ошибок и небезопасных инструкций — подключать их как есть нельзя.

## 2. AI / MCP / агенты (их 14 скиллов)

| Проверка | Их | Наш | Кто точнее |
|---|---|---|---|
| Секреты-литералы в `.mcp.json` / settings | — | `AGENT-MCP.md:11` | только мы |
| Непиннутый MCP-сервер (`npx -y`, `@latest`, `uvx`) | сами нарушают (`auditing-mcp-servers-for-tool-poisoning/SKILL.md:49,52`) | `AGENT-MCP.md:12` | только мы |
| `Bash(*)`, `--dangerously-skip-permissions`, хуки с `curl\|sh` | — | `AGENT-MCP.md:13-14` | только мы |
| AI-агент в CI на PR head (claude-code-action) | — | `SUPPLY-CHAIN.md:20-27` | только мы |
| Вывод LLM в innerHTML/SQL/eval; markdown-image exfiltration; лимиты потребления | — | `PROMPT-INJECTION.md:23,33-35,47-49,88-115` | только мы |
| Скрытые инструкции / Unicode в описаниях тулов **своего** MCP-сервера | `auditing-mcp-servers-for-tool-poisoning` | — | только они |
| Удалённый MCP без auth / bind 0.0.0.0; `file://` в fetch-туле | там же | — | только они |
| Toxic flow (чтение приватного + недоверенный ввод + egress) | там же | — | только они |
| Аудит-лог вызовов тулов; fail-closed подтверждение; `additionalProperties:false` в аргументах | `securing-agentic-ai-tool-invocation` | частично `AGENT-MCP.md:17,19` | они |
| pickle-веса вместо safetensors, веса без хэша, `trust_remote_code` | `detecting-data-and-model-poisoning` | только общий `pickle.load` | они |
| Отдача logits / raw similarity клиенту | `detecting-model-extraction-attacks`, `assessing-vector-and-embedding-weaknesses` | — | только они |
| Нормализация Unicode tag / zero-width при ingestion | `detecting-indirect-prompt-injection` | наш `stripControlChars` их не снимает | они |
| Indirect injection — finding или нет | перечисляют каналы | решаем по досягаемости тулов (`PROMPT-INJECTION.md:29-30`) | мы |
| Least-privilege креды агента | пример противоречит сам себе: `"Resource": "*"` | `AGENT-MCP.md` | мы |

## 3. Web (их 46 скиллов)

Пересечения (SQLi, NoSQLi, SSRF, CSRF, XSS, IDOR, десериализация, race, traversal, access control, секреты): **для статического аудита точнее мы** — у нас unsafe/safe-форма кода + grep-стартер, у них live-payload'ы. Исключения, где точнее они: **JWT** (algorithm confusion RS256→HS256, `kid`) и **security headers** (поимённый разбор).

Есть только у них (применимо к статике): mass assignment · prototype pollution · OAuth/OIDC misconfig · open redirect · Host header injection · CORS (reflect Origin + credentials) · GraphQL · WebSocket · PHP type juggling · **XXE** · email-header (CRLF) injection · second-order SQLi.

Есть только у нас: LLM/prompt injection · агент/MCP-конфиг · fail-open catch (A10:2025) · `rm -rf`/`DROP` по производному пути · client debug-логи · OS command injection · CI expression injection + SHA-пиннинг · supply chain как статика · file upload.

## 4. API (их 28 скиллов)

Только у них (18 применимы к статике): JWT alg-confusion и `kid`/`jku` injection · mass assignment/BOPLA · OAuth2 `redirect_uri` по префиксу, нет PKCE S256/state/одноразового кода/`aud` · слабый HS256-секрет · GraphQL introspection в проде, нет depth/complexity лимитов, field-level authz · XXE/billion laughs в SOAP · CSWSH (нет проверки Origin) и authz только на handshake у WebSocket · API-ключи в БД в открытом виде · rate limit по `X-Forwarded-For` · перечисление аккаунтов по ответам · BFLA через смену метода/версии API.

Пересечения: IDOR/BOLA, BFLA, excessive data exposure, JWT alg:none, rate limiting — **точнее они** (у нас по одной строке). SQLi/NoSQLi/command injection, SSRF, JWT claims, verbose errors — **точнее мы**.

Только у нас: XSS, CSRF, хэширование паролей и сессии (`AUTH.md`), секреты, заголовки, supply chain, race conditions (`RACE.md`, 141 строка), LLM, MCP, fail-open, деструктивные пути, десериализация, upload, SSTI.

## 5. Supply chain / DevSecOps (их 26 скиллов)

Только у нас: AI-агент в CI · планка «5 элементов» для HIGH в CI · модель угроз «внешний атакующий без write», maintainer-only триггеры — не находка · self-hosted runner в публичном репо · lockfile + `npm ci` · `curl|sh` в Dockerfile · UNASSESSED вместо тихого pass без сети · отсутствие SBOM на внутреннем приложении — hardening, не находка.

Только у них (30 применимы к статике), главное: IaC (Terraform: публичный S3, `0.0.0.0/0`, IMDSv1) · K8s (privileged, limits, securityContext, `:latest`) · Dockerfile (USER, секреты в ENV/ARG, `ADD`, multi-stage) · dependency confusion поимённо (`pip extra-index-url`, `.npmrc @scope:registry`, Maven `mirrorOf *`) · slopsquatting (галлюцинированные имена пакетов) · CODEOWNERS на `.github/workflows`, Dependabot для actions, protected `environment:` · строки подключения к БД с паролем · insecure randomness.

Пересечения: SHA-пиннинг actions и `permissions: {}` — **они** (Dependabot, deny-all по умолчанию); `pull_request_target`, expression injection, ignore-list с протуханием, десериализация — **мы**; их Semgrep-правила для CSRF и SQLi нерабочие (см. раздел 7) — там **мы**.

## 6. Контейнеры и криптография (их 49 скиллов)

Наборы почти ортогональны. Вся прикладная веб-поверхность — только у нас. Только у них (26 применимы к статике):

- **Криптография (A04:2025 у нас пуст):** ECB · DES/3DES/RC4/Blowfish · слабый KDF (PBKDF2 < 600 000) · повтор nonce в AES-GCM · не-CSPRNG / предсказуемый IV · RSA < 2048 · PKCS#1 v1.5 вместо OAEP/PSS · TLS 1.0/1.1/SSLv3 в конфиге · JWK-инъекция в JWT.
- **K8s/контейнеры:** privileged · `allowPrivilegeEscalation` · hostPID/hostNetwork/hostPath · capabilities не `drop: ALL` · `docker.sock` в контейнере · `readOnlyRootFilesystem` · seccomp `RuntimeDefault` · тег вместо digest · RBAC wildcards / `escalate`, `bind`, `impersonate` · `automountServiceAccountToken` · Secrets без encryption at rest · пароли в Helm values.

## 7. Дефекты у них (99 подтверждённых в 163 профильных скиллах)

| Тип | Примеры (`file:line`) |
|---|---|
| Небезопасная установка в скилле по безопасности | `auditing-mcp-servers-for-tool-poisoning/SKILL.md:49` `curl … \| sh` и `:52` `mcp-scan@latest`; `generating-and-analyzing-sboms/SKILL.md:53-54` `curl …/main/install.sh \| sh`; `scanning-iac-and-images-with-trivy/SKILL.md:67,70,216` curl\|sh + `trivy:latest` + `trivy-action@master`; `red-teaming-llms-with-garak/SKILL.md:60` `@main` |
| Ослабление защиты в «безопасном» примере | `securing-agentic-ai-tool-invocation/SKILL.md:141` `"Resource": "*"` под заголовком least-privilege; `verifying-build-provenance-with-slsa-sigstore/SKILL.md:108` `--certificate-identity-regexp '.*'` (противоречит своему же `:80`); `implementing-api-rate-limiting-and-throttling/SKILL.md:478` fail-open подан как достоинство; `performing-api-inventory-and-discovery/SKILL.md:185` `verify=False`; `exploiting-sql-injection-with-sqlmap/SKILL.md:62` `curl -k` |
| Устаревшие стандарты | OWASP 2021 как текущий в 23 скиллах; `performing-security-headers-audit/SKILL.md:167` «X-XSS-Protection still useful»; `performing-kubernetes-etcd-security-assessment/SKILL.md:83` `aescbc` как «secure»; `configuring-hsm-for-key-storage/SKILL.md:70` только FIPS 140-2; `continuous-llm-red-teaming-with-promptfoo/SKILL.md:195` LLM06 вместо LLM02 |
| Нерабочие правила / конфиги | Rego связывает индекс вместо объекта — правило никогда не срабатывает (`implementing-aqua-security-for-container-scanning/SKILL.md:216-219`); OPA privileged не видит Deployment (`implementing-policy-as-code-with-open-policy-agent/SKILL.md:157`); инвертированное CSRF-правило Semgrep (`integrating-sast-into-github-actions-pipeline/SKILL.md:180-188`); невалидный SQLi-паттерн (`implementing-semgrep-for-custom-sast-rules/SKILL.md:103`); неверные ID Checkov, где `skip` отключает проверку public access block (`implementing-infrastructure-as-code-security-scanning/SKILL.md:75,182,209,258`); Dockerfile, который не собирается (`performing-container-image-hardening/SKILL.md:119,130-133`); неверный `--certificate-identity` (`implementing-code-signing-for-artifacts/SKILL.md:147-148`) |
| Секрет в выражении | `implementing-code-signing-for-artifacts/SKILL.md:105` `echo "${{ secrets.GPG_PRIVATE_KEY }}"` |
| Несогласованность между скиллами | разные флаги garak и два несовместимых API PyRIT в соседних скиллах; разные имена одних и тех же ATLAS-id |
| ⚠️ По памяти агентов, без сверки с docs | `gitleaks protect` устарел; `tfsec` влит в Trivy; `.trivyignore.yaml` ключ `expired_at`; `pinecone-client` переименован; `leakreplay` в garak — не про system prompt |

## 8. Дефекты у нас (38) — это и есть список работ

| Где | Проблема |
|---|---|
| `references/CHECKLIST.md:44` | SSRF: в списке приватных диапазонов нет `172.16.0.0/12`, `192.168.0.0/16`, `fd00::/8` — аудитор может пропустить fetch во внутреннюю сеть |
| `references/PROMPT-INJECTION.md:59-65` | разделение system/user помечено «✅ SAFE», хотя `:5-7` говорит, что надёжной защиты нет — может закрыть реальную находку |
| `references/PROMPT-INJECTION.md:120` | regex `sk-[a-zA-Z0-9]{32,}` не ловит `sk-proj-…`, `sk-ant-…` |
| `references/PROMPT-INJECTION.md:77` | `stripControlChars` не снимает Unicode tag (U+E0000–E007F) и zero-width |
| `references/SUPPLY-CHAIN.md:42` | grep пиннинга пропускает `@0.28.0`, `@1.2.0`, ветки, `docker://` |
| `references/SUPPLY-CHAIN.md:43` | grep `npm (install\|i) ` не ловит `npm install` в конце строки |
| `SUPPLY-CHAIN.md:14` vs `CHECKLIST.md:140` | `pull_request_target` + PR checkout: critical в одном файле, High в другом |
| `references/SUPPLY-CHAIN.md:38` | базовый образ «по тегу или digest» — тег мутабелен, расходится с правилом SHA для actions |
| `references/CHECKLIST.md:8` | заявлена разметка по OWASP 2025, но разделов **A04 Cryptographic Failures** и **A09 Logging** нет |
| `references/CHECKLIST.md:70` | рекомендуется устаревший `git filter-branch` (нужен `git filter-repo`) |
| `references/CHECKLIST.md:83-90` | нет IaC (Terraform/CloudFormation) и K8s-манифестов; Dockerfile — одна строка |
| `references/AUTH.md:42-69` | нет OAuth2/OIDC (redirect_uri, PKCE, state, aud) и JWT alg-confusion/`kid` |
| `references/CHECKLIST.md:74-81` | нет mass assignment, GraphQL, XXE, open redirect, prototype pollution |
| `references/AGENT-MCP.md` | нет проверок кода своего MCP-сервера (описания тулов, auth транспорта, `file://`), аудит-лога вызовов, fail-closed |
| `references/MAPPING.md:13-16` | имена LLM Top 10 2026 помечены «secondary», но обязательны в каждом Refs |
| `scripts/audit.sh:92-109` | аудит зависимостей только для npm: Python/Rust/Go не проверяются **и не дают UNASSESSED** — gate может тихо пройти |
| `scripts/audit.sh:113-121` | console/raw-error ищутся только в `src/`; `grep -v "test"` выкидывает строки со словом `latest` |
| `scripts/audit.sh:80` | `.env` в `.gitignore` «найден» по `.env.example` или `!.env` |

## 9. Перепроверено вручную (2026-10-18)

Открыл файлы сам — всё подтвердилось: `auditing-mcp-servers-for-tool-poisoning/SKILL.md:49,52`; `securing-agentic-ai-tool-invocation/SKILL.md:141`; `verifying-build-provenance-with-slsa-sigstore/SKILL.md:108`; `performing-security-headers-audit/SKILL.md:167`; `implementing-api-rate-limiting-and-throttling/SKILL.md:478`. У нас: `CHECKLIST.md:44` (нет 172.16/192.168), `SUPPLY-CHAIN.md:42-43`, `CHECKLIST.md:140` (High), `PROMPT-INJECTION.md:59-65` («✅ SAFE»), `CHECKLIST.md:70` (`filter-branch`), отсутствие A04/A09 в `CHECKLIST.md`.

## 10. Что из этого следует для Keystone

1. **Сначала починить наши ошибки** (раздел 8, первые 9 строк и `audit.sh`) — это баги, а не новые фичи; часть даёт ложный pass.
2. **Добавить классы, которых нет** (своими словами, без копирования текста): A04 криптография; API — JWT alg-confusion/`kid`, OAuth2/OIDC, mass assignment, GraphQL, XXE, open redirect, CORS, WebSocket; IaC/K8s/Dockerfile; код своего MCP-сервера и агентные тулы; ML-веса.
3. **Не подключать их скиллы как есть**: 99 дефектов в 163 профильных, 0 ссылок на OWASP 2025, установки через `@latest`/`curl|sh`.
4. **Не брать** ATT&CK/D3FEND-разметку и runtime/SOC/DFIR — не задача статического аудита.

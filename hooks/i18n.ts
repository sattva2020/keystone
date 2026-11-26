// Keystone mod's words for people, one row per string: English is required, any other language falls back to it.
// Text for the agent (handoffPrompt, the marker) stays English and is not here. de/fr/es are machine translations.

export const LANGS = ['en', 'ru', 'de', 'fr', 'es'] as const
export type Lang = (typeof LANGS)[number]
export type Row<V> = { en: V } & Partial<Record<Exclude<Lang, 'en'>, V>>

export const pick = <V>(row: Row<V>, lang: Lang): V => row[lang] ?? row.en

const rows = <T extends Record<string, Row<unknown>>>(t: T) => t

const T = rows({
  status: { en: 'status', ru: 'статус', de: 'Status', fr: 'statut', es: 'estado' },
  plan: { en: 'Plan', ru: 'План', de: 'Plan', fr: 'Plan', es: 'Plan' },
  context: { en: 'Context', ru: 'Контекст', de: 'Kontext', fr: 'Contexte', es: 'Contexto' },
  handoff: { en: 'Hand off', ru: 'Передать', de: 'Übergeben', fr: 'Transmettre', es: 'Traspasar' },
  later: { en: 'Later', ru: 'Позже', de: 'Später', fr: 'Plus tard', es: 'Más tarde' },
  clean: { en: 'Start clean', ru: 'Начать чисто', de: 'Sauber starten', fr: 'Repartir à neuf', es: 'Empezar limpio' },
  save: { en: 'Save and start', ru: 'Записать и начать', de: 'Speichern und starten', fr: 'Enregistrer et repartir', es: 'Guardar y empezar' },
  cleanNote: {
    en: 'Start clean — no re-reading; anything not saved in the plan is lost',
    ru: 'Начать чисто — без перечитывания, незаписанное в план пропадёт',
    de: 'Sauber starten — ohne erneutes Lesen; was nicht im Plan steht, geht verloren',
    fr: 'Repartir à neuf — sans relecture ; ce qui n’est pas dans le plan est perdu',
    es: 'Empezar limpio: sin releer; lo que no esté en el plan se pierde',
  },
  unbound: {
    en: (name: string) => `Keystone: plan ${name} is not this session's yet`,
    ru: (name: string) => `Keystone: план ${name} ещё не привязан к этой сессии`,
    de: (name: string) => `Keystone: Plan ${name} gehört noch nicht zu dieser Sitzung`,
    fr: (name: string) => `Keystone : le plan ${name} n’est pas encore lié à cette session`,
    es: (name: string) => `Keystone: el plan ${name} aún no está vinculado a esta sesión`,
  },
  h: { en: 'h', ru: 'ч' },
  min: { en: 'min', ru: 'мин' },
  cold: {
    en: (ago: string, k: string) => `Cache went cold (${ago} ago): the next answer re-reads ${k} from scratch`,
    ru: (ago: string, k: string) => `Кэш остыл (${ago} назад): следующий ответ перечитает ${k} заново`,
    de: (ago: string, k: string) => `Cache abgekühlt (vor ${ago}): die nächste Antwort liest ${k} neu`,
    fr: (ago: string, k: string) => `Cache refroidi (il y a ${ago}) : la prochaine réponse relira ${k} en entier`,
    es: (ago: string, k: string) => `Caché enfriada (hace ${ago}): la siguiente respuesta releerá ${k} desde cero`,
  },
  noPlan: {
    en: 'No active Keystone plan — nothing to hand off.',
    ru: 'Нет активного плана Keystone — передавать нечего.',
    de: 'Kein aktiver Keystone-Plan — nichts zu übergeben.',
    fr: 'Aucun plan Keystone actif — rien à transmettre.',
    es: 'No hay un plan activo de Keystone: nada que traspasar.',
  },
  waitAgents: {
    en: 'Keystone: wait for the subagents to finish, then hand off.',
    ru: 'Keystone: дождитесь субагентов, потом передавайте задачу.',
    de: 'Keystone: Warte, bis die Subagenten fertig sind, dann übergeben.',
    fr: 'Keystone : attendez la fin des sous-agents, puis transmettez.',
    es: 'Keystone: espera a que terminen los subagentes y luego traspasa.',
  },
  handoffStarted: {
    en: 'Keystone: the agent updates the plan, then the session clears and the next command lands in the prompt box.',
    ru: 'Keystone: агент обновит план, затем сессия очистится и следующая команда встанет в поле ввода.',
    de: 'Keystone: Der Agent aktualisiert den Plan, dann wird die Sitzung geleert und der nächste Befehl steht im Eingabefeld.',
    fr: 'Keystone : l’agent met le plan à jour, puis la session est vidée et la commande suivante arrive dans la zone de saisie.',
    es: 'Keystone: el agente actualiza el plan, luego la sesión se vacía y el siguiente comando aparece en el cuadro de entrada.',
  },
  noNext: {
    en: 'Keystone: the plan has no next command — nothing to start.',
    ru: 'Keystone: у плана нет следующей команды — начинать нечего.',
    de: 'Keystone: Der Plan hat keinen nächsten Befehl — nichts zu starten.',
    fr: 'Keystone : le plan n’a pas de commande suivante — rien à lancer.',
    es: 'Keystone: el plan no tiene siguiente comando: nada que iniciar.',
  },
  clearFailed: {
    en: (cmd: string) => `Keystone: could not clear the session — run /clear and paste ${cmd}`,
    ru: (cmd: string) => `Keystone: не удалось очистить сессию — выполните /clear и вставьте ${cmd}`,
    de: (cmd: string) => `Keystone: Sitzung konnte nicht geleert werden — führe /clear aus und füge ${cmd} ein`,
    fr: (cmd: string) => `Keystone : impossible de vider la session — lancez /clear et collez ${cmd}`,
    es: (cmd: string) => `Keystone: no se pudo vaciar la sesión; ejecuta /clear y pega ${cmd}`,
  },
  handoffNotDone: {
    en: 'Keystone: handoff not finished — the plan was not updated, the context stays',
    ru: 'Keystone: передача не завершена — план не обновлён, контекст остался',
    de: 'Keystone: Übergabe nicht abgeschlossen — Plan nicht aktualisiert, Kontext bleibt',
    fr: 'Keystone : transmission inachevée — plan non mis à jour, le contexte reste',
    es: 'Keystone: traspaso sin terminar: el plan no se actualizó, el contexto se mantiene',
  },
  // the side panel; r_<code> is why a session waits (codes: skills/sessions/scripts/triage.mjs)
  waitYou: { en: 'Waiting for you', ru: 'Ждут вас', de: 'Warten auf dich', fr: 'En attente de vous', es: 'Te esperan' },
  nobody: { en: 'nobody is waiting', ru: 'никто не ждёт', de: 'niemand wartet', fr: 'personne n’attend', es: 'nadie espera' },
  sessions: { en: 'Child sessions', ru: 'Субсессии', de: 'Untersitzungen', fr: 'Sous-sessions', es: 'Subsesiones' },
  noSessions: { en: 'no child sessions', ru: 'субсессий нет', de: 'keine Untersitzungen', fr: 'aucune sous-session', es: 'no hay subsesiones' },
  noData: { en: 'no data on child sessions', ru: 'нет данных о субсессиях', de: 'keine Daten zu Untersitzungen', fr: 'aucune donnée sur les sous-sessions', es: 'sin datos de las subsesiones' },
  noOwnPlan: { en: 'no plan', ru: 'плана нет', de: 'kein Plan', fr: 'aucun plan', es: 'sin plan' },
  checks: { en: 'Checks', ru: 'Проверки', de: 'Prüfungen', fr: 'Vérifications', es: 'Comprobaciones' },
  spend: { en: 'Cost', ru: 'Расход', de: 'Kosten', fr: 'Coût', es: 'Coste' },
  thisSession: { en: 'this session', ru: 'эта сессия', de: 'diese Sitzung', fr: 'cette session', es: 'esta sesión' },
  notRun: { en: 'not run', ru: 'не запускалась', de: 'nicht gelaufen', fr: 'non lancée', es: 'no ejecutada' },
  more: { en: (n: string) => `${n} more`, ru: (n: string) => `ещё ${n}`, de: (n: string) => `${n} weitere`, fr: (n: string) => `encore ${n}`, es: (n: string) => `${n} más` },
  staleAt: { en: (time: string) => `stale · data from ${time}`, ru: (time: string) => `устарело · данные от ${time}`, de: (time: string) => `veraltet · Daten von ${time}`, fr: (time: string) => `périmé · données de ${time}`, es: (time: string) => `desactualizado · datos de las ${time}` },
  stWorking: { en: 'working', ru: 'работает', de: 'arbeitet', fr: 'travaille', es: 'trabajando' },
  stWaiting: { en: 'waits', ru: 'ждёт', de: 'wartet', fr: 'attend', es: 'espera' },
  stIdle: { en: 'idle', ru: 'не работает', de: 'ruht', fr: 'au repos', es: 'inactiva' },
  stUnknown: { en: 'unknown', ru: 'неизвестно', de: 'unbekannt', fr: 'inconnu', es: 'desconocido' },
  stReady: { en: 'done', ru: 'готово', de: 'fertig', fr: 'terminée', es: 'terminada' },
  panelOpened: { en: 'Keystone panel opened.', ru: 'Панель Keystone открыта.', de: 'Keystone-Panel geöffnet.', fr: 'Panneau Keystone ouvert.', es: 'Panel de Keystone abierto.' },
  panelWaits: { en: (reason: string) => `Keystone panel is not drawn yet: ${reason}`, ru: (reason: string) => `Панель Keystone пока не видна: ${reason}`, de: (reason: string) => `Keystone-Panel noch nicht sichtbar: ${reason}`, fr: (reason: string) => `Panneau Keystone pas encore affiché : ${reason}`, es: (reason: string) => `El panel de Keystone aún no se ve: ${reason}` },
  r_answer: { en: 'waits for your answer', ru: 'ждёт вашего ответа', de: 'wartet auf deine Antwort', fr: 'attend votre réponse', es: 'espera tu respuesta' },
  r_failed: { en: 'the turn failed or was stopped', ru: 'ход упал или остановлен', de: 'Zug fehlgeschlagen oder gestoppt', fr: 'tour échoué ou arrêté', es: 'el turno falló o se detuvo' },
  r_accept: { en: 'unproven checks: accept', ru: 'не доказано: нужен accept', de: 'unbewiesen: accept nötig', fr: 'non prouvé : accept requis', es: 'sin probar: hace falta accept' },
  r_blocked: { en: (a: string) => `BLOCKED: ${a}`, ru: (a: string) => `BLOCKED: ${a}`, de: (a: string) => `BLOCKED: ${a}`, fr: (a: string) => `BLOCKED: ${a}`, es: (a: string) => `BLOCKED: ${a}` },
  r_approve: { en: 'the plan waits for Approve', ru: 'план ждёт Approve', de: 'Plan wartet auf Approve', fr: 'le plan attend Approve', es: 'el plan espera Approve' },
  r_release: { en: (a: string) => `release steps: ${a}`, ru: (a: string) => `шаги релиза: ${a}`, de: (a: string) => `Release-Schritte: ${a}`, fr: (a: string) => `étapes de release : ${a}`, es: (a: string) => `pasos de release: ${a}` },
  r_intent: { en: 'an intent without a plan', ru: 'intent без плана', de: 'Intent ohne Plan', fr: 'intent sans plan', es: 'intent sin plan' },
  r_dirty: { en: (a: string) => `uncommitted files: ${a}`, ru: (a: string) => `незакоммиченные файлы: ${a}`, de: (a: string) => `nicht committete Dateien: ${a}`, fr: (a: string) => `fichiers non commités : ${a}`, es: (a: string) => `archivos sin commit: ${a}` },
  r_ignored: { en: (a: string) => `ignored files go with the worktree: ${a}`, ru: (a: string) => `игнорируемые файлы удалятся с worktree: ${a}`, de: (a: string) => `ignorierte Dateien verschwinden mit dem Worktree: ${a}`, fr: (a: string) => `fichiers ignorés perdus avec le worktree : ${a}`, es: (a: string) => `archivos ignorados se pierden con el worktree: ${a}` },
  r_merge: { en: (a: string) => `merge ${a}`, ru: (a: string) => `влить ${a}`, de: (a: string) => `mergen: ${a}`, fr: (a: string) => `fusionner ${a}`, es: (a: string) => `fusionar ${a}` },
  r_unrecognised: { en: (a: string) => `not recognised: ${a}`, ru: (a: string) => `не распознано: ${a}`, de: (a: string) => `nicht erkannt: ${a}`, fr: (a: string) => `non reconnu : ${a}`, es: (a: string) => `no reconocido: ${a}` },
  r_stuck: { en: (a: string) => `no progress after ${a}`, ru: (a: string) => `не продвинулась после ${a}`, de: (a: string) => `kein Fortschritt nach ${a}`, fr: (a: string) => `pas de progrès après ${a}`, es: (a: string) => `sin avance tras ${a}` },
  r_path: { en: 'the plan path failed the check', ru: 'путь плана не прошёл проверку', de: 'Planpfad nicht zulässig', fr: 'chemin du plan refusé', es: 'ruta del plan no válida' },
  r_owner: { en: (a: string) => `the plan is held by ${a}`, ru: (a: string) => `план ведёт ${a}`, de: (a: string) => `Plan wird geführt von ${a}`, fr: (a: string) => `plan tenu par ${a}`, es: (a: string) => `el plan lo lleva ${a}` },
  r_unknown: { en: 'state unknown', ru: 'состояние неизвестно', de: 'Zustand unbekannt', fr: 'état inconnu', es: 'estado desconocido' },
  r_state: { en: 'state not recognised', ru: 'состояние не распознано', de: 'Zustand nicht erkannt', fr: 'état non reconnu', es: 'estado no reconocido' },
  r_nested: { en: 'has live child sessions', ru: 'есть живые дочерние сессии', de: 'hat aktive Untersitzungen', fr: 'a des sous-sessions actives', es: 'tiene subsesiones activas' },
  r_git: { en: 'git did not answer', ru: 'git не ответил', de: 'git hat nicht geantwortet', fr: 'git n’a pas répondu', es: 'git no respondió' },
})

export type Strings = { [K in keyof typeof T]: (typeof T)[K]['en'] }
export const TABLE: Record<string, Row<unknown>> = T

export const strings = (lang: Lang): Strings =>
  Object.fromEntries(Object.entries(T).map(([k, row]) => [k, pick(row as Row<unknown>, lang)])) as Strings

// Claude Code's `language` setting is free text ("russian", "German"): its name or self-name, any case; else English.
const NAMES: Record<string, Lang> = {
  en: 'en', english: 'en',
  ru: 'ru', russian: 'ru', русский: 'ru',
  de: 'de', german: 'de', deutsch: 'de',
  fr: 'fr', french: 'fr', français: 'fr', francais: 'fr',
  es: 'es', spanish: 'es', español: 'es', espanol: 'es',
}
export const langFromText = (s: unknown): Lang => (typeof s === 'string' && NAMES[s.trim().toLowerCase()]) || 'en'

// The plugin's own option wins; `auto` (or anything else) follows Claude Code's setting.
export const pickLang = (option: unknown, setting: unknown): Lang =>
  (LANGS as readonly unknown[]).includes(option) ? (option as Lang) : langFromText(setting)

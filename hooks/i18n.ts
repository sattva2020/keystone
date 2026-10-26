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

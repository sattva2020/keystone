// Keystone handoff, the pure part: when to offer moving the task to a clean session, and what the agent is asked to do.
// The plan already holds the task's state, so there is no separate handoff document.
import { strings, type Lang, type Strings } from './i18n.ts'

export type Thresholds = { soft: number; firm: number; last: number }

export const MARKER = 'KEYSTONE HANDOFF READY'

export const thresholdsFor = (window: number): Thresholds =>
  window >= 500000 ? { soft: 350000, firm: 600000, last: 800000 } : { soft: 100000, firm: 150000, last: 170000 }

export const levelFor = (tokens: number | undefined, t: Thresholds): number =>
  tokens === undefined ? 0 : tokens >= t.last ? 3 : tokens >= t.firm ? 2 : tokens >= t.soft ? 1 : 0

export const kTokens = (n: number) => (n >= 1000000 ? `${Math.round(n / 100000) / 10}M` : `${Math.round(n / 1000)}k`)

// ponytail: fixed 1-hour prompt-cache TTL (5 min margin); a setting if people on the 5-minute cache ask for one
export const COLD_MS = 55 * 60 * 1000
export const MIN_TOKENS = 30000 // below this, re-reading the history costs less than losing what the plan lacks

// After a pause past the cache's life the next answer re-reads the whole context at full price.
export const isCold = (last: number | undefined, now: number, tokens: number) =>
  last !== undefined && now - last >= COLD_MS && tokens >= MIN_TOKENS

const ago = (ms: number, t: Strings) => {
  const m = Math.floor(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)} ${t.h}${m % 60 ? ` ${m % 60} ${t.min}` : ''}` : `${m} ${t.min}`
}

export const coldText = (ms: number, tokens: number, lang: Lang = 'en') => {
  const t = strings(lang)
  return t.cold(ago(ms, t), kTokens(tokens))
}

// for the agent, not for people: English whatever the interface language
export const handoffPrompt = (planFile: string) =>
  `Keystone handoff: the context has grown, the task continues in a clean session. In \`${planFile}\` tick [x] the finished tasks; ` +
  'under `## Implementation notes` add dated lines: decisions of this session that are not in the plan; uncommitted files ' +
  '(`git status --short`); background processes and servers still running; the next action. Do not commit or push. ' +
  `Answer with one line: ${MARKER}.`

// Keystone handoff, the pure part: when to offer moving the task to a clean session, and what the agent is asked to do.
// The plan already holds the task's state, so there is no separate handoff document.

export type Thresholds = { soft: number; firm: number; last: number }

export const MARKER = 'KEYSTONE HANDOFF READY'

export const thresholdsFor = (window: number): Thresholds =>
  window >= 500000 ? { soft: 350000, firm: 600000, last: 800000 } : { soft: 100000, firm: 150000, last: 170000 }

export const levelFor = (tokens: number | undefined, t: Thresholds): number =>
  tokens === undefined ? 0 : tokens >= t.last ? 3 : tokens >= t.firm ? 2 : tokens >= t.soft ? 1 : 0

export const kTokens = (n: number) => (n >= 1000000 ? `${Math.round(n / 100000) / 10}M` : `${Math.round(n / 1000)}k`)

export const handoffPrompt = (planFile: string) =>
  `Keystone handoff: контекст разросся, задача продолжится в чистой сессии. В \`${planFile}\` отметь [x] выполненные задачи; ` +
  'в `## Implementation notes` допиши строки с датой: решения этой сессии, которых нет в плане; незакоммиченные файлы ' +
  '(`git status --short`); запущенные фоновые процессы и серверы; следующее действие. Ничего не коммить и не пушь. ' +
  `Ответь одной строкой: ${MARKER}.`

import { test, expect } from 'claude-code/testing'
import { thresholdsFor, levelFor, handoffPrompt, MARKER, kTokens, isCold, coldText, COLD_MS } from './handoff.ts'

test('the cache counts as cold after 55 minutes and from 30k of context', async () => {
  const min = 60000
  expect(isCold(undefined, COLD_MS, 100000)).toBe(false)
  expect(isCold(0, 54 * min, 100000)).toBe(false)
  expect(isCold(0, 55 * min, 29999)).toBe(false)
  expect(isCold(0, 55 * min, 30000)).toBe(true)
  expect(coldText(130 * min, 180000)).toBe('Cache went cold (2 h 10 min ago): the next answer re-reads 180k from scratch')
  expect(coldText(130 * min, 180000, 'ru')).toBe('Кэш остыл (2 ч 10 мин назад): следующий ответ перечитает 180k заново')
  expect(coldText(120 * min, 40000, 'ru')).toContain('(2 ч назад)')
  expect(coldText(56 * min, 40000, 'de')).toContain('(vor 56 min)')
})

test('thresholds follow the window: 350k/600k/800k from 500k, 100k/150k/170k below', async () => {
  expect(thresholdsFor(1000000)).toEqual({ soft: 350000, firm: 600000, last: 800000 })
  expect(thresholdsFor(200000)).toEqual({ soft: 100000, firm: 150000, last: 170000 })
})

test('levels at the borders', async () => {
  const t = thresholdsFor(1000000)
  expect([349999, 350000, 600000, 800000].map((n) => levelFor(n, t))).toEqual([0, 1, 2, 3])
  expect(levelFor(undefined, t)).toBe(0)
  expect(kTokens(360000)).toBe('360k')
  expect(kTokens(1000000)).toBe('1M')
})

test('the agent is asked, in English, to update the plan, not to commit, and to answer the marker', async () => {
  const p = handoffPrompt('docs/keystone/x/plan.md')
  expect(p).toContain('docs/keystone/x/plan.md')
  expect(p).toContain('## Implementation notes')
  expect(p).toContain('Do not commit or push')
  expect(p).toContain(MARKER)
})

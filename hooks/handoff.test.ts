import { test, expect } from 'claude-code/testing'
import { thresholdsFor, levelFor, handoffPrompt, MARKER, kTokens } from './handoff.ts'

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

test('the agent is asked to update the plan, not to commit, and to answer the marker', async () => {
  const p = handoffPrompt('docs/keystone/x/plan.md')
  expect(p).toContain('docs/keystone/x/plan.md')
  expect(p).toContain('## Implementation notes')
  expect(p).toContain('Ничего не коммить и не пушь')
  expect(p).toContain(MARKER)
})

// Class: a failed read of either half (own blocks, child sessions) is never drawn as fresh data.
import { test, expect } from 'claude-code/testing'
import { bench, files } from '../test/panel-bench.ts'

const PLAN = 'docs/keystone/2026-10-12-reminders/plan.md'
const after = async (first: any, second: any) => {
  const b = bench({}, { ...first, now: 1 })
  await b.start()
  const before = b.state.panel as any
  Object.assign(b.w, { fail: false, ownFails: false, ...second, now: 2 })
  await b.turn()
  return [before, b.state.panel as any]
}

test('own blocks fail over earlier data, with or without rows: the data and its time stay, marked stale', async () => {
  for (const first of [{}, { fail: true }]) {
    const [before, now] = await after(first, { ownFails: true, ...first })
    expect(before.own.plan.file).toBe(PLAN)
    expect(now).toEqual({ ...before, stale: true })
    expect(now.at).toBe(1)
  }
})

test('own blocks fail with nothing earlier: nothing is claimed (no "no plan"), nothing opens', async () => {
  for (const fail of [false, true]) {
    const b = bench({}, { ownFails: true, fail })
    await b.start()
    expect([fail, b.state.panel]).toEqual([fail, undefined])
    expect(b.w.opened).toBe(0)
  }
})

test('every read of the own blocks counts: plan list, plan, verify.md, ledger, usage', async () => {
  const boom = () => { throw new Error('boom') }
  for (const path of ['fs.exists', 'fs.list', 'fs.read', 'store.get', 'session.usage']) {
    const b = bench({}, { now: 1 })
    await b.start()
    const before = b.state.panel as any
    const [noun, verb] = path.split('.') as [string, string]
    const real = b.$[noun][verb]
    b.$[noun][verb] = path === 'store.get' ? async (k: string) => (k.startsWith('cost:') ? boom() : real(k)) : async () => boom()
    b.w.now = 2
    await b.turn()
    expect([path, b.state.panel]).toEqual([path, { ...before, stale: true }])
    b.$[noun][verb] = real
    await b.turn()
    expect([path, (b.state.panel as any).stale, (b.state.panel as any).at]).toEqual([path, false, 2])
  }
  expect(PLAN in files).toBe(true)
})

test('child sessions fail: over rows — stale; never read yet — own blocks stay fresh, no mark', async () => {
  const [before, over] = await after({}, { fail: true })
  expect(over).toEqual({ ...before, stale: true })
  const [, never] = await after({ fail: true }, { fail: true })
  expect([never.rows, never.stale, never.at, never.own.plan.file]).toEqual([null, false, 2, PLAN])
})

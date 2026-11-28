// Class: what the person did with the panel holds whatever ids are known — every order of "the app answers or is silent",
// /clear and a reload around a close, and around the command.
import { test, expect } from 'claude-code/testing'
import { bench } from '../test/panel-bench.ts'

type Step = 'up' | 'down' | 'clear' | 'reload'
const STEPS: Step[] = ['up', 'down', 'clear', 'reload']
const walk = async (b: any, steps: Step[]) => {
  for (const s of steps) {
    if (s === 'up' || s === 'down') b.w.fail = s === 'down'
    if (s === 'clear') b.w.sid = `${b.w.sid}+`
    if (s === 'reload') {
      b.restart()
      await b.start() // session.start runs on a reload, not at /clear
    }
  }
  await b.turn()
  await b.turn()
}
const pairs = STEPS.flatMap((x) => STEPS.map((y) => [x, y] as Step[]))
const orders = pairs.flatMap((p) => [p, ...STEPS.map((z) => [...p, z])])

test('closed: no order of app answers, /clear and reloads opens the panel again', async () => {
  const bad: string[] = []
  for (const silent of [false, true])
    for (const before of [[], ['up'], ['down']] as Step[][])
      for (const after of orders) {
        const b = bench({}, { fail: silent })
        await b.start()
        for (const s of before) b.w.fail = s === 'down'
        const opened = b.w.opened
        await b.close('person')
        await walk(b, after)
        if (b.w.opened !== opened) bad.push([silent, before, after].join(' | '))
      }
  expect(bad).toEqual([])
})

test('the command: no order leaves a mark in the store once the app answers, and the panel may open by itself', async () => {
  const bad: string[] = []
  for (const silent of [false, true])
    for (const between of [[], ['clear'], ['reload'], ['down'], ['down', 'reload']] as Step[][])
      for (const after of orders) {
        const store: Record<string, unknown> = {}
        const b = bench(store, { fail: silent })
        await b.start()
        await b.close('person')
        await walk(b, between)
        await b.command()
        b.w.open = false // the window went; nobody closed the panel
        await walk(b, [...after, 'up'])
        if (Object.keys(store).length || !b.w.open) bad.push([silent, between, after, Object.keys(store), b.w.open].join(' | '))
      }
  expect(bad).toEqual([])
})

test('an app restart drops the session state: the store still holds the close, and the reopening', async () => {
  const store: Record<string, unknown> = {}
  const b = bench(store)
  await b.start()
  await b.close('person')
  const restartApp = async () => { delete b.state.panelClosed; delete b.state.panel; b.w.open = false; b.restart(); await b.start() }
  await restartApp()
  expect(b.w.opened).toBe(1)
  await b.command()
  await restartApp()
  expect(b.w.opened).toBe(3)
})

test('the command does not wait for a silent app', async () => {
  const b = bench({})
  b.$.mcp.call = () => new Promise(() => {})
  expect(await b.command()).toBe('Панель Sattva открыта.')
  expect(b.w.opened).toBe(1)
})

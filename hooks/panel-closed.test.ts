// Class: the closing mark lives under the app session and the engine session; a reload forgets the app session id.
import { test, expect } from 'claude-code/testing'
import { bench } from '../test/panel-bench.ts'

const reload = async (b: any, fail: boolean) => { b.w.fail = fail; b.restart(); await b.start() }

test('closed stays closed after a reload while the app does not answer, also after /clear', async () => {
  for (const cleared of [false, true]) {
    const b = bench({})
    await b.start()
    expect(b.w.opened).toBe(1)
    await b.close('person')
    if (cleared) {
      b.w.sid = 'sess-2'
      await b.turn()
    }
    await reload(b, true)
    await b.turn()
    expect([cleared, b.w.opened]).toEqual([cleared, 1])
  }
})

test('closed and reloaded while the app answers: no refresh, no list of sessions', async () => {
  const b = bench({})
  await b.start()
  await b.close('person')
  const runs = b.w.runs
  b.w.mcp.length = 0
  await reload(b, false)
  await b.turn()
  expect([b.w.opened, b.w.runs, b.w.mcp.includes('list_sessions')]).toEqual([1, runs, false])
})

test('closed before the app session is known: kept under it once it is, also after /clear and a reload', async () => {
  const b = bench({}, { fail: true })
  await b.start()
  await b.close('person')
  b.w.fail = false
  await b.turn()
  b.w.sid = 'sess-2'
  await reload(b, false)
  expect(b.w.opened).toBe(1)
})

test('the command right after a reload removes the mark, also one the app could not name yet', async () => {
  for (const fail of [false, true]) {
    const store: Record<string, unknown> = {}
    const b = bench(store)
    await b.start()
    await b.close('person')
    b.w.fail = fail
    b.restart()
    await b.command()
    expect([fail, b.w.opened]).toEqual([fail, 2])
    b.w.fail = false
    await b.turn()
    expect([fail, Object.keys(store)]).toEqual([fail, []])
    b.w.open = false // the pane went with the window, nobody closed it
    await reload(b, false)
    expect([fail, b.w.opened]).toEqual([fail, 3])
  }
})

test('the command after /clear removes every mark this session wrote', async () => {
  const store: Record<string, unknown> = {}
  const b = bench(store)
  await b.start()
  await b.close('person')
  b.w.sid = 'sess-2'
  await b.turn()
  await b.command()
  expect(Object.keys(store)).toEqual([])
})

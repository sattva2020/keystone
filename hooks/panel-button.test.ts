import { test, expect, mock } from 'claude-code/testing'
import { bench } from '../test/panel-bench.ts'

// The band's «panel» button (next.tsx) and the panel: false clean-up (panel.tsx).
const PANE = 'keystone-panel'
const PF = 'docs/keystone/2026-10-12-reminders/plan.md'
const files: Record<string, string> = { [PF]: 'Level: L · Mode: feature · Status: implementing\n\n## Tasks\n- [x] 1. a\n- [ ] 2. b\n' }
const rel = (x: string) => String(x).split('\\').join('/').replace(/^.*?(?=docs\/keystone)/, '')
const world = (on: any, o: any = {}) => {
  const w: any = { open: false, opened: 0, closed: 0, sent: [] as string[], turns: 0, toasts: [] as string[], surfaces: ['terminal'], store: { 'bound:sess-1': ['2026-10-12-reminders'] }, ...o }
  on('fs.exists', ($: any, e: any) => { const x = rel(e.path); return { value: x in files || Object.keys(files).some((f) => f.startsWith(x + '/')) } })
  on('fs.list', () => ({ value: [{ name: '2026-10-12-reminders', kind: 'dir', size: 0 }] }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }))
  on('fs.read', ($: any, e: any) => ({ value: files[rel(e.path)] }))
  on('session.start', ($: any, e: any) => e)
  on('command.register', () => ({ value: true }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [], cost: { usd: 0 } } }))
  on('session.surfaces', () => ({ value: w.surfaces }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('ui.status', () => ({ value: true }))
  on('ui.toast', ($: any, e: any) => { w.toasts.push(String(e?.text ?? e)); return { value: true } })
  on('turn.start', ($: any, e: any) => { w.turns++; return e })
  on('prompt.submit', ($: any, e: any) => { w.sent.push(e.text); return { drop: 'test' } })
  on('mcp.call', () => ({ deny: 'no server' }))
  on('ui.panes', () => ({ value: w.open ? [{ id: PANE, title: 'Keystone', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.open', () => { w.opened++; w.open = true; return { value: w.unplaced ? { isPlaced: false, reason: 'no-surface: none' } : { isPlaced: true } } })
  on('ui.close', () => { w.closed++; w.open = false; return { value: undefined } })
  on('store.get', ($: any, e: any) => ({ value: w.store[e.key] }))
  on('store.set', ($: any, e: any) => { w.store[e.key] = e.value; return { value: undefined } })
  on('store.delete', ($: any, e: any) => { delete w.store[e.key]; return { value: undefined } })
  on('ui.render', ($: any, e: any) => h($.ui.resolve(e).Box, { key: 'engine' }))
  return w
}
const BAND = { plugin: 'keystone', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } } as any
const button = async ($: any) => {
  const ui = await $.ui.mount(BAND)
  const b = (await ui.find({ key: 'panel-open' })) as any
  await ui.unmount()
  return b?.props?.label ?? null
}

test('panel button opens the panel with no model call; hidden while open; no model call', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start({ cwd: 'E:/proj' } as any)
  await clock.settle()
  expect(w.opened).toBe(0) // not on the desktop: no opening by itself
  expect(await button($)).toBe('panel')
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'panel-open' })
  await ui.unmount()
  await clock.settle()
  expect([w.opened, w.toasts]).toEqual([1, []])
  expect([w.sent, w.turns, w.toasts]).toEqual([[], 0, []]) // no model call, no prompt, «opened» needs no toast
  expect(await button($)).toBe(null) // hidden while open
})

test('the pane waits for a surface: the command answer goes to a toast, the button stays', RU_OPT(), async ($, on) => {
  const w = world(on, { unplaced: true })
  const clock = mock.clock(on)
  await $.session.start({ cwd: 'E:/proj' } as any)
  await clock.settle()
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'panel-open' })
  await ui.unmount()
  await clock.settle()
  expect(w.toasts).toEqual(['Панель Keystone пока не видна: no-surface: none'])
  expect(await button($)).toBe('панель')
})

test('option off: no button', { options: { panel: false } } as any, async ($, on) => {
  world(on)
  const clock = mock.clock(on)
  await $.session.start({ cwd: 'E:/proj' } as any)
  await clock.settle()
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ key: 'next1' })).toBeDefined() // the plan's buttons are there
  expect(await ui.find({ key: 'panel-open' })).toBeUndefined()
  await ui.unmount()
})

test('option off closes a stale pane left from before', { options: { panel: false } } as any, async ($, on) => {
  const w = world(on, { open: true, surfaces: ['desktop'] })
  const clock = mock.clock(on)
  await $.session.start({ cwd: 'E:/proj' } as any)
  await clock.settle()
  expect([w.closed, w.open, w.opened]).toEqual([1, false, 0])
})

test('back after close: a person closing the pane brings the button back, the command hides it again', async () => {
  const b = bench({}, { open: true })
  await b.start()
  expect(b.state.panelOpen).toBe(true)
  await b.close('person')
  expect(b.state.panelOpen).toBe(false)
  await b.command()
  expect(b.state.panelOpen).toBe(true)
})

function RU_OPT() { return { options: { language: 'ru' } } as any }

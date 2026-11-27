import { test, expect, mock } from 'claude-code/testing'
import { bench } from '../test/panel-bench.ts'

const PLAN_FILE = 'docs/keystone/2026-10-12-reminders/plan.md'
const DIR = 'docs/keystone/2026-10-12-reminders'
const LEDGER = `cost:${PLAN_FILE}`
const planText = (status = 'implementing', tasks = '- [x] 1. schema\n- [x] 2. job\n- [ ] 3. ui', tail = '') =>
  `# Plan: reminders\n\nLevel: L · Mode: feature · Status: ${status}\nDone means: x\n\n## Requirements Reconciliation\nCoverage: 18/18 = 100% (partial counts 0.5) · verdict: PASS\n\n## Tasks\n${tasks}\n${tail}`

// what the engine answers beneath the plugin
const files: Record<string, string> = {}
let usd: number | undefined
let sid = 'sess-1'
const mt: Record<string, number> = {} // mtimeMs by path; 1 when unset
const rel = (p: string) => String(p).split('\\').join('/').replace(/^.*?(?=docs\/keystone)/, '')
const stub = (on: any, store: Record<string, unknown> = {}, commands: string[] = [], sent: string[] = []) => {
  for (const k of Object.keys(files)) delete files[k]
  files[PLAN_FILE] = planText()
  usd = undefined
  sid = 'sess-1'
  on('fs.exists', ($: any, e: any) => { const p = rel(e.path); return { value: p in files || Object.keys(files).some((f) => f.startsWith(p + '/')) } })
  on('fs.list', () => ({ value: [{ name: '2026-10-12-reminders', kind: 'dir', size: 0 }] }))
  for (const k of Object.keys(mt)) delete mt[k]
  on('fs.stat', ($: any, e: any) => ({ value: { kind: 'file', size: 1, mtimeMs: mt[rel(e.path)] ?? 1, isLink: false } }))
  on('fs.read', ($: any, e: any) => ({ value: files[rel(e.path)] }))
  on('session.start', ($: any, e: any) => e)
  on('command.register', ($: any, e: any) => { commands.push(e.name); return { value: true } })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [], ...(usd === undefined ? {} : { cost: { usd } }) } }))
  on('ui.status', () => ({ value: true }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.suggest', () => ({ isShown: true }))
  on('prompt.submit', ($: any, e: any) => { sent.push(e.text); return { drop: 'test' } })
  on('session.id', () => ({ value: sid }))
  on('store.get', ($: any, e: any) => ({ value: store[e.key] }))
  on('store.set', ($: any, e: any) => { store[e.key] = e.value; return { value: undefined } })
  on('store.delete', ($: any, e: any) => { delete store[e.key]; return { value: undefined } })
  on('ui.render', ($: any, e: any) => h($.ui.resolve(e).Box, { key: 'engine' }))
  return store
}
const bound = (extra: Record<string, unknown> = {}) => ({ 'bound:sess-1': ['2026-10-12-reminders'], ...extra })
const TURN = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as any
const START = { cwd: 'E:/proj', surface: 'desktop', isInteractive: true } as any
const BAND = (bodyColumns = 100, isWorking = false) => ({ plugin: 'keystone', component: 'AbovePrompt', props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns } }) as any

test('band cost: the sum of the ledger in the title, none without it, hidden while Claude works', async ($, on) => {
  const store = stub(on, bound({ [LEDGER]: { plan: 2, implement: 1.2 } }))
  mock.clock(on)
  const band = async (cols = 100, working = false) => {
    const ui = await $.ui.mount({ surface: 'desktop', ...BAND(cols, working) })
    const text = (await ui.find({ type: 'Text', text: /^Keystone/ }))?.text
    const bars = (await ui.find({ key: 'bars' })) as any
    await ui.unmount()
    return { text, direction: bars?.props?.flexDirection, wide: JSON.stringify(bars ?? null).includes('"width":38') }
  }
  await $.session.start(START)
  expect((await band()).text).toBe('Keystone · L · implementing · $3.20')
  expect((await band(100, true)).text).toBeUndefined()
  expect((await band(79)).direction).toBe('column')
  expect((await band(79)).wide).toBe(false)
  expect((await band(80)).direction).toBe('row')
  expect((await band(80)).wide).toBe(true)
  store[LEDGER] = { plan: 123.45 }
  await $.session.start(START)
  expect((await band()).text).toBe('Keystone · L · implementing · $123.45')
  expect((await band()).text!.length <= 38).toBe(true)
  delete store[LEDGER]
  await $.session.start(START)
  expect((await band()).text).toBe('Keystone · L · implementing')
})

// ---- the panel
const PANE = 'keystone-panel'
const KID = { sessionId: 'kid', title: 'Kid', branch: 'b', isArchived: false, isRunning: false, startedBy: 'me', originCwd: 'E:/proj', worktreePath: 'E:/wt', sourceBranch: 'main' }
const ROW = (o: any = {}) => ({ id: 'kid', title: 'Kid', state: 'idle', ready: false, stage: 'implementing', done: 1, total: 3, code: 'approve', arg: '', next: '/keystone:plan p', wait: true, ...o })
// the app around the plugin: its session tools, the script, the panes
const world = (on: any, o: any = {}) => {
  const w: any = { list: 'No other sessions found.', rows: [], mcp: [], stdin: [], runs: 0, fail: '', opened: 0, open: false, placed: true, shown: true, surfaces: ['desktop'], detail: [], ...o }
  on('session.surfaces', () => ({ value: w.surfaces }))
  on('mcp.call', ($: any, e: any) => {
    w.mcp.push(e.tool)
    if (w.fail === 'deny') return { deny: 'no server' }
    if (w.fail === 'isError') return { value: { content: [{ type: 'text', text: 'boom' }], isError: true } }
    if (e.tool === 'get_session' && e.args.session_id !== 'self') w.detail.push(e.args.session_id)
    const text = e.tool === 'list_sessions' ? w.list : JSON.stringify(e.args.session_id === 'self' ? { sessionId: 'me', originCwd: 'E:/proj' } : { ...KID, sessionId: e.args.session_id })
    return { value: { content: [{ type: 'text', text }], isError: false } }
  })
  on('process.run', async ($: any, e: any) => {
    w.runs++
    w.stdin.push(JSON.parse(e.init.stdin))
    if (w.hold) await w.hold
    if (w.fail === 'run') return { deny: 'timeout' }
    return { value: { exitCode: w.fail === 'exit' ? 1 : 0, stdout: w.fail === 'json' ? 'oops' : JSON.stringify({ rows: w.rows }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.panes', () => ({ value: w.open ? [{ id: PANE, title: 'Keystone', isShown: w.shown, isFocused: false, isPlaced: w.placed }] : [] }))
  on('ui.open', () => { if (w.openFails) return { deny: 'no panes' }; w.opened++; w.open = true; return { value: w.placed ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface: none' } } })
  on('ui.close', () => { w.open = false; return { value: undefined } })
  on('session.attach', ($: any, e: any) => ({ clientId: e.clientId }))
  return w
}
const family = (w: any, rows: any[] = [ROW()]) => { w.list = JSON.stringify([KID]); w.rows = rows }
const mountPane = ($: any, surface: any = 'desktop', placement: any = 'dock') =>
  $.ui.mount({ plugin: 'keystone', surface, component: 'Pane', requestId: PANE, props: { title: 'Keystone', isFocused: false, bodyColumns: 37, placement, scroll: { offset: 0, bodyRows: 40 }, view: {} } } as any)
const words = async (ui: any) => ((await ui.findAll({ type: 'Text' })) as any[]).map((x) => x.text as string)
const shown = async ($: any, placement: any = 'dock') => { const ui = await mountPane($, 'desktop', placement); const w = await words(ui); await ui.unmount(); return w }
const RU = { options: { language: 'ru' } } as any

test('own block: plan, checks, cost with this turn in it', RU, async ($, on) => {
  const store = stub(on, bound())
  const w = world(on)
  const clock = mock.clock(on)
  files[`${DIR}/verify.md`] = 'Verdict: PASS-UNPROVEN\nVerdict: FAIL\nSecurity gate: warn\n'
  usd = 1
  await $.session.start(START)
  await clock.settle()
  let t = await shown($)
  expect(t).toContain('L · implementing · 2/3')
  expect(t).toContain('verify 🟡 PASS-UNPROVEN')
  expect(t).toContain('check 18/18 = 100%')
  expect(t).toContain('security warn')
  expect(t).toContain('субсессий нет')
  expect(w.runs).toBe(0) // no children: the script is not run
  await $.prompt.submit({ text: `/keystone:implement ${PLAN_FILE}` } as any)
  usd = 3.5
  await $.turn.complete(TURN)
  await clock.settle()
  t = await shown($)
  expect(t).toContain('implement $2.50 · total $2.50')
  expect(t).toContain('эта сессия $3.50')
  expect((store[LEDGER] as any).implement).toBe(2.5)
  delete files[`${DIR}/verify.md`]
  await $.turn.complete(TURN)
  await clock.settle()
  t = await shown($)
  expect(t).toContain('verify не запускалась')
  expect(t).toContain('security —')
})

test('own wait and the next command: every case, security first on L with threats', RU, async ($, on) => {
  stub(on, bound())
  world(on)
  const clock = mock.clock(on)
  const all = '- [x] 1. a\n- [x] 2. b'
  const cases: [string, string, string | null, string | null, number?][] = [ // plan, verify.md, reason, button, plan mtime
    [planText('draft'), '', 'план ждёт Approve', 'plan'],
    [planText('implementing', all), 'Verdict: FAIL', null, 'fix'], // a fresh FAIL waits for the agent: fix verify
    [planText('implementing', all), 'Verdict: FAIL', null, 'verify', 5], // the plan changed after the FAIL: verify again
    [planText('implementing', all), 'Verdict: PASS-UNPROVEN', 'не доказано: нужен accept', 'verify', 5],
    [planText('implementing', '- [x] 1. a\n- [ ] 2. b'), 'Verdict: FAIL', null, 'implement'],
    [planText('verified', all, '\n## Release\n- [ ] R1. push\n- [ ] R2. zip\n'), '', 'шаги релиза: 2', 'implement'],
    [planText('implementing', all), 'Verdict: PASS-UNPROVEN', 'не доказано: нужен accept', 'verify'],
    [planText('implementing', '- [x] 1. a\n- [ ] 2. b BLOCKED: db'), '', 'BLOCKED: 1', null],
    [planText('implementing'), 'Verdict: PASS', null, 'implement'],
    [planText('implementing', `${all}\n\n## Risks\nThreats:\n- x\n`), '', null, 'security'],
  ]
  for (const [plan, verify, why, button, planM] of cases) {
    files[PLAN_FILE] = plan
    mt[PLAN_FILE] = planM ?? 1
    files[`${DIR}/verify.md`] = verify
    await $.session.start(START)
    await clock.settle()
    const ui = await mountPane($)
    const t = await words(ui)
    expect([why, t.includes(why ? `  ${why}` : 'никто не ждёт')]).toEqual([why, true])
    expect([why, ((await ui.find({ key: 'panel-next' })) as any)?.props?.label ?? null]).toEqual([why, button])
    if (why?.includes('accept')) expect(t).toContain(`  /keystone:verify accept ${PLAN_FILE}`)
    await ui.unmount()
  }
  // the answer's Next: is the panel's button too
  files[PLAN_FILE] = planText()
  files[`${DIR}/verify.md`] = ''
  mt[PLAN_FILE] = 1
  await $.prompt.submit({ text: `/keystone:implement ${PLAN_FILE}` } as any)
  await $.turn.complete({ ...TURN, answer: 'Next: /x now' })
  await clock.settle()
  const ui = await mountPane($)
  expect(((await ui.find({ key: 'panel-next' })) as any)?.props?.label).toBe('/x now')
  await ui.unmount()
})

test('the family goes to the script: parents, details once, a starting session is not cached', async ($, on) => {
  stub(on)
  const w = world(on)
  const clock = mock.clock(on)
  const list = (starting: boolean) => JSON.stringify([
    KID, { ...KID, sessionId: 'grand', startedBy: 'kid' }, { ...KID, sessionId: 'new', starting, worktreePath: undefined, originCwd: undefined }, { ...KID, sessionId: 'old', isArchived: true }, { sessionId: 'boss', title: 'Boss' },
  ])
  w.list = list(true)
  w.rows = [ROW()]
  await $.session.start(START)
  await clock.settle()
  expect(w.detail).toEqual(['kid', 'grand'])
  const s = (id: string) => w.stdin.at(-1).sessions.find((x: any) => x.sessionId === id)
  expect([w.stdin[0].self, w.stdin[0].originCwd]).toEqual(['me', 'E:/proj'])
  expect([s('kid').parentSessionId, s('kid').worktreePath, s('kid').sourceBranch, s('kid').branch]).toEqual(['me', 'E:/wt', 'main', 'b'])
  expect(s('grand').parentSessionId).toBe('kid')
  expect([s('new').isRunning, s('new').worktreePath]).toEqual([true, undefined])
  w.list = list(false)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(w.detail).toEqual(['kid', 'grand', 'new']) // one look-up each
  expect([s('new').isRunning, s('new').worktreePath]).toEqual([false, 'E:/wt'])
})

test('stale: the last rows and their time stay, marked', RU, async ($, on) => {
  stub(on, bound())
  const w = world(on)
  const clock = mock.clock(on, { now: 1000000 })
  family(w)
  w.shown = false // no tick in between
  await $.session.start(START)
  await clock.settle()
  expect((await shown($))[0]).toBe('Ждут вас')
  for (const fail of ['isError', 'deny', 'run', 'exit', 'json']) {
    const good = new Date(clock.now()).toTimeString().slice(0, 5)
    w.fail = fail
    await clock.advance(3600000)
    await $.turn.complete(TURN)
    await clock.settle()
    const t = await shown($)
    expect([fail, t[0]]).toEqual([fail, `устарело · данные от ${good}`])
    expect(t).toContain('⏳ Kid')
    expect((await shown($, 'widget'))[0].startsWith('⚠ ')).toBe(true)
    w.fail = ''
    await $.turn.complete(TURN)
    await clock.settle()
    expect((await shown($))[0]).toBe('Ждут вас')
  }
})

test('failure isolation: no app server, no process, no panes — the turn, the start and the band work', RU, async ($, on) => {
  stub(on, bound())
  const w = world(on, { fail: 'deny', openFails: true })
  const clock = mock.clock(on)
  expect(await $.session.start(START)).toBeDefined()
  await clock.settle()
  expect(((await $.turn.complete(TURN)) as any).text).toBe('')
  await clock.settle()
  const t = await shown($)
  expect(t).toContain('нет данных о субсессиях')
  expect(t).toContain('L · implementing · 2/3')
  expect(w.runs).toBe(0)
  const ui = await $.ui.mount({ surface: 'desktop', ...BAND() })
  expect(await ui.find({ key: 'plan-bar' })).toBeDefined()
  await ui.unmount()
})

test('option off: no command, no hooks, no refresh', { options: { panel: false } } as any, async ($, on) => {
  const commands: string[] = []
  stub(on, bound(), commands)
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  await $.turn.complete(TURN)
  await $.session.attach({ surface: 'desktop', clientId: 'd' } as any)
  await clock.advance(120000)
  expect(commands).toEqual(['keystone-status', 'keystone-handoff'])
  expect([w.mcp.length, w.runs, w.opened]).toEqual([0, 0, 0])
  const ui = await mountPane($)
  expect(await ui.find({ key: 'engine' })).toBeDefined() // the pane is not drawn by Keystone
  await ui.unmount()
})

test('five blocks, waiting first', RU, async ($, on) => {
  stub(on, bound())
  const w = world(on)
  const clock = mock.clock(on)
  family(w)
  await $.session.start(START)
  await clock.settle()
  const t = await shown($)
  const at = ['Ждут вас', 'Субсессии', 'План', 'Проверки', 'Расход'].map((x) => t.indexOf(x))
  expect(at[0]).toBe(0)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
})

test('nothing read yet: the heading and no data', async ($, on) => {
  stub(on)
  world(on)
  expect(await shown($)).toEqual(['Keystone', 'no data on child sessions'])
})

test('waiting block: who, why and the next command; own first', RU, async ($, on) => {
  stub(on, bound())
  const w = world(on)
  const clock = mock.clock(on)
  files[PLAN_FILE] = planText('draft')
  family(w, [ROW(), ROW({ id: 'b', title: 'Rel', code: 'release', arg: 'R1, R2', next: `/keystone:implement ${PLAN_FILE}` }), ROW({ id: 'c', title: 'Busy', state: 'working', wait: false, code: null, next: null })])
  await $.session.start(START)
  await clock.settle()
  const t = await shown($)
  expect(t.slice(1, t.indexOf('Субсессии'))).toEqual(['⏳ эта сессия', '  план ждёт Approve', `  /keystone:plan ${PLAN_FILE}`, '⏳ Kid', '  план ждёт Approve', '  /keystone:plan p', '⏳ Rel', '  шаги релиза: R1, R2', `  /keystone:implement ${PLAN_FILE}`])
  files[PLAN_FILE] = planText()
  family(w, [ROW({ wait: false })])
  await $.turn.complete(TURN)
  await clock.settle()
  expect((await shown($))[1]).toBe('никто не ждёт')
})

test('8 rows and more', RU, async ($, on) => {
  stub(on, bound())
  const w = world(on)
  const clock = mock.clock(on)
  files[PLAN_FILE] = planText('draft')
  family(w, Array.from({ length: 9 }, (_, i) => ROW({ id: `k${i}`, title: `K${i}`, state: 'waiting' })))
  await $.session.start(START)
  await clock.settle()
  const t = await shown($)
  const cut = t.indexOf('Субсессии')
  expect(t.slice(0, cut).filter((x) => x.startsWith('⏳')).length).toBe(8)
  expect(t.slice(0, cut)).toContain('ещё 2')
  expect(t.slice(cut, t.indexOf('План')).filter((x) => x.startsWith('⏳')).length).toBe(8)
  expect(t.slice(cut)).toContain('ещё 1')
})

test('unknown row and the marks', RU, async ($, on) => {
  stub(on, bound())
  const w = world(on)
  const clock = mock.clock(on)
  const quiet = { wait: false, code: null, next: null }
  family(w, [
    ROW({ title: 'A', state: 'unknown', ...quiet }), ROW({ title: 'B', ready: true, stage: 'verified', done: 3, ...quiet }), ROW({ title: 'C', state: 'working', ...quiet }),
    ROW({ title: 'D\nx', stage: null, total: 0, ...quiet }), ROW({ title: 'E', state: 'waiting', ...quiet }),
  ])
  await $.session.start(START)
  await clock.settle()
  const t = await shown($)
  expect(t.slice(t.indexOf('Субсессии') + 1, t.indexOf('План'))).toEqual([
    '❔ A', '  неизвестно · implementing · 1/3', '✅ B', '  готово · verified · 3/3', '🔄 C', '  работает · implementing · 1/3', '⏸ D x', '  не работает', '⏳ E', '  ждёт · implementing · 1/3',
  ])
})

test('button fills only; it is the only button', async ($, on) => {
  const sent: string[] = []
  stub(on, bound(), [], sent)
  const w = world(on)
  const clock = mock.clock(on)
  const filled: string[] = []
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', ($: any, e: any) => { filled.push(e.text); return { isFilled: true } })
  family(w)
  await $.session.start(START)
  await clock.settle()
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await mountPane($, surface)
    expect((await ui.findAll({ type: 'Button' })).length).toBe(1)
    await ui.press({ key: 'panel-next' })
    await ui.unmount()
  }
  expect(filled).toEqual(Array(4).fill(`/keystone:implement ${PLAN_FILE}`))
  expect(sent).toEqual([])
})

test('widget: one line of numbers, no buttons', async ($, on) => {
  stub(on, bound())
  const w = world(on)
  const clock = mock.clock(on)
  files[PLAN_FILE] = planText('draft')
  family(w, [ROW(), ROW({ id: 'b', state: 'working', wait: false, code: null })])
  await $.session.start(START)
  await clock.settle()
  const ui = await mountPane($, 'desktop', 'widget')
  expect(await words(ui)).toEqual(['⏳ 2 · 🔄 1 · 2/3'])
  expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
  await ui.unmount()
})

test('widget without a plan sums the rows; without tasks there is no progress', async ($, on) => {
  stub(on)
  const w = world(on)
  const clock = mock.clock(on)
  family(w, [ROW(), ROW({ id: 'b', done: 2, total: 2, wait: false })])
  await $.session.start(START)
  await clock.settle()
  expect(await shown($, 'widget')).toEqual(['⏳ 1 · 🔄 0 · 3/5'])
  family(w, [ROW({ done: 0, total: 0 })])
  await $.turn.complete(TURN)
  await clock.settle()
  expect(await shown($, 'widget')).toEqual(['⏳ 1 · 🔄 0'])
})

test('other surfaces: every surface and seat draws', async ($, on) => {
  stub(on, bound())
  const w = world(on)
  const clock = mock.clock(on)
  family(w)
  await $.session.start(START)
  await clock.settle()
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const)
    for (const placement of ['dock', 'inline', 'widget', 'elsewhere']) {
      const ui = await mountPane($, surface, placement)
      expect([surface, placement, (await words(ui)).length > 0]).toEqual([surface, placement, true])
      await ui.unmount()
    }
})

// ---- opening, closing, the command and the timer
const ATTACH = (surface: string) => ({ surface, clientId: `${surface}:default` }) as any

test('open: once with a plan restored from the store, again never while it stands', async ($, on) => {
  stub(on, bound())
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  await clock.settle()
  expect(w.opened).toBe(1)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(w.opened).toBe(1)
})

test('open: with child sessions and no plan; with neither it stays closed', async ($, on) => {
  stub(on)
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  await clock.settle()
  expect(w.opened).toBe(0)
  family(w)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(w.opened).toBe(1)
})

test('open, close, command: a closed panel stays closed, also after /clear; the command opens it', async () => {
  files[PLAN_FILE] = planText()
  const store: Record<string, unknown> = {}
  const b = bench(store)
  await b.start()
  expect(b.w.commands).toEqual(['keystone-panel'])
  expect(b.w.opened).toBe(1)
  for (const kind of ['plugin', 'unload']) {
    expect(await b.close(kind)).toBe(1) // the close goes through
    expect(store).toEqual({}) // only the person's close is remembered
  }
  b.w.open = true
  expect(await b.close('person')).toBe(1)
  expect(store).toEqual({ 'panel:closed:me': true, 'panel:closed:sess-1': true }) // the only new keys
  const [opened, runs] = [b.w.opened, b.w.runs]
  await b.turn()
  b.w.sid = 'sess-2' // /clear: a new engine session, the same app session
  await b.turn()
  expect([b.w.opened, b.w.runs]).toEqual([opened, runs])
  expect(await b.command()).toBe('Панель Keystone открыта.')
  expect([b.w.opened, b.w.runs]).toEqual([opened + 1, runs + 1])
  expect(store).toEqual({})
  b.w.open = false
  b.w.placed = false
  expect(await b.command()).toContain('no-surface: none')
  b.w.openFails = true
  expect(await b.command()).toContain('пока не видна')
})

test('store: closed before the app session is known goes under the session id, and holds', async () => {
  files[PLAN_FILE] = planText()
  const store: Record<string, unknown> = {}
  const b = bench(store, { fail: true })
  await b.start()
  expect(b.w.opened).toBe(1)
  await b.close('person')
  expect(store).toEqual({ 'panel:closed:sess-1': true })
  b.w.fail = false
  await b.turn()
  expect([b.w.opened, b.w.runs]).toEqual([1, 0])
})

test('refresh: a close stops the timer, the command starts it again', async () => {
  files[PLAN_FILE] = planText()
  const b = bench({})
  await b.start()
  const n = b.w.runs
  await b.tick()
  expect(b.w.runs).toBe(n + 1)
  await b.close('person')
  b.w.open = true // even if a pane were listed
  await b.tick()
  expect(b.w.runs).toBe(n + 1)
  await b.command()
  await b.tick()
  expect(b.w.runs).toBe(n + 3)
})

test('open fails: silence', async ($, on) => {
  stub(on, bound())
  const w = world(on, { openFails: true })
  const clock = mock.clock(on)
  expect(await $.session.start(START)).toBeDefined()
  await clock.settle()
  expect(w.opened).toBe(0)
})

test('refresh: every 30 s while the panel is seen, as a widget too; hidden — never', async ($, on) => {
  stub(on, bound())
  const w = world(on)
  const clock = mock.clock(on)
  family(w)
  await $.session.start(START)
  await clock.settle()
  const during = async () => { const n = w.runs; await clock.advance(90000); return w.runs - n }
  expect(await during()).toBe(3)
  w.shown = false
  expect(await during()).toBe(0)
  await shown($, 'widget')
  expect(await during()).toBe(3)
  await shown($, 'dock')
  expect(await during()).toBe(0)
  w.shown = true
  w.placed = false
  expect(await during()).toBe(0)
})

test('refresh: after a turn, not after a subagent turn; a second one waits for the first', async ($, on) => {
  stub(on, bound())
  const w = world(on)
  const clock = mock.clock(on)
  family(w)
  w.shown = false
  await $.session.start(START)
  await clock.settle()
  const n = w.runs
  await $.turn.complete({ ...TURN, agentId: 'a1' })
  await clock.settle()
  expect(w.runs).toBe(n)
  let free = () => {}
  w.hold = new Promise<void>((r) => { free = r })
  await $.turn.complete(TURN)
  await clock.settle()
  await $.turn.complete(TURN)
  await clock.settle()
  expect(w.runs).toBe(n + 1)
  w.hold = undefined
  free()
  await clock.settle()
  await $.turn.complete(TURN)
  await clock.settle()
  expect(w.runs).toBe(n + 2)
})

test('a reload with the panel up: a new timer, no second open', async ($, on) => {
  stub(on, bound())
  const w = world(on, { open: true })
  const clock = mock.clock(on)
  family(w)
  await $.session.start(START)
  await clock.settle()
  const n = w.runs
  await clock.advance(60000)
  expect([w.opened, w.runs - n]).toEqual([0, 2])
})

test('the terminal pays nothing: no app calls; the command still opens; a desktop attaching starts it', async ($, on) => {
  stub(on, bound())
  const w = world(on, { surfaces: ['terminal'] })
  const clock = mock.clock(on)
  family(w)
  await $.session.start({ ...START, surface: 'terminal' })
  await $.turn.complete(TURN)
  await $.session.attach(ATTACH('mobile'))
  await clock.advance(90000)
  expect([w.mcp.length, w.runs, w.opened]).toEqual([0, 0, 0])
  await $.command.run({ command: 'keystone-panel', args: '' })
  await clock.settle()
  expect([w.runs, w.opened]).toEqual([1, 1])
  w.open = false
  w.surfaces = ['terminal', 'desktop']
  expect(((await $.session.attach(ATTACH('desktop'))) as any).clientId).toBe('desktop:default')
  await clock.settle()
  expect([w.runs, w.opened]).toEqual([2, 2])
})

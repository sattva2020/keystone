import { test, expect, mock } from 'claude-code/testing'
import { parsePlan, statusText, costLine, gatesFor, nextCommand, nextButtons } from './sattva.ts'
import { MARKER } from './handoff.ts'
import { chip, barText, barSvg, pct, toneFor } from './next.tsx'

const PLAN = [
  '# Plan: reminders', '',
  'Level: L · Mode: feature · Status: implementing',
  'Settings: tests — yes · logging — standard · docs — no',
  'Done means: npm test green; reminder row visible',
  '', '## Original Request', '- [ ] not a task', '',
  '## Tasks',
  '- [x] 1. schema', '- [x] 2. job', '- [ ] 3. email — BLOCKED: no staging SMTP', '- [ ] 4. ui', '',
].join('\n')

// a fake project: docs/sattva/<one task>/plan.md
const files: Record<string, string> = { 'docs/sattva/2026-10-12-reminders/plan.md': PLAN }
const rel = (p: string) => String(p).split('\\').join('/').replace(/^.*?(?=docs\/sattva|\.ai-factory)/, '')
const stubFs = (on: any) => {
  on('fs.exists', ($: any, e: any) => { const p = rel(e.path); return { value: p in files || Object.keys(files).some((f) => f.startsWith(p + '/')) } })
  on('fs.list', () => ({ value: [{ name: '2026-10-12-reminders', kind: 'dir', size: 0 }] }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }))
  on('fs.read', ($: any, e: any) => ({ value: files[rel(e.path)] }))
}

test('parsePlan reads the header and counts only ## Tasks', async () => {
  const p = parsePlan('docs/sattva/x/plan.md', PLAN)!
  expect(p.level).toBe('L')
  expect(p.status).toBe('implementing')
  expect([p.done, p.total, p.blocked]).toEqual([2, 4, 1])
  expect(p.doneMeans).toBe('npm test green; reminder row visible')
  expect(gatesFor(p).join(' ')).toContain('Stop reminds')
})

test('gatesFor: open tasks → Stop reminds about them; all ticked → Stop reminds to run verify', () => {
  const plan = (tasks: string[]) => parsePlan('docs/sattva/x/plan.md', ['# Plan: x', '', 'Level: M · Mode: feature · Status: implementing', '', '## Tasks', ...tasks, ''].join('\n'))!
  expect(gatesFor(plan(['- [x] 1. a', '- [ ] 2. b'])).join(' ')).toContain('Stop reminds about open tasks')
  const done = gatesFor(plan(['- [x] 1. a', '- [ ] 2. b — BLOCKED: no db'])).join(' ')
  expect(done).toContain('Stop reminds to run /sattva:verify')
  expect(done).not.toContain('open tasks')
})

test('verified, abandoned and header-less plans are not active', async () => {
  expect(parsePlan('p', PLAN.replace('implementing', 'verified'))).toBe(null)
  expect(parsePlan('p', '# Plan\n## Tasks\n- [ ] 1. a\n')).toBe(null)
})

test('cost line sums stages and says when nothing was measured', async () => {
  expect(costLine({})).toBe('not measured yet')
  expect(costLine({ plan: 3.2, check: 1.25, implement: 0.001 })).toBe('plan $3.20 · check $1.25 · total $4.45')
  expect(statusText(null, {})).toContain('No active Sattva plan')
})

test('/sattva-status answers without a model turn', async ($, on) => {
  stubFs(on)
  mock.store(on, { 'cost:docs/sattva/2026-10-12-reminders/plan.md': { plan: 2.5, check: 1 } })
  on('prompt.submit', () => ({ drop: 'test' }))
  on('ui.status', () => ({ value: true }))
  await $.prompt.submit({ text: '/sattva:check docs/sattva/2026-10-12-reminders/plan.md' } as any)
  const out = await $.command.run({ command: 'sattva-status', args: '' })
  const text = JSON.stringify(out)
  expect(text).toContain('Level L')
  expect(text).toContain('tasks 2/4')
  expect(text).toContain('BLOCKED 1')
  expect(text).toContain('plan $2.50 · check $1.00 · total $3.50')
  expect(text).toContain('Next: /sattva:implement docs/sattva/2026-10-12-reminders/plan.md')
})

test('next command follows the plan status, with the plan path', async () => {
  const p = parsePlan('docs/sattva/x/plan.md', PLAN)!
  expect(nextCommand(p)).toBe('/sattva:implement docs/sattva/x/plan.md')
  expect(nextCommand({ ...p, done: 3, blocked: 1 })).toBe('/sattva:verify docs/sattva/x/plan.md')
  expect(nextCommand({ ...p, status: 'approved' })).toBe('/sattva:implement docs/sattva/x/plan.md')
  expect(nextCommand({ ...p, status: 'draft' })).toBe('/sattva:plan docs/sattva/x/plan.md')
})

test('release mode: a verified plan with open ## Release steps stays in view and points to implement', async () => {
  const rel = PLAN.replace('implementing', 'verified').replace('- [ ] 3. email — BLOCKED: no staging SMTP', '- [x] 3. email').replace('- [ ] 4. ui', '- [x] 4. ui') + '\n## Release\n- [ ] R1. merge into main and push — check: CI green\n- [ ] R2. deploy — check: /health 200\n'
  const p = parsePlan('docs/sattva/x/plan.md', rel)!
  expect(p.status).toBe('verified')
  expect(p.release).toBe(2)
  expect(nextCommand(p)).toBe('/sattva:implement docs/sattva/x/plan.md')
  expect(gatesFor(p).join(' ')).toContain('release mode')
  expect(parsePlan('p', PLAN.replace('implementing', 'verified'))).toBe(null)
})

test('L with a Threats: block and no ticked security task: security before verify', async () => {
  const f = 'docs/sattva/x/plan.md'
  const threats = PLAN.replace('## Tasks', '## Risks\nThreats:\n- token leak — task 4\n\n## Tasks')
  const p = parsePlan(f, threats)!
  expect(p.security).toBe(true)
  expect(nextButtons({ ...p, done: 3, blocked: 1 }, false)).toEqual([`/sattva:security ${f}`, `/sattva:verify ${f}`, '/sattva:review', '/sattva-status'])
  expect(nextButtons(p, false)[0]).toBe(`/sattva:implement ${f}`) // open tasks still come first
  const ran = parsePlan(f, threats.replace('- [ ] 4. ui', '- [x] 4. Run /sattva:security docs — check: Security gate pass'))!
  expect(ran.security).toBe(false)
  expect(parsePlan(f, PLAN)!.security).toBe(false)
})

test('buttons: the next command, the status, and a third only where Sattva asks for one', async () => {
  const f = 'docs/sattva/x/plan.md'
  const p = parsePlan(f, PLAN)!
  expect(nextButtons(null, false)).toEqual([])
  expect(nextButtons({ ...p, level: 'M', status: 'draft' }, false)).toEqual([`/sattva:plan ${f}`, '/sattva-status'])
  expect(nextButtons({ ...p, status: 'draft' }, false)).toEqual([`/sattva:plan ${f}`, '/sattva-status'])
  expect(nextButtons({ ...p, status: 'draft' }, true)).toEqual([`/sattva:plan ${f}`, `/sattva:check docs/sattva/x/intent.md ${f}`, '/sattva-status'])
  expect(nextButtons({ ...p, status: 'approved' }, true)).toEqual([`/sattva:implement ${f}`, '/sattva-status'])
  expect(nextButtons(p, false)).toEqual([`/sattva:implement ${f}`, '/sattva-status'])
  expect(nextButtons({ ...p, level: 'M', done: 3, blocked: 1 }, false)).toEqual([`/sattva:verify ${f}`, '/sattva-status'])
  expect(nextButtons({ ...p, done: 3, blocked: 1 }, false)).toEqual([`/sattva:verify ${f}`, '/sattva:review', '/sattva-status'])
  expect(nextButtons({ ...p, status: 'verified', release: 1 }, false)).toEqual([`/sattva:implement ${f}`, '/sattva-status'])
})

// what the engine answers beneath the plugin in a session
let mtime = 1
let hasPlan = true
let dirs = ['2026-10-12-reminders']
let usd: number | undefined
let ctx: number | undefined // context tokens $.session.usage reports
const BIND = { text: '/sattva:implement docs/sattva/2026-10-12-reminders/plan.md' } as any
const stubSession = (on: any, store?: Record<string, unknown> | null) => { // null: the test answers the store itself
  on('fs.exists', ($: any, e: any) => { const p = rel(e.path); return { value: hasPlan && (p in files || Object.keys(files).some((f) => f.startsWith(p + '/'))) } })
  on('fs.list', () => ({ value: dirs.map((name) => ({ name, kind: 'dir', size: 0 })) }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: mtime, isLink: false } }))
  on('fs.read', ($: any, e: any) => ({ value: files[rel(e.path)] }))
  on('session.start', ($: any, e: any) => e)
  on('command.register', () => ({ value: true }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: ctx }, rateLimits: [], ...(usd === undefined ? {} : { cost: { usd } }) } }))
  on('ui.status', () => ({ value: true }))
  on('turn.start', ($: any, e: any) => e)
  on('turn.complete', () => ({ text: '' }))
  on('prompt.suggest', () => ({ isShown: true }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('classic.SessionStart', () => ({}))
  on('ui.render', ($: any, e: any) => h($.ui.resolve(e).Box, { key: 'engine' })) // the engine's own (empty) band beneath
  if (store !== null) mock.store(on, store)
}

const TURN = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as any
const PLAN_FILE = 'docs/sattva/2026-10-12-reminders/plan.md'
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } } as any
const label = async (ui: any, key: string) => ((await ui.find({ key })) as any)?.props?.label

test('buttons appear when a session starts on its plan and leave when a turn starts', async ($, on) => {
  stubSession(on)
  on('prompt.submit', ($: any, e: any) => ({ drop: 'test' }))
  await $.prompt.submit(BIND)
  await $.session.start({ cwd: 'E:/proj' } as any) // a reload or resume of a session that works with the plan
  let ui = await $.ui.mount({ plugin: 'sattva', surface: 'desktop', ...BAND })
  expect(await label(ui, 'next1')).toBe('implement')
  expect(await label(ui, 'next2')).toBe('status')
  expect(await ui.find({ key: 'plan-bar' })).toBeDefined()
  await ui.unmount()
  await $.turn.start({ text: 'x', turnId: 't2' } as any)
  ui = await $.ui.mount({ plugin: 'sattva', surface: 'desktop', ...BAND })
  expect(await ui.find({ key: 'next1' })).toBeUndefined()
  await ui.unmount()
})

test('a pressed button fills the prompt box and never sends it', async ($, on) => {
  stubSession(on)
  const filled: string[] = []
  const sent: string[] = []
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', ($: any, e: any) => { filled.push(e.text); return { isFilled: true } })
  on('prompt.submit', ($: any, e: any) => { sent.push(e.text); return { drop: 'test' } })
  await $.prompt.submit(BIND)
  sent.length = 0
  for (const surface of ['terminal', 'desktop'] as const) {
    await $.session.start({ cwd: 'E:/proj' } as any)
    const ui = await $.ui.mount({ plugin: 'sattva', surface, ...BAND })
    await ui.press({ key: 'next1' })
    expect(await ui.find({ key: 'next1' })).toBeUndefined()
    await ui.unmount()
  }
  expect(filled).toEqual([`/sattva:implement ${PLAN_FILE}`, `/sattva:implement ${PLAN_FILE}`])
  expect(sent).toEqual([])
})

test('handoff: /clear only after the marker and a changed plan, then the next command waits in the box', async ($, on) => {
  stubSession(on)
  const clock = mock.clock(on)
  const sent: string[] = []
  const cleared: string[] = []
  const filled: string[] = []
  const toasts: string[] = []
  on('prompt.submit', ($: any, e: any) => { sent.push(e.text); return { text: e.text } })
  on('command.run', { command: 'clear' }, () => { cleared.push('clear'); return {} })
  on('prompt.fill', ($: any, e: any) => { filled.push(e.text); return { isFilled: true } })
  on('ui.toast', ($: any, e: any) => { toasts.push(String(e?.text ?? e)); return { value: true } })
  mtime = 1
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit(BIND)
  sent.length = 0

  // no marker: called off, nothing cleared
  await $.command.run({ command: 'sattva-handoff', args: '' })
  await clock.settle()
  expect(sent.length).toBe(1)
  expect(sent[0]).toContain(PLAN_FILE)
  expect(sent[0]).toContain(MARKER)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(cleared).toEqual([])

  // marker, but the plan did not change: called off
  await $.command.run({ command: 'sattva-handoff', args: '' })
  await clock.settle()
  await $.turn.complete({ ...TURN, answer: MARKER })
  await clock.settle()
  expect(cleared).toEqual([])

  // marker and a newer plan: /clear, then the next command is filled in after the clear
  await $.command.run({ command: 'sattva-handoff', args: '' })
  await clock.settle()
  mtime = 2
  await $.turn.complete({ ...TURN, answer: MARKER })
  await clock.settle()
  expect(cleared).toEqual(['clear'])
  await $.classic.SessionStart({ source: 'clear' } as any)
  await clock.settle()
  expect(filled).toEqual([`/sattva:implement ${PLAN_FILE}`])
  mtime = 1
})

test('/sattva-handoff without an active plan says so and sends nothing', async ($, on) => {
  stubSession(on)
  hasPlan = false
  const sent: string[] = []
  on('prompt.submit', ($: any, e: any) => { sent.push(e.text); return { drop: 'test' } })
  await $.session.start({ cwd: 'E:/proj' } as any)
  const out = await $.command.run({ command: 'sattva-handoff', args: '' })
  expect(JSON.stringify(out)).toContain('No active Sattva plan')
  expect(sent).toEqual([])
  hasPlan = true
})

test('band pieces: short chips, bars clamp, context tone follows the handoff level', async () => {
  expect(chip(`/sattva:verify ${PLAN_FILE}`)).toBe('verify')
  expect(chip('/sattva-status')).toBe('status')
  expect(chip('/sattva-status', 'статус')).toBe('статус')
  expect(barText(0.5, 8)).toBe('████░░░░')
  expect(barText(2, 4)).toBe('████')
  expect(pct(0.383)).toBe('38%')
  expect([0, 1, 2, 3].map(toneFor)).toEqual(['suggestion', 'warning', 'error', 'error'])
  expect(barSvg(0.5, 'success', 100)).toContain('width="50"')
})

test('session binding: survives a restart that drops the session state (kept in the store by session id)', async ($, on) => {
  stubSession(on, { 'bound:sess-1': ['2026-10-12-reminders'] }) // bound before the app restarted; the state is gone
  on('prompt.submit', ($: any, e: any) => ({ drop: 'test' }))
  await $.session.start({ cwd: 'E:/proj' } as any)
  expect(JSON.stringify(await $.command.run({ command: 'sattva-status', args: '' }))).toContain('tasks 2/4')
  const ui = await $.ui.mount({ plugin: 'sattva', surface: 'desktop', ...BAND })
  expect(await label(ui, 'next1')).toBe('implement')
  expect(await ui.find({ key: 'unbound' })).toBeUndefined()
  await ui.unmount()
})

test('session binding: a bound plan is written to the store under the session id', async ($, on) => {
  stubSession(on, null)
  const kept: Record<string, unknown> = {}
  on('store.get', ($: any, e: any) => ({ value: kept[e.key] }))
  on('store.set', ($: any, e: any) => { kept[e.key] = e.value; return { value: undefined } })
  on('prompt.submit', ($: any, e: any) => ({ drop: 'test' }))
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit(BIND)
  expect(kept['bound:sess-1']).toEqual(['2026-10-12-reminders'])
})

test('a session without a plan of its own is told once about the plan in view; the first prompt takes the row away', async ($, on) => {
  stubSession(on)
  on('prompt.submit', ($: any, e: any) => ({ drop: 'test' }))
  await $.session.start({ cwd: 'E:/proj' } as any)
  let ui = await $.ui.mount({ plugin: 'sattva', surface: 'desktop', ...BAND })
  expect(JSON.stringify(await ui.find({ key: 'unbound' }))).toContain("plan 2026-10-12-reminders is not this session's yet")
  expect(await label(ui, 'unbound-go')).toBe('implement')
  expect(await ui.find({ key: 'next1' })).toBeUndefined()
  await ui.unmount()
  await $.prompt.submit({ text: 'what does this function do?' } as any)
  ui = await $.ui.mount({ plugin: 'sattva', surface: 'desktop', ...BAND })
  expect(await ui.find({ key: 'unbound' })).toBeUndefined()
  await ui.unmount()
})

test('the band stays after a plain prompt in a session that works with the plan', async ($, on) => {
  stubSession(on)
  on('prompt.submit', ($: any, e: any) => e)
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit({ text: `/sattva:implement ${PLAN_FILE}` } as any)
  await $.turn.complete(TURN)
  let ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
  expect(await label(ui, 'next1')).toBe('implement')
  await ui.unmount()
  await $.prompt.submit({ text: 'what does this function do?' } as any)
  ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'next1' })).toBeUndefined() // nothing while the turn runs
  await ui.unmount()
  await $.turn.complete(TURN)
  ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
  expect(await label(ui, 'next1')).toBe('implement')
  expect(await ui.find({ key: 'plan-bar' })).toBeDefined()
  await ui.unmount()
})

test('session binding: a session that never worked with the plan gets no buttons, status, handoff or cost', async ($, on) => {
  stubSession(on)
  const sent: string[] = []
  on('prompt.submit', ($: any, e: any) => { sent.push(e.text); return { drop: 'test' } })
  usd = 1
  await $.session.start({ cwd: 'E:/proj' } as any)
  const ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'next1' })).toBeUndefined()
  await ui.unmount()
  expect(JSON.stringify(await $.command.run({ command: 'sattva-status', args: '' }))).toContain("is not this session's")
  expect(JSON.stringify(await $.command.run({ command: 'sattva-handoff', args: '' }))).toContain('No active Sattva plan')
  await $.prompt.submit({ text: 'what does this function do?' } as any)
  usd = 3
  await $.turn.complete(TURN)
  await $.prompt.submit(BIND)
  expect(JSON.stringify(await $.command.run({ command: 'sattva-status', args: '' }))).toContain('Cost by stage (this machine): not measured yet')
  expect(sent.some((t) => t.includes('Sattva handoff'))).toBe(false)
  usd = undefined
})

test('session binding: /sattva:<stage> naming the plan, or an edit in its folder, makes it the session plan', async ($, on) => {
  stubSession(on)
  on('prompt.submit', ($: any, e: any) => ({ drop: 'test' }))
  on('tool.call', () => ({ deny: 'test' }))
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit({ text: '/sattva:start rename a button' } as any)
  expect(JSON.stringify(await $.command.run({ command: 'sattva-status', args: '' }))).toContain("is not this session's")
  await $.tool.call({ tool: 'Write', file_path: 'E:\\proj\\docs\\sattva\\2026-10-12-reminders\\plan.md', content: 'x' } as any)
  expect(JSON.stringify(await $.command.run({ command: 'sattva-status', args: '' }))).toContain('tasks 2/4')
})

test('session binding: an argument-less implement takes the newest plan; a newer folder without plan.md hides nothing', async ($, on) => {
  stubSession(on)
  on('prompt.submit', ($: any, e: any) => ({ drop: 'test' }))
  dirs = ['2026-10-12-reminders', '2026-10-16-next'] // the newer folder has only an intent
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit({ text: '/sattva:implement' } as any)
  await $.turn.complete(TURN)
  const ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
  expect(await label(ui, 'next1')).toBe('implement')
  await ui.unmount()
  dirs = ['2026-10-12-reminders']
})

test('session binding: Sattva stages run before the session had a plan are billed to it once it has one', async ($, on) => {
  stubSession(on)
  on('prompt.submit', ($: any, e: any) => ({ drop: 'test' }))
  usd = 0
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit({ text: '/sattva:start add reminders' } as any)
  usd = 2
  await $.turn.complete(TURN)
  await $.prompt.submit({ text: 'unrelated chat' } as any)
  usd = 2.5
  await $.turn.complete(TURN)
  await $.prompt.submit(BIND)
  usd = 3.5
  await $.turn.complete(TURN)
  expect(JSON.stringify(await $.command.run({ command: 'sattva-status', args: '' }))).toContain('start $2.00 · implement $1.00 · total $3.00')
  usd = undefined
})

const MIN = 60000

test('cold cache: past 55 minutes the band offers a clean start that clears with no model turn', { options: { language: 'ru' } }, async ($, on) => {
  stubSession(on)
  const clock = mock.clock(on)
  const sent: string[] = []
  const cleared: string[] = []
  const filled: string[] = []
  on('prompt.submit', ($: any, e: any) => { sent.push(e.text); return { drop: 'test' } })
  on('command.run', { command: 'clear' }, () => { cleared.push('clear'); return {} })
  on('prompt.fill', ($: any, e: any) => { filled.push(e.text); return { isFilled: true } })
  ctx = 40000
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit(BIND)
  await $.turn.complete(TURN)
  sent.length = 0

  await clock.advance(54 * MIN)
  let ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'cold-clean' })).toBeUndefined()
  await ui.unmount()

  await clock.advance(MIN)
  ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
  expect(await label(ui, 'cold-clean')).toBe('Начать чисто')
  expect(await label(ui, 'cold-save')).toBe('Записать и начать')
  expect(JSON.stringify(await ui.find({ key: 'cold' }))).toContain('Кэш остыл (55 мин назад)')
  await ui.press({ key: 'cold-clean' })
  await clock.settle()
  await ui.unmount()
  expect(cleared).toEqual(['clear'])
  expect(sent).toEqual([]) // no model turn: the history is not re-read
  await $.classic.SessionStart({ source: 'clear' } as any)
  await clock.settle()
  expect(filled).toEqual([`/sattva:implement ${PLAN_FILE}`])
  ctx = undefined
})

test('cold cache: no offer on a small context or without a plan; a sent prompt takes it away', async ($, on) => {
  stubSession(on)
  const clock = mock.clock(on)
  on('prompt.submit', ($: any, e: any) => ({ drop: 'test' }))
  const cold = async () => {
    const ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
    const found = (await ui.find({ key: 'cold-clean' })) !== undefined
    await ui.unmount()
    return found
  }
  await $.session.start({ cwd: 'E:/proj' } as any)

  // a session that never worked with a plan: nothing to start clean from
  ctx = 40000
  await $.turn.complete(TURN)
  await clock.advance(60 * MIN)
  expect(await cold()).toBe(false)

  await $.prompt.submit(BIND)
  ctx = 20000
  await $.turn.complete(TURN)
  await clock.advance(60 * MIN)
  expect(await cold()).toBe(false)

  ctx = 40000
  await $.turn.complete(TURN)
  await clock.advance(60 * MIN)
  expect(await cold()).toBe(true)
  await $.prompt.submit({ text: 'still here' } as any)
  expect(await cold()).toBe(false)
  ctx = undefined
})

test('cold cache: a resumed or reloaded session finds the pause through session.start', { options: { language: 'ru' } }, async ($, on) => {
  stubSession(on, { 'turn:last:sess-1': 60 * MIN }) // the last turn was two hours ago, before the timer could live
  const clock = mock.clock(on, { now: 3 * 60 * MIN })
  on('prompt.submit', ($: any, e: any) => ({ drop: 'test' }))
  ctx = 40000
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit(BIND)
  await $.session.start({ cwd: 'E:/proj' } as any) // the reload or resume: no timer survived, the store did
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
  expect(JSON.stringify(await ui.find({ key: 'cold' }))).toContain('(2 ч назад)')
  await ui.unmount()
  ctx = undefined
})

test('cold cache: a timer armed before a new prompt never marks the fresh answer cold', async ($, on) => {
  stubSession(on)
  const clock = mock.clock(on)
  on('prompt.submit', ($: any, e: any) => ({ drop: 'test' }))
  ctx = 40000
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit(BIND)
  await $.turn.complete(TURN)
  await clock.advance(54 * MIN)
  await $.prompt.submit({ text: 'x' } as any)
  await $.turn.start({ text: 'x', turnId: 't2' } as any)
  await clock.advance(2 * MIN) // the old 55-min timer comes due while the model answers
  await $.turn.complete(TURN)
  const ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'cold-clean' })).toBeUndefined()
  await ui.unmount()
  ctx = undefined
})

test('cold cache: «Записать и начать» starts the usual handoff and drops the band', async ($, on) => {
  stubSession(on)
  const clock = mock.clock(on)
  const sent: string[] = []
  on('prompt.submit', ($: any, e: any) => { sent.push(e.text); return { drop: 'test' } })
  ctx = 40000
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit(BIND)
  await $.turn.complete(TURN)
  sent.length = 0
  await clock.advance(55 * MIN)
  let ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
  await ui.press({ key: 'cold-save' })
  await clock.settle()
  await ui.unmount()
  expect(sent.length).toBe(1)
  expect(sent[0]).toContain(PLAN_FILE)
  expect(sent[0]).toContain(MARKER)
  ui = await $.ui.mount({ plugin: 'sattva', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'cold-clean' })).toBeUndefined()
  await ui.unmount()
  ctx = undefined
})

// the whole band: plan and context bars with the handoff offer, the cold-cache row, the next-step buttons
async function drawBand($: any, on: any, surface: 'terminal' | 'desktop', setting?: string) {
  stubSession(on)
  const clock = mock.clock(on)
  const sent: string[] = []
  on('prompt.submit', ($: any, e: any) => { sent.push(e.text); return { drop: 'test' } })
  on('session.measure', () => ({ changed: [] }))
  if (setting) on('settings.read', () => ({ value: { language: setting } }))
  ctx = 400000
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit(BIND)
  await $.turn.complete(TURN)
  await clock.advance(60 * MIN)
  await $.session.measure({ context: { tokens: 400000, window: 1000000 } } as any)
  const ui = await $.ui.mount({ plugin: 'sattva', surface, ...BAND })
  const text = JSON.stringify(await Promise.all(['bars', 'cold', 'cold-note', 'next'].map((key) => ui.find({ key }))))
  ctx = undefined
  return { ui, text, sent, clock }
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`language: English by default, no Cyrillic anywhere in the band (${surface})`, async ($, on) => {
    const { ui, text } = await drawBand($, on, surface)
    expect(await label(ui, 'cold-save')).toBe('Save and start')
    expect(await label(ui, 'cold-clean')).toBe('Start clean')
    expect(text).toContain('Cache went cold (1 h ago)')
    expect(/[\u0400-\u04FF]/.test(text)).toBe(false)
    await ui.unmount()
  })

  test(`language: ru by the plugin option (${surface})`, { options: { language: 'ru' } }, async ($, on) => {
    const { ui, text } = await drawBand($, on, surface)
    expect(await label(ui, 'cold-save')).toBe('Записать и начать')
    expect(await label(ui, 'cold-clean')).toBe('Начать чисто')
    expect(text).toContain('Кэш остыл (1 ч назад)')
    await ui.unmount()
  })
}

test("language: auto follows Claude Code's language setting", { options: { language: 'auto' } }, async ($, on) => {
  const { ui } = await drawBand($, on, 'terminal', 'russian')
  expect(await label(ui, 'cold-save')).toBe('Записать и начать')
  await ui.unmount()
})

test('language: the plugin option wins over the setting', { options: { language: 'en' } }, async ($, on) => {
  const { ui, text } = await drawBand($, on, 'terminal', 'russian')
  expect(await label(ui, 'cold-save')).toBe('Save and start')
  expect(/[\u0400-\u04FF]/.test(text)).toBe(false)
  await ui.unmount()
})

test('language: the text sent to the agent stays English in any interface language', { options: { language: 'de' } }, async ($, on) => {
  const { ui, sent, clock } = await drawBand($, on, 'terminal')
  expect(await label(ui, 'cold-save')).toBe('Speichern und starten')
  sent.length = 0
  await ui.press({ key: 'cold-save' })
  await clock.settle()
  await ui.unmount()
  expect(sent.length).toBe(1)
  expect(sent[0]).toContain('Do not commit or push')
  expect(sent[0]).toContain(MARKER)
})

test('cost: an answer to a menu keeps paying into the stage it serves, also with no buttons after it', async ($, on) => {
  stubSession(on)
  on('prompt.submit', () => ({ drop: 'test' }))
  usd = 1
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit(BIND)
  await $.turn.complete(TURN)
  usd = 3
  await $.prompt.submit({ text: 'Исправить здесь' } as any)
  await $.turn.complete(TURN)
  const status = JSON.stringify(await $.command.run({ command: 'sattva-status', args: '' }))
  expect(status).toContain('$2.00')
  expect(status).not.toContain('other')
  usd = undefined
})

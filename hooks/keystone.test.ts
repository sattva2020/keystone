import { test, expect, mock } from 'claude-code/testing'
import { parsePlan, statusText, costLine, gatesFor, nextCommand, nextButtons } from './keystone.ts'
import { MARKER } from './handoff.ts'

const PLAN = [
  '# Plan: reminders', '',
  'Level: L · Mode: feature · Status: implementing',
  'Settings: tests — yes · logging — standard · docs — no',
  'Done means: npm test green; reminder row visible',
  '', '## Original Request', '- [ ] not a task', '',
  '## Tasks',
  '- [x] 1. schema', '- [x] 2. job', '- [ ] 3. email — BLOCKED: no staging SMTP', '- [ ] 4. ui', '',
].join('\n')

// a fake project: docs/keystone/<one task>/plan.md
const files: Record<string, string> = { 'docs/keystone/2026-10-12-reminders/plan.md': PLAN }
const rel = (p: string) => String(p).split('\\').join('/').replace(/^.*?(?=docs\/keystone|\.ai-factory)/, '')
const stubFs = (on: any) => {
  on('fs.exists', ($: any, e: any) => { const p = rel(e.path); return { value: p in files || Object.keys(files).some((f) => f.startsWith(p + '/')) } })
  on('fs.list', () => ({ value: [{ name: '2026-10-12-reminders', kind: 'dir', size: 0 }] }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }))
  on('fs.read', ($: any, e: any) => ({ value: files[rel(e.path)] }))
}

test('parsePlan reads the header and counts only ## Tasks', async () => {
  const p = parsePlan('docs/keystone/x/plan.md', PLAN)!
  expect(p.level).toBe('L')
  expect(p.status).toBe('implementing')
  expect([p.done, p.total, p.blocked]).toEqual([2, 4, 1])
  expect(p.doneMeans).toBe('npm test green; reminder row visible')
  expect(gatesFor(p).join(' ')).toContain('Stop reminds')
})

test('verified, abandoned and header-less plans are not active', async () => {
  expect(parsePlan('p', PLAN.replace('implementing', 'verified'))).toBe(null)
  expect(parsePlan('p', '# Plan\n## Tasks\n- [ ] 1. a\n')).toBe(null)
})

test('cost line sums stages and says when nothing was measured', async () => {
  expect(costLine({})).toBe('not measured yet')
  expect(costLine({ plan: 3.2, check: 1.25, implement: 0.001 })).toBe('plan $3.20 · check $1.25 · total $4.45')
  expect(statusText(null, {})).toContain('No active Keystone plan')
})

test('/keystone-status answers without a model turn', async ($, on) => {
  stubFs(on)
  mock.store(on, { 'cost:docs/keystone/2026-10-12-reminders/plan.md': { plan: 2.5, check: 1 } })
  const out = await $.command.run({ command: 'keystone-status', args: '' })
  const text = JSON.stringify(out)
  expect(text).toContain('Level L')
  expect(text).toContain('tasks 2/4')
  expect(text).toContain('BLOCKED 1')
  expect(text).toContain('plan $2.50 · check $1.00 · total $3.50')
  expect(text).toContain('Next: /keystone:implement docs/keystone/2026-10-12-reminders/plan.md')
})

test('next command follows the plan status, with the plan path', async () => {
  const p = parsePlan('docs/keystone/x/plan.md', PLAN)!
  expect(nextCommand(p)).toBe('/keystone:implement docs/keystone/x/plan.md')
  expect(nextCommand({ ...p, done: 3, blocked: 1 })).toBe('/keystone:verify docs/keystone/x/plan.md')
  expect(nextCommand({ ...p, status: 'approved' })).toBe('/keystone:implement docs/keystone/x/plan.md')
  expect(nextCommand({ ...p, status: 'draft' })).toBe('/keystone:plan docs/keystone/x/plan.md')
})

test('release mode: a verified plan with open ## Release steps stays in view and points to implement', async () => {
  const rel = PLAN.replace('implementing', 'verified').replace('- [ ] 3. email — BLOCKED: no staging SMTP', '- [x] 3. email').replace('- [ ] 4. ui', '- [x] 4. ui') + '\n## Release\n- [ ] R1. merge into main and push — check: CI green\n- [ ] R2. deploy — check: /health 200\n'
  const p = parsePlan('docs/keystone/x/plan.md', rel)!
  expect(p.status).toBe('verified')
  expect(p.release).toBe(2)
  expect(nextCommand(p)).toBe('/keystone:implement docs/keystone/x/plan.md')
  expect(gatesFor(p).join(' ')).toContain('release mode')
  expect(parsePlan('p', PLAN.replace('implementing', 'verified'))).toBe(null)
})

test('buttons: the next command, the status, and a third only where Keystone asks for one', async () => {
  const f = 'docs/keystone/x/plan.md'
  const p = parsePlan(f, PLAN)!
  expect(nextButtons(null, false)).toEqual([])
  expect(nextButtons({ ...p, level: 'M', status: 'draft' }, false)).toEqual([`/keystone:plan ${f}`, '/keystone-status'])
  expect(nextButtons({ ...p, status: 'draft' }, false)).toEqual([`/keystone:plan ${f}`, '/keystone-status'])
  expect(nextButtons({ ...p, status: 'draft' }, true)).toEqual([`/keystone:plan ${f}`, `/keystone:check docs/keystone/x/intent.md ${f}`, '/keystone-status'])
  expect(nextButtons({ ...p, status: 'approved' }, true)).toEqual([`/keystone:implement ${f}`, '/keystone-status'])
  expect(nextButtons(p, false)).toEqual([`/keystone:implement ${f}`, '/keystone-status'])
  expect(nextButtons({ ...p, level: 'M', done: 3, blocked: 1 }, false)).toEqual([`/keystone:verify ${f}`, '/keystone-status'])
  expect(nextButtons({ ...p, done: 3, blocked: 1 }, false)).toEqual([`/keystone:verify ${f}`, '/keystone:review', '/keystone-status'])
  expect(nextButtons({ ...p, status: 'verified', release: 1 }, false)).toEqual([`/keystone:implement ${f}`, '/keystone-status'])
})

// what the engine answers beneath the plugin in a session
let mtime = 1
let hasPlan = true
const stubSession = (on: any) => {
  on('fs.exists', ($: any, e: any) => { const p = rel(e.path); return { value: hasPlan && (p in files || Object.keys(files).some((f) => f.startsWith(p + '/'))) } })
  on('fs.list', () => ({ value: [{ name: '2026-10-12-reminders', kind: 'dir', size: 0 }] }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: mtime, isLink: false } }))
  on('fs.read', ($: any, e: any) => ({ value: files[rel(e.path)] }))
  on('session.start', ($: any, e: any) => e)
  on('command.register', () => ({ value: true }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] } }))
  on('ui.status', () => ({ value: true }))
  on('turn.start', ($: any, e: any) => e)
  on('turn.complete', () => ({ text: '' }))
  on('prompt.suggest', ($: any, e: any) => e)
  on('agent.list', () => ({ value: [] }))
  on('classic.SessionStart', () => ({}))
  on('ui.render', ($: any, e: any) => h($.ui.resolve(e).Box, { key: 'engine' })) // the engine's own (empty) band beneath
  mock.store(on)
}

const TURN = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as any
const PLAN_FILE = 'docs/keystone/2026-10-12-reminders/plan.md'
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } } as any
const label = async (ui: any, key: string) => ((await ui.find({ key })) as any)?.props?.label

test('buttons appear when a session starts on an active plan and leave when a turn starts', async ($, on) => {
  stubSession(on)
  await $.session.start({ cwd: 'E:/proj' } as any)
  let ui = await $.ui.mount({ plugin: 'keystone', surface: 'desktop', ...BAND })
  expect(await label(ui, 'next1')).toBe(`/keystone:implement ${PLAN_FILE}`)
  expect(await label(ui, 'next2')).toBe('/keystone-status')
  await ui.unmount()
  await $.turn.start({ text: 'x', turnId: 't2' } as any)
  ui = await $.ui.mount({ plugin: 'keystone', surface: 'desktop', ...BAND })
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
  for (const surface of ['terminal', 'desktop'] as const) {
    await $.session.start({ cwd: 'E:/proj' } as any)
    const ui = await $.ui.mount({ plugin: 'keystone', surface, ...BAND })
    await ui.press({ key: 'next1' })
    expect(await ui.find({ key: 'next1' })).toBeUndefined()
    await ui.unmount()
  }
  expect(filled).toEqual([`/keystone:implement ${PLAN_FILE}`, `/keystone:implement ${PLAN_FILE}`])
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

  // no marker: called off, nothing cleared
  await $.command.run({ command: 'keystone-handoff', args: '' })
  await clock.settle()
  expect(sent.length).toBe(1)
  expect(sent[0]).toContain(PLAN_FILE)
  expect(sent[0]).toContain(MARKER)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(cleared).toEqual([])

  // marker, but the plan did not change: called off
  await $.command.run({ command: 'keystone-handoff', args: '' })
  await clock.settle()
  await $.turn.complete({ ...TURN, answer: MARKER })
  await clock.settle()
  expect(cleared).toEqual([])

  // marker and a newer plan: /clear, then the next command is filled in after the clear
  await $.command.run({ command: 'keystone-handoff', args: '' })
  await clock.settle()
  mtime = 2
  await $.turn.complete({ ...TURN, answer: MARKER })
  await clock.settle()
  expect(cleared).toEqual(['clear'])
  await $.classic.SessionStart({ source: 'clear' } as any)
  await clock.settle()
  expect(filled).toEqual([`/keystone:implement ${PLAN_FILE}`])
  mtime = 1
})

test('/keystone-handoff without an active plan says so and sends nothing', async ($, on) => {
  stubSession(on)
  hasPlan = false
  const sent: string[] = []
  on('prompt.submit', ($: any, e: any) => { sent.push(e.text); return { drop: 'test' } })
  await $.session.start({ cwd: 'E:/proj' } as any)
  const out = await $.command.run({ command: 'keystone-handoff', args: '' })
  expect(JSON.stringify(out)).toContain('Нет активного плана Keystone')
  expect(sent).toEqual([])
  hasPlan = true
})

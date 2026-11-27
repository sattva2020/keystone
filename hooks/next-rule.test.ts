import { test, expect, mock } from 'claude-code/testing'
import { answerNext, fallbackNext, parsePlan, verdictOf, type Plan } from './plan.ts'
import { nextButtons } from './keystone.ts'
import { COLD_MS, MARKER } from './handoff.ts'

const F = 'docs/keystone/x/plan.md'
const PLAN = 'Level: L · Mode: feature · Status: implementing\n\n## Tasks\n- [x] 1. a\n- [x] 2. b\n'
const p = parsePlan(F, PLAN)!
const FENCE = '```'

test('answerNext table: the last Next: line, a code block after it or a command in the line', async () => {
  const rows: [string, string, { cmd: string | null } | null][] = [
    ['block', `Done.\n\nNext: verify in a clean session\n${FENCE}\n/keystone:verify ${F}\n${FENCE}\n`, { cmd: `/keystone:verify ${F}` }],
    ['line', 'Next: /keystone:fix verify', { cmd: '/keystone:fix verify' }],
    ['two Next:', 'Next: /a one\nmore\nNext: /b two', { cmd: '/b two' }],
    ['Next: in an example block above', `Next: /real x\n${FENCE}\nNext: /fake\n${FENCE}\ntext`, { cmd: '/real x' }],
    ['no Next:', 'All done, nothing else.', null],
    ['empty block', `Next: push and open the PR\n${FENCE}\n\n${FENCE}\n`, { cmd: null }],
    ['command in backticks', 'Next: run `/code-review --fix` then rest', { cmd: '/code-review --fix' }],
    ['nothing now', `Next: nothing now — waiting for CI\n${FENCE}\n/keystone:verify ${F}\n${FENCE}`, { cmd: null }],
  ]
  for (const [name, answer, want] of rows) expect([name, answerNext(answer)]).toEqual([name, want])
  expect(answerNext('Next: push and open the PR')).toEqual({ cmd: null })
  expect(answerNext('  Next: /x\r\n')).toEqual({ cmd: '/x' })
})

test('fallbackNext table: the verdict decides once every task is ticked', async () => {
  const fail = (stale: boolean) => ({ verdict: 'FAIL' as const, stale })
  const unproven = (stale: boolean) => ({ verdict: 'PASS-UNPROVEN' as const, stale })
  const blocked: Plan = { ...p, done: 1, blocked: 1 }
  const open: Plan = { ...p, done: 1 }
  const rows: [string, Plan, any, string | null][] = [
    ['FAIL fresh', p, fail(false), '/keystone:fix verify'],
    ['FAIL stale', p, fail(true), `/keystone:verify ${F}`],
    ['PASS-UNPROVEN fresh', p, unproven(false), `/keystone:verify accept ${F}`],
    ['PASS-UNPROVEN stale', p, unproven(true), `/keystone:verify accept ${F}`],
    ['only BLOCKED, no verify.md', blocked, null, null],
    ['all ticked, no verify.md', p, null, `/keystone:verify ${F}`],
    ['open tasks + FAIL', open, fail(false), `/keystone:implement ${F}`],
    ['draft', { ...p, status: 'draft' }, fail(false), `/keystone:plan ${F}`],
    ['approved', { ...p, status: 'approved' }, fail(false), `/keystone:implement ${F}`],
    ['verified', { ...p, status: 'verified', release: 1 }, fail(false), `/keystone:implement ${F}`],
  ]
  for (const [name, plan, v, want] of rows) expect([name, fallbackNext(plan, v)]).toEqual([name, want])
})

test('buttons from main: the answer first, the status extras after it, no repeat', async () => {
  const sec: Plan = { ...p, security: true }
  const status = '/keystone-status'
  expect(nextButtons(sec, false)).toEqual([`/keystone:security ${F}`, `/keystone:verify ${F}`, '/keystone:review', status])
  expect(nextButtons(sec, false, undefined)).toEqual(nextButtons(sec, false))
  expect(nextButtons(sec, false, `/keystone:verify ${F}`)).toEqual(nextButtons(sec, false)) // main = the status's own: old order
  expect(nextButtons(sec, false, '/keystone:fix verify')).toEqual(['/keystone:fix verify', `/keystone:security ${F}`, '/keystone:review', status])
  expect(nextButtons(sec, false, null)).toEqual([`/keystone:security ${F}`, '/keystone:review', status])
  expect(nextButtons({ ...p, done: 1 }, false, null)).toEqual([status])
  expect(nextButtons({ ...p, done: 1 }, false, '/code-review')).toEqual(['/code-review', status])
  expect(nextButtons(null, false, '/x')).toEqual([])
})

test('verdictOf: the header verdict (first), stale by mtime, null on any failure', async () => {
  const fake = (o: { verify?: string; planM?: number; verifyM?: number; fail?: 'stat' | 'read' }) => ({
    fs: {
      exists: async (f: string) => f === F || (f.endsWith('verify.md') && o.verify !== undefined),
      read: async () => { if (o.fail === 'read') throw new Error('read'); return o.verify ?? '' },
      stat: async (f: string) => { if (o.fail === 'stat') throw new Error('stat'); return { mtimeMs: f === F ? o.planM ?? 1 : o.verifyM ?? 1 } },
    },
  }) as any
  expect(await verdictOf(fake({}), p)).toBe(null)
  expect(await verdictOf(fake({ verify: 'Verdict: FAIL\nVerdict: PASS\n' }), p)).toEqual({ verdict: 'FAIL', stale: false })
  expect(await verdictOf(fake({ verify: 'Verdict: FAIL', planM: 5, verifyM: 2 }), p)).toEqual({ verdict: 'FAIL', stale: true })
  expect(await verdictOf(fake({ verify: 'Verdict: PASS-UNPROVEN', planM: 2, verifyM: 2 }), p)).toEqual({ verdict: 'PASS-UNPROVEN', stale: false })
  expect(await verdictOf(fake({ verify: 'Verdict: FAIL', fail: 'stat' }), p)).toBe(null)
  expect(await verdictOf(fake({ verify: 'Verdict: FAIL', fail: 'read' }), p)).toBe(null)
  expect(await verdictOf(fake({ verify: 'no verdict yet' }), p)).toBe(null)
})

// ---- the module in a session: the answer's Next: drives the band, the suggestion, the status, the handoff
const PF = 'docs/keystone/2026-10-12-reminders/plan.md'
const VF = 'docs/keystone/2026-10-12-reminders/verify.md'
const OPEN = 'Level: L · Mode: feature · Status: implementing\n\n## Tasks\n- [x] 1. a\n- [ ] 2. b\n'
const ALL = OPEN.replace('- [ ] 2.', '- [x] 2.')
const rel = (x: string) => String(x).split('\\').join('/').replace(/^.*?(?=docs\/keystone)/, '')
const session = (on: any, o: any = {}) => {
  const w: any = { files: { [PF]: OPEN } as Record<string, string>, mtime: { [PF]: 1, [VF]: 1 } as Record<string, number>, store: {} as Record<string, unknown>, suggested: [] as string[], cleared: 0, filled: [] as string[], readFails: false, ...o }
  on('fs.exists', ($: any, e: any) => { const x = rel(e.path); return { value: x in w.files || Object.keys(w.files).some((f) => f.startsWith(x + '/')) } })
  on('fs.list', () => ({ value: [{ name: '2026-10-12-reminders', kind: 'dir', size: 0 }] }))
  on('fs.stat', ($: any, e: any) => (w.readFails && rel(e.path) === VF ? { deny: 'io' } : { value: { kind: 'file', size: 1, mtimeMs: w.mtime[rel(e.path)] ?? 1, isLink: false } }))
  on('fs.read', ($: any, e: any) => (w.readFails && rel(e.path) === VF ? { deny: 'io' } : { value: w.files[rel(e.path)] }))
  on('session.start', ($: any, e: any) => e)
  on('command.register', () => ({ value: true }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: w.tokens }, rateLimits: [], cost: { usd: 0 } } }))
  on('ui.status', () => ({ value: true }))
  on('turn.start', ($: any, e: any) => e)
  on('turn.complete', () => ({ text: '' }))
  on('prompt.suggest', ($: any, e: any) => { w.suggested.push(e.text); return { isShown: true } })
  on('prompt.submit', () => ({ drop: 'test' }))
  on('prompt.fill', ($: any, e: any) => { w.filled.push(e.text); return { isFilled: true } })
  on('command.run', { command: 'clear' }, () => { w.cleared++; return {} })
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('classic.SessionStart', () => ({}))
  on('store.get', ($: any, e: any) => ({ value: w.store[e.key] }))
  on('store.set', ($: any, e: any) => { w.store[e.key] = e.value; return { value: undefined } })
  on('store.delete', ($: any, e: any) => { delete w.store[e.key]; return { value: undefined } })
  on('ui.toast', () => ({ value: true }))
  on('ui.render', ($: any, e: any) => h($.ui.resolve(e).Box, { key: 'engine' }))
  return w
}
const BANDP = { plugin: 'keystone', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } } as any
const chips = async ($: any) => {
  const ui = await $.ui.mount(BANDP)
  const out: string[] = []
  for (let i = 1; i <= 6; i++) { const b = (await ui.find({ key: `next${i}` })) as any; if (b) out.push(b.props.label) }
  await ui.unmount()
  return out
}
const T = (answer: string, o: any = {}) => ({ answer, durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...o }) as any
const bindIt = ($: any) => $.prompt.submit({ text: `/keystone:implement ${PF}` } as any)

test('answer drives the band; a subagent answer does not; an answer without Next: hands back to the plan', async ($, on) => {
  session(on)
  await $.session.start({ cwd: 'E:/proj' } as any)
  await bindIt($)
  await $.turn.complete(T('ok'))
  expect(await chips($)).toEqual(['implement', 'status'])
  await $.turn.complete(T(`Done.\nNext: run it\n${FENCE}\n/code-review\n${FENCE}`))
  expect(await chips($)).toEqual(['/code-review', 'status'])
  await $.turn.complete(T('Next: /other', { agentId: 'a1' }))
  expect(await chips($)).toEqual(['/code-review', 'status'])
  await $.turn.complete(T('plain answer'))
  expect(await chips($)).toEqual(['implement', 'status'])
})

test('nothing now: no main button, no suggestion; a command with no slash: no main button', async ($, on) => {
  const w = session(on)
  const clock = mock.clock(on)
  await $.session.start({ cwd: 'E:/proj' } as any)
  await bindIt($)
  w.suggested.length = 0
  await $.turn.complete(T('Next: nothing now — waiting for CI'))
  await clock.settle()
  expect(await chips($)).toEqual(['status'])
  expect(w.suggested).toEqual([])
  await bindIt($)
  await $.turn.complete(T('Next: push and open the PR'))
  expect(await chips($)).toEqual(['status'])
})

test('suggestion after a plain prompt follows the answer; a Keystone turn without Next: gets the plan step', async ($, on) => {
  const w = session(on)
  const clock = mock.clock(on)
  await $.session.start({ cwd: 'E:/proj' } as any)
  await bindIt($)
  await $.prompt.submit({ text: 'hello' } as any)
  w.suggested.length = 0
  await $.turn.complete(T('Next: /code-review'))
  await clock.settle()
  expect(w.suggested).toEqual(['/code-review'])
  await $.prompt.submit({ text: 'hello' } as any)
  await $.turn.complete(T('no next line'))
  await clock.settle()
  expect(w.suggested).toEqual(['/code-review']) // plain prompt, no Next: — no suggestion
  await bindIt($)
  await $.turn.complete(T('no next line'))
  await clock.settle()
  expect(w.suggested.at(-1)).toBe(`/keystone:implement ${PF}`)
})

test('aborted turn keeps the command; an error or an empty answer too', async ($, on) => {
  session(on)
  await $.session.start({ cwd: 'E:/proj' } as any)
  await bindIt($)
  await $.turn.complete(T('Next: /keystone:fix verify'))
  await $.turn.complete(T('', { reason: 'aborted', isAborted: true }))
  await $.turn.complete(T('Next: /else', { reason: 'error' }))
  await $.turn.complete(T('   '))
  expect((await chips($))[0]).toBe('fix')
})

test('reload restores: a new engine takes the answer back from the store', async ($, on) => {
  session(on, { store: { 'bound:sess-1': ['2026-10-12-reminders'], 'next:sess-1': { cmd: '/keystone:fix verify' } } })
  await $.session.start({ cwd: 'E:/proj' } as any)
  expect((await chips($))[0]).toBe('fix')
  const status = JSON.stringify(await $.command.run({ command: 'keystone-status', args: '' }))
  expect(status).toContain('Next: /keystone:fix verify')
})

test('handoff takes the answer; handoff keeps the previous Next: over a changed plan', async ($, on) => {
  const w = session(on, { files: { [PF]: ALL, [VF]: 'Verdict: FAIL' } })
  const clock = mock.clock(on)
  await $.session.start({ cwd: 'E:/proj' } as any)
  await bindIt($)
  await $.turn.complete(T('no Next: here'))
  expect((await chips($))[0]).toBe('fix') // fresh FAIL, no answer: the fallback
  await $.turn.complete(T('Next: /keystone:fix verify'))
  await $.command.run({ command: 'keystone-handoff', args: '' })
  await clock.settle()
  w.mtime[PF] = 5 // the handoff edits plan.md: the FAIL is now older than the plan
  await $.turn.complete(T(MARKER))
  await clock.settle()
  expect(w.cleared).toBe(1)
  expect(w.store['handoff:next']).toBe('/keystone:fix verify')
  // the handoff takes this answer's command when it names another one
  await $.turn.complete(T('Next: /keystone:review'))
  await $.command.run({ command: 'keystone-handoff', args: '' })
  await clock.settle()
  w.mtime[PF] = 9
  await $.turn.complete(T(MARKER))
  await clock.settle()
  expect(w.store['handoff:next']).toBe('/keystone:review')
})

test('read failures: verify.md unreadable → buttons by status; the turn still answers', async ($, on) => {
  const w = session(on, { files: { [PF]: ALL, [VF]: 'Verdict: FAIL' }, readFails: true })
  await $.session.start({ cwd: 'E:/proj' } as any)
  await bindIt($)
  const out = await $.turn.complete(T('ok'))
  expect(out).toBeDefined()
  expect((await chips($))[0]).toBe('verify')
  w.readFails = false
  await $.turn.complete(T('ok'))
  expect((await chips($))[0]).toBe('fix')
})

test('one source: band, status, suggestion and the plan bar all take the answer', async ($, on) => {
  const w = session(on, { tokens: 200000 })
  const clock = mock.clock(on)
  await $.session.start({ cwd: 'E:/proj' } as any)
  await bindIt($)
  await $.turn.complete(T('Next: /x'))
  await clock.settle()
  expect((await chips($))[0]).toBe('/x')
  expect(JSON.stringify(await $.command.run({ command: 'keystone-status', args: '' }))).toContain('Next: /x')
  expect(w.suggested.at(-1)).toBe('/x')
  // the plan bar's next step: «Начать чисто» after a cold pause puts it into the box after /clear
  await clock.advance(COLD_MS)
  await clock.settle()
  const ui = await $.ui.mount(BANDP)
  await ui.press({ key: 'cold-clean' })
  await ui.unmount()
  await clock.settle()
  expect(w.store['handoff:next']).toBe('/x')
})

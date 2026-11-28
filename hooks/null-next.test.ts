import { test, expect, mock } from 'claude-code/testing'
import { parsePlan, statusText, noCommandText } from './sattva.ts'
import { MARKER } from './handoff.ts'

// fix verify (run 2) of docs/sattva/2026-11-26-mod-buttons-follow-next
// Class: a null next step ("no command now") stays "none" everywhere — never turned into another instruction

test('status text: a live plan with no next command says so, not /sattva:start', async () => {
  const F = 'docs/sattva/x/plan.md'
  const blockedOnly = parsePlan(F, 'Level: L · Mode: feature · Status: implementing\n\n## Tasks\n- [x] 1. a\n- [ ] 2. b BLOCKED: db\n')!
  const draft = parsePlan(F, 'Level: L · Mode: feature · Status: draft\n\n## Tasks\n- [ ] 1. a\n')!
  for (const p of [blockedOnly, draft]) {
    const text = statusText(p, {}, null)
    expect(text).not.toContain('/sattva:start')
    expect(text).toContain(`Next: ${noCommandText(p)}`)
  }
  expect(noCommandText(blockedOnly)).not.toContain('/sattva:')
  // a finished plan still points to the next task
  const gone = parsePlan(F, 'Level: L · Mode: feature · Status: abandoned\n\n## Tasks\n- [x] 1. a\n')!
  expect(statusText(gone, {}, null)).toContain('/sattva:start')
})

test('handoff after an answer with no command seeds nothing; the box stays empty after /clear', async ($, on) => {
  const PF = 'docs/sattva/2026-10-12-reminders/plan.md'
  const files: Record<string, string> = { [PF]: 'Level: L · Mode: feature · Status: draft\n\n## Tasks\n- [ ] 1. a\n' }
  const store: Record<string, unknown> = { 'handoff:next': '/sattva:stale' }
  let mtime = 1
  let cleared = 0
  const rel = (x: string) => String(x).split('\\').join('/').replace(/^.*?(?=docs\/sattva)/, '')
  on('fs.exists', ($: any, e: any) => { const x = rel(e.path); return { value: x in files || Object.keys(files).some((f) => f.startsWith(x + '/')) } })
  on('fs.list', () => ({ value: [{ name: '2026-10-12-reminders', kind: 'dir', size: 0 }] }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: mtime, isLink: false } }))
  on('fs.read', ($: any, e: any) => ({ value: files[rel(e.path)] }))
  on('session.start', ($: any, e: any) => e)
  on('command.register', () => ({ value: true }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [], cost: { usd: 0 } } }))
  on('ui.status', () => ({ value: true }))
  on('turn.start', ($: any, e: any) => e)
  on('turn.complete', () => ({ text: '' }))
  on('prompt.suggest', () => ({ isShown: true }))
  on('prompt.submit', () => ({ drop: 'test' }))
  on('command.run', { command: 'clear' }, () => { cleared++; return {} })
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('store.get', ($: any, e: any) => ({ value: store[e.key] }))
  on('store.set', ($: any, e: any) => { store[e.key] = e.value; return { value: undefined } })
  on('store.delete', ($: any, e: any) => { delete store[e.key]; return { value: undefined } })
  on('ui.toast', () => ({ value: true }))
  const clock = mock.clock(on)
  const T = (answer: string) => ({ answer, durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' }) as any
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit({ text: `/sattva:plan ${PF}` } as any)
  await $.turn.complete(T('Next: nothing now — waiting for your Approve'))
  await $.command.run({ command: 'sattva-handoff', args: '' })
  await clock.settle()
  mtime = 2
  await $.turn.complete(T(MARKER))
  await clock.settle()
  expect(store['handoff:next']).toBe(undefined)
  expect(cleared).toBe(1)
})

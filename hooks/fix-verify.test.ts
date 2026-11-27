import { test, expect, mock } from 'claude-code/testing'
import { answerNext, verdictOf, parsePlan } from './plan.ts'
import { MARKER } from './handoff.ts'

// fix verify of docs/keystone/2026-11-26-mod-buttons-follow-next: three classes of findings
const FENCE = '```'

// Class: the verdict is the one verify.md records in its header, not a verdict its body quotes
test('verdictOf reads the header verdict, not a quoted one in the report', async () => {
  const F = 'docs/keystone/x/plan.md'
  const p = parsePlan(F, 'Level: L · Mode: feature · Status: implementing\n\n## Tasks\n- [x] 1. a\n')!
  const fake = (verify: string) => ({
    fs: { exists: async () => true, read: async () => verify, stat: async () => ({ mtimeMs: 1 }) },
  }) as any
  const body = (head: string, quoted: string) => `# Verify: x\nDate: 2026-11-26 · Base: a · Verdict: ${head}\n## Report\nRow 5 — wrong — a body line quoting \`Verdict: ${quoted}\`\n`
  expect((await verdictOf(fake(body('FAIL', 'PASS')), p))?.verdict).toBe('FAIL')
  expect((await verdictOf(fake(body('FAIL', 'PASS-UNPROVEN')), p))?.verdict).toBe('FAIL')
  expect((await verdictOf(fake(body('PASS-UNPROVEN', 'PASS')), p))?.verdict).toBe('PASS-UNPROVEN')
})

// Class: the command in the Next: line is the slash command, not the prose around it or a file path
test('answerNext: the command in the line stops at prose; /clear gives way; paths are not commands', async () => {
  const rows: [string, { cmd: string | null }][] = [
    ['Next: /clear, then /keystone:verify docs/k/plan.md', { cmd: '/keystone:verify docs/k/plan.md' }],
    ['Next: commit it; run /keystone:evolve again after the next tasks', { cmd: '/keystone:evolve' }],
    ['Next: /keystone:verify docs/x/plan.md after /clear', { cmd: '/keystone:verify docs/x/plan.md' }],
    ['Next: /keystone:fix verify', { cmd: '/keystone:fix verify' }],
    ['Next: /keystone:verify accept docs/x/plan.md — one row is unproven', { cmd: '/keystone:verify accept docs/x/plan.md' }],
    ['Next: look at /tmp/x.log', { cmd: null }],
    [`Next: run tests\n${FENCE}bash\n/usr/bin/node --test\n${FENCE}`, { cmd: null }],
    ['Next: /clear', { cmd: '/clear' }],
  ]
  for (const [answer, want] of rows) expect([answer, answerNext(answer)]).toEqual([answer, want])
})

// Class: an answer that named no command must not be replaced by a guess where a command is seeded
test('handoff after an answer with no command seeds nothing, not verify', async ($, on) => {
  const PF = 'docs/keystone/2026-10-12-reminders/plan.md'
  const files: Record<string, string> = { [PF]: 'Level: L · Mode: feature · Status: draft\n\n## Tasks\n- [ ] 1. a\n' }
  const store: Record<string, unknown> = {}
  let mtime = 1
  const rel = (x: string) => String(x).split('\\').join('/').replace(/^.*?(?=docs\/keystone)/, '')
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
  on('command.run', { command: 'clear' }, () => ({}))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('store.get', ($: any, e: any) => ({ value: store[e.key] }))
  on('store.set', ($: any, e: any) => { store[e.key] = e.value; return { value: undefined } })
  on('store.delete', ($: any, e: any) => { delete store[e.key]; return { value: undefined } })
  on('ui.toast', () => ({ value: true }))
  const clock = mock.clock(on)
  const T = (answer: string) => ({ answer, durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' }) as any
  await $.session.start({ cwd: 'E:/proj' } as any)
  await $.prompt.submit({ text: `/keystone:plan ${PF}` } as any)
  await $.turn.complete(T('Next: nothing now — waiting for your Approve'))
  await $.command.run({ command: 'keystone-handoff', args: '' })
  await clock.settle()
  mtime = 2
  await $.turn.complete(T(MARKER))
  await clock.settle()
  expect(store['handoff:next']).toBe(undefined)
})

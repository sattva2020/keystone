import { test, expect, mock } from 'claude-code/testing'
import { parsePlan, statusText, costLine, gatesFor, nextCommand } from './keystone.ts'

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

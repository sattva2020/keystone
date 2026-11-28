// The panel's own registration on a hand-made engine, for the hooks/panel*.test.ts files.
import { onStart, onTurn, register as registerPanel } from '../hooks/panel.tsx'

const PANE = 'sattva-panel'
const PLAN_FILE = 'docs/sattva/2026-10-12-reminders/plan.md'
export const files: Record<string, string> = {
  [PLAN_FILE]: '# Plan: reminders\n\nLevel: L · Mode: feature · Status: implementing\n\n## Tasks\n- [x] 1. a\n- [ ] 2. b\n',
}
const KID = { sessionId: 'kid', title: 'Kid', branch: 'b', isArchived: false, isRunning: false, startedBy: 'me', originCwd: 'E:/proj', worktreePath: 'E:/wt', sourceBranch: 'main' }
const ROW = { id: 'kid', title: 'Kid', state: 'idle', ready: false, stage: 'implementing', done: 1, total: 3, code: 'approve', arg: '', next: '/sattva:plan p', wait: true }

// The kit cannot raise a person's ui.close (only the plugin reaches that event), so the closing cases run the panel's own
// registration on a hand-made `on` and `$`: one store, one queue of timers. `restart` registers again, as a reload does.
export const bench = (store: Record<string, unknown>, o: any = {}) => {
  const w: any = { list: JSON.stringify([KID]), rows: [ROW], runs: 0, now: 1, opened: 0, open: false, placed: true, shown: true, sid: 'sess-1', fail: false, commands: [] as string[], mcp: [] as string[], ...o }
  const hooks: Record<string, any> = {}
  const state: Record<string, unknown> = { lang: 'ru', bound: ['2026-10-12-reminders'] }
  let queue: (() => void)[] = []
  let ticks: (() => void)[] = []
  const $: any = {
    plugin: { root: 'E:/plugin' },
    store: { get: async (k: string) => store[k], set: async (k: string, v: unknown) => { store[k] = v }, delete: async (k: string) => { delete store[k] } },
    state: { get: async (r: any) => ({ value: state[r.key] }), set: async (r: any, v: unknown) => { state[r.key] = v } },
    session: { id: async () => w.sid, surfaces: async () => ['desktop'], usage: async () => { if (w.ownFails) throw new Error('no usage'); return { context: {} } } },
    fs: { exists: async (p: string) => p === 'docs/sattva' || p in files, list: async () => [{ name: '2026-10-12-reminders', kind: 'dir' }], stat: async () => ({ mtimeMs: 1 }), read: async (p: string) => files[p] },
    command: { register: async (c: any) => { w.commands.push(c.name) } },
    clock: {
      now: async () => w.now,
      after: (_: number, fn: () => void) => { queue.push(fn); return { cancel: () => {} } },
      every: (_: number, fn: () => void) => { ticks.push(fn); return { cancel: () => { ticks = ticks.filter((x) => x !== fn) } } },
    },
    ui: {
      panes: async () => (w.open ? [{ id: PANE, isShown: w.shown, isPlaced: w.placed }] : []),
      open: async () => { if (w.openFails) throw new Error('no panes'); w.opened++; w.open = true; return w.placed ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface: none' } },
    },
    mcp: { call: async (_: string, tool: string, args: any) => {
      w.mcp.push(tool)
      if (w.fail) throw new Error('no server')
      return { isError: false, content: [{ type: 'text', text: tool === 'list_sessions' ? w.list : JSON.stringify(args.session_id === 'self' ? { sessionId: 'me', originCwd: 'E:/proj' } : KID) }] }
    } },
    process: { run: async () => { w.runs++; return { exitCode: 0, stdout: JSON.stringify({ rows: w.rows }) } } },
  }
  const on: any = (event: string, a: any, b: any) => { hooks[event] = b ?? a; return { catch: () => {} } }
  const restart = () => {
    ticks = []
    registerPanel(on, {} as any, { nextButtons: () => [], costLine: () => '', ledgerKey: (p: any) => `cost:${p.file}` })
  }
  restart()
  const rest = async () => { for (let i = 0; i < 20; i++) { const q = queue; queue = []; q.forEach((fn) => fn()); for (let j = 0; j < 30; j++) await Promise.resolve() } }
  return {
    $, w, hooks, rest, state, restart,
    start: async () => { await onStart($); await rest() },
    turn: async () => { await onTurn($); await rest() },
    tick: async () => { [...ticks].forEach((fn) => fn()); await rest() },
    close: async (kind: string) => { let passed = 0; await hooks['ui.close']($, { id: PANE, origin: { kind } }, async () => { passed++; w.open = false }); return passed },
    command: async () => { const r = await hooks['command.run']($); await rest(); return r.text as string },
  }
}

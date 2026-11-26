// Keystone side panel: who waits for you, child sessions, this session's plan, checks and cost. It reads the app's list
// of child sessions, and skills/sessions/scripts/panel.mjs (the engine's registry, git, plan files); it sends nothing,
// calls no model, and its one button only fills the prompt box. Every failure stays inside the panel.
import type { EngineInterface, Register } from 'claude-code'
import type { PanelData, PanelOwn, PanelRow } from '../types'
import { strings, type Strings } from './i18n.ts'
import { chip, langOf, pick } from './next.tsx'
import { sessionPlan, type Ledger, type Plan } from './plan.ts'

const PANE = 'keystone-panel'
const PANEL = { plugin: 'keystone', key: 'panel' } as const
const CLOSED = { plugin: 'keystone', key: 'panelClosed' } as const
const SHOWN = 8
const TICK_MS = 30000
const EMPTY: PanelOwn = { plan: null, next: null, wait: null, verdict: null, coverage: null, security: null, cost: '', sessionUsd: null }

// keystone.ts hands these over (no circular import); a function that takes $ cannot be handed over, so sessionPlan is imported
type Deps = { nextButtons: (p: Plan | null, hasIntent: boolean) => string[]; costLine: (l: Ledger) => string; ledgerKey: (p: Plan) => string }
type Listed = { sessionId: string; title?: string; branch?: string; isArchived?: boolean; isRunning?: boolean; starting?: boolean; startedBy?: string }
type Detail = { worktreePath?: string; originCwd?: string; sourceBranch?: string }

// What this session's plan waits for from the person; the first match wins.
export function ownWait(p: Plan | null, verdict: string | null): { code: string; arg: string } | null {
  if (!p) return null
  if (p.status === 'draft') return { code: 'approve', arg: '' }
  if (p.status === 'verified' && p.release > 0) return { code: 'release', arg: String(p.release) }
  if (p.status !== 'implementing') return null
  if (verdict === 'PASS-UNPROVEN') return { code: 'accept', arg: '' }
  if (p.blocked > 0 && p.total - p.done - p.blocked === 0) return { code: 'blocked', arg: String(p.blocked) }
  return null
}

// The minimized panel: how many wait for you, how many work, the progress of the tasks.
export function widgetLine(d: PanelData): string {
  const rows = d.rows ?? []
  const waits = rows.filter((r) => r.wait).length + (d.own.wait ? 1 : 0)
  const [done, total] = d.own.plan ? [d.own.plan.done, d.own.plan.total] : rows.reduce(([a, b], r) => [a + r.done, b + r.total], [0, 0])
  return `${d.stale ? '⚠ ' : ''}⏳ ${waits} · 🔄 ${rows.filter((r) => r.state === 'working').length}${total > 0 ? ` · ${done}/${total}` : ''}`
}

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ')
const reason = (t: Strings, code: string, arg: string): string => {
  const row = (t as unknown as Record<string, string | ((a: string) => string) | undefined>)[`r_${code}`]
  return clean(typeof row === 'function' ? row(arg) : row ?? code)
}

let self: { id: string; originCwd?: string } | null = null
const details = new Map<string, Detail>()
let busy = false
let timer: { cancel: () => void } | undefined
let placement = ''
let enabled = true
let deps: Deps

async function ask($: EngineInterface, tool: string, args: Record<string, unknown>): Promise<string> {
  const r = await $.mcp.call('ccd_session_mgmt', tool, args)
  if (r.isError) throw new Error(tool)
  return r.content.map((c) => (c.type === 'text' ? String((c as { text?: unknown }).text ?? '') : '')).join('').trim()
}

// this session as the app knows it; it outlives /clear, unlike $.session.id()
async function appSelf($: EngineInterface): Promise<{ id: string; originCwd?: string }> {
  if (!self) {
    const me = JSON.parse(await ask($, 'get_session', { session_id: 'self' }))
    self = { id: String(me.sessionId), originCwd: me.originCwd }
  }
  return self
}

async function childRows($: EngineInterface): Promise<PanelRow[]> {
  const me = await appSelf($)
  const text = await ask($, 'list_sessions', { linked: true, limit: 100 })
  const list: Listed[] = text.startsWith('[') ? JSON.parse(text) : [] // no family: a sentence, not a list
  if (!list.some((s) => s.startedBy === me.id && !s.isArchived)) return []
  const line = new Set([me.id])
  for (let grew = true; grew; ) {
    grew = false
    for (const s of list) if (!line.has(s.sessionId) && !s.isArchived && s.startedBy && line.has(s.startedBy)) { line.add(s.sessionId); grew = true }
  }
  const sessions = []
  for (const s of list) {
    // a starting session has no worktree yet: its folder would be cached wrong, its state is unknown
    if (line.has(s.sessionId) && s.sessionId !== me.id && !s.starting && !details.has(s.sessionId)) {
      const d = JSON.parse(await ask($, 'get_session', { session_id: s.sessionId }))
      details.set(s.sessionId, { worktreePath: d.worktreePath, originCwd: d.originCwd, sourceBranch: d.sourceBranch })
    }
    sessions.push({
      sessionId: s.sessionId, title: s.title, branch: s.branch, isArchived: !!s.isArchived, parentSessionId: s.startedBy,
      isRunning: s.starting ? true : s.isRunning, ...details.get(s.sessionId),
    })
  }
  const r = await $.process.run(['node', `${$.plugin.root}/skills/sessions/scripts/panel.mjs`], {
    stdin: JSON.stringify({ self: me.id, originCwd: me.originCwd, sessions }),
    timeoutMs: 25000,
  })
  if (r.exitCode !== 0) throw new Error('panel.mjs')
  const { rows } = JSON.parse(r.stdout)
  if (!Array.isArray(rows)) throw new Error('panel.mjs')
  return rows
}

async function ownBlock($: EngineInterface): Promise<PanelOwn> {
  const p = await sessionPlan($)
  const sessionUsd = (await $.session.usage()).cost?.usd ?? null
  if (!p) return { ...EMPTY, cost: deps.costLine({}), sessionUsd }
  const read = async (f: string) => ((await $.fs.exists(f)) ? $.fs.read(f) : '')
  const verify = await read(p.file.replace(/[^/]*$/, 'verify.md'))
  const verdict = [...verify.matchAll(/Verdict:\s*(PASS-UNPROVEN|PASS|FAIL)/g)].at(-1)?.[1] ?? null
  const wait = ownWait(p, verdict)
  const { file, level, status, done, total, blocked, release } = p
  return {
    plan: { file, level, status, done, total, blocked, release },
    next: wait?.code === 'accept' ? `/keystone:verify accept ${file}` : wait?.code === 'blocked' ? null : deps.nextButtons(p, false)[0] ?? null,
    wait,
    verdict,
    coverage: (await read(file)).match(/^Coverage:\s*([^%\n]*%)/m)?.[1] ?? null,
    security: [...verify.matchAll(/Security gate:\s*(pass|warn|fail|n\/a)/g)].at(-1)?.[1] ?? null,
    cost: deps.costLine(((await $.store.get(deps.ledgerKey(p))) ?? {}) as Ledger),
    sessionUsd,
  }
}

async function refreshPanel($: EngineInterface) {
  if (busy) return
  busy = true
  try {
    let rows: PanelRow[] | null = null
    let own: PanelOwn | null = null
    try {
      own = await ownBlock($)
      rows = await childRows($)
    } catch {
      // own or rows null: the last answer stays, marked stale
    }
    const { value: prev = null } = await $.state.get(PANEL)
    if (own && (rows || !prev?.rows)) await $.state.set(PANEL, { rows, own, at: await $.clock.now(), stale: false })
    else if (prev) await $.state.set(PANEL, { ...prev, stale: true })
    // no own blocks and nothing earlier: claim nothing
  } catch {
    // the panel is optional
  } finally {
    busy = false
  }
}

async function isOpen($: EngineInterface) { return (await $.ui.panes()).some((p) => p.id === PANE) }

// What the person last did with the panel. $.state holds it whatever the ids are (it outlives a reload and /clear); the
// store keeps it over an app restart, under the app session's id and the engine session's: every name known at a look
// gets the mark or loses it, so a name learned later (the app answers, /clear) is brought in line on the next look.
async function keys($: EngineInterface) { return [...(self ? [`panel:closed:${self.id}`] : []), `panel:closed:${await $.session.id()}`] }
async function mark($: EngineInterface, act?: boolean): Promise<boolean> {
  const names = await keys($)
  const { value: kept } = await $.state.get(CLOSED)
  let isClosed = act ?? kept?.closed
  if (isClosed === undefined) {
    isClosed = false
    for (const k of names) if (await $.store.get(k)) isClosed = true
    if (!isClosed) return false // nobody acted yet, as far as the names known now tell: nothing to record
  }
  const all = [...new Set([...(kept?.names ?? []), ...names])]
  if (kept?.closed !== isClosed || kept.names.length !== all.length) await $.state.set(CLOSED, { closed: isClosed, names: all })
  for (const k of isClosed ? names : all) {
    const has = !!(await $.store.get(k))
    if (isClosed && !has) await $.store.set(k, true)
    if (!isClosed && has) await $.store.delete(k)
  }
  return isClosed
}
async function closed($: EngineInterface) {
  try {
    await appSelf($)
  } catch {
    // the app is silent: the names known so far
  }
  return mark($)
}
async function onDesktop($: EngineInterface) { return (await $.session.surfaces()).includes('desktop') }

function stopTimer() {
  try {
    timer?.cancel()
  } catch {
    // a timer of an engine that is gone is gone with it
  }
  timer = undefined
}
function startTimer($: EngineInterface) {
  stopTimer()
  timer = $.clock.every(TICK_MS, () => void tick($).catch(() => undefined))
}
async function tick($: EngineInterface) {
  const p = (await $.ui.panes()).find((x) => x.id === PANE)
  if (p?.isPlaced && (p.isShown || placement === 'widget')) await auto($)
}

// opens by itself with a plan or child sessions, on the desktop, unless the person closed it in this session
async function maybeOpen($: EngineInterface) {
  if ((await closed($)) || (await isOpen($)) || !(await onDesktop($))) return
  const { value: d = null } = await $.state.get(PANEL)
  if (!d?.own.plan && !d?.rows?.length) return
  await $.ui.open({ id: PANE, title: 'Keystone' })
  startTimer($)
}

// the refresh nobody asked for: the desktop only, and not for a panel the person closed
async function auto($: EngineInterface) {
  try {
    if (!(await onDesktop($))) return
    if ((await closed($)) && !(await isOpen($))) return
    await refreshPanel($)
    await maybeOpen($)
  } catch {
    // the panel is optional
  }
}

// keystone.ts calls these from its own session.start and turn.complete (one hook per event per plugin), off the hook
export async function onStart($: EngineInterface) {
  if (!enabled) return
  await $.command.register({ name: 'keystone-panel', description: 'Keystone: open the side panel (no model call)' }).catch(() => undefined)
  try {
    if (await isOpen($)) startTimer($) // a reload drops the timer, the pane stays
  } catch {
    // no panes here
  }
  await auto($)
}
export async function onTurn($: EngineInterface) {
  if (enabled) await auto($)
}

export function register(on: Parameters<Register>[0], options: Parameters<Register>[1], given: Deps) {
  deps = given
  // a reload or another test starts over
  self = null
  details.clear()
  busy = false
  stopTimer()
  placement = ''
  enabled = options.panel !== false
  if (!enabled) return

  on('session.attach', async ($, e, next) => {
    const out = await next(e)
    if (e.surface === 'desktop') $.clock.after(0, () => void auto($))
    return out
  }).catch(($, e, next) => next(e))

  on('ui.close', { id: PANE }, async ($, e, next) => {
    stopTimer()
    if (e.origin.kind === 'person') await mark($, true)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'keystone-panel' }, async ($) => {
    const t = strings(await langOf($))
    let text: string = t.panelOpened
    try {
      await mark($, false)
      const r = await $.ui.open({ id: PANE, title: 'Keystone' })
      startTimer($)
      if (!r.isPlaced) text = t.panelWaits(r.reason)
      $.clock.after(0, () => void refreshPanel($))
    } catch (err) {
      text = t.panelWaits(clean(String((err as Error)?.message ?? err)))
    }
    return { text }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    placement = e.props.placement
    const { Box, Button, Text } = $.ui.resolve(e)
    const t = strings(await langOf($))
    const { value: d = null } = await $.state.get(PANEL)
    if (!d)
      return (
        <Box flexDirection="column">
          <Text bold>Keystone</Text>
          <Text dimColor>{t.noData}</Text>
        </Box>
      )
    if (placement === 'widget') return <Box><Text wrap="truncate-end">{widgetLine(d)}</Text></Box>

    const line = (text: string, dim = false) => <Text dimColor={dim} wrap="truncate-end">{clean(text)}</Text>
    const block = (key: string, title: string, body: any[]) => (
      <Box key={key} flexDirection="column" marginBottom={1}>
        <Text bold>{title}</Text>
        {body}
      </Box>
    )
    const cut = <T,>(list: T[], draw: (x: T) => any[]) => [
      ...list.slice(0, SHOWN).flatMap(draw),
      ...(list.length > SHOWN ? [line(t.more(String(list.length - SHOWN)), true)] : []),
    ]
    const { own } = d
    const rows = d.rows ?? []
    const waits = [
      ...(own.wait ? [{ title: t.thisSession, code: own.wait.code, arg: own.wait.arg, next: own.next }] : []),
      ...rows.filter((r) => r.wait).map((r) => ({ title: r.title, code: r.code ?? '', arg: r.arg, next: r.next })),
    ]
    const word = { working: ['🔄', t.stWorking], waiting: ['⏳', t.stWaiting], idle: ['⏸', t.stIdle], unknown: ['❔', t.stUnknown] } as const
    const progress = (x: { done: number; total: number }) => (x.total > 0 ? [`${x.done}/${x.total}`] : [])
    const rowLines = (r: PanelRow) => {
      const [icon, name] = r.ready ? (['✅', t.stReady] as const) : word[r.state] ?? word.unknown
      return [
        line(`${icon} ${r.title}`),
        line(['  ' + name, ...(r.stage ? [r.stage] : []), ...progress(r)].join(' · '), true),
        ...(r.next ? [line(`  ${r.next}`, true)] : []),
      ]
    }
    const light: Record<string, string> = { PASS: '🟢', 'PASS-UNPROVEN': '🟡', FAIL: '🔴' }
    const next = own.next
    return (
      <Box flexDirection="column">
        {d.stale ? <Text color="warning" wrap="truncate-end">{t.staleAt(new Date(d.at).toTimeString().slice(0, 5))}</Text> : null}
        {block('p-wait', t.waitYou, waits.length === 0 ? [line(t.nobody, true)] : cut(waits, (w) => [
          line(`⏳ ${w.title}`),
          line(`  ${reason(t, w.code, w.arg)}`, true),
          ...(w.next ? [line(`  ${w.next}`, true)] : []),
        ]))}
        {block('p-sessions', t.sessions, d.rows === null ? [line(t.noData, true)] : rows.length === 0 ? [line(t.noSessions, true)] : cut(rows, rowLines))}
        {block('p-plan', t.plan, own.plan ? [
          line([own.plan.level, own.plan.status, ...progress(own.plan), ...(own.plan.blocked ? [`BLOCKED ${own.plan.blocked}`] : [])].join(' · ')),
          ...(next ? [<Button key="panel-next" label={chip(next, t.status)} variant="primary" onPress={() => pick($, next)} />] : []),
        ] : [line(t.noOwnPlan, true)])}
        {block('p-checks', t.checks, [
          line(`verify ${own.verdict ? `${light[own.verdict] ?? ''} ${own.verdict}` : t.notRun}`),
          line(`check ${own.coverage ?? '—'}`),
          line(`security ${own.security ?? '—'}`),
        ])}
        {block('p-cost', t.spend, [
          line(own.cost || '—'),
          ...(own.sessionUsd === null ? [] : [line(`${t.thisSession} $${own.sessionUsd.toFixed(2)}`, true)]),
        ])}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}

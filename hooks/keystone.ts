// Keystone mod: /keystone-status (no model turn), a status line, and the real cost of each stage.
// Works next to the settings hooks in hooks.json (gate.mjs); this module only observes and reports.
import type { EngineInterface, Register } from 'claude-code'
import { register as registerNext } from './next.tsx'
import { register as registerLinks, normalize } from './links.ts'
import { MARKER } from './handoff.ts'

const ACTIVE = new Set(['draft', 'approved', 'implementing'])
const STAGE = /^\s*\/keystone:([a-z]+)/
const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export type Plan = {
  file: string
  level: string
  mode: string
  status: string
  done: number
  total: number
  blocked: number
  release: number // open `- [ ] R<n>.` steps in ## Release (run after verify)
  security: boolean // a Threats: block without a ticked /keystone:security task: verify needs its gate line
  doneMeans?: string
}
export type Ledger = Record<string, number> // stage → USD

const slash = (p: string) => p.replace(/\\/g, '/')

async function planRoots($: EngineInterface): Promise<string[]> {
  const roots = ['docs/keystone']
  if (await $.fs.exists('.ai-factory/config.yaml')) {
    const m = (await $.fs.read('.ai-factory/config.yaml')).match(/^\s*specs:\s*["']?([^"'\s#]+)/m)
    roots.push(m ? m[1].replace(/\/+$/, '') : '.ai-factory/specs')
  }
  return roots
}

// Same rule as gate.mjs: task folders whose plan.md is in view (parsePlan), newest first — date prefix of the folder
// name, then plan.md mtime. A folder without plan.md (intent only) never hides another plan.
async function plans($: EngineInterface): Promise<Plan[]> {
  const out: { plan: Plan; name: string; mtime: number }[] = []
  for (const r of await planRoots($)) {
    if (!(await $.fs.exists(r))) continue
    for (const d of await $.fs.list(r)) {
      const file = `${r}/${d.name}/plan.md`
      if (d.kind !== 'dir' || !(await $.fs.exists(file))) continue
      const plan = parsePlan(file, await $.fs.read(file))
      if (plan) out.push({ plan, name: d.name, mtime: (await $.fs.stat(file)).mtimeMs })
    }
  }
  out.sort((a, b) => (a.name.slice(0, 10) === b.name.slice(0, 10) ? b.mtime - a.mtime : b.name.slice(0, 10).localeCompare(a.name.slice(0, 10))))
  return out.map((x) => x.plan)
}

// The repo's newest plan in view, whoever works with it (/keystone-status names it to an unbound session).
export async function activePlan($: EngineInterface): Promise<Plan | null> {
  return (await plans($))[0] ?? null
}

// A plan is this session's once it ran `/keystone:<stage>` naming the plan's folder (implement/verify with no argument
// take the newest plan, as their skills do) or edited a file in that folder; gate.mjs reads the same from the transcript.
const folder = (file: string) => file.replace(/\/[^/]*$/, '').replace(/^.*\//, '')
const BOUND = { plugin: 'keystone', key: 'bound' } as const
const NO_ARG = new Set(['implement', 'verify'])

async function bind($: EngineInterface, names: string[]) {
  const { value: bound = [] } = await $.state.get(BOUND)
  const add = names.filter((n) => !bound.includes(n))
  if (add.length) await $.state.set(BOUND, [...bound, ...add])
}

export async function bindCommand($: EngineInterface, stage: string, args: string) {
  const all = await plans($)
  const a = slash(args)
  const names = a.trim() ? all.map((p) => folder(p.file)).filter((n) => a.includes(n)) : NO_ARG.has(stage) && all[0] ? [folder(all[0].file)] : []
  await bind($, names)
}

async function bindEdit($: EngineInterface, path: string) {
  const p = '/' + slash(path)
  const names = (await planRoots($)).map((r) => p.match(new RegExp(`/${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/`))?.[1]).filter((n): n is string => !!n)
  await bind($, names)
}

// The plan this session works with: the newest plan in view it is bound to; none → no status, buttons, handoff or cost.
export async function sessionPlan($: EngineInterface): Promise<Plan | null> {
  const { value: bound = [] } = await $.state.get(BOUND)
  if (!bound.length) return null
  return (await plans($)).find((p) => bound.includes(folder(p.file))) ?? null
}

export function parsePlan(file: string, raw: string): Plan | null {
  const lines = raw.replace(/\r/g, '').split('\n')
  const header = lines.find((l) => /^Level:/.test(l)) ?? lines.find((l) => /^Status:/.test(l)) ?? ''
  const status = header.match(/\bStatus:\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? ''
  let inTasks = false, inRelease = false, done = 0, total = 0, blocked = 0, release = 0, secDone = false
  for (const l of lines) {
    if (/^## /.test(l)) { inTasks = /^## Tasks\b/.test(l); inRelease = /^## Release\b/.test(l); continue }
    if (inRelease && /^\s*- \[ \]/.test(l)) release++
    if (!inTasks) continue
    if (/^\s*- \[x\]/i.test(l)) { done++; total++; if (l.includes('/keystone:security')) secDone = true }
    else if (/^\s*- \[ \]/.test(l)) { total++; if (l.includes('BLOCKED:')) blocked++ }
  }
  // a verified plan stays in view only while its ## Release steps are open (release mode)
  if (!ACTIVE.has(status) && !(status === 'verified' && release > 0)) return null
  return {
    file: slash(file),
    level: header.match(/\bLevel:\s*([SML])\b/)?.[1] ?? '?',
    mode: header.match(/\bMode:\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? 'feature',
    status,
    done, total, blocked, release,
    security: lines.some((l) => /^\s*Threats:/.test(l)) && !secDone,
    doneMeans: lines.find((l) => /^Done means:/.test(l))?.replace(/^Done means:\s*/, ''),
  }
}

export function gatesFor(p: Plan): string[] {
  if (p.status === 'verified') return [`release mode: ${p.release} step(s) in ## Release, each merge / push / deploy after your yes`]
  const g = ['push/PR closed until /keystone:verify']
  if (p.status === 'draft') g.unshift('code edits closed until Approve')
  if (p.mode === 'fix' && p.status === 'implementing') g.push('committed tests locked (fix)')
  if (p.status === 'implementing' && p.total - p.done - p.blocked > 0) g.push('Stop reminds about open tasks')
  return g
}

// The command the plan's state asks for next, with the plan path filled in (Tab takes it from the prompt box).
export function nextCommand(p: Plan): string | null {
  if (p.status === 'verified') return `/keystone:implement ${p.file}`
  if (p.status === 'draft') return `/keystone:plan ${p.file}`
  if (p.status === 'approved') return `/keystone:implement ${p.file}`
  if (p.status === 'implementing') return `/keystone:${p.total - p.done - p.blocked > 0 ? 'implement' : 'verify'} ${p.file}`
  return null
}

// The buttons above the prompt: the plan's next command, /keystone-status, and a third one only where Keystone itself
// asks for an extra step (check before Approve on L with an intent, review before push on L). No model call.
export function nextButtons(p: Plan | null, hasIntent: boolean): string[] {
  const first = p && nextCommand(p)
  if (!p || !first) return []
  const dir = p.file.replace(/\/[^/]*$/, '')
  // L with threats: the security gate line comes before verify (skills/verify/SKILL.md, Security gate)
  const b = p.level === 'L' && p.security && first.startsWith('/keystone:verify') ? [`/keystone:security ${p.file}`, first] : [first]
  if (p.status === 'draft' && p.level === 'L' && hasIntent) b.push(`/keystone:check ${dir}/intent.md ${p.file}`)
  if (p.status === 'implementing' && p.level === 'L' && first.startsWith('/keystone:verify')) b.push('/keystone:review')
  b.push('/keystone-status')
  return b
}

// show=false clears the band; errors leave it empty rather than break the turn.
export async function publishButtons($: EngineInterface, show: boolean) {
  try {
    let list: string[] = []
    if (show) {
      const p = await sessionPlan($)
      const intent = p ? `${p.file.replace(/\/[^/]*$/, '')}/intent.md` : ''
      list = nextButtons(p, !!p && p.status === 'draft' && p.level === 'L' && (await $.fs.exists(intent)))
    }
    await $.state.set({ plugin: 'keystone', key: 'buttons' }, list)
  } catch {
    // the band is optional
  }
}

const usd =(n: number) => `$${n.toFixed(2)}`
export const costLine = (l: Ledger) => {
  const parts = Object.entries(l).filter(([, v]) => v > 0.005).map(([k, v]) => `${k} ${usd(v)}`)
  const total = Object.values(l).reduce((a, b) => a + b, 0)
  return parts.length ? `${parts.join(' · ')} · total ${usd(total)}` : 'not measured yet'
}

export function statusText(p: Plan | null, l: Ledger): string {
  if (!p) return 'No active Keystone plan — no gates.\nNext: /keystone:start <task> (not sure which command? see docs/scenarios.md)'
  return [
    `Keystone plan: ${p.file}`,
    `Level ${p.level} · Mode ${p.mode} · Status ${p.status} · tasks ${p.done}/${p.total}${p.blocked ? ` · BLOCKED ${p.blocked}` : ''}`,
    `Done means: ${p.doneMeans ?? '— (missing in the header)'}`,
    `Gates: ${gatesFor(p).join('; ')}. Lift: Status: abandoned or KEYSTONE_GATES=off.`,
    `Cost by stage (this machine): ${costLine(l)}`,
    `Next: ${nextCommand(p) ?? 'nothing in this plan — /keystone:start <task> for the next one'}`,
  ].join('\n')
}

const ledgerKey = (p: Plan) => `cost:${p.file}`

async function refresh($: EngineInterface) {
  const p = await sessionPlan($)
  await $.state.set({ plugin: 'keystone', key: 'plan' }, p?.file ?? '').catch(() => undefined) // next.tsx offers a handoff only with a plan
  const progress = p && { level: p.level, status: p.status, done: p.done, total: p.total, blocked: p.blocked }
  await $.state.set({ plugin: 'keystone', key: 'progress' }, progress).catch(() => undefined) // the plan bar in next.tsx
  if (!p) return $.ui.status(undefined)
  const l = ((await $.store.get(ledgerKey(p))) ?? {}) as Ledger
  const total = Object.values(l).reduce((a, b) => a + b, 0)
  $.ui.status(`Keystone · ${p.level} · ${p.status} · ${p.done}/${p.total}${p.blocked ? ` · ${p.blocked} blocked` : ''}${total ? ` · ${usd(total)}` : ''}`)
}

// The agent was asked (next.tsx) to bring plan.md up to date. /clear runs only on its marker and only if the plan file
// really changed; otherwise the handoff is called off and the context stays.
async function checkHandoff($: EngineInterface, answer: string) {
  try {
    const { value: h } = await $.state.get({ plugin: 'keystone', key: 'handoff' })
    if (!h?.pending) return
    const { file, mtime } = h.pending
    await $.state.set({ plugin: 'keystone', key: 'handoff' }, { ...h, pending: null })
    const changed = (await $.fs.stat(file)).mtimeMs > mtime
    if (!answer.includes(MARKER) || !changed) return $.ui.toast('Keystone: передача не завершена — план не обновлён, контекст остался')
    const p = await sessionPlan($)
    const cmd = (p && nextCommand(p)) ?? `/keystone:verify ${file}`
    await $.store.set('handoff:next', cmd)
    $.clock.after(0, () =>
      void $.command.run({ command: 'clear' }).catch(() => $.ui.toast(`Keystone: не удалось очистить сессию — выполните /clear и вставьте ${cmd}`)),
    )
  } catch {
    // a failed check leaves the session as it is
  }
}

export const register: Register = (on, options) => {
  registerNext(on, options)
  registerLinks(on, options)
  let stage = 'other'
  let lastUsd: number | undefined
  let early: Ledger = {}
  let lastPlan: Plan | null = null // verify ends a plan (Status: verified); its own turn is still billed to it
  let suggestion: string | null = null // next Keystone command, offered as the dim suggestion after a Keystone turn

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'keystone-status', description: 'Keystone: active plan, gates and cost by stage (no model call)' })
    await $.command.register({ name: 'keystone-handoff', description: 'Keystone: update the plan, clear the session, put the next command in the box' })
    lastUsd = (await $.session.usage()).cost?.usd
    await refresh($)
    await publishButtons($, true) // back to an unfinished task: its next step is one click away
    // links resolve from the folder the session started in; a hot reload fires session.start again with a moved cwd
    const base = await $.state.get({ plugin: 'keystone', key: 'base' }).catch(() => ({ value: undefined }))
    if (!base.value) await $.state.set({ plugin: 'keystone', key: 'base' }, normalize(e.cwd)).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    await publishButtons($, false)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'keystone-status' }, async ($) => {
    const p = await sessionPlan($)
    const other = p ? null : await activePlan($)
    if (other)
      return { text: `Keystone plan ${other.file} (${other.status}) is not this session's: no gates, status or cost here.\nNext: ${nextCommand(other) ?? '/keystone:start <task>'} to work on it in this session` }
    const l = p ? (((await $.store.get(ledgerKey(p))) ?? {}) as Ledger) : {}
    return { text: statusText(p, l) }
  })

  // remember the stage the user asked for; hand implement/verify the measured cost so their report line is real
  on('prompt.submit', async ($, e, next) => {
    await publishButtons($, false)
    const m = e.text.match(STAGE)
    stage = m ? m[1] : 'other' // a plain prompt is not a Keystone stage: no buttons after it, its cost is `other`
    if (m) await bindCommand($, m[1], e.text.slice(m[0].length)).then(() => refresh($)).catch(() => undefined)
    if (m && (m[1] === 'implement' || m[1] === 'verify')) {
      const p = await sessionPlan($)
      if (p) {
        const l = ((await $.store.get(ledgerKey(p))) ?? {}) as Ledger
        return next({ ...e, context: [...(e.context ?? []), `Keystone cost meter (measured by the keystone mod, use it in the cost line): ${costLine(l)}`] })
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // an edit inside a task folder binds the session to that plan (the plan stage writes plan.md this way)
  on('tool.call', async ($, e, next) => {
    const { file_path, notebook_path } = e as { file_path?: unknown; notebook_path?: unknown }
    const path = file_path ?? notebook_path
    if (EDITS.has(e.tool) && typeof path === 'string') await bindEdit($, path).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e)) // an observer: a failure never blocks the tool

  // attribute the cost of every main-loop turn to the current stage of this session's plan; Keystone stages run before
  // the session has a plan (start, intent, plan before plan.md exists) wait in `early` and land with the first plan
  // ponytail: `early` is a module variable — a hot reload drops it
  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId) return out
    await checkHandoff($, e.answer)
    await publishButtons($, stage !== 'other')
    const now = (await $.session.usage()).cost?.usd
    if (now === undefined) return out
    const delta = lastUsd === undefined ? 0 : Math.max(0, now - lastUsd)
    lastUsd = now
    const p = (await sessionPlan($)) ?? lastPlan
    if (p) lastPlan = p
    if (!p && stage !== 'other' && delta > 0) early[stage] = (early[stage] ?? 0) + delta
    if (p && (delta > 0 || Object.keys(early).length)) {
      const l = ((await $.store.get(ledgerKey(p))) ?? {}) as Ledger
      for (const [k, v] of Object.entries(early)) l[k] = (l[k] ?? 0) + v
      early = {}
      l[stage] = (l[stage] ?? 0) + delta
      await $.store.set(ledgerKey(p), l)
    }
    await refresh($)
    const active = await sessionPlan($)
    suggestion = stage !== 'other' && active ? nextCommand(active) : null
    if (suggestion) void $.prompt.suggest({ text: suggestion })
    return out
  }).catch(($, e, next) => next(e))

  // the engine's own guess after a Keystone turn gives way to the plan's next command
  on('prompt.suggest', { origin: { kind: 'suggestion' } }, async ($, e, nxt) => nxt(suggestion ? { ...e, text: suggestion } : e))
    .catch(($, e, nxt) => nxt(e))
}

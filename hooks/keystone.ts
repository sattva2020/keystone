// Keystone mod: /keystone-status (no model turn), a status line, and the real cost of each stage.
// Works next to the settings hooks in hooks.json (gate.mjs); this module only observes and reports.
import type { EngineInterface, Register } from 'claude-code'
import { register as registerNext } from './next.tsx'
import { register as registerLinks, normalize } from './links.ts'
import { MARKER } from './handoff.ts'

const ACTIVE = new Set(['draft', 'approved', 'implementing'])
const STAGE = /^\s*\/keystone:([a-z]+)/

export type Plan = {
  file: string
  level: string
  mode: string
  status: string
  done: number
  total: number
  blocked: number
  release: number // open `- [ ] R<n>.` steps in ## Release (run after verify)
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

// Same rule as gate.mjs: plan.md of the newest task folder (date prefix, then plan.md mtime) with an active status.
export async function activePlan($: EngineInterface): Promise<Plan | null> {
  const dirs: { name: string; path: string; mtime: number }[] = []
  for (const r of await planRoots($)) {
    if (!(await $.fs.exists(r))) continue
    for (const d of await $.fs.list(r)) {
      if (d.kind !== 'dir') continue
      const path = `${r}/${d.name}`
      const plan = `${path}/plan.md`
      const mtime = (await $.fs.exists(plan)) ? (await $.fs.stat(plan)).mtimeMs : 0
      dirs.push({ name: d.name, path, mtime })
    }
  }
  if (!dirs.length) return null
  dirs.sort((a, b) => (a.name.slice(0, 10) === b.name.slice(0, 10) ? a.mtime - b.mtime : a.name.slice(0, 10).localeCompare(b.name.slice(0, 10))))
  const file = `${dirs[dirs.length - 1].path}/plan.md`
  if (!(await $.fs.exists(file))) return null
  return parsePlan(file, await $.fs.read(file))
}

export function parsePlan(file: string, raw: string): Plan | null {
  const lines = raw.replace(/\r/g, '').split('\n')
  const header = lines.find((l) => /^Level:/.test(l)) ?? lines.find((l) => /^Status:/.test(l)) ?? ''
  const status = header.match(/\bStatus:\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? ''
  let inTasks = false, inRelease = false, done = 0, total = 0, blocked = 0, release = 0
  for (const l of lines) {
    if (/^## /.test(l)) { inTasks = /^## Tasks\b/.test(l); inRelease = /^## Release\b/.test(l); continue }
    if (inRelease && /^\s*- \[ \]/.test(l)) release++
    if (!inTasks) continue
    if (/^\s*- \[x\]/i.test(l)) { done++; total++ }
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
  const b = [first]
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
      const p = await activePlan($)
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
  const p = await activePlan($)
  await $.state.set({ plugin: 'keystone', key: 'plan' }, p?.file ?? '').catch(() => undefined) // next.tsx offers a handoff only with a plan
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
    const p = await activePlan($)
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
  let lastPlan: Plan | null = null // verify ends a plan (Status: verified); its own turn is still billed to it
  let next: string | null = null // next Keystone command, offered as the dim suggestion after a Keystone turn

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
    const p = await activePlan($)
    const l = p ? (((await $.store.get(ledgerKey(p))) ?? {}) as Ledger) : {}
    return { text: statusText(p, l) }
  })

  // remember the stage the user asked for; hand implement/verify the measured cost so their report line is real
  on('prompt.submit', async ($, e, next) => {
    await publishButtons($, false)
    const m = e.text.match(STAGE)
    if (m) stage = m[1]
    if (m && (m[1] === 'implement' || m[1] === 'verify')) {
      const p = await activePlan($)
      if (p) {
        const l = ((await $.store.get(ledgerKey(p))) ?? {}) as Ledger
        return next({ ...e, context: [...(e.context ?? []), `Keystone cost meter (measured by the keystone mod, use it in the cost line): ${costLine(l)}`] })
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // attribute the cost of every main-loop turn to the current stage of the active plan
  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId) return out
    await checkHandoff($, e.answer)
    await publishButtons($, stage !== 'other')
    const now = (await $.session.usage()).cost?.usd
    if (now === undefined) return out
    const delta = lastUsd === undefined ? 0 : Math.max(0, now - lastUsd)
    lastUsd = now
    const p = (await activePlan($)) ?? lastPlan
    if (p) lastPlan = p
    if (p && delta > 0) {
      const l = ((await $.store.get(ledgerKey(p))) ?? {}) as Ledger
      l[stage] = (l[stage] ?? 0) + delta
      await $.store.set(ledgerKey(p), l)
    }
    await refresh($)
    const active = await activePlan($)
    next = stage !== 'other' && active ? nextCommand(active) : null
    if (next) void $.prompt.suggest({ text: next })
    return out
  }).catch(($, e, next) => next(e))

  // the engine's own guess after a Keystone turn gives way to the plan's next command
  on('prompt.suggest', { origin: { kind: 'suggestion' } }, async ($, e, nxt) => nxt(next ? { ...e, text: next } : e))
    .catch(($, e, nxt) => nxt(e))
}

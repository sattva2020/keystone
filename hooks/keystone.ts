// Keystone mod: /keystone-status (no model turn), a status line, and the real cost of each stage.
// Works next to the settings hooks in hooks.json (gate.mjs); this module only observes and reports.
import type { EngineInterface, Register } from 'claude-code'

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
  if (!ACTIVE.has(status)) return null
  let inTasks = false, done = 0, total = 0, blocked = 0
  for (const l of lines) {
    if (/^## /.test(l)) { inTasks = /^## Tasks\b/.test(l); continue }
    if (!inTasks) continue
    if (/^\s*- \[x\]/i.test(l)) { done++; total++ }
    else if (/^\s*- \[ \]/.test(l)) { total++; if (l.includes('BLOCKED:')) blocked++ }
  }
  return {
    file: slash(file),
    level: header.match(/\bLevel:\s*([SML])\b/)?.[1] ?? '?',
    mode: header.match(/\bMode:\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? 'feature',
    status,
    done, total, blocked,
    doneMeans: lines.find((l) => /^Done means:/.test(l))?.replace(/^Done means:\s*/, ''),
  }
}

export function gatesFor(p: Plan): string[] {
  const g = ['push/PR closed until /keystone:verify']
  if (p.status === 'draft') g.unshift('code edits closed until Approve')
  if (p.mode === 'fix' && p.status === 'implementing') g.push('committed tests locked (fix)')
  if (p.status === 'implementing' && p.total - p.done - p.blocked > 0) g.push('Stop reminds about open tasks')
  return g
}

// The command the plan's state asks for next, with the plan path filled in (Tab takes it from the prompt box).
export function nextCommand(p: Plan): string | null {
  if (p.status === 'draft') return `/keystone:plan ${p.file}`
  if (p.status === 'approved') return `/keystone:implement ${p.file}`
  if (p.status === 'implementing') return `/keystone:${p.total - p.done - p.blocked > 0 ? 'implement' : 'verify'} ${p.file}`
  return null
}

const usd = (n: number) => `$${n.toFixed(2)}`
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
  if (!p) return $.ui.status(undefined)
  const l = ((await $.store.get(ledgerKey(p))) ?? {}) as Ledger
  const total = Object.values(l).reduce((a, b) => a + b, 0)
  $.ui.status(`Keystone · ${p.level} · ${p.status} · ${p.done}/${p.total}${p.blocked ? ` · ${p.blocked} blocked` : ''}${total ? ` · ${usd(total)}` : ''}`)
}

export const register: Register = (on) => {
  let stage = 'other'
  let lastUsd: number | undefined
  let lastPlan: Plan | null = null // verify ends a plan (Status: verified); its own turn is still billed to it
  let next: string | null = null // next Keystone command, offered as the dim suggestion after a Keystone turn

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'keystone-status', description: 'Keystone: active plan, gates and cost by stage (no model call)' })
    lastUsd = (await $.session.usage()).cost?.usd
    await refresh($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'keystone-status' }, async ($) => {
    const p = await activePlan($)
    const l = p ? (((await $.store.get(ledgerKey(p))) ?? {}) as Ledger) : {}
    return { text: statusText(p, l) }
  })

  // remember the stage the user asked for; hand implement/verify the measured cost so their report line is real
  on('prompt.submit', async ($, e, next) => {
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

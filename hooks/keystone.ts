// Keystone mod: /keystone-status (no model turn), a status line, and the real cost of each stage.
// Works next to the settings hooks in hooks.json (gate.mjs); this module only observes and reports.
import type { EngineInterface, Register } from 'claude-code'
import { register as registerNext, langOf } from './next.tsx'
import { pickLang, strings } from './i18n.ts'
import { register as registerLinks, normalize } from './links.ts'
import { onStart as panelStart, onTurn as panelTurn, register as registerPanel } from './panel.tsx'
import { activePlan, answerNext, type AnswerNext, fallbackNext, folder, nextOf, parsePlan, planRoots, plans, sessionPlan, slash, statusNext, verdictOf, type Ledger, type Plan } from './plan.ts'
import { COLD_MS, MARKER, isCold } from './handoff.ts'

export { activePlan, parsePlan, sessionPlan, type Ledger, type Plan }

const STAGE = /^\s*\/keystone:([a-z]+)/
const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const NO_ARG = new Set(['implement', 'verify'])

const BOUND = { plugin: 'keystone', key: 'bound' } as const // the engine wants the reference in the file that uses it

// $.state does not outlive the app's restart; the store does, so the binding is kept there too, by session id.
// ponytail: one store key per session id, never pruned (as turn:last)
const boundKey = async ($: EngineInterface) => `bound:${await $.session.id()}`

async function bind($: EngineInterface, names: string[]) {
  const { value: bound = [] } = await $.state.get(BOUND)
  const add = names.filter((n) => !bound.includes(n))
  if (!add.length) return
  await $.state.set(BOUND, [...bound, ...add])
  await $.store.set(await boundKey($), [...bound, ...add]).catch(() => undefined)
}

// a resumed session whose state is gone gets its binding back from the store
async function restoreBound($: EngineInterface) {
  const { value: bound = [] } = await $.state.get(BOUND)
  if (bound.length) return
  const kept = await $.store.get(await boundKey($))
  if (Array.isArray(kept) && kept.length) await $.state.set(BOUND, kept as string[])
}

// The answer's Next: (plan.ts answerNext) lives until the next real answer; the store keeps it over an app restart.
// ponytail: one store key per session id, never pruned (as bound:)
const ANSWER = { plugin: 'keystone', key: 'answerNext' } as const
const answerKey = async ($: EngineInterface) => `next:${await $.session.id()}`

// only a finished answer counts: an aborted turn, an error, an empty answer or the handoff's marker keep the last one
async function recordAnswer($: EngineInterface, e: { reason?: unknown; answer?: unknown }): Promise<AnswerNext | undefined> {
  if (e.reason !== 'answer' || typeof e.answer !== 'string' || !e.answer.trim() || e.answer.includes(MARKER)) return undefined
  const a = answerNext(e.answer)
  try {
    await $.state.set(ANSWER, a)
  } catch {
    return a // no state: this turn's suggestion still follows the answer
  }
  await $.store.set(await answerKey($), a).catch(() => undefined)
  return a
}

async function restoreAnswer($: EngineInterface) {
  if ((await $.state.get(ANSWER)).value !== undefined) return
  const kept = (await $.store.get(await answerKey($))) as AnswerNext | undefined
  if (kept !== undefined) await $.state.set(ANSWER, kept)
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

export function gatesFor(p: Plan): string[] {
  if (p.status === 'verified') return [`release mode: ${p.release} step(s) in ## Release, each merge / push / deploy after your yes`]
  const g = ['push/PR closed until /keystone:verify']
  if (p.status === 'draft') g.unshift('code edits closed until Approve')
  if (p.mode === 'fix' && p.status === 'implementing') g.push('committed tests locked (fix)')
  if (p.status === 'implementing') g.push(p.total - p.done - p.blocked > 0 ? 'Stop reminds about open tasks' : 'Stop reminds to run /keystone:verify')
  return g
}

// The command the plan's status alone asks for (plan.ts statusNext); the answer and verify.md come in through nextOf.
export function nextCommand(p: Plan) { return statusNext(p) }

// The buttons above the prompt: the plan's next command, /keystone-status, and a third one only where Keystone itself
// asks for an extra step (check before Approve on L with an intent, review before push on L). No model call.
// `main` (nextOf: the answer's Next:, else verify.md, else the status) goes first when it differs from the status's own;
// null = no main button (the answer named no command), the extra steps and the status stay.
export function nextButtons(p: Plan | null, hasIntent: boolean, main?: string | null): string[] {
  const first = p && statusNext(p)
  if (!p || (!first && !main)) return []
  const dir = p.file.replace(/\/[^/]*$/, '')
  const b: string[] = []
  if (first) {
    // L with threats: the security gate line comes before verify (skills/verify/SKILL.md, Security gate)
    b.push(...(p.level === 'L' && p.security && first.startsWith('/keystone:verify') ? [`/keystone:security ${p.file}`, first] : [first]))
    if (p.status === 'draft' && p.level === 'L' && hasIntent) b.push(`/keystone:check ${dir}/intent.md ${p.file}`)
    if (p.status === 'implementing' && p.level === 'L' && first.startsWith('/keystone:verify')) b.push('/keystone:review')
  }
  const list = main === undefined || main === first ? b : [...(main ? [main] : []), ...b.filter((c) => c !== first && c !== main)]
  return [...list, '/keystone-status']
}

const usd = (n: number) => `$${n.toFixed(2)}`
export const costLine = (l: Ledger) => {
  const parts = Object.entries(l).filter(([, v]) => v > 0.005).map(([k, v]) => `${k} ${usd(v)}`)
  const total = Object.values(l).reduce((a, b) => a + b, 0)
  return parts.length ? `${parts.join(' · ')} · total ${usd(total)}` : 'not measured yet'
}

// show=false clears the band; errors leave it empty rather than break the turn.
export async function publishButtons($: EngineInterface, show: boolean) {
  try {
    let list: string[] = []
    if (show) {
      const p = await sessionPlan($)
      const intent = p ? `${p.file.replace(/\/[^/]*$/, '')}/intent.md` : ''
      list = nextButtons(p, !!p && p.status === 'draft' && p.level === 'L' && (await $.fs.exists(intent)), p ? await nextOf($, p) : undefined)
    }
    await $.state.set({ plugin: 'keystone', key: 'buttons' }, list)
    if (!show) await $.state.set({ plugin: 'keystone', key: 'unbound' }, '') // the start-of-session hint leaves with the first prompt
  } catch {
    // the band is optional
  }
}

export function statusText(p: Plan | null, l: Ledger, next: string | null = null): string {
  if (!p) return 'No active Keystone plan — no gates.\nNext: /keystone:start <task> (not sure which command? see docs/scenarios.md)'
  return [
    `Keystone plan: ${p.file}`,
    `Level ${p.level} · Mode ${p.mode} · Status ${p.status} · tasks ${p.done}/${p.total}${p.blocked ? ` · BLOCKED ${p.blocked}` : ''}`,
    `Done means: ${p.doneMeans ?? '— (missing in the header)'}`,
    `Gates: ${gatesFor(p).join('; ')}. Lift: Status: abandoned or KEYSTONE_GATES=off.`,
    `Cost by stage (this machine): ${costLine(l)}`,
    `Next: ${next ?? noCommandText(p)}`,
  ].join('\n')
}

// No next command: a live plan waits (the answer named none, or only BLOCKED tasks are left) — say so, never guess one
export function noCommandText(p: Plan): string {
  return ['draft', 'approved', 'implementing', 'verified'].includes(p.status)
    ? 'none now — the last answer named no command, or only BLOCKED tasks are left'
    : 'nothing in this plan — /keystone:start <task> for the next one'
}

export const ledgerKey = (p: Plan) => `cost:${p.file}`

async function refresh($: EngineInterface) {
  const p = await sessionPlan($)
  await $.state.set({ plugin: 'keystone', key: 'plan' }, p?.file ?? '').catch(() => undefined) // next.tsx offers a handoff only with a plan
  const l = p ? (((await $.store.get(ledgerKey(p)).catch(() => undefined)) ?? {}) as Ledger) : {} // the bar does not depend on the ledger
  const total = Object.values(l).reduce((a, b) => a + b, 0)
  const progress = p && { level: p.level, status: p.status, done: p.done, total: p.total, blocked: p.blocked, next: await nextOf($, p), cost: total }
  await $.state.set({ plugin: 'keystone', key: 'progress' }, progress).catch(() => undefined) // the plan bar in next.tsx
  if (!p) return $.ui.status(undefined)
  $.ui.status(`Keystone · ${p.level} · ${p.status} · ${p.done}/${p.total}${p.blocked ? ` · ${p.blocked} blocked` : ''}${total ? ` · ${usd(total)}` : ''}`)
}

// The agent was asked (next.tsx) to bring plan.md up to date. /clear runs only on its marker and only if the plan file
// really changed; otherwise the handoff is called off and the context stays.
async function checkHandoff($: EngineInterface, answer: string) {
  try {
    const { value: h } = await $.state.get({ plugin: 'keystone', key: 'handoff' })
    if (!h?.pending) return
    const t = strings(await langOf($))
    const { file, mtime } = h.pending
    await $.state.set({ plugin: 'keystone', key: 'handoff' }, { ...h, pending: null })
    const changed = (await $.fs.stat(file)).mtimeMs > mtime
    if (!answer.includes(MARKER) || !changed) return $.ui.toast(t.handoffNotDone)
    const p = await sessionPlan($)
    // an answer that named no command leaves the box empty after /clear, never a guess
    const cmd = p ? await nextOf($, p) : `/keystone:verify ${file}`
    if (cmd) await $.store.set('handoff:next', cmd)
    else await $.store.delete('handoff:next').catch(() => undefined)
    $.clock.after(0, () =>
      void $.command.run({ command: 'clear' }).catch(() => $.ui.toast(t.clearFailed(cmd ?? '—'))),
    )
  } catch {
    // a failed check leaves the session as it is
  }
}

// Pause → cold cache: the band (next.tsx) offers a clean start once the last main-loop turn is COLD_MS old.
// ponytail: one store key per session id, never pruned; prune by age if the store grows noticeably
const lastKey = async ($: EngineInterface) => `turn:last:${await $.session.id()}`
let coldTimer: { cancel: () => void } | undefined

async function setCold($: EngineInterface, cold: number | null) {
  const { value: h = { level: 0, tokens: 0, window: 0, shown: 0, pending: null, cold: null } } = await $.state.get({ plugin: 'keystone', key: 'handoff' })
  if (h.cold !== cold) await $.state.set({ plugin: 'keystone', key: 'handoff' }, { ...h, cold })
}

function stopTimer() {
  try {
    coldTimer?.cancel()
  } catch {
    // a timer of an engine that is gone (a reload, another test) is gone with it
  }
  coldTimer = undefined
}

// the session is active again: no band, and no timer from before that could still come due mid-turn
async function warm($: EngineInterface) {
  stopTimer()
  await setCold($, null)
}

// marks the cache cold now, or arms a timer for when it will be; a reload drops timers, so session.start calls it too
async function watchCold($: EngineInterface, last: number) {
  const now = await $.clock.now()
  stopTimer()
  // not due yet: wait; due: decide once (a small context stays as it is, with no timer left behind)
  if (last + COLD_MS > now) coldTimer = $.clock.after(last + COLD_MS - now, () => void watchCold($, last).catch(() => undefined))
  else if (isCold(last, now, (await $.session.usage()).context.tokens ?? 0)) await setCold($, last)
}

export const register: Register = (on, options) => {
  registerNext(on, options)
  registerLinks(on, options)
  registerPanel(on, options, { nextButtons, costLine, ledgerKey })
  let stage = 'other'
  let costStage = 'other' // like `stage`, but an answer to a menu or a question keeps paying into the stage it serves
  let lastUsd: number | undefined
  let early: Ledger = {}
  let lastPlan: Plan | null = null // verify ends a plan (Status: verified); its own turn is still billed to it
  let suggestion: string | null = null // next Keystone command, offered as the dim suggestion after a Keystone turn

  on('session.start', async ($, e, next) => {
    // the band's language: the plugin option, else Claude Code's `language` setting, else English
    let setting: unknown
    try {
      setting = (await $.settings.read()).language // the merged settings, as `{ key }` reads them
    } catch {
      // no settings noun (the test kit): the option or English
    }
    await $.state.set({ plugin: 'keystone', key: 'lang' }, pickLang(options.language, setting)).catch(() => undefined)
    await $.command.register({ name: 'keystone-status', description: 'Keystone: active plan, gates and cost by stage (no model call)' })
    await $.command.register({ name: 'keystone-handoff', description: 'Keystone: update the plan, clear the session, put the next command in the box' })
    lastUsd = (await $.session.usage()).cost?.usd
    await restoreBound($).catch(() => undefined)
    await restoreAnswer($).catch(() => undefined)
    await refresh($)
    await publishButtons($, true) // back to an unfinished task: its next step is one click away
    // no plan of its own, but the repo has one in view: say so once, with its next command (silence looks like a broken mod)
    const other = (await sessionPlan($)) ? null : await activePlan($)
    await $.state.set({ plugin: 'keystone', key: 'unbound' }, (other && fallbackNext(other, await verdictOf($, other))) ?? '').catch(() => undefined)
    // links resolve from the folder the session started in; a hot reload fires session.start again with a moved cwd
    const base = await $.state.get({ plugin: 'keystone', key: 'base' }).catch(() => ({ value: undefined }))
    if (!base.value) await $.state.set({ plugin: 'keystone', key: 'base' }, normalize(e.cwd)).catch(() => undefined)
    try {
      const last = (await $.store.get(await lastKey($))) as number | undefined
      if (last !== undefined) await watchCold($, last)
    } catch {
      // the cold-cache offer is optional
    }
    const out = await next(e)
    try {
      $.clock.after(0, () => void panelStart($))
    } catch {
      // no timer: no panel this time
    }
    return out
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    await publishButtons($, false)
    await warm($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'keystone-status' }, async ($) => {
    const p = await sessionPlan($)
    const other = p ? null : await activePlan($)
    if (other) {
      const cmd = fallbackNext(other, await verdictOf($, other))
      return { text: `Keystone plan ${other.file} (${other.status}) is not this session's: no gates, status or cost here.\nNext: ${cmd ? `${cmd} to work on it in this session` : noCommandText(other)}` }
    }
    const l = p ? (((await $.store.get(ledgerKey(p))) ?? {}) as Ledger) : {}
    return { text: statusText(p, l, await nextOf($, p)) }
  })

  // remember the stage the user asked for; hand implement/verify the measured cost so their report line is real
  on('prompt.submit', async ($, e, next) => {
    await publishButtons($, false)
    await warm($).catch(() => undefined) // whatever is sent, the cache warms up again
    const m = e.text.match(STAGE)
    stage = m ? m[1] : 'other' // a plain prompt is not a Keystone stage: no suggestion in the box after it, its cost is `other`
    if (m) await bindCommand($, m[1], e.text.slice(m[0].length)).then(() => refresh($)).catch(() => undefined)
    costStage = m ? m[1] : (await sessionPlan($).catch(() => null)) ? costStage : 'other'
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
    try {
      const said = await recordAnswer($, e) // before the handoff: /clear carries this answer's command
      await checkHandoff($, e.answer)
      try {
        const at = await $.clock.now()
        await $.store.set(await lastKey($), at)
        await setCold($, null) // a fresh answer: whatever a timer wrote while it ran is stale
        await watchCold($, at)
      } catch {
        // the cold-cache offer is optional
      }
      await publishButtons($, true) // the band stays while the session has a plan, also after a plain prompt or an answer
      const now = (await $.session.usage()).cost?.usd
      if (now === undefined) return out
      const delta = lastUsd === undefined ? 0 : Math.max(0, now - lastUsd)
      lastUsd = now
      const p = (await sessionPlan($)) ?? lastPlan
      if (p) lastPlan = p
      if (!p && costStage !== 'other' && delta > 0) early[costStage] = (early[costStage] ?? 0) + delta
      if (p && (delta > 0 || Object.keys(early).length)) {
        const l = ((await $.store.get(ledgerKey(p))) ?? {}) as Ledger
        for (const [k, v] of Object.entries(early)) l[k] = (l[k] ?? 0) + v
        early = {}
        l[costStage] = (l[costStage] ?? 0) + delta
        await $.store.set(ledgerKey(p), l)
      }
      await refresh($)
      const active = await sessionPlan($)
      // the answer's Next: after any turn; without one, the plan's next step only after a Keystone turn
      suggestion = said ? said.cmd : stage !== 'other' && active ? await nextOf($, active) : null
      if (suggestion) void $.prompt.suggest({ text: suggestion })
      return out
    } finally {
      try {
        $.clock.after(0, () => void panelTurn($))
      } catch {
        // no timer: no panel this time
      }
    }
  }).catch(($, e, next) => next(e))

  // the engine's own guess after a Keystone turn gives way to the plan's next command
  on('prompt.suggest', { origin: { kind: 'suggestion' } }, async ($, e, nxt) => nxt(suggestion ? { ...e, text: suggestion } : e))
    .catch(($, e, nxt) => nxt(e))
}

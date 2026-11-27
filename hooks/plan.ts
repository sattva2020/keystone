// The session's plan: reading plan.md files and the plan this session is bound to.
// Shared by keystone.ts (status, buttons, handoff, cost) and panel.tsx (the side panel).
import type { EngineInterface } from 'claude-code'

const ACTIVE = new Set(['draft', 'approved', 'implementing'])

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

export const slash = (p: string) => p.replace(/\\/g, '/')

// Keystone keeps its task folders only in docs/keystone; it never reads another planner's folders.
export async function planRoots(_$: EngineInterface): Promise<string[]> {
  return ['docs/keystone']
}

// Same rule as gate.mjs: task folders whose plan.md is in view (parsePlan), newest first — date prefix of the folder
// name, then plan.md mtime. A folder without plan.md (intent only) never hides another plan.
export async function plans($: EngineInterface): Promise<Plan[]> {
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
export const folder = (file: string) => file.replace(/\/[^/]*$/, '').replace(/^.*\//, '')
const BOUND = { plugin: 'keystone', key: 'bound' } as const

// The plan this session works with: the newest plan in view it is bound to; none → no status, buttons, handoff or cost.
export async function sessionPlan($: EngineInterface): Promise<Plan | null> {
  const { value: bound = [] } = await $.state.get(BOUND)
  if (!bound.length) return null
  return (await plans($)).find((p) => bound.includes(folder(p.file))) ?? null
}

// ---- the next step: the answer's `Next:` line first, else verify.md's verdict, else the plan's status

// The command the plan's state asks for next, with the plan path filled in (Tab takes it from the prompt box).
export function statusNext(p: Plan): string | null {
  if (p.status === 'verified') return `/keystone:implement ${p.file}`
  if (p.status === 'draft') return `/keystone:plan ${p.file}`
  if (p.status === 'approved') return `/keystone:implement ${p.file}`
  if (p.status === 'implementing') return `/keystone:${p.total - p.done - p.blocked > 0 ? 'implement' : 'verify'} ${p.file}`
  return null
}

export type AnswerNext = { cmd: string | null } | null
const FENCE = /^\s*```/

// The answer's last `Next:` line (outside code blocks): null = no such line; cmd null = no slash command in it.
export function answerNext(answer: string): AnswerNext {
  const lines = answer.replace(/\r/g, '').split('\n')
  let at = -1
  let inCode = false
  lines.forEach((l, i) => {
    if (FENCE.test(l)) inCode = !inCode
    else if (!inCode && /^\s*Next:/.test(l)) at = i
  })
  if (at < 0) return null
  const tail = lines[at].replace(/^\s*Next:\s*/, '')
  if (/^nothing now/i.test(tail)) return { cmd: null }
  const open = lines.findIndex((l, i) => i > at && FENCE.test(l))
  if (open >= 0) {
    const first = lines.slice(open + 1).find((l) => l.trim() !== '')
    if (first && !FENCE.test(first) && CMD.test(first.trim().split(/\s+/)[0])) return { cmd: first.trim() }
  }
  return { cmd: inlineCommand(tail) }
}

// a slash command's name: one segment, so a file path (/usr/bin/node, /tmp/x.log) is not a command
const CMD = /^\/[A-Za-z][\w:.-]*$/
const PUNCT = /[,;:.]+$/
// ponytail: a fixed list of words that end a command's arguments in prose; extend it when a skill's Next: line needs
const STOP = new Set(['then', 'after', 'before', 'and', 'or', 'once', 'when', 'if', 'to', 'in', 'so', 'again', 'later', 'first', 'with', 'for', 'on', 'at', 'from', 'by', 'of', 'the', 'a', '—', '–', '-'])
const SESSION_STEP = new Set(['/clear', '/compact']) // "/clear, then /keystone:verify …": the step after it is the next one

// The slash command in the Next: line itself: in backticks up to the closing one; otherwise its name and the argument
// words up to punctuation, a dash, a joining word or another command.
function inlineCommand(tail: string): string | null {
  const words = tail.split(/\s+/).filter(Boolean)
  const found: string[] = []
  words.forEach((w, i) => {
    if (w.startsWith('`')) {
      const inner = tail.slice(tail.indexOf(w) + 1).split('`')[0].trim()
      if (CMD.test(inner.split(/\s+/)[0] ?? '')) found.push(inner)
      return
    }
    const name = w.replace(PUNCT, '')
    if (!CMD.test(name)) return
    const args: string[] = []
    if (name === w) {
      for (const a of words.slice(i + 1)) {
        if (STOP.has(a) || a.startsWith('(') || a.startsWith('/') || a.startsWith('`')) break
        const bare = a.replace(PUNCT, '')
        if (bare) args.push(bare)
        if (bare !== a) break
      }
    }
    found.push([name, ...args].join(' '))
  })
  return found.find((c) => !SESSION_STEP.has(c.split(' ')[0])) ?? found[0] ?? null
}

export type Verdict = { verdict: 'PASS' | 'PASS-UNPROVEN' | 'FAIL'; stale: boolean }

// verify.md next to the plan: the verdict of its header (`Date: … · Verdict: X`, the first one — report bodies quote
// other verdicts, and accept never rewrites it); stale once plan.md changed after it (fix verify commits the plan)
// ponytail: mtime, not commit order — a fresh clone gives equal mtimes and the verdict counts as fresh; git log if that bites
export async function verdictOf($: EngineInterface, p: Plan): Promise<Verdict | null> {
  try {
    const f = p.file.replace(/[^/]*$/, 'verify.md')
    if (!(await $.fs.exists(f))) return null
    const verdict = (await $.fs.read(f)).match(/Verdict:\s*(PASS-UNPROVEN|PASS|FAIL)/)?.[1] as Verdict['verdict'] | undefined
    if (!verdict) return null
    return { verdict, stale: (await $.fs.stat(p.file)).mtimeMs > (await $.fs.stat(f)).mtimeMs }
  } catch {
    return null
  }
}

// No `Next:` in the answer: all tasks ticked → the verdict decides; otherwise the status.
export function fallbackNext(p: Plan, v: Verdict | null): string | null {
  if (p.status === 'implementing' && p.total - p.done - p.blocked === 0) {
    if (v?.verdict === 'FAIL') return v.stale ? `/keystone:verify ${p.file}` : '/keystone:fix verify'
    if (v?.verdict === 'PASS-UNPROVEN') return `/keystone:verify accept ${p.file}`
    if (p.blocked > 0) return null
  }
  return statusNext(p)
}

export function pickNext(p: Plan | null, v: Verdict | null, a: AnswerNext): string | null {
  if (!p) return null
  return a ? a.cmd : fallbackNext(p, v)
}

const ANSWER = { plugin: 'keystone', key: 'answerNext' } as const

// The one next step of this session's plan, for the band, the suggestion, /keystone-status, /clear and the panel.
export async function nextOf($: EngineInterface, p: Plan | null): Promise<string | null> {
  if (!p) return null
  let a: AnswerNext = null
  try {
    a = (await $.state.get(ANSWER)).value ?? null
  } catch {
    // no answer read: the plan decides
  }
  return pickNext(p, await verdictOf($, p), a)
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

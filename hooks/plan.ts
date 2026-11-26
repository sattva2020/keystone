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

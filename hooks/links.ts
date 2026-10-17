// Keystone links: a file path in `backticks` in an agent's answer is drawn as a link relative to the folder the
// session started in (the Desktop file pane opens links from there). Only the drawing changes, never the message.
import type { Register } from 'claude-code'

export const MAX_STATS = 20

export const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
const isAbs = (p: string) => /^([A-Za-z]:\/|\/)/.test(p)
const key = (p: string) => (/^[A-Za-z]:/.test(p) ? p.toLowerCase() : p)
const encode = (p: string) => p.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')

// `path`, `path:12`; a path needs a slash or a file extension; no spaces at the ends, no backticks inside
const CANDIDATE = /^(?![\s])([^`\s][^`]*?[^`\s]|[^`\s])(:\d+)?$/
const looksLikePath = (p: string) => /[\\/]/.test(p) || /\.[A-Za-z0-9]{1,8}$/.test(p)

// base-relative path of an absolute or relative path inside base; null when it lies outside
export function inside(path: string, base: string): string | null {
  const b = normalize(base)
  const p = normalize(path)
  const rel = !isAbs(p) ? p : key(p).startsWith(key(b) + '/') ? p.slice(b.length + 1) : null
  if (rel === null) return null
  // resolve . and ..; a path that climbs above base lies outside it
  const out: string[] = []
  for (const s of rel.split('/')) {
    if (s === '..') { if (!out.length) return null; out.pop() }
    else if (s && s !== '.') out.push(s)
  }
  return out.length ? out.join('/') : null
}

// A link to a file outside the session folder: the Desktop file pane cannot open it ("file not found"), so the
// path is shown as code instead — copyable, never a dead link. The label stays when it says more than the path.
export function outsideAsCode(link: string, target: string): string {
  let path = target
  try { path = decodeURI(target) } catch { /* keep as written */ }
  const label = link.slice(1, link.lastIndexOf(']('))
  const bare = label.replace(/`/g, '')
  const same = normalize(bare) === normalize(path) || normalize(bare) === normalize(target)
  return same || !bare ? `\`${path}\`` : `${label} (\`${path}\`)`
}

// Code fences are left alone; existing links inside the folder are kept (absolute → relative), links outside it
// become code; at most MAX_STATS look-ups per message.
export async function linkify(text: string, base: string, isFile: (abs: string) => Promise<boolean>): Promise<string> {
  let stats = 0
  const parts = text.split(/(```[\s\S]*?(?:```|$))/)
  for (let i = 0; i < parts.length; i += 2) {
    const chunk = parts[i]
    if (!chunk) continue
    const out: string[] = []
    let last = 0
    // [label](target) or `code`
    for (const m of chunk.matchAll(/\[[^\]]*\]\(([^)\s]+)\)|`([^`\n]+)`/g)) {
      out.push(chunk.slice(last, m.index))
      last = m.index! + m[0].length
      if (m[1] !== undefined) {
        const t = normalize(m[1])
        const rel = isAbs(t) ? inside(m[1], base) : null
        if (rel) out.push(m[0].replace(`(${m[1]})`, `(${encode(rel)})`))
        else if (isAbs(t) || t.startsWith('../')) out.push(outsideAsCode(m[0], m[1]))
        else out.push(m[0])
        continue
      }
      const c = m[2].match(CANDIDATE)
      const path = c?.[1]
      const rel = path && looksLikePath(path) ? inside(path, base) : null
      if (!rel || stats >= MAX_STATS) { out.push(m[0]); continue }
      stats++
      out.push((await isFile(`${normalize(base)}/${rel}`)) ? `[${m[0]}](${encode(rel)}${c![2] ?? ''})` : m[0])
    }
    out.push(chunk.slice(last))
    parts[i] = out.join('')
  }
  return parts.join('')
}

export const register: Register = (on) => {
  // ponytail: only found files are cached; a missing one is looked up again on the next draw (new files appear), capped by MAX_STATS
  const found = new Map<string, true>()

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const text = e.props.text
    if (!text.includes('`') && !text.includes('](')) return next(e)
    try {
      const base = (await $.state.get({ plugin: 'keystone', key: 'base' })).value ?? normalize(await $.session.cwd())
      const isFile = async (abs: string) => {
        if (found.has(abs)) return true
        const ok = await $.fs.stat(abs).then((s) => s.kind === 'file', () => false)
        if (ok) { if (found.size >= 1000) found.clear(); found.set(abs, true) }
        return ok
      }
      const linked = await linkify(text, base, isFile)
      if (linked !== text) return next({ ...e, props: { ...e.props, text: linked } })
    } catch {
      // fall through to the message as written
    }
    return next(e)
  })
}

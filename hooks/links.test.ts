import { test, expect } from 'claude-code/testing'
import { linkify, inside, outsideAsText, MAX_STATS } from './links.ts'

const BASE = 'E:/work/repo'
const FILES = new Set(['E:/work/repo/hooks/keystone.ts', 'E:/work/repo/docs/my plan (v2).md'])
const isFile = async (abs: string) => FILES.has(abs)
const tick = '`'

test('an existing file inside the session folder becomes a relative link, with its line', async () => {
  expect(await linkify(`see ${tick}hooks/keystone.ts${tick}`, BASE, isFile)).toBe(`see [${tick}hooks/keystone.ts${tick}](hooks/keystone.ts)`)
  expect(await linkify(`see ${tick}hooks/keystone.ts:86${tick}`, BASE, isFile)).toBe(`see [${tick}hooks/keystone.ts:86${tick}](hooks/keystone.ts:86)`)
  const win = `${tick}E:\\work\\repo\\hooks\\keystone.ts${tick}`
  expect(await linkify(win, 'e:/work/repo', async (a) => FILES.has(a.replace('e:', 'E:')))).toBe(`[${win}](hooks/keystone.ts)`)
})

test('missing or outside paths in code become plain text; plain code and fences stay as written', async () => {
  const fence = '```'
  for (const p of ['hooks/missing.ts', 'C:/other/x.ts', '../up.ts']) expect(await linkify(`${tick}${p}${tick}`, BASE, isFile)).toBe(p)
  for (const t of [`${tick}npm test${tick}`, `${fence}\nhooks/keystone.ts ${tick}hooks/keystone.ts${tick}\n${fence}`])
    expect(await linkify(t, BASE, isFile)).toBe(t)
})

test('spaces and brackets are encoded; absolute link targets inside become relative', async () => {
  expect(await linkify(`${tick}docs/my plan (v2).md${tick}`, BASE, isFile)).toBe(`[${tick}docs/my plan (v2).md${tick}](docs/my%20plan%20%28v2%29.md)`)
  expect(await linkify('[plan](E:/work/repo/hooks/keystone.ts)', BASE, isFile)).toBe('[plan](hooks/keystone.ts)')
  expect(await linkify('[x](https://e.com/a.ts)', BASE, isFile)).toBe('[x](https://e.com/a.ts)')
  expect(inside('E:/elsewhere/a.ts', BASE)).toBe(null)
})

test('at most MAX_STATS look-ups per message', async () => {
  let n = 0
  const count = async () => { n++; return false }
  await linkify(Array.from({ length: MAX_STATS + 5 }, (_, i) => `${tick}f${i}.ts${tick}`).join(' '), BASE, count)
  expect(n).toBe(MAX_STATS)
})

test('a link to a file outside the session folder becomes plain text, not a dead link', async () => {
  const mem = 'C:/Users/me/.claude/projects/x/memory/a.md'
  expect(await linkify(`[${mem}](${mem})`, BASE, isFile)).toBe(mem)
  expect(await linkify(`[${tick}${mem}${tick}](${mem})`, BASE, isFile)).toBe(mem)
  expect(await linkify(`[memory note](${mem})`, BASE, isFile)).toBe(`memory note (${mem})`)
  expect(await linkify('[up](../other/x.md)', BASE, isFile)).toBe('up (../other/x.md)')
  expect(outsideAsText('[a b](C:/x/a%20b.md)', 'C:/x/a%20b.md')).toBe('a b (C:/x/a b.md)')
  expect(await linkify('[keystone](hooks/keystone.ts)', BASE, isFile)).toBe('[keystone](hooks/keystone.ts)')
  expect(await linkify('[x](https://e.com/a.ts)', BASE, isFile)).toBe('[x](https://e.com/a.ts)')
})

test('every link is checked: a stray ../ is repaired, a missing file never stays a link', async () => {
  // the file exists inside the folder, the model wrote ../ in front of it
  expect(await linkify('[report](../hooks/keystone.ts)', BASE, isFile)).toBe('[report](hooks/keystone.ts)')
  expect(await linkify(`${tick}../hooks/keystone.ts${tick}`, BASE, isFile)).toBe(`[${tick}../hooks/keystone.ts${tick}](hooks/keystone.ts)`)
  // a relative link to a file that does not exist becomes code, not a dead link
  expect(await linkify('[gone](docs/missing.md)', BASE, isFile)).toBe('gone (docs/missing.md)')
  // a line suffix survives
  expect(await linkify('[k](hooks/keystone.ts:86)', BASE, isFile)).toBe('[k](hooks/keystone.ts:86)')
  // URLs and anchors are left alone
  expect(await linkify('[x](#top)', BASE, isFile)).toBe('[x](#top)')
  expect(await linkify('[m](mailto:a@b.c)', BASE, isFile)).toBe('[m](mailto:a@b.c)')
})

import { test, expect } from 'claude-code/testing'
import { linkify, inside, MAX_STATS } from './links.ts'

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

test('missing files, outside paths, plain code and fences stay as written', async () => {
  const fence = '```'
  for (const t of [`${tick}hooks/missing.ts${tick}`, `${tick}C:/other/x.ts${tick}`, `${tick}../up.ts${tick}`, `${tick}npm test${tick}`, `${fence}\nhooks/keystone.ts ${tick}hooks/keystone.ts${tick}\n${fence}`])
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
